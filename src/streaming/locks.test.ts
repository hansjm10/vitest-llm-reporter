/**
 * Tests for synchronization locks
 *
 * @module streaming/locks.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Mutex, Semaphore, ReadWriteLock } from './locks.js'

describe('Mutex', () => {
  let mutex: Mutex

  beforeEach(() => {
    mutex = new Mutex({ timeout: 1000 })
  })

  describe('basic locking', () => {
    it('should allow acquisition when unlocked', async () => {
      await expect(mutex.acquire('test1')).resolves.toBeUndefined()
      expect(mutex.isLocked).toBe(true)
    })

    it('should block second acquisition', async () => {
      await mutex.acquire('test1')

      const promise = mutex.acquire('test2')

      // Should still be pending after a short delay
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(mutex.getStats().waiters).toBe(1)

      mutex.release('test1')
      await expect(promise).resolves.toBeUndefined()
    })

    it('should release lock correctly', () => {
      mutex.acquire('test1')
      expect(mutex.isLocked).toBe(true)

      mutex.release('test1')
      expect(mutex.isLocked).toBe(false)
    })

    it('should throw on release when not locked', () => {
      expect(() => mutex.release()).toThrow('Cannot release unlocked mutex')
    })

    it('should throw on holder mismatch', async () => {
      await mutex.acquire('test1')
      expect(() => mutex.release('test2')).toThrow('Lock holder mismatch')
    })
  })

  describe('timeout handling', () => {
    it('should timeout after configured time', async () => {
      const shortMutex = new Mutex({ timeout: 100 })
      await shortMutex.acquire('holder')

      const start = Date.now()
      await expect(shortMutex.acquire('waiter')).rejects.toThrow('Lock acquisition timeout')
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(90)
      expect(elapsed).toBeLessThan(200)
    })
  })

  describe('withLock helper', () => {
    it('should execute function with lock held', async () => {
      let executed = false

      await mutex.withLock(() => {
        executed = true
        expect(mutex.isLocked).toBe(true)
      })

      expect(executed).toBe(true)
      expect(mutex.isLocked).toBe(false)
    })

    it('should release lock even on error', async () => {
      await expect(
        mutex.withLock(() => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      expect(mutex.isLocked).toBe(false)
    })

    it('should handle async functions', async () => {
      let executed = false

      await mutex.withLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        executed = true
      })

      expect(executed).toBe(true)
      expect(mutex.isLocked).toBe(false)
    })
  })

  describe('statistics', () => {
    it('should track lock statistics', async () => {
      const stats1 = mutex.getStats()
      expect(stats1.locked).toBe(false)
      expect(stats1.lockCount).toBe(0)

      await mutex.acquire('test')
      const stats2 = mutex.getStats()
      expect(stats2.locked).toBe(true)
      expect(stats2.holder).toBe('test')
      expect(stats2.lockCount).toBe(1)

      mutex.release('test')
      const stats3 = mutex.getStats()
      expect(stats3.locked).toBe(false)
      expect(stats3.lockCount).toBe(1)
    })
  })
})

describe('Semaphore', () => {
  let semaphore: Semaphore

  beforeEach(() => {
    semaphore = new Semaphore(2, { timeout: 1000 })
  })

  describe('basic operations', () => {
    it('should allow acquisition up to permit limit', async () => {
      await expect(semaphore.acquire('test1')).resolves.toBeUndefined()
      expect(semaphore.availablePermits).toBe(1)

      await expect(semaphore.acquire('test2')).resolves.toBeUndefined()
      expect(semaphore.availablePermits).toBe(0)
    })

    it('should block when permits exhausted', async () => {
      await semaphore.acquire('test1')
      await semaphore.acquire('test2')

      const promise = semaphore.acquire('test3')

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(semaphore.getStats().waiters).toBe(1)

      semaphore.release()
      await expect(promise).resolves.toBeUndefined()
    })

    it('should release permits correctly', async () => {
      await semaphore.acquire('test1')
      expect(semaphore.availablePermits).toBe(1)

      semaphore.release()
      expect(semaphore.availablePermits).toBe(2)
    })
  })

  describe('withPermit helper', () => {
    it('should execute function with permit held', async () => {
      const initialPermits = semaphore.availablePermits
      let executed = false

      await semaphore.withPermit(() => {
        executed = true
        expect(semaphore.availablePermits).toBe(initialPermits - 1)
      })

      expect(executed).toBe(true)
      expect(semaphore.availablePermits).toBe(initialPermits)
    })

    it('should release permit even on error', async () => {
      const initialPermits = semaphore.availablePermits

      await expect(
        semaphore.withPermit(() => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      expect(semaphore.availablePermits).toBe(initialPermits)
    })
  })

  describe('timeout handling', () => {
    it('should timeout when permits unavailable', async () => {
      const shortSemaphore = new Semaphore(1, { timeout: 100 })
      await shortSemaphore.acquire('holder')

      const start = Date.now()
      await expect(shortSemaphore.acquire('waiter')).rejects.toThrow(
        'Semaphore acquisition timeout'
      )
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(90)
      expect(elapsed).toBeLessThan(200)
    })
  })

  describe('edge cases', () => {
    it('should throw on invalid permit count', () => {
      expect(() => new Semaphore(0)).toThrow('Semaphore permits must be positive')
      expect(() => new Semaphore(-1)).toThrow('Semaphore permits must be positive')
    })
  })
})

describe('ReadWriteLock', () => {
  let rwLock: ReadWriteLock

  beforeEach(() => {
    rwLock = new ReadWriteLock({ timeout: 1000 })
  })

  describe('read operations', () => {
    it('should allow multiple concurrent readers', async () => {
      await expect(rwLock.acquireRead('reader1')).resolves.toBeUndefined()
      await expect(rwLock.acquireRead('reader2')).resolves.toBeUndefined()

      const stats = rwLock.getStats()
      expect(stats.readers).toBe(2)
      expect(stats.writing).toBe(false)
    })

    it('should block readers when writer is active', async () => {
      await rwLock.acquireWrite('writer')

      const promise = rwLock.acquireRead('reader')

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(rwLock.getStats().readWaiters).toBe(1)

      rwLock.releaseWrite()
      await expect(promise).resolves.toBeUndefined()
    })

    it('should release read locks correctly', async () => {
      await rwLock.acquireRead('reader1')
      await rwLock.acquireRead('reader2')
      expect(rwLock.getStats().readers).toBe(2)

      rwLock.releaseRead()
      expect(rwLock.getStats().readers).toBe(1)

      rwLock.releaseRead()
      expect(rwLock.getStats().readers).toBe(0)
    })

    it('should throw on release when no readers', () => {
      expect(() => rwLock.releaseRead()).toThrow('Cannot release read lock - no active readers')
    })
  })

  describe('write operations', () => {
    it('should allow exclusive write access', async () => {
      await expect(rwLock.acquireWrite('writer')).resolves.toBeUndefined()

      const stats = rwLock.getStats()
      expect(stats.writing).toBe(true)
      expect(stats.readers).toBe(0)
    })

    it('should block writers when readers are active', async () => {
      await rwLock.acquireRead('reader')

      const promise = rwLock.acquireWrite('writer')

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(rwLock.getStats().writeWaiters).toBe(1)

      rwLock.releaseRead()
      await expect(promise).resolves.toBeUndefined()
    })

    it('should block writers when another writer is active', async () => {
      await rwLock.acquireWrite('writer1')

      const promise = rwLock.acquireWrite('writer2')

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(rwLock.getStats().writeWaiters).toBe(1)

      rwLock.releaseWrite()
      await expect(promise).resolves.toBeUndefined()
    })

    it('should release write locks correctly', async () => {
      await rwLock.acquireWrite('writer')
      expect(rwLock.getStats().writing).toBe(true)

      rwLock.releaseWrite()
      expect(rwLock.getStats().writing).toBe(false)
    })

    it('should throw on release when not writing', () => {
      expect(() => rwLock.releaseWrite()).toThrow(
        'Cannot release write lock - not currently writing'
      )
    })
  })

  describe('withLock helpers', () => {
    it('should execute read function with read lock', async () => {
      let executed = false

      await rwLock.withReadLock(() => {
        executed = true
        expect(rwLock.getStats().readers).toBe(1)
      })

      expect(executed).toBe(true)
      expect(rwLock.getStats().readers).toBe(0)
    })

    it('should execute write function with write lock', async () => {
      let executed = false

      await rwLock.withWriteLock(() => {
        executed = true
        expect(rwLock.getStats().writing).toBe(true)
      })

      expect(executed).toBe(true)
      expect(rwLock.getStats().writing).toBe(false)
    })

    it('should release locks even on error', async () => {
      await expect(
        rwLock.withReadLock(() => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      expect(rwLock.getStats().readers).toBe(0)

      await expect(
        rwLock.withWriteLock(() => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      expect(rwLock.getStats().writing).toBe(false)
    })
  })

  describe('priority handling', () => {
    it('should prioritize waiting writers over new readers', async () => {
      await rwLock.acquireRead('reader1')

      // Queue a writer
      const writerPromise = rwLock.acquireWrite('writer')
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Try to queue more readers - they should wait for the writer
      const readerPromise = rwLock.acquireRead('reader2')
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(rwLock.getStats().writeWaiters).toBe(1)
      expect(rwLock.getStats().readWaiters).toBe(1)

      // Release the active reader - writer should get priority
      rwLock.releaseRead()
      await expect(writerPromise).resolves.toBeUndefined()

      expect(rwLock.getStats().writing).toBe(true)
      expect(rwLock.getStats().readWaiters).toBe(1)
    })
  })
})
