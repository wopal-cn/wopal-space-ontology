/**
 * Prompt Loading
 *
 * Loads prompt templates from plugin's prompts/ directory at runtime for hot-reload support.
 * Env vars WOPAL_DISTILL_PROMPT_FILE / WOPAL_DEDUP_PROMPT_FILE / WOPAL_TITLE_PROMPT_FILE
 * override file paths with higher priority.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import type { MemoryCategory } from "./types.js";
import { memoryLogger } from "../logger.js";

/** Plugin root directory — set during initialization */
let _pluginDir: string | null = null;

/**
 * Set plugin root directory for prompt file resolution.
 * Must be called before any prompt loading functions.
 */
export function setPluginDirectory(dir: string): void {
  _pluginDir = dir;
}

/**
 * Resolve prompt file path from environment variable.
 *
 * Supports:
 * - Absolute path: /path/to/file.md
 * - Home directory: ~/path/to/file.md
 * - Relative path: path/to/file.md (relative to cwd)
 */
function resolveEnvFilePath(envVar: string): string | null {
  const envPath = process.env[envVar];
  if (!envPath) return null;

  if (envPath.startsWith("/")) {
    return envPath;
  }

  if (envPath.startsWith("~/")) {
    return join(homedir(), envPath.slice(2));
  }

  return join(process.cwd(), envPath);
}

/**
 * Load a prompt file: env var override → plugin prompts/ dir.
 * Returns null if neither source is available.
 */
function loadPromptFile(envVar: string, filename: string): string | null {
  const envPath = resolveEnvFilePath(envVar);
  if (envPath && existsSync(envPath)) {
    try {
      memoryLogger.debug(`Loaded prompt from env: ${envPath}`);
      return readFileSync(envPath, "utf-8");
    } catch (error) {
      memoryLogger.warn(`Failed to load prompt from ${envPath}: ${error}`);
    }
  }

  if (_pluginDir) {
    const pluginPath = join(_pluginDir, "prompts", filename);
    if (existsSync(pluginPath)) {
      try {
        return readFileSync(pluginPath, "utf-8");
      } catch (error) {
        memoryLogger.warn(`Failed to load prompt from ${pluginPath}: ${error}`);
      }
    }
  }

  return null;
}

/** Title generation prompt for session title after compaction */
export function loadTitlePrompt(): string {
  return loadPromptFile("WOPAL_TITLE_PROMPT_FILE", "title.md")
    ?? "You are a title generator. Output ONLY valid JSON: {\"title\":\"Brief natural thread title\"}. The title must be a single line, ≤50 characters, and use the same language as the summary. Never output labels like Thread Title or Title as the title value.\n\n---\nConversation summary:\n{{summary}}";
}

/** Extracted memory from LLM (single-layer body) */
export interface ExtractResult {
  memories: Array<{
    category: MemoryCategory;
    body: string;
    tags: string[];
  }>;
  title?: string;
}

/**
 * Load extraction prompt template.
 */
function loadPromptTemplate(): string {
  return loadPromptFile("WOPAL_DISTILL_PROMPT_FILE", "distill.md")
    ?? "# Memory Extraction\n\nAnalyze the conversation below and extract memories worth preserving for future sessions.\n\n## Recent Conversation\n{{conversation}}\n\n## Output Format\n\nReturn a JSON object:\n{\"memories\": [{\"category\": \"knowledge\", \"body\": \"Title\\n\\nCore content...\", \"tags\": [\"tag\"]}]}\n\nIf nothing to extract, return {\"memories\": []}";
}

/**
 * Build extraction prompt for LLM (always reads from file for hot-reload).
 */
export function buildExtractionPrompt(conversation: string): string {
  return loadPromptTemplate().replace("{{conversation}}", conversation);
}

/**
 * Build deduplication prompt — single LLM call for decision + merge content.
 */
export function buildBatchDedupPrompt(
  candidates: Array<{ index: number; category: string; body: string }>,
  existingByCandidate: Map<number, Array<{ index: number; body: string; id: string }>>
): string {
  const candidatesWithExisting = candidates.filter(
    (c) => existingByCandidate.has(c.index) && existingByCandidate.get(c.index)!.length > 0
  );

  const input = candidatesWithExisting.map((c) => {
    const existing = existingByCandidate.get(c.index)!;
    return {
      candidate: { index: c.index, category: c.category, body: c.body },
      similar_existing: existing.map((e) => ({ index: e.index, body: e.body })),
    };
  });

  const template = loadPromptFile("WOPAL_DEDUP_PROMPT_FILE", "dedup.md")
    ?? "You are a memory deduplicator. For each candidate, compare with similar existing memories and decide: create (unrelated, coexist), skip (discard), merge (supplement), or replace (outdated).\n\nInput:\n{{input}}\n\nOutput JSON:\n{\"decisions\": [{\"index\": 1, \"action\": \"create\"}, {\"index\": 2, \"action\": \"skip\"}, {\"index\": 3, \"action\": \"merge\", \"merge_into\": 1, \"merged_body\": \"...\", \"tags\": [\"tag\"]}]}";

  return template.replace("{{input}}", JSON.stringify(input, null, 2));
}
