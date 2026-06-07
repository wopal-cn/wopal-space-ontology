/**
 * Concurrency manager with FIFO queue per key.
 *
 * Uses the settled-flag pattern to prevent double-resolution:
 * - acquire() creates a queue entry with settled=false
 * - release() sets settled=true and resolves the next waiter
 * - cancelWaiters() sets settled=true before rejecting
 *
 * This prevents cancelWaiters from rejecting an entry that was
 * already resolved by release().
 */

interface QueueEntry {
  resolve: () => void
  rawReject: (error: Error) => void
  settled: boolean
}

export class ConcurrencyManager {
  private counts = new Map<string, number>()
  private queues = new Map<string, QueueEntry[]>()

  /**
   * Acquire a concurrency slot for the given key.
   * If limit is reached, waits in FIFO queue.
   */
  async acquire(key: string, limit: number): Promise<void> {
    const current = this.counts.get(key) ?? 0
    if (current < limit) {
      this.counts.set(key, current + 1)
      return
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        resolve: () => {
          if (entry.settled) return
          entry.settled = true
          resolve()
        },
        rawReject: reject,
        settled: false,
      }

      const queue = this.queues.get(key) ?? []
      queue.push(entry)
      this.queues.set(key, queue)
    })
  }

  /**
   * Release a concurrency slot for the given key.
   * If there are waiters, hands off the slot to the next one.
   */
  release(key: string): void {
    const queue = this.queues.get(key)

    // Try to hand off to a waiting entry (skip any settled entries from cancelWaiters)
    while (queue && queue.length > 0) {
      const next = queue.shift()!
      if (!next.settled) {
        // Hand off the slot to this waiter (count stays the same)
        next.resolve()
        return
      }
    }

    // No handoff occurred - decrement the count to free the slot
    const current = this.counts.get(key) ?? 0
    if (current > 0) {
      this.counts.set(key, current - 1)
    }
  }

  /**
   * Cancel all waiting acquires for a key. Used during cleanup.
   */
  cancelWaiters(key: string): void {
    const queue = this.queues.get(key)
    if (queue) {
      for (const entry of queue) {
        if (!entry.settled) {
          entry.settled = true
          entry.rawReject(new Error(`Concurrency queue cancelled for: ${key}`))
        }
      }
      this.queues.delete(key)
    }
  }

  /**
   * Clear all state. Used during manager cleanup/shutdown.
   * Cancels all pending waiters.
   */
  clear(): void {
    for (const [key] of this.queues) {
      this.cancelWaiters(key)
    }
    this.counts.clear()
    this.queues.clear()
  }

  /**
   * Non-blocking acquire. Returns true if slot acquired, false if limit reached.
   */
  tryAcquire(key: string, limit: number): boolean {
    const current = this.counts.get(key) ?? 0
    if (current < limit) {
      this.counts.set(key, current + 1)
      return true
    }
    return false
  }

  /**
   * Get current count for a key (for testing/debugging)
   */
  getCount(key: string): number {
    return this.counts.get(key) ?? 0
  }

  /**
   * Get queue length for a key (for testing/debugging)
   */
  getQueueLength(key: string): number {
    return this.queues.get(key)?.length ?? 0
  }
}