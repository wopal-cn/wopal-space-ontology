import { describe, it, expect, vi } from "vitest"
import { handleQuestionAsked, type QuestionAskedEvent } from "./question-relay.js"
import type { SimpleTaskManager } from "./simple-task-manager.js"
import type { WopalTask } from "../types.js"

// Mock client factory
function createMockClient() {
  return {
    session: {
      promptAsync: vi.fn().mockResolvedValue(undefined),
    },
  }
}

// Mock task manager with shared client
function createMockTaskManager(task?: WopalTask, client?: ReturnType<typeof createMockClient>): SimpleTaskManager {
  const mockClient = client ?? createMockClient()
  return {
    findBySession: vi.fn((sessionID: string) => (task?.sessionID === sessionID ? task : undefined)),
    getTask: vi.fn((id: string) => (task?.id === id ? task : undefined)),
    getClient: vi.fn(() => mockClient),
  } as unknown as SimpleTaskManager
}

describe("handleQuestionAsked", () => {
  const mockTask: WopalTask = {
    id: "wopal-task-123",
    sessionID: "child-session-456",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "Do something",
    parentSessionID: "parent-session-789",
  }

  it("子会话提问：设置 task.status 为 waiting", async () => {
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    const event: QuestionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "question-req-001",
      question: {
        header: "What should I do?",
      },
    }

    expect(mockTask.status).toBe("running")

    await handleQuestionAsked(event, mockManager)

    expect(mockTask.status).toBe("waiting")
    expect(mockTask.waitingReason).toBe("question_tool")
    expect(mockTask.pendingQuestionID).toBe("question-req-001")
  })

  it("子会话提问：向父代理注入 [WOPAL TASK QUESTION] 通知", async () => {
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    const event: QuestionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "question-req-002",
      question: {
        header: "What should I do?",
      },
    }

    const result = await handleQuestionAsked(event, mockManager)

    expect(result).toBe(true)
    expect(mockClient.session.promptAsync).toHaveBeenCalled()

    const promptCall = mockClient.session.promptAsync.mock.calls[0][0]
    const notification = promptCall.body.parts[0].text
    expect(notification).toContain("[WOPAL TASK QUESTION]")
  })

  it("主会话提问：不注入通知，返回 false", async () => {
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(undefined, mockClient)
    const event: QuestionAskedEvent = {
      sessionID: "main-session-999",
      requestID: "question-req-003",
      question: {
        header: "Question for main session",
      },
    }

    const result = await handleQuestionAsked(event, mockManager)

    expect(result).toBe(false)
    expect(mockClient.session.promptAsync).not.toHaveBeenCalled()
  })

  it("通知包含完整内容：question body + options 都在通知中", async () => {
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    const event: QuestionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "question-req-004",
      question: {
        header: "Which option?",
        question: "Which option do you prefer?",
        options: [
          { label: "Option A", description: "First choice" },
          { label: "Option B", description: "Second choice" },
        ],
      },
    }

    const result = await handleQuestionAsked(event, mockManager)

    expect(result).toBe(true)

    const promptCall = mockClient.session.promptAsync.mock.calls[0][0]
    const notification = promptCall.body.parts[0].text

    expect(notification).toContain("Which option do you prefer?")
    expect(notification).toContain("Option A")
    expect(notification).toContain("Option B")
    expect(notification).toContain("**Options:**")
  })

  it("notifyParent 失败不崩溃：捕获异常，不传播", async () => {
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(mockTask, mockClient)
    mockClient.session.promptAsync.mockRejectedValueOnce(new Error("Network error"))

    const event: QuestionAskedEvent = {
      sessionID: "child-session-456",
      requestID: "question-req-005",
      question: {
        header: "Test question",
      },
    }

    // Should not throw
    const result = await handleQuestionAsked(event, mockManager)

    expect(result).toBe(false) // Failed, returns false
  })

  it("无 requestID 时：pendingQuestionID 不设置", async () => {
    const freshTask: WopalTask = {
      id: "wopal-task-fresh",
      sessionID: "child-session-fresh",
      status: "running",
      description: "Fresh task",
      agent: "fae",
      prompt: "Do something",
      parentSessionID: "parent-session-789",
    }
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(freshTask, mockClient)
    const event: QuestionAskedEvent = {
      sessionID: "child-session-fresh",
      question: {
        header: "What should I do?",
      },
    }

    await handleQuestionAsked(event, mockManager)

    expect(freshTask.status).toBe("waiting")
    expect(freshTask.pendingQuestionID).toBeUndefined()
  })
})