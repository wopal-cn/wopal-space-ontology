import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MemoryStore, MemoryInput, MemoryCategory } from "./store.js";

// Helper to create a 768-dim Float32Array vector
function createVector(): Float32Array {
  const vec = new Float32Array(768);
  for (let i = 0; i < 768; i++) {
    vec[i] = Math.random();
  }
  return vec;
}

describe("MemoryStore", () => {
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "memory-store-test-"));
    store = new MemoryStore(tempDir);
    await store.init();
  });

  afterEach(() => {
    // tempDir is in /tmp, no need to clean up
  });

  describe("add + update (core bug verification)", () => {
    it("should update text without schema error and preserve created_at", async () => {
      const input: MemoryInput = {
        text: "## 测试记忆: 这是一个测试记忆条目，用于验证 add 和 update 功能正常工作",
        vector: createVector(),
        category: "knowledge" as MemoryCategory,
        project: "test-project",
        session_id: "test-session",
        importance: 0.8,
      };

      const memory = await store.add(input);
      const originalCreatedAt = memory.created_at;

      // Wait a bit to ensure updated_at differs
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update the text
      await store.update(memory.id, { text: "## 更新后的记忆: 这是更新后的内容，验证 schema 不报错" });

      // Get the updated memory
      const updated = await store.get(memory.id);

      expect(updated).not.toBeNull();
      expect(updated!.text).toBe("## 更新后的记忆: 这是更新后的内容，验证 schema 不报错");
      expect(updated!.created_at).toBe(originalCreatedAt); // created_at preserved
      expect(updated!.updated_at).toBeGreaterThan(originalCreatedAt); // updated_at changed
    });
  });

  describe("add + get", () => {
    it("should return complete Memory object with correct field types", async () => {
      const input: MemoryInput = {
        text: "## 完整记忆测试: 这是一个完整的记忆对象测试，包含所有字段验证类型正确性",
        vector: createVector(),
        category: "preference" as MemoryCategory,
        project: "test-project",
        session_id: "test-session",
        importance: 0.5,
        metadata: { key: "value", num: 42 },
      };

      const added = await store.add(input);
      const retrieved = await store.get(added.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(added.id);
      expect(retrieved!.text).toBe(input.text);
      // LanceDB returns Arrow FloatVector, check length instead of type
      expect(retrieved!.vector.length).toBe(768);
      expect(retrieved!.category).toBe(input.category);
      expect(retrieved!.project).toBe(input.project);
      expect(retrieved!.session_id).toBe(input.session_id);
      expect(retrieved!.importance).toBe(input.importance);
      expect(typeof retrieved!.created_at).toBe("number");
      expect(typeof retrieved!.updated_at).toBe("number");
      expect(typeof retrieved!.access_count).toBe("number");
      expect(retrieved!.metadata).toEqual({ key: "value", num: 42 });
    });

    it("should be idempotent for exact duplicate memory in same session", async () => {
      const input: MemoryInput = {
        text: "## 完整重复记忆测试: 这是一个用于验证同 session 同分类同正文不会重复写入的测试记忆",
        vector: createVector(),
        category: "knowledge" as MemoryCategory,
        project: "test-project",
        session_id: "test-session",
        importance: 0.5,
        metadata: { key: "value" },
      };

      const first = await store.add(input);
      const second = await store.add({
        ...input,
        vector: createVector(),
      });

      expect(second.id).toBe(first.id);
      expect(await store.count()).toBe(1);
    });
  });

  describe("update non-existent id", () => {
    it("should throw error for non-existent id", async () => {
      // Update a non-existent ID should throw
      await expect(
        store.update("non-existent-id-12345", { text: "should throw" })
      ).rejects.toThrow("Memory not found for update: non-existent-id-12345");
    });
  });

  describe("delete + count", () => {
    it("should correctly count rows after add and delete", async () => {
      const input1: MemoryInput = {
        text: "## 记忆一: 第一个测试记忆用于计数功能验证，确保 count 方法正常工作",
        vector: createVector(),
        category: "knowledge" as MemoryCategory,
        project: "test-project",
        session_id: "test-session",
      };

      const input2: MemoryInput = {
        text: "## 记忆二: 第二个测试记忆用于计数功能验证，与第一个一起测试 delete",
        vector: createVector(),
        category: "knowledge" as MemoryCategory,
        project: "test-project",
        session_id: "test-session",
      };

      const mem1 = await store.add(input1);
      const mem2 = await store.add(input2);

      expect(await store.count()).toBe(2);

      await store.delete(mem1.id);
      expect(await store.count()).toBe(1);

      // Verify mem2 still exists
      const remaining = await store.get(mem2.id);
      expect(remaining).not.toBeNull();
    });
  });

  describe("searchByQuery", () => {
    it("should find matching results with 'like' query type", async () => {
      const uniqueText = "## 独特标记记忆: 这条记忆包含独特关键词 UNIQUE_KEYWORD_42 用于搜索测试验证";
      const input: MemoryInput = {
        text: uniqueText,
        vector: createVector(),
        category: "knowledge" as MemoryCategory,
        project: "test-project",
        session_id: "test-session",
      };

      await store.add(input);

      // Search for the unique keyword
      const results = await store.searchByQuery("UNIQUE_KEYWORD_42", 10, "like");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toContain("UNIQUE_KEYWORD_42");
    });
  });
});
