import { describe, it, expect } from "vitest"
import { ConcurrencyManager } from "./concurrency-manager.js"

describe("ConcurrencyManager", () => {
  it("should allow acquire when under limit", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 3)

    expect(manager.getCount("key1")).toBe(1)
  })

  it("should track multiple acquires", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 3)
    await manager.acquire("key1", 3)
    await manager.acquire("key1", 3)

    expect(manager.getCount("key1")).toBe(3)
  })

  it("should queue when at limit", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 2)
    await manager.acquire("key1", 2)

    const acquirePromise = manager.acquire("key1", 2)

    expect(manager.getCount("key1")).toBe(2)
    expect(manager.getQueueLength("key1")).toBe(1)

    // The promise should not resolve yet
    let resolved = false
    acquirePromise.then(() => {
      resolved = true
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(resolved).toBe(false)
  })

  it("should hand off slot on release", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 1)

    const acquirePromise = manager.acquire("key1", 1)

    expect(manager.getQueueLength("key1")).toBe(1)

    manager.release("key1")

    await acquirePromise

    expect(manager.getCount("key1")).toBe(1)
    expect(manager.getQueueLength("key1")).toBe(0)
  })

  it("should decrement count when no waiters", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 3)
    expect(manager.getCount("key1")).toBe(1)

    manager.release("key1")

    expect(manager.getCount("key1")).toBe(0)
  })

  it("should cancel waiters", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 1)
    const acquirePromise = manager.acquire("key1", 1)

    manager.cancelWaiters("key1")

    await expect(acquirePromise).rejects.toThrow(
      "Concurrency queue cancelled for: key1"
    )
  })

  it("should clear all state", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 3)
    await manager.acquire("key2", 3)

    manager.clear()

    expect(manager.getCount("key1")).toBe(0)
    expect(manager.getCount("key2")).toBe(0)
  })

  it("should handle multiple keys independently", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 2)
    await manager.acquire("key2", 2)

    expect(manager.getCount("key1")).toBe(1)
    expect(manager.getCount("key2")).toBe(1)
  })

  it("should handle settled flag to prevent double-resolution", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 1)
    const acquirePromise = manager.acquire("key1", 1)

    // Cancel waiters (sets settled=true)
    manager.cancelWaiters("key1")

    await expect(acquirePromise).rejects.toThrow()

    // Release should not cause issues
    manager.release("key1")

    expect(manager.getCount("key1")).toBe(0)
  })

  it("should skip settled entries in queue during release", async () => {
    const manager = new ConcurrencyManager()

    await manager.acquire("key1", 1)
    const acquirePromise1 = manager.acquire("key1", 1)
    const acquirePromise2 = manager.acquire("key1", 1)

    // Cancel all waiters (both entries get settled=true)
    manager.cancelWaiters("key1")

    await expect(acquirePromise1).rejects.toThrow()
    await expect(acquirePromise2).rejects.toThrow()

    // Release should decrement count since no valid waiters
    manager.release("key1")
    expect(manager.getCount("key1")).toBe(0)
  })
})