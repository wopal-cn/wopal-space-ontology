// Protocol layer: builds server-function requests and normalizes responses.
// Constants are the SolidStart server function ids reverse-engineered from
// opencode.ai frontend chunks. If opencode.ai redeploys, these hashes change.

import { decodeSerovalStream } from "./seroval-parser.js";

export const SERVER_FUNCTIONS = {
  billingInfo: "c83b78a614689c38ebee981f9b39a8b377716db85c1fd7dbab604adc02d3313d",
  liteSubscription: "c7389bd0e731f80f49593e5ee53835475f4e28594dd6bd83eb229bab753498cd",
  usageList: "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c",
  costs: "15702f3a12ff8bff357f8c2aa154a17e65b746d5f6b96adc9002c86ee0c15205",
};

export const DEFAULT_BASE_URL = "https://opencode.ai";

let serverInstanceCounter = 0;

function serializePrimitive(value) {
  if (typeof value === "number") return { t: 0, s: value };
  if (typeof value === "string") return { t: 1, s: value };
  if (value === null) return { t: 2, s: 0 };
  if (typeof value === "undefined") return { t: 2, s: 1 };
  if (value === true) return { t: 2, s: 2 };
  if (value === false) return { t: 2, s: 3 };
  throw new TypeError(`Unsupported arg type: ${typeof value}`);
}

function serializeArgs(args) {
  return {
    t: { t: 9, i: 0, l: args.length, a: args.map(serializePrimitive), o: 0 },
    f: 31,
    m: [],
  };
}

// accountId is embedded in the URL so DNR can match and inject the right cookie.
// credentials:"omit" keeps the browser cookie out; DNR supplies the account cookie.
export async function callServerFunction({ baseUrl, accountId }, id, args) {
  const instance = `ext:${serverInstanceCounter++}`;
  const workspaceId = args[0] || "";
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url =
    accountId != null
      ? `${baseUrl}/_server${separator}_acct=${encodeURIComponent(accountId)}`
      : `${baseUrl}/_server`;

  const response = await fetch(url, {
    method: "POST",
    credentials: "omit",
    redirect: "manual",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Origin: baseUrl,
      Referer: `${baseUrl}/workspace/${encodeURIComponent(workspaceId)}/go`,
      "User-Agent": "opencode-usage-ext/1.0",
      "X-Server-Id": id,
      "X-Server-Instance": instance,
    },
    body: JSON.stringify(serializeArgs(args)),
  });

  if (!response.ok && response.status !== 302 && response.status !== 0) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    const xError = response.headers.get("x-error");
    if (xError) throw new Error("Empty error response from server.");
    return null;
  }

  // The response is text/javascript Seroval stream regardless of Accept header.
  const decoded = decodeSerovalStream(bytes);
  if (decoded && decoded._errorResponse) {
    interpretErrorResponse(decoded, response);
  }
  if (response.headers.get("x-error")) {
    throw new Error(interpretErrorResponse(decoded, response));
  }
  return decoded;
}

function interpretErrorResponse(decoded) {
  if (decoded && decoded._newExpr && /\/auth\/authorize/.test(decoded.raw || "")) {
    return "Cookie expired or not logged in. Re-save this account.";
  }
  if (decoded && decoded._errorResponse && /\/auth\/authorize/.test(decoded.raw || "")) {
    return "Cookie expired or not logged in. Re-save this account.";
  }
  if (decoded instanceof Error) return decoded.message;
  return "OpenCode server returned an error response.";
}

export function normalizeLiteSubscription(lite) {
  if (!lite) return { active: false };
  return {
    active: true,
    mine: lite.mine,
    useBalance: lite.useBalance,
    rollingUsage: normalizeUsageWindow(lite.rollingUsage),
    weeklyUsage: normalizeUsageWindow(lite.weeklyUsage),
    monthlyUsage: normalizeUsageWindow(lite.monthlyUsage),
  };
}

function normalizeUsageWindow(value) {
  if (!value) return null;
  const usagePercent = Number(value.usagePercent ?? 0);
  return {
    usagePercent,
    remainingPercent: Math.max(0, 100 - usagePercent),
    resetInSec: Number(value.resetInSec ?? 0),
    resetIn: formatDuration(Number(value.resetInSec ?? 0)),
  };
}

export function normalizeBilling(billing) {
  if (!billing) return { balance: null };
  return {
    balance: typeof billing.balance === "number" ? billing.balance : null,
    balanceUsd: typeof billing.balance === "number" ? billing.balance / 1e8 : null,
    paymentMethodType: billing.paymentMethodType || null,
    reloadAmount: billing.reloadAmount ?? null,
  };
}

export function summarizeUsageRows(rows) {
  const summary = { count: 0, totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0, byModel: {} };
  for (const row of rows || []) {
    const model = row.model || "unknown";
    const inputTokens =
      Number(row.inputTokens || 0) +
      Number(row.cacheReadTokens || 0) +
      Number(row.cacheWrite5mTokens || 0) +
      Number(row.cacheWrite1hTokens || 0);
    const outputTokens = Number(row.outputTokens || 0);
    const costUsd = Number(row.cost || 0) / 1e8;
    summary.count += 1;
    summary.totalInputTokens += inputTokens;
    summary.totalOutputTokens += outputTokens;
    summary.totalCostUsd += costUsd;
    summary.byModel[model] ||= { count: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    summary.byModel[model].count += 1;
    summary.byModel[model].costUsd += costUsd;
    summary.byModel[model].inputTokens += inputTokens;
    summary.byModel[model].outputTokens += outputTokens;
  }
  summary.totalCostUsd = roundMoney(summary.totalCostUsd);
  for (const item of Object.values(summary.byModel)) item.costUsd = roundMoney(item.costUsd);
  return summary;
}

export function warningsForSnapshot(snapshot, warnPercent) {
  const warnings = [];
  if (!snapshot.go?.active) return warnings;
  for (const [label, usage] of [
    ["5-hour", snapshot.go.rollingUsage],
    ["weekly", snapshot.go.weeklyUsage],
    ["monthly", snapshot.go.monthlyUsage],
  ]) {
    if (usage && usage.usagePercent >= warnPercent) {
      warnings.push(`${label} usage ${usage.usagePercent}%, resets in ${usage.resetIn}`);
    }
  }
  return warnings;
}

export function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function roundMoney(value) {
  return Math.round(value * 10000) / 10000;
}