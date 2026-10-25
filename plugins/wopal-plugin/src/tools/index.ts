import type { ToolDefinition } from "@wopal/ellamaka-plugin";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { MemoryStore } from "../memory/store.js";
import type { EmbeddingClient } from "../memory/embedder.js";
import type { SessionStore } from "../session-store.js";
import { createWopalTaskTool } from "./wopal-task.js";
import { createWopalOutputTool } from "./wopal-task-output.js";
import { createWopalReplyTool } from "./wopal-task-reply.js";
import { createWopalTaskAbortTool } from "./wopal-task-abort.js";
import { createWopalTaskFinishTool } from "./wopal-task-finish.js";
import { createMemoryManageTool } from "./memory-manage/index.js";
import type { SessionSkillOverlay } from "../session-skill-overlay.js";
import { createWopalSkillGrantTool } from "./wopal-skill-grant.js";

export function createWopalTools(
  manager: SimpleTaskManager,
  store?: MemoryStore,
  embedder?: EmbeddingClient,
  sessionStore?: SessionStore,
  skillOverlay?: SessionSkillOverlay,
): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {
    wopal_task: createWopalTaskTool(manager),
    wopal_task_output: createWopalOutputTool(manager),
    wopal_task_reply: createWopalReplyTool(manager),
    wopal_task_abort: createWopalTaskAbortTool(manager),
    wopal_task_finish: createWopalTaskFinishTool(manager),
    wopal_skill_grant: createWopalSkillGrantTool(
      manager,
      skillOverlay ?? manager.getSkillOverlay(),
    ),
  };

  if (store) {
    tools.memory_manage = createMemoryManageTool(store, embedder, sessionStore);
  }

  return tools;
}

export {
  createWopalTaskTool,
  createWopalOutputTool,
  createWopalReplyTool,
  createWopalTaskAbortTool,
  createWopalTaskFinishTool,
  createWopalSkillGrantTool,
  createMemoryManageTool,
};
