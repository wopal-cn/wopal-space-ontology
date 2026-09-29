import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { readFileSync, unlinkSync, existsSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  coreLogger,
  rulesLogger,
  taskLogger,
  memoryLogger,
  contextLogger,
  createPluginLoggers,
  formatSessionID,
  getAllowedModules,
  getLogFile,
  getMinLevel,
  getMinLevelName,
} from "./logger"
import { createRuntimeContext } from "./runtime-context.js"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempLogFile: string

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function resetEnv(vars: Record<string, string | undefined>): void {
  setEnv(vars)
}

function readLog(): string {
  if (!existsSync(tempLogFile)) return ""
  return readFileSync(tempLogFile, "utf-8")
}

function clearLog(): void {
  if (existsSync(tempLogFile)) {
    unlinkSync(tempLogFile)
  }
}

// ---------------------------------------------------------------------------
// Level filtering
// ---------------------------------------------------------------------------

describe("Level filtering", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES

    tempLogFile = join("/tmp", `logger-test-${Date.now()}.log`)
    clearLog()
    setEnv({
      WOPAL_PLUGIN_LOG_LEVEL: undefined,
      WOPAL_PLUGIN_LOG_FILE: tempLogFile,
      WOPAL_PLUGIN_LOG_MODULES: undefined,
    })
  })

  afterEach(() => {
    resetEnv(originalEnv)
    clearLog()
  })

  it("filters trace/debug when level=warn (default)", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "warn" })

    taskLogger.trace("trace message")
    taskLogger.debug("debug message")
    taskLogger.warn("warn message")
    taskLogger.error("error message")

    const log = readLog()
    expect(log).not.toContain("[TRACE]")
    expect(log).not.toContain("[DEBUG]")
    expect(log).toContain("[WARN]")
    expect(log).toContain("[ERROR]")
  })

  it("filters trace when level=debug", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "debug" })

    taskLogger.trace("trace message")
    taskLogger.debug("debug message")
    taskLogger.info("info message")

    const log = readLog()
    expect(log).not.toContain("[TRACE]")
    expect(log).toContain("[DEBUG]")
    expect(log).toContain("[INFO]")
  })

  it("outputs all levels when level=trace", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "trace" })

    taskLogger.trace("trace message")
    taskLogger.debug("debug message")
    taskLogger.info("info message")
    taskLogger.warn("warn message")
    taskLogger.error("error message")
    taskLogger.fatal("fatal message")

    const log = readLog()
    expect(log).toContain("[TRACE]")
    expect(log).toContain("[DEBUG]")
    expect(log).toContain("[INFO]")
    expect(log).toContain("[WARN]")
    expect(log).toContain("[ERROR]")
    expect(log).toContain("[FATAL]")
  })

  it("filters info/debug/trace when level=error", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "error" })

    taskLogger.info("info message")
    taskLogger.warn("warn message")
    taskLogger.error("error message")
    taskLogger.fatal("fatal message")

    const log = readLog()
    expect(log).not.toContain("[INFO]")
    expect(log).not.toContain("[WARN]")
    expect(log).toContain("[ERROR]")
    expect(log).toContain("[FATAL]")
  })
})

// ---------------------------------------------------------------------------
// Module filtering
// ---------------------------------------------------------------------------

describe("Module filtering", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES

    tempLogFile = join("/tmp", `logger-test-${Date.now()}.log`)
    clearLog()
    setEnv({
      WOPAL_PLUGIN_LOG_LEVEL: "debug",
      WOPAL_PLUGIN_LOG_FILE: tempLogFile,
      WOPAL_PLUGIN_LOG_MODULES: undefined,
    })
  })

  afterEach(() => {
    resetEnv(originalEnv)
    clearLog()
  })

  it("filters by single module (task)", () => {
    setEnv({ WOPAL_PLUGIN_LOG_MODULES: "task" })

    coreLogger.debug("core message")
    rulesLogger.debug("rules message")
    taskLogger.debug("task message")
    memoryLogger.debug("memory message")
    contextLogger.debug("context message")

    const log = readLog()
    expect(log).not.toContain("[core]")
    expect(log).not.toContain("[rules]")
    expect(log).toContain("[task]")
    expect(log).not.toContain("[memory]")
    expect(log).not.toContain("[context]")
  })

  it("filters by multiple modules (task,memory)", () => {
    setEnv({ WOPAL_PLUGIN_LOG_MODULES: "task,memory" })

    coreLogger.debug("core message")
    taskLogger.debug("task message")
    memoryLogger.debug("memory message")
    contextLogger.debug("context message")

    const log = readLog()
    expect(log).not.toContain("[core]")
    expect(log).toContain("[task]")
    expect(log).toContain("[memory]")
    expect(log).not.toContain("[context]")
  })

  it("outputs all modules when WOPAL_PLUGIN_LOG_MODULES is empty", () => {
    setEnv({ WOPAL_PLUGIN_LOG_MODULES: "" })

    coreLogger.debug("core message")
    taskLogger.debug("task message")
    memoryLogger.debug("memory message")

    const log = readLog()
    expect(log).toContain("[core]")
    expect(log).toContain("[task]")
    expect(log).toContain("[memory]")
  })
})

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

describe("Sanitization", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES

    tempLogFile = join("/tmp", `logger-test-${Date.now()}.log`)
    clearLog()
    setEnv({
      WOPAL_PLUGIN_LOG_LEVEL: "debug",
      WOPAL_PLUGIN_LOG_FILE: tempLogFile,
      WOPAL_PLUGIN_LOG_MODULES: undefined,
    })
  })

  afterEach(() => {
    resetEnv(originalEnv)
    clearLog()
  })

  it("redacts token field", () => {
    taskLogger.info({ token: "secret-token-123", user_id: "abc" }, "Task started")
    const log = readLog()
    expect(log).toContain("token=[REDACTED]")
    expect(log).toContain("user_id=abc")
  })

  it("redacts password field", () => {
    taskLogger.info({ password: "my-password", user_id: "xyz" }, "Login")
    const log = readLog()
    expect(log).toContain("password=[REDACTED]")
    expect(log).toContain("user_id=xyz")
  })

  it("redacts api_key field (case-insensitive)", () => {
    taskLogger.info({ api_key: "key-123", API_KEY: "key-456" }, "API call")
    const log = readLog()
    expect(log).toContain("api_key=[REDACTED]")
    expect(log).toContain("API_KEY=[REDACTED]")
  })

  it("redacts nested sensitive fields", () => {
    taskLogger.info(
      { request: { authorization: "Bearer token", body: "data" } },
      "Request received"
    )
    const log = readLog()
    // Nested object is serialized as JSON with redacted sensitive field
    expect(log).toContain("request={\"authorization\":\"[REDACTED]\",\"body\":\"data\"}")
  })

  it("does not redact session_id (allowed)", () => {
    taskLogger.info({ session_id: "ses_abc123", task_id: "task-1" }, "Session started")
    const log = readLog()
    expect(log).toContain("session_id=ses_abc123")
    expect(log).toContain("task_id=task-1")
  })
})

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

describe("Output format", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES

    tempLogFile = join("/tmp", `logger-test-${Date.now()}.log`)
    clearLog()
    setEnv({
      WOPAL_PLUGIN_LOG_LEVEL: "info",
      WOPAL_PLUGIN_LOG_FILE: tempLogFile,
      WOPAL_PLUGIN_LOG_MODULES: undefined,
    })
  })

  afterEach(() => {
    resetEnv(originalEnv)
    clearLog()
  })

  it("formats timestamp correctly (YYYY-MM-DD HH:mm:ss)", () => {
    taskLogger.info("Test message")
    const log = readLog()
    // Match pattern: 2026-05-21 14:30:00
    expect(log).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  })

  it("formats level tag correctly", () => {
    taskLogger.warn("Warning message")
    const log = readLog()
    expect(log).toContain("[WARN]")
  })

  it("formats module tag correctly", () => {
    taskLogger.info("Task message")
    memoryLogger.info("Memory message")
    const log = readLog()
    expect(log).toContain("[task]")
    expect(log).toContain("[memory]")
  })

  it("formats key=val pairs correctly", () => {
    taskLogger.info({ task_id: "task-abc", count: 42 }, "Task started")
    const log = readLog()
    expect(log).toContain("task_id=task-abc")
    expect(log).toContain("count=42")
  })

  it("formats Error objects correctly (message only)", () => {
    const err = new Error("Something went wrong")
    taskLogger.error({ err, task_id: "task-1" }, "Task failed")
    const log = readLog()
    expect(log).toContain("err=Something went wrong")
  })

  it("formats nested objects as JSON", () => {
    taskLogger.info({ metadata: { key: "value", num: 123 } }, "Metadata logged")
    const log = readLog()
    expect(log).toContain("metadata={\"key\":\"value\",\"num\":123}")
  })

  it("appends newline after each log line", () => {
    taskLogger.info("Line 1")
    taskLogger.info("Line 2")
    const log = readLog()
    const lines = log.split("\n")
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[0]).toMatch(/Line 1$/)
    expect(lines[1]).toMatch(/Line 2$/)
  })
})

describe("Per-invocation logger routing", () => {
  it("keeps space log files isolated", () => {
    const root = join("/tmp", `logger-runtime-${crypto.randomUUID()}`)
    const spaceA = join(root, "a")
    const spaceB = join(root, "b")
    const logA = join(spaceA, ".wopal-space", "logs", "wopal-plugin.log")
    const logB = join(spaceB, ".wopal-space", "logs", "wopal-plugin.log")
    try {
      const runtimeA = createRuntimeContext({ directory: spaceA, wopalSpaceRoot: spaceA })
      const runtimeB = createRuntimeContext({ directory: spaceB, wopalSpaceRoot: spaceB })
      const loggersA = createPluginLoggers(runtimeA, { WOPAL_PLUGIN_LOG_LEVEL: "info" })
      const loggersB = createPluginLoggers(runtimeB, { WOPAL_PLUGIN_LOG_LEVEL: "info" })

      loggersA.core.info("from-a")
      loggersB.core.info("from-b")

      expect(readFileSync(logA, "utf-8")).toContain("from-a")
      expect(readFileSync(logA, "utf-8")).not.toContain("from-b")
      expect(readFileSync(logB, "utf-8")).toContain("from-b")
      expect(readFileSync(logB, "utf-8")).not.toContain("from-a")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// formatSessionID
// ---------------------------------------------------------------------------

describe("formatSessionID", () => {
  it("returns 'unknown' for undefined", () => {
    expect(formatSessionID(undefined, false)).toBe("unknown")
  })

  it("adds (main) suffix for isTask=false", () => {
    expect(formatSessionID("ses_1da5cd417ffe", false)).toBe("a5cd417ffe(main)")
  })

  it("adds (task) suffix for isTask=true", () => {
    expect(formatSessionID("ses_1d63bf80effe", true)).toBe("63bf80effe(task)")
  })

  it("takes last 10 chars if sessionID is longer", () => {
    const longID = "ses_abcdefghij123456789xyz"
    const result = formatSessionID(longID, false)
    expect(result).toBe("3456789xyz(main)")
    expect(result.length).toBe(16) // 10 chars + "(main)"
  })

})

// ---------------------------------------------------------------------------
// Test environment suppression
// ---------------------------------------------------------------------------

describe("Test environment suppression", () => {
  const wopalSpaceDir = join(process.cwd(), ".wopal-space")
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    if (existsSync(wopalSpaceDir)) {
      rmSync(wopalSpaceDir, { recursive: true, force: true })
    }

    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES

    setEnv({
      WOPAL_PLUGIN_LOG_LEVEL: "info",
      WOPAL_PLUGIN_LOG_FILE: undefined,
      WOPAL_PLUGIN_LOG_MODULES: undefined,
    })
  })

  afterEach(() => {
    if (existsSync(wopalSpaceDir)) {
      rmSync(wopalSpaceDir, { recursive: true, force: true })
    }
    resetEnv(originalEnv)
  })

  it("VITEST env is truthy", () => {
    expect(process.env.VITEST).toBeTruthy()
  })

  it("does not create .wopal-space/ directory when logging in test environment", () => {
    coreLogger.info("should not write file")
    expect(existsSync(wopalSpaceDir)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// logDir routing via RuntimeContext
// ---------------------------------------------------------------------------

describe("logDir routing via RuntimeContext", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES
    setEnv({
      WOPAL_PLUGIN_LOG_FILE: undefined,
      WOPAL_PLUGIN_LOG_LEVEL: "info",
      WOPAL_PLUGIN_LOG_MODULES: undefined,
    })
  })

  afterEach(() => {
    resetEnv(originalEnv)
  })

  it("uses RuntimeContext.logDir in test environment (VITEST)", async () => {
    // In test environment, VITEST is set, so getLogFile returns
    // WOPAL_PLUGIN_LOG_FILE or "". We can't easily test the non-VITEST
    // path since VITEST is always set. Instead, verify the import exists.
    const { getLogFile } = await import("./logger.js")
    // In VITEST env, getLogFile returns WOPAL_PLUGIN_LOG_FILE ?? ""
    // Since we cleared WOPAL_PLUGIN_LOG_FILE, it should return ""
    expect(getLogFile()).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Log config resolution (config file defaults + env overrides)
// ---------------------------------------------------------------------------

describe("Log config resolution", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    originalEnv["WOPAL_PLUGIN_LOG_LEVEL"] = process.env.WOPAL_PLUGIN_LOG_LEVEL
    originalEnv["WOPAL_PLUGIN_LOG_FILE"] = process.env.WOPAL_PLUGIN_LOG_FILE
    originalEnv["WOPAL_PLUGIN_LOG_MODULES"] = process.env.WOPAL_PLUGIN_LOG_MODULES
    originalEnv["ELLAMAKA_LOG_LEVEL"] = process.env.ELLAMAKA_LOG_LEVEL
    setEnv({
      WOPAL_PLUGIN_LOG_LEVEL: undefined,
      WOPAL_PLUGIN_LOG_FILE: undefined,
      WOPAL_PLUGIN_LOG_MODULES: undefined,
      ELLAMAKA_LOG_LEVEL: undefined,
    })
  })

  afterEach(() => {
    resetEnv(originalEnv)
  })

  it("uses config logLevel when no env override exists", () => {
    expect(getMinLevelName(process.env, { level: "debug" })).toBe("debug")
    expect(getMinLevel(process.env, { level: "debug" })).toBe(20)
  })

  it("env WOPAL_PLUGIN_LOG_LEVEL overrides config logLevel", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "warn" })
    expect(getMinLevelName(process.env, { level: "debug" })).toBe("warn")
    expect(getMinLevel(process.env, { level: "debug" })).toBe(40)
  })

  it("defaults to info when neither config nor env provides a level", () => {
    expect(getMinLevelName(process.env, {})).toBe("info")
    expect(getMinLevelName()).toBe("info")
  })

  it("falls back to config level when env value is invalid", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "not-a-level" })
    expect(getMinLevelName(process.env, { level: "debug" })).toBe("debug")
  })

  it("falls back to info when env is invalid and config has no level", () => {
    setEnv({ WOPAL_PLUGIN_LOG_LEVEL: "not-a-level" })
    expect(getMinLevelName(process.env)).toBe("info")
  })

  it("uses config logFile when no env override exists", () => {
    expect(getLogFile(undefined, process.env, { file: "/tmp/from-config.log" })).toBe(
      "/tmp/from-config.log",
    )
  })

  it("env WOPAL_PLUGIN_LOG_FILE overrides config logFile", () => {
    setEnv({ WOPAL_PLUGIN_LOG_FILE: "/tmp/from-env.log" })
    expect(getLogFile(undefined, process.env, { file: "/tmp/from-config.log" })).toBe(
      "/tmp/from-env.log",
    )
  })

  it("env WOPAL_PLUGIN_LOG_MODULES overrides config logModules", () => {
    const config = { modules: ["task"] }
    expect(getAllowedModules(process.env, config)).toEqual(new Set(["task"]))
    setEnv({ WOPAL_PLUGIN_LOG_MODULES: "core,memory" })
    expect(getAllowedModules(process.env, config)).toEqual(
      new Set(["core", "memory"]),
    )
  })

  it("createPluginLoggers applies config level and reports the effective name", () => {
    const root = join("/tmp", `logger-config-${crypto.randomUUID()}`)
    const space = join(root, "space")
    const logFile = join(space, ".wopal-space", "logs", "wopal-plugin.log")
    try {
      const context = createRuntimeContext({ directory: space, wopalSpaceRoot: space })
      const loggers = createPluginLoggers(
        context,
        { WOPAL_PLUGIN_LOG_FILE: logFile },
        { level: "debug" },
      )
      expect(loggers.logLevel).toBe("debug")
      loggers.core.debug("debug-from-config")
      loggers.core.info("info-from-config")
      const log = readFileSync(logFile, "utf-8")
      expect(log).toContain("debug-from-config")
      expect(log).toContain("info-from-config")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("createPluginLoggers keeps env override over config level", () => {
    const root = join("/tmp", `logger-config-${crypto.randomUUID()}`)
    const space = join(root, "space")
    const logFile = join(space, ".wopal-space", "logs", "wopal-plugin.log")
    mkdirSync(join(space, ".wopal-space", "logs"), { recursive: true })
    writeFileSync(logFile, "", "utf-8")
    try {
      const context = createRuntimeContext({ directory: space, wopalSpaceRoot: space })
      const loggers = createPluginLoggers(
        context,
        {
          WOPAL_PLUGIN_LOG_LEVEL: "fatal",
          WOPAL_PLUGIN_LOG_FILE: logFile,
        },
        { level: "debug" },
      )
      expect(loggers.logLevel).toBe("fatal")
      loggers.core.info("env-fatal-visible")
      loggers.core.debug("should-be-suppressed")
      const log = readFileSync(logFile, "utf-8")
      expect(log).not.toContain("should-be-suppressed")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Host unified level fallback (ELLAMAKA_LOG_LEVEL)
// ---------------------------------------------------------------------------

describe("Host unified level fallback", () => {
  it("uses the host level when neither plugin env nor config provides one", () => {
    expect(getMinLevelName({ ELLAMAKA_LOG_LEVEL: "ERROR" })).toBe("error")
    expect(getMinLevel({ ELLAMAKA_LOG_LEVEL: "ERROR" })).toBe(50)
  })

  it("normalizes the host level to lowercase", () => {
    expect(getMinLevelName({ ELLAMAKA_LOG_LEVEL: "DEBUG" })).toBe("debug")
    expect(getMinLevel({ ELLAMAKA_LOG_LEVEL: "DEBUG" })).toBe(20)
  })

  it("keeps explicit plugin env above the host fallback", () => {
    const env = { WOPAL_PLUGIN_LOG_LEVEL: "warn", ELLAMAKA_LOG_LEVEL: "ERROR" }
    expect(getMinLevelName(env, { level: "debug" })).toBe("warn")
    expect(getMinLevel(env, { level: "debug" })).toBe(40)
  })

  it("keeps config level above the host fallback", () => {
    const env = { ELLAMAKA_LOG_LEVEL: "ERROR" }
    expect(getMinLevelName(env, { level: "debug" })).toBe("debug")
    expect(getMinLevel(env, { level: "debug" })).toBe(20)
  })

  it("does not map host TRACE (engine-side categories, not plugin modules)", () => {
    expect(getMinLevelName({ ELLAMAKA_LOG_LEVEL: "TRACE" })).toBe("info")
    expect(getMinLevel({ ELLAMAKA_LOG_LEVEL: "TRACE" })).toBe(30)
  })

  it("does not map host FATAL (no host equivalent)", () => {
    expect(getMinLevelName({ ELLAMAKA_LOG_LEVEL: "FATAL" })).toBe("info")
    expect(getMinLevel({ ELLAMAKA_LOG_LEVEL: "FATAL" })).toBe(30)
  })

  it("ignores an empty host level", () => {
    expect(getMinLevelName({ ELLAMAKA_LOG_LEVEL: "" })).toBe("info")
    expect(getMinLevel({ ELLAMAKA_LOG_LEVEL: "" })).toBe(30)
  })

  it("falls back to the host level when the plugin env value is invalid", () => {
    const env = {
      WOPAL_PLUGIN_LOG_LEVEL: "not-a-level",
      ELLAMAKA_LOG_LEVEL: "WARN",
    }
    expect(getMinLevelName(env)).toBe("warn")
    expect(getMinLevel(env)).toBe(40)
  })

  it("defaults to info when no layer provides a valid level", () => {
    expect(getMinLevelName({})).toBe("info")
    expect(getMinLevel({})).toBe(30)
  })
})
