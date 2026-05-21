import type { ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import type { MemoryStore } from "../memory/store.js"
import type { EmbeddingClient } from "../memory/embedder.js"
import type { SessionStore } from "../session-store.js"
import type { DistillEngine } from "../memory/distill.js"
import { createWopalTaskTool } from "./wopal-task.js"
import { createWopalOutputTool } from "./wopal-task-output.js"
import { createWopalReplyTool } from "./wopal-task-reply.js"
import { createWopalTaskAbortTool } from "./wopal-task-abort.js"
import { createWopalTaskFinishTool } from "./wopal-task-finish.js"
import { createMemoryManageTool } from "./memory-manage/index.js"

export function createWopalTools(
  manager: SimpleTaskManager,
  store?: MemoryStore,
  embedder?: EmbeddingClient,
  sessionStore?: SessionStore,
  distillEngine?: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {
    wopal_task: createWopalTaskTool(manager),
    wopal_task_output: createWopalOutputTool(manager),
    wopal_task_reply: createWopalReplyTool(manager),
    wopal_task_abort: createWopalTaskAbortTool(manager),
    wopal_task_finish: createWopalTaskFinishTool(manager),
  }

  if (store) {
    tools.memory_manage = createMemoryManageTool(store, embedder, sessionStore, distillEngine, client)
  }

  return tools
}

export { createWopalTaskTool, createWopalOutputTool, createWopalReplyTool, createWopalTaskAbortTool, createWopalTaskFinishTool, createMemoryManageTool }