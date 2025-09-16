import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConsoleCapture } from './capture.js'

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture
  let originalConsole: Record<string, (...args: any[]) => void>

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
      void capture.runWithCapture(testId, () => {
        console.log('Test output')
        console.error('Test error')
      })

      const output = capture.stopCapture(testId)

      expect(output).toBeDefined()
      expect(output.entries).toBeInstanceOf(Array)
      expect(output.entries.some((e) => e.level === 'log' && e.text === 'Test output')).toBe(true)
      expect(output.entries.some((e) => e.level === 'error' && e.text === 'Test error')).toBe(true)
    })

    it('should not capture output when disabled', () => {
      capture = new ConsoleCapture({ enabled: false })
      const testId = 'test-2'

      capture.startCapture(testId)
      void capture.runWithCapture(testId, () => {
        console.log('Should not capture')
      })

      const output = capture.stopCapture(testId)
      expect(output.entries).toEqual([])
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

      expect(output1.entries.some((e) => e.level === 'log' && e.text === 'Test 1 output')).toBe(
        true
      )
      expect(output1.entries.some((e) => e.level === 'log' && e.text === 'Test 2 output')).toBe(
        false
      )

      expect(output2.entries.some((e) => e.level === 'log' && e.text === 'Test 2 output')).toBe(
        true
      )
      expect(output2.entries.some((e) => e.level === 'log' && e.text === 'Test 1 output')).toBe(
        false
      )
    })

    it('should capture logs emitted shortly after test completion', async () => {
      const testId = 'test-late'

      capture.startCapture(testId)

      await capture.runWithCapture(testId, async () => {
        console.log('Immediate log')
        setTimeout(() => {
          console.log('Deferred log')
        }, 0)
      })

      // Allow deferred console.log to run before stopping capture
      await new Promise((resolve) => setTimeout(resolve, 15))

      const output = capture.stopCapture(testId)
      const messages = output.entries.map((event) => event.text)
      expect(messages).toContain('Immediate log')
      expect(messages).toContain('Deferred log')
    })

    it('should handle parallel test execution', async () => {
      const results: Map<number, string> = new Map()

      const promises = Array.from({ length: 5 }, (_, i) => {
        const testId = `test-${i}`
        capture.startCapture(testId)

        return capture.runWithCapture(testId, async () => {
          console.log(`Output from test ${i}`)
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))
          const output = capture.stopCapture(testId)
          const logEvents = output.entries.filter((e) => e.level === 'log')
          results.set(i, logEvents[0]?.text || '')
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
      void capture.runWithCapture(testId, () => {
        // This will exceed 50 bytes
        console.log('This is a very long message that exceeds the byte limit')
        console.log('This should not be captured')
      })

      const output = capture.stopCapture(testId)
      // Since the first message exceeds 50 bytes, nothing is captured except truncation warning
      expect(output).toBeDefined()
      expect(output.entries.length).toBeGreaterThan(0)
      // Should have truncation event
      const truncationEvent = output.entries.find((e) => e.text.includes('truncated'))
      expect(truncationEvent).toBeDefined()
      expect(truncationEvent?.level).toBe('warn')
    })

    it('should respect line limits', () => {
      const testId = 'test-line-limit'
      capture = new ConsoleCapture({
        enabled: true,
        maxBytes: 10000,
        maxLines: 3
      })

      capture.startCapture(testId)
      void capture.runWithCapture(testId, () => {
        console.log('Line 1')
        console.log('Line 2')
        console.log('Line 3')
        console.log('Line 4 - should not be captured')
        console.log('Line 5 - should not be captured')
      })

      const output = capture.stopCapture(testId)
      const logEvents = output.entries.filter((e) => e.level === 'log')
      // Should have at most 3 lines (might have truncation message as 4th)
      expect(output.entries.length).toBeLessThanOrEqual(4)
      expect(logEvents.some((e) => e.text === 'Line 1')).toBe(true)
      expect(logEvents.some((e) => e.text === 'Line 2')).toBe(true)
      expect(logEvents.some((e) => e.text === 'Line 3')).toBe(true)
      // Line 4 and 5 should not be in the first 3 entries
      const firstThreeTexts = logEvents.slice(0, 3).map((e) => e.text)
      expect(firstThreeTexts).not.toContain('Line 4 - should not be captured')
      expect(firstThreeTexts).not.toContain('Line 5 - should not be captured')
    })

    it('should clear buffer immediately when requested', () => {
      const testId = 'test-clear'

      capture.startCapture(testId)
      void capture.runWithCapture(testId, () => {
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
      void capture.runWithCapture(testId, () => {
        console.log('Test output')
      })

      const output = capture.stopCapture(testId)
      expect(output).toBeDefined()

      // Buffer should still exist during grace period
      let stats = capture.getStats()
      expect(stats.pendingCleanups).toBe(1)

      // Wait for grace period
      await new Promise((resolve) => setTimeout(resolve, 20))

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
      void capture.runWithCapture(testId, () => {
        console.log('Log message')
        console.error('Error message')
        console.warn('Warn message')
        console.info('Info message')
        console.debug('Debug message')
      })

      const output = capture.stopCapture(testId)

      expect(output.entries.some((e) => e.level === 'log' && e.text === 'Log message')).toBe(true)
      expect(output.entries.some((e) => e.level === 'error' && e.text === 'Error message')).toBe(
        true
      )
      expect(output.entries.some((e) => e.level === 'warn' && e.text === 'Warn message')).toBe(true)
      expect(output.entries.some((e) => e.level === 'info' && e.text === 'Info message')).toBe(true)
      expect(output.entries.some((e) => e.level === 'debug' && e.text === 'Debug message')).toBe(
        true
      )
    })

    it('should handle complex objects', () => {
      const testId = 'test-objects'

      capture.startCapture(testId)
      void capture.runWithCapture(testId, () => {
        console.log({ key: 'value', nested: { prop: 123 } })
        console.log(['item1', 'item2'])
      })

      const output = capture.stopCapture(testId)

      const logEvents = output.entries.filter((e) => e.level === 'log')
      expect(logEvents[0]?.text).toContain('key')
      expect(logEvents[0]?.text).toContain('value')
      expect(logEvents[1]?.text).toContain('item1')
    })

    it('should handle circular references', () => {
      const testId = 'test-circular'

      const obj: any = { prop: 'value' }
      obj.circular = obj

      capture.startCapture(testId)
      void capture.runWithCapture(testId, () => {
        console.log(obj)
      })

      const output = capture.stopCapture(testId)

      const logEvents = output.entries.filter((e) => e.level === 'log')
      expect(logEvents[0]?.text).toContain('[Circular')
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
