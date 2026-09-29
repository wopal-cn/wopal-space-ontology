import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createRuntimeContext } from "./runtime-context.js";
import { loadRuntimeEnvironment } from "./runtime-environment.js";
import { resolveResources } from "./resources/index.js";
import type { MemoryStore } from "./memory/store.js";
import type { EmbeddingClient } from "./memory/embedder.js";
import type { LLMClient } from "./llm-client.js";
import type { LoggerInstance } from "./logger.js";

describe("loadRuntimeEnvironment", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture(): { wopalHome: string; spaceRoot: string } {
    const root = join(tmpdir(), `wopal-runtime-env-${crypto.randomUUID()}`);
    const wopalHome = join(root, "home");
    const spaceRoot = join(root, "space");
    mkdirSync(join(spaceRoot, ".wopal"), { recursive: true });
    mkdirSync(wopalHome, { recursive: true });
    roots.push(root);
    return { wopalHome, spaceRoot };
  }

  it("keeps whitelisted secret and log variables from home, space, and process", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(
      join(wopalHome, ".env"),
      [
        "WOPAL_LLM_API_KEY=home-key",
        "WOPAL_PLUGIN_LOG_LEVEL=home-debug",
        "WOPAL_HOME=/home/overridden",
      ].join("\n"),
    );
    writeFileSync(
      join(spaceRoot, ".wopal", ".env"),
      [
        "WOPAL_LLM_API_KEY=space-key",
        "WOPAL_EMBEDDING_API_KEY=space-embedding",
      ].join("\n"),
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });

    const env = loadRuntimeEnvironment(context, {
      WOPAL_PLUGIN_LOG_LEVEL: "process-warn",
      WOPAL_PLUGIN_LOG_MODULES: "memory",
      WOPAL_PLUGIN_LOG_FILE: "/tmp/plugin.log",
    });

    expect(env.WOPAL_LLM_API_KEY).toBe("space-key");
    expect(env.WOPAL_EMBEDDING_API_KEY).toBe("space-embedding");
    expect(env.WOPAL_PLUGIN_LOG_LEVEL).toBe("process-warn");
    expect(env.WOPAL_PLUGIN_LOG_MODULES).toBe("memory");
    expect(env.WOPAL_PLUGIN_LOG_FILE).toBe("/tmp/plugin.log");
    expect(env.WOPAL_HOME).toBe("/home/overridden");
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("reads ELLAMAKA_LOG_LEVEL from the process environment and ignores .env files", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(join(wopalHome, ".env"), "ELLAMAKA_LOG_LEVEL=DEBUG\n");
    writeFileSync(
      join(spaceRoot, ".wopal", ".env"),
      "ELLAMAKA_LOG_LEVEL=WARN\n",
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });

    const env = loadRuntimeEnvironment(context, {
      ELLAMAKA_LOG_LEVEL: "ERROR",
    });

    expect(env.ELLAMAKA_LOG_LEVEL).toBe("ERROR");
  });

  it("does not expose ELLAMAKA_LOG_LEVEL from .env when the process environment has none", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(join(wopalHome, ".env"), "ELLAMAKA_LOG_LEVEL=DEBUG\n");
    writeFileSync(
      join(spaceRoot, ".wopal", ".env"),
      "ELLAMAKA_LOG_LEVEL=WARN\n",
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });

    const env = loadRuntimeEnvironment(context, {});

    expect(env.ELLAMAKA_LOG_LEVEL).toBeUndefined();
  });

  it("keeps connection parameters required by resource clients", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(
      join(wopalHome, ".env"),
      [
        "WOPAL_LLM_BASE_URL=http://llm.home.invalid",
        "WOPAL_LLM_MODEL=home-llm-model",
        "WOPAL_LLM_API_KEY=home-key",
        "WOPAL_EMBEDDING_BASE_URL=http://embedding.home.invalid",
        "WOPAL_EMBEDDING_MODEL=home-embedding-model",
        "WOPAL_EMBEDDING_API_KEY=home-embedding-key",
      ].join("\n"),
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });

    const env = loadRuntimeEnvironment(context, {});

    expect(env.WOPAL_LLM_BASE_URL).toBe("http://llm.home.invalid");
    expect(env.WOPAL_LLM_MODEL).toBe("home-llm-model");
    expect(env.WOPAL_LLM_API_KEY).toBe("home-key");
    expect(env.WOPAL_EMBEDDING_BASE_URL).toBe("http://embedding.home.invalid");
    expect(env.WOPAL_EMBEDDING_MODEL).toBe("home-embedding-model");
    expect(env.WOPAL_EMBEDDING_API_KEY).toBe("home-embedding-key");
  });

  it("excludes feature switches and prompt path variables", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(
      join(wopalHome, ".env"),
      [
        "WOPAL_MEMORY_ENABLED=true",
        "WOPAL_RULES_INJECTION_ENABLED=true",
        "WOPAL_MEMORY_INJECTION_ENABLED=true",
        "WOPAL_DISTILL_PROMPT_FILE=/tmp/distill.md",
        "WOPAL_DEDUP_PROMPT_FILE=/tmp/dedup.md",
        "WOPAL_TITLE_PROMPT_FILE=/tmp/title.md",
      ].join("\n"),
    );
    writeFileSync(
      join(spaceRoot, ".wopal", ".env"),
      [
        "WOPAL_MEMORY_ENABLED=false",
        "WOPAL_TITLE_PROMPT_FILE=/tmp/space-title.md",
      ].join("\n"),
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });

    const env = loadRuntimeEnvironment(context, {
      WOPAL_MEMORY_ENABLED: "true",
    });

    expect(env.WOPAL_MEMORY_ENABLED).toBeUndefined();
    expect(env.WOPAL_RULES_INJECTION_ENABLED).toBeUndefined();
    expect(env.WOPAL_MEMORY_INJECTION_ENABLED).toBeUndefined();
    expect(env.WOPAL_DISTILL_PROMPT_FILE).toBeUndefined();
    expect(env.WOPAL_DEDUP_PROMPT_FILE).toBeUndefined();
    expect(env.WOPAL_TITLE_PROMPT_FILE).toBeUndefined();
  });

  it("only exposes whitelisted keys", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(
      join(wopalHome, ".env"),
      "WOPAL_LLM_API_KEY=key\nWOPAL_MEMORY_ENABLED=true\nOTHER_VAR=x\n",
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });

    const env = loadRuntimeEnvironment(context, {
      WOPAL_LLM_API_KEY: "process-key",
      WOPAL_MEMORY_ENABLED: "false",
    });

    expect(Object.keys(env).sort()).toEqual(["WOPAL_LLM_API_KEY"]);
  });

  it("does not load space values for a non-space invocation", () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(join(wopalHome, ".env"), "WOPAL_LLM_API_KEY=home\n");
    writeFileSync(
      join(spaceRoot, ".wopal", ".env"),
      "WOPAL_LLM_API_KEY=space\n",
    );
    const context = createRuntimeContext({ directory: spaceRoot, wopalHome });

    expect(loadRuntimeEnvironment(context, {}).WOPAL_LLM_API_KEY).toBe("home");
  });

  it("does not mutate the supplied process environment", () => {
    const { wopalHome } = fixture();
    writeFileSync(join(wopalHome, ".env"), "WOPAL_LLM_API_KEY=from-file\n");
    const baseline: Record<string, string | undefined> = {
      WOPAL_LLM_API_KEY: "existing",
    };
    const context = createRuntimeContext({ directory: wopalHome, wopalHome });

    loadRuntimeEnvironment(context, baseline);

    expect(baseline).toEqual({ WOPAL_LLM_API_KEY: "existing" });
  });

  it("supports resource construction from environment-only deployment", async () => {
    const { wopalHome, spaceRoot } = fixture();
    writeFileSync(
      join(wopalHome, ".env"),
      [
        "WOPAL_LLM_BASE_URL=http://llm.env-only.invalid",
        "WOPAL_LLM_API_KEY=env-llm-key",
        "WOPAL_EMBEDDING_BASE_URL=http://embedding.env-only.invalid",
        "WOPAL_EMBEDDING_MODEL=env-embedding-model",
        "WOPAL_EMBEDDING_API_KEY=env-embedding-key",
      ].join("\n"),
    );
    const context = createRuntimeContext({
      directory: spaceRoot,
      wopalHome,
      wopalSpaceRoot: spaceRoot,
    });
    const env = loadRuntimeEnvironment(context, {});

    const calls: string[] = [];
    const resources = await resolveResources(
      {
        memory: { enabled: true, injection: true },
        context: { enabled: true },
      },
      {
        context,
        env,
        loggers: { core: noopLogger(), memory: noopLogger() },
      },
      {
        createStore: async () => {
          calls.push("store");
          return {} as MemoryStore;
        },
        createEmbedder: async (deps) => {
          calls.push("embedder");
          expect(deps.environment.WOPAL_EMBEDDING_BASE_URL).toBe(
            "http://embedding.env-only.invalid",
          );
          expect(deps.environment.WOPAL_EMBEDDING_MODEL).toBe(
            "env-embedding-model",
          );
          expect(deps.environment.WOPAL_EMBEDDING_API_KEY).toBe(
            "env-embedding-key",
          );
          return {} as EmbeddingClient;
        },
        createLLM: async (deps) => {
          calls.push("llm");
          expect(deps.environment.WOPAL_LLM_BASE_URL).toBe(
            "http://llm.env-only.invalid",
          );
          expect(deps.environment.WOPAL_LLM_API_KEY).toBe("env-llm-key");
          return {} as LLMClient;
        },
      },
    );

    expect(calls.sort()).toEqual(["embedder", "llm", "store"]);
    expect(resources.store).toBeDefined();
    expect(resources.embedder).toBeDefined();
    expect(resources.llm).toBeDefined();
  });
});

function noopLogger(): LoggerInstance {
  const noop = (): void => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  };
}
