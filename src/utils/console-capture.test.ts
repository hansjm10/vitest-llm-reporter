import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConsoleCapture } from './console-capture'

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture
  let originalConsole: Record<string, Function>

  beforeEach(() => {
    // Save original console methods
    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    }
    
    capture = new ConsoleCapture({
      enabled: true,
      maxBytes: 1000,
      maxLines: 10,
      gracePeriodMs: 10
    })
  })

  afterEach(() => {
    // Restore original console methods
    capture.reset()
    Object.entries(originalConsole).forEach(([method, fn]) => {
      ;(console as any)[method] = fn
    })
  })

  describe('capture lifecycle', () => {
    it('should capture console output for a test', () => {
      const testId = 'test-1'
      
      capture.startCapture(testId)
      
      // Use runWithCapture to establish context
      capture.runWithCapture(testId, () => {
        console.log('Test output')
        console.error('Test error')
      })
      
      const output = capture.stopCapture(testId)
      
      expect(output).toBeDefined()
      expect(output?.logs).toContain('Test output')
      expect(output?.errors).toContain('Test error')
    })

    it('should not capture output when disabled', () => {
      capture = new ConsoleCapture({ enabled: false })
      const testId = 'test-2'
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log('Should not capture')
      })
      
      const output = capture.stopCapture(testId)
      expect(output).toBeUndefined()
    })

    it('should isolate output between tests', async () => {
      const test1 = 'test-1'
      const test2 = 'test-2'
      
      capture.startCapture(test1)
      capture.startCapture(test2)
      
      await capture.runWithCapture(test1, () => {
        console.log('Test 1 output')
      })
      
      await capture.runWithCapture(test2, () => {
        console.log('Test 2 output')
      })
      
      const output1 = capture.stopCapture(test1)
      const output2 = capture.stopCapture(test2)
      
      expect(output1?.logs).toContain('Test 1 output')
      expect(output1?.logs).not.toContain('Test 2 output')
      
      expect(output2?.logs).toContain('Test 2 output')
      expect(output2?.logs).not.toContain('Test 1 output')
    })

    it('should handle parallel test execution', async () => {
      const results: Map<number, string> = new Map()
      
      const promises = Array.from({ length: 5 }, (_, i) => {
        const testId = `test-${i}`
        capture.startCapture(testId)
        
        return capture.runWithCapture(testId, async () => {
          console.log(`Output from test ${i}`)
          // Simulate async work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
          const output = capture.stopCapture(testId)
          results.set(i, output?.logs?.[0] || '')
        })
      })
      
      await Promise.all(promises)
      
      // Each test should have captured its own output
      for (let i = 0; i < 5; i++) {
        expect(results.get(i)).toBe(`Output from test ${i}`)
      }
    })
  })

  describe('buffer management', () => {
    it('should respect byte limits', () => {
      const testId = 'test-byte-limit'
      capture = new ConsoleCapture({
        enabled: true,
        maxBytes: 50,
        maxLines: 100
      })
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        // This will exceed 50 bytes
        console.log('This is a very long message that exceeds the byte limit')
        console.log('This should not be captured')
      })
      
      const output = capture.stopCapture(testId)
      expect(output?.logs?.length).toBe(1)
    })

    it('should respect line limits', () => {
      const testId = 'test-line-limit'
      capture = new ConsoleCapture({
        enabled: true,
        maxBytes: 10000,
        maxLines: 3
      })
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log('Line 1')
        console.log('Line 2')
        console.log('Line 3')
        console.log('Line 4 - should not be captured')
        console.log('Line 5 - should not be captured')
      })
      
      const output = capture.stopCapture(testId)
      // Should have at most 3 lines (might have truncation message as 4th)
      expect(output?.logs?.length).toBeLessThanOrEqual(4)
      expect(output?.logs).toContain('Line 1')
      expect(output?.logs).toContain('Line 2')
      expect(output?.logs).toContain('Line 3')
      // Line 4 and 5 should not be in the first 3 entries
      const firstThree = output?.logs?.slice(0, 3) || []
      expect(firstThree).not.toContain('Line 4 - should not be captured')
      expect(firstThree).not.toContain('Line 5 - should not be captured')
    })

    it('should clear buffer immediately when requested', () => {
      const testId = 'test-clear'
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log('Test output')
      })
      
      capture.clearBuffer(testId)
      
      // Buffer should be cleared immediately
      const stats = capture.getStats()
      expect(stats.activeBuffers).toBe(0)
    })

    it('should clean up buffers after grace period', async () => {
      const testId = 'test-grace'
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log('Test output')
      })
      
      const output = capture.stopCapture(testId)
      expect(output).toBeDefined()
      
      // Buffer should still exist during grace period
      let stats = capture.getStats()
      expect(stats.pendingCleanups).toBe(1)
      
      // Wait for grace period
      await new Promise(resolve => setTimeout(resolve, 20))
      
      // Buffer should be cleaned up
      stats = capture.getStats()
      expect(stats.activeBuffers).toBe(0)
      expect(stats.pendingCleanups).toBe(0)
    })
  })

  describe('console methods', () => {
    it('should capture different console methods separately', () => {
      const testId = 'test-methods'
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log('Log message')
        console.error('Error message')
        console.warn('Warn message')
        console.info('Info message')
        console.debug('Debug message')
      })
      
      const output = capture.stopCapture(testId)
      
      expect(output?.logs).toContain('Log message')
      expect(output?.errors).toContain('Error message')
      expect(output?.warns).toContain('Warn message')
      expect(output?.info).toContain('Info message')
      expect(output?.debug).toContain('Debug message')
    })

    it('should handle complex objects', () => {
      const testId = 'test-objects'
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log({ key: 'value', nested: { prop: 123 } })
        console.log(['item1', 'item2'])
      })
      
      const output = capture.stopCapture(testId)
      
      expect(output?.logs?.[0]).toContain('key')
      expect(output?.logs?.[0]).toContain('value')
      expect(output?.logs?.[1]).toContain('item1')
    })

    it('should handle circular references', () => {
      const testId = 'test-circular'
      
      const obj: any = { prop: 'value' }
      obj.circular = obj
      
      capture.startCapture(testId)
      capture.runWithCapture(testId, () => {
        console.log(obj)
      })
      
      const output = capture.stopCapture(testId)
      
      expect(output?.logs?.[0]).toContain('[Circular')
    })
  })

  describe('reset', () => {
    it('should clean up all resources on reset', () => {
      // Start multiple captures
      for (let i = 0; i < 5; i++) {
        capture.startCapture(`test-${i}`)
      }
      
      let stats = capture.getStats()
      expect(stats.activeBuffers).toBe(5)
      expect(stats.isPatched).toBe(true)
      
      // Reset should clean everything
      capture.reset()
      
      stats = capture.getStats()
      expect(stats.activeBuffers).toBe(0)
      expect(stats.pendingCleanups).toBe(0)
      expect(stats.isPatched).toBe(false)
    })
  })
})