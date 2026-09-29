import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { resolveWopalHome } from "./paths.js"
import type { RuntimeContext } from "./runtime-context.js"
import type { RuntimeEnvironment } from "./runtime-environment.js"

// ---------------------------------------------------------------------------
// Level definitions
// ---------------------------------------------------------------------------

const LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

/**
 * Host unified-log-level vocabulary (the engine writes ELLAMAKA_LOG_LEVEL).
 *
 * TRACE is deliberately excluded: the engine emits TRACE only when the user
 * passes `--trace <categories>`, and those categories are engine-side and
 * unrelated to plugin modules — mapping it would open every module at trace
 * volume. FATAL has no host equivalent, so it stays plugin-explicit.
 */
const HOST_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"])

// ---------------------------------------------------------------------------
// Log config resolution — config file defaults + diagnostic env overrides
// ---------------------------------------------------------------------------

export interface ResolvedLogConfig {
  level?: string
  file?: string
  modules?: string[]
}

function matchPluginLevel(value: string | undefined): string | undefined {
  return value !== undefined && Object.hasOwn(LEVELS, value) ? value : undefined
}

function matchHostLevel(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase()
  return normalized !== undefined && HOST_LEVELS.has(normalized)
    ? normalized
    : undefined
}

function resolveLevel(
  environment: RuntimeEnvironment,
  config?: ResolvedLogConfig,
): string {
  return (
    matchPluginLevel(environment.WOPAL_PLUGIN_LOG_LEVEL) ??
    matchPluginLevel(config?.level) ??
    matchHostLevel(environment.ELLAMAKA_LOG_LEVEL) ??
    "info"
  )
}

export function getMinLevel(
  environment: RuntimeEnvironment = process.env,
  config?: ResolvedLogConfig,
): number {
  const level = resolveLevel(environment, config)
  return LEVELS[level] ?? LEVELS["info"]!
}

export function getMinLevelName(
  environment: RuntimeEnvironment = process.env,
  config?: ResolvedLogConfig,
): string {
  const level = resolveLevel(environment, config)
  return Object.hasOwn(LEVELS, level) ? level : "info"
}

export function getLogFile(
  context?: RuntimeContext,
  environment: RuntimeEnvironment = process.env,
  config?: ResolvedLogConfig,
): string {
  const configured = environment.WOPAL_PLUGIN_LOG_FILE ?? config?.file
  if (environment.VITEST) {
    return configured ?? ""
  }
  if (configured) return configured
  if (context) return join(context.logDir, "wopal-plugin.log")
  const wopalHome = resolveWopalHome(environment.WOPAL_HOME)
  return join(wopalHome, "logs", "wopal-plugin.log")
}

export function getAllowedModules(
  environment: RuntimeEnvironment,
  config?: ResolvedLogConfig,
): Set<string> | null {
  const env = environment.WOPAL_PLUGIN_LOG_MODULES
  if (env !== undefined && env.trim() !== "") {
    return new Set(env.split(",").map(m => m.trim().toLowerCase()))
  }
  const configModules = config?.modules
  if (configModules !== undefined && configModules.length > 0) {
    return new Set(configModules.map(m => m.trim().toLowerCase()))
  }
  return null // null = all modules
}

// ---------------------------------------------------------------------------
// Sanitization — sensitive key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = [
  /token/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /private[_-]?key/i,
]

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some(pattern => pattern.test(key))) {
      out[key] = "[REDACTED]"
    } else if (value instanceof Error) {
      // Preserve Error message (not the full Error object)
      out[key] = { message: value.message }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      out[key] = sanitizeData(value as Record<string, unknown>)
    } else {
      out[key] = value
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function timeString(): string {
  return new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\//g, "-")
}

function formatMeta(data: Record<string, unknown>): string {
  const keys = Object.keys(data)
  if (keys.length === 0) return ""
  const parts: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Error) {
      parts.push(`${k}=${v.message}`)
    } else if (
      typeof v === "object" &&
      v !== null &&
      "message" in v &&
      Object.keys(v).length === 1
    ) {
      // Sanitized Error object: { message: string }
      parts.push(`${k}=${(v as { message: string }).message}`)
    } else if (typeof v === "object" && v !== null) {
      parts.push(`${k}=${JSON.stringify(v)}`)
    } else {
      parts.push(`${k}=${v}`)
    }
  }
  return parts.length > 0 ? " " + parts.join(" ") : ""
}

// ---------------------------------------------------------------------------
// File output
// ---------------------------------------------------------------------------

const initializedLogFiles = new Set<string>()

function ensureLogFile(logFile: string): boolean {
  const dir = dirname(logFile)
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      return false
    }
  }
  return true
}

interface LoggerConfiguration {
  context?: RuntimeContext
  environment: RuntimeEnvironment
  config?: ResolvedLogConfig
}

/** Either a fixed configuration or a resolver invoked at each call. */
type ConfigurationSource = LoggerConfiguration | (() => LoggerConfiguration)

function resolveConfiguration(source: ConfigurationSource): LoggerConfiguration {
  return typeof source === "function" ? source() : source
}

function writeLine(line: string, configuration: LoggerConfiguration): void {
  const logFile = getLogFile(configuration.context, configuration.environment, configuration.config)
  if (!logFile) return
  if (!ensureLogFile(logFile)) return
  try {
    if (!initializedLogFiles.has(logFile)) {
      initializedLogFiles.add(logFile)
      const clearOnStart = !configuration.environment.VITEST
        && getMinLevel(configuration.environment, configuration.config) <= LEVELS["debug"]!
      if (clearOnStart) {
        writeFileSync(logFile, line, "utf-8")
      } else {
        appendFileSync(logFile, line, "utf-8")
      }
    } else {
      appendFileSync(logFile, line, "utf-8")
    }
  } catch {
    // silently ignore write errors
  }
}

// ---------------------------------------------------------------------------
// Core log function
// ---------------------------------------------------------------------------

function shouldLog(
  levelNum: number,
  moduleName: string,
  environment: RuntimeEnvironment,
  config?: ResolvedLogConfig,
): boolean {
  if (levelNum < getMinLevel(environment, config)) return false
  const allowed = getAllowedModules(environment, config)
  if (allowed !== null && !allowed.has(moduleName)) return false
  return true
}

function log(
  level: string,
  levelNum: number,
  moduleName: string,
  source: ConfigurationSource,
  ...args: [string] | [Record<string, unknown>, string]
): void {
  const configuration = resolveConfiguration(source)
  if (!shouldLog(levelNum, moduleName, configuration.environment, configuration.config)) return

  let data: Record<string, unknown>
  let msg: string

  if (args.length === 1) {
    data = {}
    msg = args[0]
  } else {
    data = args[0]
    msg = args[1]
  }

  const sanitized = sanitizeData(data)
  const meta = formatMeta(sanitized)
  const timestamp = timeString()
  const line = `${timestamp} [${level.toUpperCase()}] [${moduleName}]${meta} ${msg}\n`
  writeLine(line, configuration)
}

// ---------------------------------------------------------------------------
// LoggerInstance interface + factory
// ---------------------------------------------------------------------------

export interface LoggerInstance {
  trace(msg: string): void
  trace(data: Record<string, unknown>, msg: string): void
  debug(msg: string): void
  debug(data: Record<string, unknown>, msg: string): void
  info(msg: string): void
  info(data: Record<string, unknown>, msg: string): void
  warn(msg: string): void
  warn(data: Record<string, unknown>, msg: string): void
  error(msg: string): void
  error(data: Record<string, unknown>, msg: string): void
  fatal(msg: string): void
  fatal(data: Record<string, unknown>, msg: string): void
}

function createLogger(
  moduleName: string,
  source: ConfigurationSource = { environment: process.env },
): LoggerInstance {
  return {
    trace: (...args: [string] | [Record<string, unknown>, string]) =>
      log("trace", LEVELS["trace"]!, moduleName, source, ...args),
    debug: (...args: [string] | [Record<string, unknown>, string]) =>
      log("debug", LEVELS["debug"]!, moduleName, source, ...args),
    info: (...args: [string] | [Record<string, unknown>, string]) =>
      log("info", LEVELS["info"]!, moduleName, source, ...args),
    warn: (...args: [string] | [Record<string, unknown>, string]) =>
      log("warn", LEVELS["warn"]!, moduleName, source, ...args),
    error: (...args: [string] | [Record<string, unknown>, string]) =>
      log("error", LEVELS["error"]!, moduleName, source, ...args),
    fatal: (...args: [string] | [Record<string, unknown>, string]) =>
      log("fatal", LEVELS["fatal"]!, moduleName, source, ...args),
  }
}

export interface PluginLoggers {
  core: LoggerInstance
  rules: LoggerInstance
  task: LoggerInstance
  memory: LoggerInstance
  context: LoggerInstance
  logFile: string
  logLevel: string
}

export function createPluginLoggers(
  context: RuntimeContext,
  environment: RuntimeEnvironment,
  config?: ResolvedLogConfig,
): PluginLoggers {
  const configuration: LoggerConfiguration = {
    context,
    environment,
    ...(config !== undefined ? { config } : {}),
  }
  return {
    core: createLogger("core", configuration),
    rules: createLogger("rules", configuration),
    task: createLogger("task", configuration),
    memory: createLogger("memory", configuration),
    context: createLogger("context", configuration),
    logFile: getLogFile(context, environment, config),
    logLevel: getMinLevelName(environment, config),
  }
}

// ---------------------------------------------------------------------------
// Module logger singletons
// ---------------------------------------------------------------------------

/**
 * Runtime installed by the composition root (`createPluginRuntime`).
 *
 * The module-level loggers are process-wide singletons but a single process can
 * host several runtime instances (one per space). Their destination therefore
 * cannot be frozen at import time — it must follow the runtime that is actually
 * serving. Without a binding the singletons fall back to the process
 * environment, which for a space instance resolved to the global
 * `<WOPAL_HOME>/logs` file instead of the space's own log dir.
 *
 * Last writer wins: the composition root binds as it assembles each runtime.
 */
let boundRuntime: (() => LoggerConfiguration) | undefined

function singletonConfiguration(): LoggerConfiguration {
  return boundRuntime?.() ?? { environment: process.env }
}

/**
 * Point the module-level loggers at a runtime's log destination.
 *
 * Called by `createPluginRuntime`; tests call it directly to exercise routing.
 */
export function bindLoggerRuntime(
  context: RuntimeContext,
  environment: RuntimeEnvironment = process.env,
  config?: ResolvedLogConfig,
): void {
  boundRuntime = () => ({
    context,
    environment,
    ...(config !== undefined ? { config } : {}),
  })
}

/** Drop the runtime binding; singletons fall back to the process environment. */
export function resetLoggerRuntime(): void {
  boundRuntime = undefined
}

export const coreLogger: LoggerInstance = createLogger("core", singletonConfiguration)
export const rulesLogger: LoggerInstance = createLogger("rules", singletonConfiguration)
export const taskLogger: LoggerInstance = createLogger("task", singletonConfiguration)
export const memoryLogger: LoggerInstance = createLogger("memory", singletonConfiguration)
export const contextLogger: LoggerInstance = createLogger("context", singletonConfiguration)

// ---------------------------------------------------------------------------
// Utility — formatSessionID (migrated from debug.ts)
// ---------------------------------------------------------------------------

/**
 * Format session ID for logging: last 10 chars + (main/task) role.
 * e.g. "ffeEpC3rH1(main)", "fffeUoPDLV7(task)"
 */
export function formatSessionID(
  sessionID: string | undefined,
  isTask: boolean,
): string {
  if (!sessionID) return "unknown"
  return `${sessionID.slice(-10)}(${isTask ? "task" : "main"})`
}
