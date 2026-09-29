import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { RuntimeContext } from "./runtime-context.js";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const ENV_ALLOWLIST = [
  // Connection parameters and secrets required by resource client construction.
  "WOPAL_LLM_BASE_URL",
  "WOPAL_LLM_MODEL",
  "WOPAL_LLM_API_KEY",
  "WOPAL_EMBEDDING_BASE_URL",
  "WOPAL_EMBEDDING_MODEL",
  "WOPAL_EMBEDDING_API_KEY",
  // Log diagnostic overrides.
  "WOPAL_PLUGIN_LOG_LEVEL",
  "WOPAL_PLUGIN_LOG_FILE",
  "WOPAL_PLUGIN_LOG_MODULES",
  // Host-resolved unified log level fallback (consumed by logger.ts).
  "ELLAMAKA_LOG_LEVEL",
  // Path fallback (logger.ts getLogFile).
  "WOPAL_HOME",
] as const;

/**
 * Allowlisted keys that only the real process environment may provide.
 *
 * ELLAMAKA_LOG_LEVEL is host-owned: the engine injects its resolved unified
 * level into the process environment, so a home/space `.env` file must not be
 * able to shadow it.
 */
const PROCESS_ONLY_KEYS: ReadonlySet<string> = new Set(["ELLAMAKA_LOG_LEVEL"]);

function pickAllowlisted(source: Record<string, string | undefined>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = source[key];
    if (value !== undefined && value !== "") values[key] = value;
  }
  return values;
}

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const values: Record<string, string> = {};
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return values;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (PROCESS_ONLY_KEYS.has(key)) continue;
    if (!ENV_ALLOWLIST.includes(key as (typeof ENV_ALLOWLIST)[number])) continue;
    values[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return values;
}

export function loadRuntimeEnvironment(
  context: RuntimeContext,
  processEnvironment: NodeJS.ProcessEnv = process.env,
): RuntimeEnvironment {
  const homeEnvironment = loadEnvFile(join(context.wopalHome, ".env"));
  const spaceEnvironment = context.wopalSpaceRoot
    ? loadEnvFile(join(context.wopalSpaceRoot, ".wopal", ".env"))
    : {};
  return Object.freeze({
    ...homeEnvironment,
    ...spaceEnvironment,
    ...pickAllowlisted(processEnvironment),
  });
}
