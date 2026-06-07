/**
 * LLM Client
 *
 * Uses OpenAI-compatible API for memory distillation, deduplication, and session title generation.
 * Required environment variables: WOPAL_LLM_BASE_URL, WOPAL_LLM_API_KEY
 */

import OpenAI from "openai";
import { coreLogger } from "./logger.js";

const LLM_TIMEOUT_MS = 120000;

/**
 * LLM client using OpenAI-compatible API
 *
 * Required environment variables:
 * - WOPAL_LLM_BASE_URL: LLM API endpoint
 * - WOPAL_LLM_API_KEY: API key for LLM service
 * - WOPAL_LLM_MODEL: Model name (optional, defaults to gpt-4o-mini)
 */
export class LLMClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const baseURL = process.env.WOPAL_LLM_BASE_URL;
    const apiKey = process.env.WOPAL_LLM_API_KEY;

    if (!baseURL || !apiKey) {
      throw new Error(
        "LLMClient requires WOPAL_LLM_BASE_URL and WOPAL_LLM_API_KEY environment variables"
      );
    }

    this.model = process.env.WOPAL_LLM_MODEL ?? "gpt-4o-mini";

    this.client = new OpenAI({
      baseURL,
      apiKey,
    });

    coreLogger.info({ model: this.model, base_url: baseURL }, "LLM client ready");
  }

  /**
   * Complete a prompt and return raw text response
   *
   * @param prompt - The prompt to send to the LLM
   * @returns Raw text response
   */
  async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [{ role: "user", content: prompt }],
        },
        {
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        }
      );

      const content = response.choices[0]?.message?.content ?? "";

      return content;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      coreLogger.warn({ err }, "LLM completion failed");
      throw new Error(`LLM complete failed: ${err.message}`);
    }
  }

  /**
   * Complete a prompt and parse JSON response
   *
   * - Extracts first {...} or [...] block from response
   * - Attempts repair with simple heuristics
   * - Returns parsed JSON as typed object
   *
   * @param prompt - The prompt to send to the LLM
   * @returns Parsed JSON object
   */
  async completeJson<T>(prompt: string): Promise<T> {
    const rawResponse = await this.complete(prompt);

    const jsonStr = this.extractJson(rawResponse);

    if (!jsonStr) {
      coreLogger.warn("LLM JSON response missing JSON payload");
      throw new Error("No JSON found in LLM response");
    }

    // Try direct parse
    try {
      return JSON.parse(jsonStr) as T;
    } catch (_parseError) {
      // fall through to repair
    }

    // Attempt simple repair
    const repaired = this.repairJson(jsonStr);

    try {
      return JSON.parse(repaired) as T;
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      coreLogger.warn({ err: parseError instanceof Error ? parseError : new Error(String(parseError)) }, "LLM JSON parse failed");
      throw new Error(`Failed to parse JSON after repair: ${message}`);
    }
  }

/**
   * Extract JSON block from text
   *
   * Handles:
   * - Markdown code blocks (```json ... ``)
   * - Raw {...} or [...] blocks
   * - JSON after code blocks
   */
  private extractJson(text: string): string | null {
    // Strategy 1: Find {"memories": ...} with balanced braces
    const memoriesStart = text.search(/\{\s*"memories"/);
    if (memoriesStart !== -1) {
      const jsonStr = this.extractBalancedJson(text, memoriesStart);
      if (jsonStr) return jsonStr;
    }

    // Strategy 2: Find JSON in markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      const blockContent = codeBlockMatch[1].trim();
      if (blockContent.startsWith("{") || blockContent.startsWith("[")) {
        return blockContent;
      }
    }

    // Strategy 3: Find {"decision": ...} for dedup prompt
    const decisionStart = text.indexOf('{"decision"');
    if (decisionStart !== -1) {
      const jsonStr = this.extractBalancedJson(text, decisionStart);
      if (jsonStr) return jsonStr;
    }

    // Strategy 4: Generic JSON object/array for small structured tasks
    const genericStart = text.search(/[\[{]/);
    if (genericStart !== -1) {
      if (text[genericStart] === "{") return this.extractBalancedJson(text, genericStart);
      const jsonStr = this.extractBalancedArray(text, genericStart);
      if (jsonStr) return jsonStr;
    }

    return null;
  }

  /**
   * Extract balanced JSON object starting from given position
   */
  private extractBalancedJson(text: string, start: number): string | null {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) {
            return text.substring(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  private extractBalancedArray(text: string, start: number): string | null {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "[") depth++;
        else if (char === "]") {
          depth--;
          if (depth === 0) return text.substring(start, i + 1);
        }
      }
    }

    return null;
  }

  /**
   * Simple JSON repair heuristics
   *
   * Handles common issues:
   * - Trailing commas
   * - Missing closing brackets
   * - Literal newlines inside strings
   */
  private repairJson(jsonStr: string): string {
    let repaired = jsonStr;

    // Remove trailing commas before } or ]
    repaired = repaired.replace(/,\s*([}\]])/g, "$1");

    // Fix literal newlines inside JSON strings
    repaired = this.fixNewlinesInStrings(repaired);

    // Ensure proper closing
    const openBraces = (repaired.match(/\{/g) ?? []).length;
    const closeBraces = (repaired.match(/\}/g) ?? []).length;
    if (openBraces > closeBraces) {
      repaired += "}".repeat(openBraces - closeBraces);
    }

    const openBrackets = (repaired.match(/\[/g) ?? []).length;
    const closeBrackets = (repaired.match(/\]/g) ?? []).length;
    if (openBrackets > closeBrackets) {
      repaired += "]".repeat(openBrackets - closeBrackets);
    }

    return repaired;
  }

  /**
   * Fix literal newlines inside JSON string values
   *
   * LLMs often output actual newlines inside JSON strings instead of \n.
   * This walks the string tracking quote/escape state and replaces
   * literal newlines inside strings with the \n escape sequence.
   */
  private fixNewlinesInStrings(jsonStr: string): string {
    const chars: string[] = [];
    let inString = false;
    let escapeNext = false;

    for (const char of jsonStr) {
      if (escapeNext) {
        chars.push(char);
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        chars.push(char);
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        chars.push(char);
        continue;
      }

      if (inString && (char === "\n" || char === "\r")) {
        chars.push(char === "\r" ? "\\r" : "\\n");
        continue;
      }

      chars.push(char);
    }

    return chars.join("");
  }

  /**
   * Get current model name
   */
  getModel(): string {
    return this.model;
  }
}

let singleton: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  singleton ??= new LLMClient();
  return singleton;
}
