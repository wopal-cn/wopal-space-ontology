import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";
import { formatSessionID } from "../debug.js";

interface CommandExecuteBeforeInput {
  command: string;
  sessionID: string;
  arguments: string;
}

interface CommandExecuteBeforeOutput {
  parts: Array<{ type?: string; text?: string; synthetic?: boolean }>;
}

interface ToolExecuteBeforeInput {
  tool?: string;
  sessionID?: string;
  callID?: string;
}

interface ToolExecuteBeforeOutput {
  args?: Record<string, unknown>;
}

interface ToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: Record<string, unknown>;
}

interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: unknown;
}

export interface CommandHookContext {
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
  projectDirectory: string;
}

export function createCommandHooks(ctx: CommandHookContext) {
  async function onToolDefinition(
    _input: { toolID: string },
    _output: { description: string; parameters: unknown },
  ): Promise<void> {
    if (_input.toolID !== "memory_manage") {
      return;
    }

    // NOTE: 不再硬编码覆盖 description。工具的展示义务区分定义在
    // src/tools/memory-manage/index.ts 中，onToolDefinition 不应篡改。
    // 命令层的展示要求通过 command.execute.before 注入（见下方）。
  }

  async function onCommandExecuteBefore(
    input: CommandExecuteBeforeInput,
    output: CommandExecuteBeforeOutput,
  ): Promise<void> {
    if (input.command !== "memory") {
      return;
    }

    const first = output.parts.find(
      (part) => part.type === "text" && typeof part.text === "string",
    );
    if (!first?.text) {
      return;
    }

    first.text = [
      "这是一个立即执行命令，不是规则阅读任务。",
      "你必须立刻调用 memory_manage 工具，不要解释命令，不要复述规则。",
      "如果是 list，默认使用 limit=100 一次拿完，除非用户显式指定 limit。",
      "tool 返回值对用户不可见。你必须把工具返回的完整文本逐字写入回复。",
      "严禁概括、严禁摘要、严禁只汇总结论、严禁省略任意一条记忆。",
      "因为用户需要逐条审查完整内容，决定删除或调整哪一条。",
      "如果你没有把完整结果写出来，这次命令就是失败的。",
      "",
      first.text,
    ].join("\n");
  }

  async function onToolExecuteBefore(
    input: ToolExecuteBeforeInput,
    _output: ToolExecuteBeforeOutput,
  ): Promise<void> {
    const sessionID = input?.sessionID;
    const toolName = input?.tool;

    if (!sessionID || !toolName) {
      return;
    }

    if (toolName === "skill") {
      const skillName = _output?.args?.name;
      if (typeof skillName === "string" && skillName.length > 0) {
        ctx.sessionStore.recordSkillLoaded(sessionID, skillName);
        ctx.contextDebugLog(`[skill] ${formatSessionID(sessionID, false)} loaded: ${skillName}`);
      }
    }
  }

  async function onToolExecuteAfter(
    _input: ToolExecuteAfterInput,
    _output: ToolExecuteAfterOutput,
  ): Promise<void> {
    // No-op: memory_manage echo handled via tool return string
  }

  return {
    "command.execute.before": onCommandExecuteBefore,
    "tool.execute.before": onToolExecuteBefore,
    "tool.execute.after": onToolExecuteAfter,
    "tool.definition": onToolDefinition,
  };
}