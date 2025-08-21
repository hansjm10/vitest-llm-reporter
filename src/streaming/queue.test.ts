/**
 * Tests for priority output queue system
 *
 * @module streaming/queue.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PriorityOutputQueue, TestOutputQueue, OutputPriority, OutputSource } from './queue.js'

describe('PriorityOutputQueue', () => {
  let queue: PriorityOutputQueue

  beforeEach(() => {
    queue = new PriorityOutputQueue({
      defaultTimeout: 1000,
      enableBatching: false // Disable for predictable testing
    })
  })

  afterEach(async () => {
    queue.clear()
  })

  describe('basic operations', () => {
    it('should enqueue and process operations', async () => {
      let executed = false

      await queue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'test data', () => {
        executed = true
      })

      expect(executed).toBe(true)
    })

    it('should process operations in priority order', async () => {
      const results: string[] = []

      // Enqueue in reverse priority order
      const promise1 = queue.enqueue(OutputPriority.LOW, OutputSource.TEST, 'low', () => {
        results.push('low')
      })

      const promise2 = queue.enqueue(
        OutputPriority.CRITICAL,
        OutputSource.ERROR,
        'critical',
        () => {
          results.push('critical')
        }
      )

      const promise3 = queue.enqueue(OutputPriority.HIGH, OutputSource.TEST, 'high', () => {
        results.push('high')
      })

      await Promise.all([promise1, promise2, promise3])

      expect(results).toEqual(['critical', 'high', 'low'])
    })

    it('should handle async executors', async () => {
      let value = 0

      await queue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'async test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        value = 42
      })

      expect(value).toBe(42)
    })

    it('should timeout long-running operations', async () => {
      const shortQueue = new PriorityOutputQueue({ defaultTimeout: 100 })

      const start = Date.now()
      await expect(
        shortQueue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'timeout test', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
        })
      ).rejects.toThrow('Operation timeout')

      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(90)
      expect(elapsed).toBeLessThan(150)
    })
  })

  describe('queue management', () => {
    it('should respect max size limit', async () => {
      const limitedQueue = new PriorityOutputQueue({ maxSize: 2 })

      // Fill the queue
      const promise1 = limitedQueue.enqueue(
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'test1',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      )

      const promise2 = limitedQueue.enqueue(
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'test2',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      )

      // This should be rejected due to size limit
      await expect(
        limitedQueue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'test3', () => {})
      ).rejects.toThrow('Queue size limit exceeded')

      await Promise.allSettled([promise1, promise2])
    })

    it('should clear all operations', async () => {
      const promises = []

      for (let i = 0; i < 5; i++) {
        promises.push(
          queue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, `test${i}`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 100))
          })
        )
      }

      queue.clear()

      // All promises should be rejected
      const results = await Promise.allSettled(promises)
      results.forEach((result) => {
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') {
          expect(result.reason.message).toBe('Queue cleared')
        }
      })
    })

    it('should drain all operations', async () => {
      let executedCount = 0
      const promises = []

      for (let i = 0; i < 3; i++) {
        promises.push(
          queue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, `test${i}`, () => {
            executedCount++
          })
        )
      }

      await queue.drain()
      expect(executedCount).toBe(3)
      expect(queue.isEmpty).toBe(true)
    })
  })

  describe('batching', () => {
    beforeEach(() => {
      queue = new PriorityOutputQueue({
        enableBatching: true,
        maxBatchSize: 3,
        batchTimeout: 50
      })
    })

    it('should batch compatible operations', async () => {
      const results: string[] = []
      const promises = []

      // These should be batched together
      for (let i = 0; i < 3; i++) {
        promises.push(
          queue.enqueue(
            OutputPriority.NORMAL,
            OutputSource.TEST,
            `test${i}`,
            () => {
              results.push(`test${i}`)
            },
            { testFile: 'same-file.test.ts' }
          )
        )
      }

      await Promise.all(promises)
      expect(results).toHaveLength(3)

      const stats = queue.getStats()
      expect(stats.batches).toBeGreaterThan(0)
    })

    it('should not batch incompatible operations', async () => {
      const results: string[] = []
      const promises = []

      // Different priorities - should not batch
      promises.push(
        queue.enqueue(OutputPriority.CRITICAL, OutputSource.ERROR, 'critical', () => {
          results.push('critical')
        })
      )

      promises.push(
        queue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'normal', () => {
          results.push('normal')
        })
      )

      await Promise.all(promises)

      // Should execute in priority order
      expect(results).toEqual(['critical', 'normal'])
    })
  })

  describe('statistics', () => {
    it('should track operation statistics', async () => {
      const initialStats = queue.getStats()
      expect(initialStats.enqueued).toBe(0)
      expect(initialStats.processed).toBe(0)

      await queue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'test', () => {})

      const finalStats = queue.getStats()
      expect(finalStats.enqueued).toBe(1)
      expect(finalStats.processed).toBe(1)
    })

    it('should track dropped operations', async () => {
      const limitedQueue = new PriorityOutputQueue({ maxSize: 1 })

      // First operation should succeed
      const promise1 = limitedQueue.enqueue(
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'test1',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      )

      // Second should be dropped
      try {
        await limitedQueue.enqueue(OutputPriority.NORMAL, OutputSource.TEST, 'test2', () => {})
      } catch (error) {
        // Expected
      }

      const stats = limitedQueue.getStats()
      expect(stats.dropped).toBe(1)

      await promise1
    })
  })
})

describe('TestOutputQueue', () => {
  let queue: TestOutputQueue

  beforeEach(() => {
    queue = new TestOutputQueue({ enableBatching: false })
  })

  afterEach(async () => {
    queue.clear()
  })

  describe('test-aware operations', () => {
    it('should handle test-specific output', async () => {
      let executed = false

      await queue.enqueueTestOutput(
        'test-file.test.ts',
        'should do something',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'test output',
        () => {
          executed = true
        }
      )

      expect(executed).toBe(true)
    })

    it('should track active tests', async () => {
      const promise1 = queue.enqueueTestOutput(
        'file1.test.ts',
        'test1',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'output1',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      )

      const promise2 = queue.enqueueTestOutput(
        'file2.test.ts',
        'test2',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'output2',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      )

      // Check during execution
      await new Promise((resolve) => setTimeout(resolve, 10))
      const activeTests = queue.getActiveTests()
      expect(activeTests).toHaveLength(2)
      expect(activeTests).toContain('file1.test.ts::test1')
      expect(activeTests).toContain('file2.test.ts::test2')

      await Promise.all([promise1, promise2])

      // Should be empty after completion
      expect(queue.getActiveTests()).toHaveLength(0)
    })

    it('should complete tests properly', async () => {
      const testFile = 'test.test.ts'
      const testName = 'test case'

      // Start some output for the test
      const promise = queue.enqueueTestOutput(
        testFile,
        testName,
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'output',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      )

      // Complete the test (should wait for pending output)
      const completePromise = queue.completeTest(testFile, testName)

      await Promise.all([promise, completePromise])

      expect(queue.hasTestOutput(testFile, testName)).toBe(false)
    })

    it('should detect test output presence', async () => {
      const testFile = 'test.test.ts'
      const testName = 'test case'

      expect(queue.hasTestOutput(testFile, testName)).toBe(false)

      // Queue multiple operations to ensure one is still pending
      const promise1 = queue.enqueueTestOutput(
        testFile,
        testName,
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'output1',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      )

      const promise2 = queue.enqueueTestOutput(
        testFile,
        testName,
        OutputPriority.NORMAL,
        OutputSource.TEST,
        'output2',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      )

      // Should detect pending output
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(queue.hasTestOutput(testFile, testName)).toBe(true)

      await Promise.all([promise1, promise2])
      expect(queue.hasTestOutput(testFile, testName)).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle executor errors gracefully', async () => {
      await expect(
        queue.enqueueTestOutput(
          'test.test.ts',
          'failing test',
          OutputPriority.NORMAL,
          OutputSource.TEST,
          'error output',
          () => {
            throw new Error('Executor error')
          }
        )
      ).rejects.toThrow('Executor error')
    })

    it('should handle async executor errors', async () => {
      await expect(
        queue.enqueueTestOutput(
          'test.test.ts',
          'async failing test',
          OutputPriority.NORMAL,
          OutputSource.TEST,
          'error output',
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            throw new Error('Async executor error')
          }
        )
      ).rejects.toThrow('Async executor error')
    })
  })
})
