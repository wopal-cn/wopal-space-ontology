import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

export type LogFn = (message: string) => void;

export type DebugLog = LogFn;

/**
 * Module names for debug filtering:
 * - "plugin" for plugin lifecycle (load, init, tool registration)
 * - "rules" for rule discovery and injection
 * - "task" for task delegation and monitoring
 * - "memory" for memory system (store, retrieval, distill)
 * - "context" for session state, snapshots, compaction
 */
export type DebugModule = "plugin" | "rules" | "task" | "memory" | "context";

function getLogFile(): string {
  const logPath = process.env.WOPAL_PLUGIN_LOG_FILE;
  if (logPath) {
    return logPath;
  }

  return join(tmpdir(), "wopal-plugin.log");
}

function ensureLogFile(logFile: string): boolean {
  const dir = dirname(logFile);
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Format timestamp in China Standard Time (UTC+8)
 * Output format: YYYY-MM-DD HH:mm:ss
 */
function formatCSTTimestamp(): string {
  const now = new Date();
  const parts = now.toLocaleString('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).split(/[,\/\s:]+/);
  
  const [month, day, year, hour, minute, second] = parts;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Check if debug output is enabled for a specific module.
 * 
 * WOPAL_PLUGIN_DEBUG values:
 * - "1", "*", "all" → enable all modules
 * - "task" → enable only task module
 * - "rules" → enable only rules module
 * - "memory" → enable only memory module
 * - "task,rules,memory" → enable multiple modules (comma-separated)
 */
export function isDebugEnabled(module: DebugModule): boolean {
  const debug = process.env.WOPAL_PLUGIN_DEBUG;
  if (!debug) {
    return false;
  }

  const normalized = debug.trim().toLowerCase();

  // Enable all
  if (normalized === "1" || normalized === "*" || normalized === "all") {
    return true;
  }

  // Check specific modules
  const modules = normalized.split(",").map(m => m.trim());
  return modules.includes(module);
}

function writeLog(prefix: string, message: string): void {
  if (process.env.VITEST) return;

  const logFile = getLogFile();
  if (!ensureLogFile(logFile)) {
    return;
  }

  const timestamp = formatCSTTimestamp();
  const header = `${timestamp} ${prefix} `;
  const lines = message.split('\n');
  const logMessage = lines.map((line, i) => i === 0 ? `${header}${line}` : `  ${line}`).join('\n') + '\n\n';

  try {
    appendFileSync(logFile, logMessage, "utf-8");
  } catch {
    // Silently ignore write errors
  }
}

/**
 * Create a debug log function for a specific module.
 *
 * @param prefix - Log prefix (e.g., "[plugin]", "[rules]", "[task]")
 * @param module - Module name for filtering ("plugin", "rules", "task", "memory", "context")
 *
 * Environment variables:
 * - WOPAL_PLUGIN_DEBUG: "1"/"*"/"all" for all, or comma-separated modules
 * - WOPAL_PLUGIN_LOG_FILE: Custom log file path (default: tmpdir/wopal-plugin.log)
 */
export function createDebugLog(prefix = "[plugin]", module: DebugModule = "plugin"): LogFn {
  return (message: string): void => {
    if (!isDebugEnabled(module)) {
      return;
    }
    writeLog(prefix, message);
  };
}

/**
 * Create a warn log function (always outputs to log file, ignores debug filter)
 */
export function createWarnLog(prefix = "[plugin]"): LogFn {
  return (message: string): void => {
    writeLog(`${prefix} [WARN]`, message);
  };
}

/**
 * Create an info log function (always outputs to log file, ignores debug filter).
 * Unlike createWarnLog, does not add [WARN] suffix — suitable for informational
 * messages that should always be visible (e.g., token usage stats).
 */
export function createInfoLog(prefix = "[plugin]"): LogFn {
  return (message: string): void => {
    writeLog(prefix, message);
  };
}

// DIFF-TEST-FINAL: 验证 v2 SDK 调用修复成功 [2026-04-14 17:04:24]
