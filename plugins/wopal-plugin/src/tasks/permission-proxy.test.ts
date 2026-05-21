import { describe, it, expect, vi } from "vitest"
import { handlePermissionAsked, type PermissionAskedEvent } from "./permission-proxy.js"
import type { SimpleTaskManager } from "./simple-task-manager.js"
import type { WopalTask } from "../types.js"

function createV1MockClient() {
  return {
    postSessionIdPermissionsPermissionId: vi.fn().mockResolvedValue(true),
    session: {
      promptAsync: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function createV2MockClient() {
  return {
    permission: {
      reply: vi.fn().mockResolvedValue(true),
    },
    session: {
      promptAsync: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function createMockTaskManager(task?: WopalTask, client?: ReturnType<typeof createV1MockClient>): SimpleTaskManager {
  const mockClient = client ?? createV1MockClient()
  return {
    findBySession: vi.fn((sessionID: string) => (task?.sessionID === sessionID ? task : undefined)),
    getTask: vi.fn((id: string) => (task?.id === id ? task : undefined)),
    getClient: vi.fn(() => mockClient),
  } as unknown as SimpleTaskManager
}

describe("handlePermissionAsked", () => {
  const mockTask: WopalTask = {
    id: "wopal-task-123",
    sessionID: "child-session-456",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "Do something",
    parentSessionID: "parent-session-789",
  }

  it("v1 SDK: 子会话权限请求调用 postSessionIdPermissionsPermissionId", async () => {
    const mockClient = createV1MockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    const event: PermissionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "per-abc123",
      permission: "bash",
    }

    const result = await handlePermissionAsked(event, mockManager, mockClient)

    expect(result).toBe(true)
    expect(mockClient.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
      path: { id: "child-session-456", permissionID: "per-abc123" },
      body: { response: "once" },
    })
    expect(mockClient.session.promptAsync).toHaveBeenCalled()
  })

  it("v2 SDK: 子会话权限请求调用 permission.reply", async () => {
    const mockClient = createV2MockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient as any)
    const event: PermissionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "per-abc123",
      permission: "bash",
    }

    const result = await handlePermissionAsked(event, mockManager, mockClient)

    expect(result).toBe(true)
    expect(mockClient.permission.reply).toHaveBeenCalledWith({
      requestID: "per-abc123",
      reply: "once",
    })
  })

  it("主会话权限请求：不调用 reply，返回 false", async () => {
    const mockClient = createV1MockClient()
    const mockManager = createMockTaskManager(undefined, mockClient)
    const event: PermissionAskedEvent = {
      sessionID: "main-session-999",
      requestID: "per-xyz789",
      permission: "write",
    }

    const result = await handlePermissionAsked(event, mockManager, mockClient)

    expect(result).toBe(false)
    expect(mockClient.postSessionIdPermissionsPermissionId).not.toHaveBeenCalled()
  })

  it("v1 reply 参数正确性：path 包含 sessionID 和 requestID", async () => {
    const mockClient = createV1MockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    const event: PermissionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "per-test-request-id",
      permission: "edit",
      patterns: ["src/**/*.ts"],
    }

    await handlePermissionAsked(event, mockManager, mockClient)

    const replyCall = mockClient.postSessionIdPermissionsPermissionId.mock.calls[0][0]
    expect(replyCall.path.id).toBe("child-session-456")
    expect(replyCall.path.permissionID).toBe("per-test-request-id")
    expect(replyCall.body.response).toBe("once")
  })

  it("reply 失败不崩溃：捕获异常，不传播", async () => {
    const mockClient = createV1MockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    mockClient.postSessionIdPermissionsPermissionId.mockRejectedValueOnce(new Error("Network error"))

    const event: PermissionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "per-fail",
      permission: "bash",
    }

    const result = await handlePermissionAsked(event, mockManager, mockClient)

    expect(result).toBe(false)
  })

  it("通知包含权限信息：通知中包含 permission 类型和 patterns", async () => {
    const mockClient = createV1MockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    const event: PermissionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "per-with-patterns",
      permission: "write",
      patterns: ["file1.ts", "file2.ts"],
    }

    await handlePermissionAsked(event, mockManager, mockClient)

    const promptCall = mockClient.session.promptAsync.mock.calls[0][0]
    const notification = promptCall.body.parts[0].text

    expect(notification).toContain("write")
    expect(notification).toContain("file1.ts")
    expect(notification).toContain("file2.ts")
    expect(notification).toContain("[WOPAL TASK PERMISSION]")
  })
})
