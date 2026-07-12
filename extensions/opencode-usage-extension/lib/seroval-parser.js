// Seroval stream decoder — pure string parser, CSP-safe (no eval/new Function).
// Decodes the text/javascript stream format returned by opencode.ai/_server.
// Format: ;0xSIZEHEX;PAYLOAD  repeated, where PAYLOAD is a JS expression
// using $R[N]=VALUE references to share values across the stream.

export function decodeSerovalStream(bytes) {
  const decoder = new TextDecoder();
  let offset = 0;
  let result;
  const refs = {};
  while (offset < bytes.length) {
    if (bytes[offset] !== 0x3b) {
      throw new Error(`Malformed stream: expected ; at ${offset}`);
    }
    const sizeHex = decoder.decode(bytes.subarray(offset + 1, offset + 11));
    const size = parseInt(sizeHex, 16);
    if (!Number.isFinite(size)) {
      throw new Error(`Malformed stream: invalid chunk size ${sizeHex}`);
    }
    const start = offset + 12;
    const end = start + size;
    if (end > bytes.length) {
      throw new Error("Malformed stream: truncated chunk");
    }
    const payload = decoder.decode(bytes.subarray(start, end));
    result = parseSerovalPayload(payload, refs);
    offset = end;
  }
  return result;
}

function parseSerovalPayload(payload, refs) {
  // Wrapper: ((self.$R=self.$R||{})["instanceId"]=[],($R=>BODY)($R["instanceId"]))
  const instMatch = payload.match(/\["([^"]+)"\]=\[\]/);
  if (!instMatch) throw new Error("Unrecognized seroval wrapper");
  const instanceId = instMatch[1];
  if (!refs[instanceId]) refs[instanceId] = [];
  const refsArr = refs[instanceId];

  const arrowIdx = payload.indexOf("=>");
  if (arrowIdx === -1) throw new Error("No arrow in payload");
  let i = arrowIdx + 2;
  while (i < payload.length && /\s/.test(payload[i])) i++;
  const parsed = readValue(payload, i, refsArr);
  return parsed.value;
}

function readValue(body, start, refsArr) {
  let i = start;
  while (i < body.length && /\s/.test(body[i])) i++;

  // $R[N]= prefix — register a ref then read the value
  const refM = body.slice(i).match(/^\$R\[(\d+)\]=/);
  if (refM) {
    const idx = parseInt(refM[1], 10);
    i += refM[0].length;
    const v = readValue(body, i, refsArr);
    refsArr[idx] = v.value;
    return { value: v.value, end: v.end };
  }

  const ch = body[i];
  if (ch === "{") return readObject(body, i, refsArr);
  if (ch === "[") return readArray(body, i, refsArr);
  if (ch === '"' || ch === "'") return readString(body, i);
  if (body.slice(i, i + 2) === "!0") return { value: true, end: i + 2 };
  if (body.slice(i, i + 2) === "!1") return { value: false, end: i + 2 };
  if (body.slice(i, i + 4) === "null") return { value: null, end: i + 4 };
  if (body.slice(i, i + 9) === "undefined") return { value: undefined, end: i + 9 };
  if (body.slice(i, i + 2) === "$R") {
    const m = body.slice(i).match(/^\$R\[(\d+)\]/);
    return { value: refsArr[parseInt(m[1], 10)], end: i + m[0].length };
  }
  if (body.slice(i, i + 4) === "new ") return readNewExpr(body, i);
  if (/[0-9-]/.test(ch)) return readNumber(body, i);
  throw new Error(`Unrecognized value at ${i}: ${body.slice(i, i + 40)}`);
}

function readObject(body, start, refsArr) {
  const obj = {};
  let i = start + 1;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (body[i] === "}") return { value: obj, end: i + 1 };
    let key;
    if (body[i] === '"' || body[i] === "'") {
      const s = readString(body, i);
      key = s.value;
      i = s.end;
    } else {
      const m = body.slice(i).match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (!m) throw new Error(`Expected key at ${i}: ${body.slice(i, i + 20)}`);
      key = m[1];
      i += m[0].length;
    }
    while (i < body.length && /[\s:]/.test(body[i])) i++;
    const v = readValue(body, i, refsArr);
    obj[key] = v.value;
    i = v.end;
  }
  throw new Error("Unterminated object");
}

function readArray(body, start, refsArr) {
  const arr = [];
  let i = start + 1;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (body[i] === "]") return { value: arr, end: i + 1 };
    const v = readValue(body, i, refsArr);
    arr.push(v.value);
    i = v.end;
  }
  throw new Error("Unterminated array");
}

function readString(body, start) {
  const quote = body[start];
  let i = start + 1;
  let out = "";
  while (i < body.length) {
    if (body[i] === "\\") {
      const next = body[i + 1];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else out += next;
      i += 2;
      continue;
    }
    if (body[i] === quote) return { value: out, end: i + 1 };
    out += body[i];
    i++;
  }
  throw new Error("Unterminated string");
}

function readNumber(body, start) {
  const m = body.slice(start).match(/^-?[0-9]+e[+-]?[0-9]+|^-?[0-9.]+/);
  return { value: Number(m[0]), end: start + m[0].length };
}

function readNewExpr(body, start) {
  // new Date("...") — preserve as ISO string
  const dateM = body.slice(start).match(/^new Date\(("|')([^"']+)("|')\)/);
  if (dateM) return { value: dateM[2], end: start + dateM[0].length };

  // new Response(...) — error marker, skip to matching close paren
  let depth = 0;
  let i = start;
  let inStr = null;
  while (i < body.length) {
    const ch = body[i];
    if (inStr) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      i++;
      if (depth === 0) {
        return { value: { _errorResponse: true, raw: body.slice(start, i) }, end: i };
      }
      continue;
    }
    i++;
  }
  throw new Error("Unterminated new expression");
}