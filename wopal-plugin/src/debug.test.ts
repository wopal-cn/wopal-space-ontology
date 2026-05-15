import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDebugLog, createWarnLog, createInfoLog } from "./debug.js";

describe("createDebugLog", () => {
  let tempDir: string;
  let logFile: string;
  let savedVitest: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "debug-test-"));
    logFile = join(tempDir, "test.log");
    process.env.WOPAL_PLUGIN_LOG_FILE = logFile;
    savedVitest = process.env.VITEST;
    delete process.env.VITEST;
  });

  afterEach(() => {
    delete process.env.WOPAL_PLUGIN_DEBUG;
    delete process.env.WOPAL_PLUGIN_LOG_FILE;
    if (savedVitest !== undefined) process.env.VITEST = savedVitest;
    if (existsSync(logFile)) {
      unlinkSync(logFile);
    }
  });

  it("writes to log file when WOPAL_PLUGIN_DEBUG=1", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "1";
    const log = createDebugLog();
    log("test message");
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[plugin] test message");
  });

  it("writes to log file when WOPAL_PLUGIN_DEBUG=*", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "*";
    const log = createDebugLog();
    log("star test");
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[plugin] star test");
  });

  it("writes to log file when WOPAL_PLUGIN_DEBUG=all", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "all";
    const log = createDebugLog();
    log("all test");
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[plugin] all test");
  });

  it("does not write when WOPAL_PLUGIN_DEBUG is unset", () => {
    const log = createDebugLog();
    log("test message");
    
    expect(existsSync(logFile)).toBe(false);
  });

  it("uses custom prefix", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "1";
    const log = createDebugLog("[custom]");
    log("hello");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[custom] hello");
  });

  it("uses default path when WOPAL_PLUGIN_LOG_FILE is not set", () => {
    delete process.env.WOPAL_PLUGIN_LOG_FILE;
    process.env.WOPAL_PLUGIN_DEBUG = "1";
    
    const log = createDebugLog();
    log("default path test");
    
    // Default path should be in tmpdir
    const defaultLog = join(tmpdir(), "wopal-plugin.log");
    expect(existsSync(defaultLog)).toBe(true);
    
    // Cleanup
    if (existsSync(defaultLog)) {
      unlinkSync(defaultLog);
    }
  });

  it("uses China Standard Time format (YYYY-MM-DD HH:mm:ss)", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "1";
    const log = createDebugLog();
    log("timestamp test");
    
    const content = readFileSync(logFile, "utf-8");
    // Match format: 2026-03-15 16:30:45 [plugin] timestamp test
    const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /m;
    expect(timestampPattern.test(content)).toBe(true);
  });
});

describe("createDebugLog module filtering", () => {
  let tempDir: string;
  let logFile: string;
  let savedVitest: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "module-test-"));
    logFile = join(tempDir, "test.log");
    process.env.WOPAL_PLUGIN_LOG_FILE = logFile;
    savedVitest = process.env.VITEST;
    delete process.env.VITEST;
  });

  afterEach(() => {
    delete process.env.WOPAL_PLUGIN_DEBUG;
    delete process.env.WOPAL_PLUGIN_LOG_FILE;
    if (savedVitest !== undefined) process.env.VITEST = savedVitest;
    if (existsSync(logFile)) {
      unlinkSync(logFile);
    }
  });

  it("filters by single module: task only", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "task";
    
    const rulesLog = createDebugLog("[rules]", "rules");
    const taskLog = createDebugLog("[task]", "task");
    
    rulesLog("rules message");
    taskLog("task message");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).not.toContain("rules message");
    expect(content).toContain("[task] task message");
  });

  it("filters by single module: rules only", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "rules";
    
    const rulesLog = createDebugLog("[rules]", "rules");
    const taskLog = createDebugLog("[task]", "task");
    
    rulesLog("rules message");
    taskLog("task message");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[rules] rules message");
    expect(content).not.toContain("task message");
  });

  it("filters by multiple modules", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "task,rules";
    
    const rulesLog = createDebugLog("[rules]", "rules");
    const taskLog = createDebugLog("[task]", "task");
    
    rulesLog("rules message");
    taskLog("task message");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("rules message");
    expect(content).toContain("task message");
  });

  it("handles whitespace in module list", () => {
    process.env.WOPAL_PLUGIN_DEBUG = " task , rules ";
    
    const rulesLog = createDebugLog("[rules]", "rules");
    const taskLog = createDebugLog("[task]", "task");
    
    rulesLog("rules message");
    taskLog("task message");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("rules message");
    expect(content).toContain("task message");
  });

  it("is case-insensitive for module names", () => {
    process.env.WOPAL_PLUGIN_DEBUG = "TASK";
    
    const taskLog = createDebugLog("[task]", "task");
    taskLog("task message");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[task] task message");
  });
});

describe("createWarnLog", () => {
  let tempDir: string;
  let logFile: string;
  let savedVitest: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "warn-test-"));
    logFile = join(tempDir, "warn.log");
    process.env.WOPAL_PLUGIN_LOG_FILE = logFile;
    savedVitest = process.env.VITEST;
    delete process.env.VITEST;
  });

  afterEach(() => {
    delete process.env.WOPAL_PLUGIN_DEBUG;
    delete process.env.WOPAL_PLUGIN_LOG_FILE;
    if (savedVitest !== undefined) process.env.VITEST = savedVitest;
    if (existsSync(logFile)) {
      unlinkSync(logFile);
    }
  });

  it("writes to log file even without WOPAL_PLUGIN_DEBUG", () => {
    // warnLog should always write, regardless of DEBUG flag
    const warn = createWarnLog();
    warn("warning message");
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[plugin] [WARN] warning message");
  });

  it("uses custom prefix", () => {
    const warn = createWarnLog("[custom]");
    warn("custom warning");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[custom] [WARN] custom warning");
  });

  it("uses China Standard Time format (YYYY-MM-DD HH:mm:ss)", () => {
    const warn = createWarnLog();
    warn("timestamp test");
    
    const content = readFileSync(logFile, "utf-8");
    // Match format: 2026-03-15 16:30:45 [plugin] [WARN] timestamp test
    const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /m;
    expect(timestampPattern.test(content)).toBe(true);
  });
});

describe("createInfoLog", () => {
  let tempDir: string;
  let logFile: string;
  let savedVitest: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "info-test-"));
    logFile = join(tempDir, "info.log");
    process.env.WOPAL_PLUGIN_LOG_FILE = logFile;
    savedVitest = process.env.VITEST;
    delete process.env.VITEST;
  });

  afterEach(() => {
    delete process.env.WOPAL_PLUGIN_DEBUG;
    delete process.env.WOPAL_PLUGIN_LOG_FILE;
    if (savedVitest !== undefined) process.env.VITEST = savedVitest;
    if (existsSync(logFile)) {
      unlinkSync(logFile);
    }
  });

  it("writes to log file even without WOPAL_PLUGIN_DEBUG", () => {
    const info = createInfoLog();
    info("info message");
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[plugin] info message");
    expect(content).not.toContain("[WARN]");
  });

  it("uses custom prefix", () => {
    const info = createInfoLog("[tokens]");
    info("token data");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[tokens] token data");
  });

  it("does not include [WARN] suffix", () => {
    const info = createInfoLog("[test]");
    info("no warn");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[test] no warn");
    expect(content).not.toContain("[WARN]");
  });

  it("uses China Standard Time format (YYYY-MM-DD HH:mm:ss)", () => {
    const info = createInfoLog();
    info("timestamp test");
    
    const content = readFileSync(logFile, "utf-8");
    const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /m;
    expect(timestampPattern.test(content)).toBe(true);
  });
});
