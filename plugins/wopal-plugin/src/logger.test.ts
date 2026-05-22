import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { readFileSync, unlinkSync, existsSync, rmSync } from "fs"
import { join } from "path"
import {
  coreLogger,
  rulesLogger,
  taskLogger,
  memoryLogger,
  contextLogger,
  formatSessionID,
} from "./logger"

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