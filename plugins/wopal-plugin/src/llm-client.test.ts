import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(),
      },
    }
  },
}))

import OpenAI from "openai"

beforeAll(() => {
  vi.stubEnv("WOPAL_LLM_BASE_URL", "https://api.test.local/v1")
  vi.stubEnv("WOPAL_LLM_API_KEY", "test-key")
})

async function createClientWithResponse(rawResponse: string) {
    const { LLMClient } = await import("./llm-client.js")
  const client = new LLMClient()
  const mockCreate = (client as unknown as { client: OpenAI }).client.chat.completions.create as ReturnType<typeof vi.fn>
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: rawResponse } }],
  })
  return client
}

describe("LLMClient completeJson", () => {
  it("parses plain JSON object", async () => {
    const client = await createClientWithResponse('{"title":"Hello World"}')
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("Hello World")
  })

  it("extracts JSON from markdown json code block", async () => {
    const client = await createClientWithResponse(
      'Here is the result:\n```json\n{"title":"Code Block Title"}\n```\nDone.'
    )
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("Code Block Title")
  })

  it("extracts JSON from code block without language tag", async () => {
    const client = await createClientWithResponse(
      '```\n{"title":"No Lang Tag"}\n```'
    )
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("No Lang Tag")
  })

  it("extracts JSON surrounded by noise text", async () => {
    const client = await createClientWithResponse(
      'Some preamble text here {"title":"In The Middle"} and some trailing text'
    )
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("In The Middle")
  })

  it("extracts memories object with balanced braces", async () => {
    const raw = '{"memories":[{"content":"test","tags":"a"}]}'
    const client = await createClientWithResponse(raw)
    const result = await client.completeJson<{ memories: Array<{ content: string }> }>("test")
    expect(result.memories).toHaveLength(1)
    expect(result.memories[0].content).toBe("test")
  })

  it("extracts decision object from surrounding text", async () => {
    const raw = '{"decision":"keep","reason":"unique"}'
    const client = await createClientWithResponse(
      'Analysis complete ' + raw + ' end'
    )
    const result = await client.completeJson<{ decision: string }>("test")
    expect(result.decision).toBe("keep")
  })

  it("extracts JSON array", async () => {
    const client = await createClientWithResponse('[{"a":1},{"a":2}]')
    const result = await client.completeJson<Array<{ a: number }>>("test")
    expect(result).toHaveLength(2)
    expect(result[1].a).toBe(2)
  })

  it("throws when no JSON found in response", async () => {
    const client = await createClientWithResponse("No JSON here, just plain text.")
    await expect(client.completeJson("test")).rejects.toThrow("No JSON found in LLM response")
  })

  it("repairs trailing commas before closing braces", async () => {
    const client = await createClientWithResponse('{"title":"Trailing",}')
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("Trailing")
  })

  it("repairs trailing commas before closing brackets", async () => {
    const client = await createClientWithResponse('{"items":[1,2,3,]}')
    const result = await client.completeJson<{ items: number[] }>("test")
    expect(result.items).toEqual([1, 2, 3])
  })

  it("repairs literal newlines inside JSON strings", async () => {
    const client = await createClientWithResponse('{"title":"line1\nline2"}')
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("line1\nline2")
  })

  it("repairs missing closing braces when extractable", async () => {
    const client = await createClientWithResponse('{"title":"unclosed"},')
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("unclosed")
  })

  it("throws on completely unclosed JSON with no closing brace", async () => {
    const client = await createClientWithResponse('{"title":"unclosed"')
    await expect(client.completeJson("test")).rejects.toThrow("No JSON found in LLM response")
  })

  it("repairs missing closing brackets when extractable", async () => {
    const client = await createClientWithResponse('{"items":[1,2]},')
    const result = await client.completeJson<{ items: number[] }>("test")
    expect(result.items).toEqual([1, 2])
  })

  it("handles balanced braces inside string values", async () => {
    const client = await createClientWithResponse('{"title":"a {b} c"}')
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe("a {b} c")
  })

  it("handles escaped quotes inside string values", async () => {
    const client = await createClientWithResponse('{"title":"He said \\"hello\\""}')
    const result = await client.completeJson<{ title: string }>("test")
    expect(result.title).toBe('He said "hello"')
  })
})
