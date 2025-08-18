/* eslint-disable no-console -- This file tests console capture functionality */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ConsoleCapture } from './console-capture'
import { ConsoleInterceptor } from './console-interceptor'

/**
 * Tests for critical bug fixes in console capture
 */
describe('ConsoleCapture Bug Fixes', () => {
  let capture: ConsoleCapture

  beforeEach(() => {
    capture = new ConsoleCapture({ enabled: true })
  })

  afterEach(() => {
    capture.reset()
  })

  describe('AsyncLocalStorage memory leak fix', () => {
    it('should clean up context after runWithCapture', async () => {
      const testId = 'memory-test'

      // Spy on AsyncLocalStorage exit to verify it's called
      const exitSpy = vi.fn()
      const originalExit = (capture as any).testContext.exit
      ;(capture as any).testContext.exit = exitSpy

      await capture.runWithCapture(testId, () => {
        console.log('Test output')
      })

      // Verify exit was called to clean up context
      expect(exitSpy).toHaveBeenCalled()

      // Restore original method
      ;(capture as any).testContext.exit = originalExit
    })

    it('should clean up context even if test function throws', async () => {
      const testId = 'error-test'

      // Spy on AsyncLocalStorage exit
      const exitSpy = vi.fn()
      const originalExit = (capture as any).testContext.exit
      ;(capture as any).testContext.exit = exitSpy

      try {
        await capture.runWithCapture(testId, () => {
          throw new Error('Test error')
        })
      } catch {
        // Expected error
      }

      // Verify exit was called even after error
      expect(exitSpy).toHaveBeenCalled()

      // Restore original method
      ;(capture as any).testContext.exit = originalExit
    })
  })

  describe('Error boundary protection', () => {
    it('should not break console when buffer.add throws', async () => {
      const testId = 'error-boundary-test'
      capture.startCapture(testId)

      // Make buffer.add throw an error
      const buffer = (capture as any).buffers.get(testId)
      if (buffer) {
        buffer.add = () => {
          throw new Error('Buffer error')
        }
      }

      // Console should still work despite buffer error
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await capture.runWithCapture(testId, () => {
        console.log('This should not throw')
      })

      // Verify console.log was still called (through original method)
      expect(() => console.log('Still works')).not.toThrow()

      logSpy.mockRestore()
    })

    it('should handle errors in getStore gracefully', () => {
      const testId = 'store-error-test'

      // Make getStore throw an error
      const originalGetStore = (capture as any).testContext.getStore
      ;(capture as any).testContext.getStore = () => {
        throw new Error('Store error')
      }

      capture.startCapture(testId)

      // Console should still work
      expect(() => console.log('Should not throw')).not.toThrow()

      // Restore original method
      ;(capture as any).testContext.getStore = originalGetStore
    })
  })

  describe('Race condition prevention', () => {
    it('should not clear buffer if test ID is reused', async () => {
      const testId = 'race-test'

      // Start first test
      capture.startCapture(testId)
      await capture.runWithCapture(testId, () => {
        console.log('First test')
      })

      // Get the first generation
      const firstGen = (capture as any).testGeneration.get(testId)

      // Stop capture (schedules cleanup)
      capture.stopCapture(testId)

      // Immediately start new test with same ID (simulating test retry)
      capture.startCapture(testId)
      await capture.runWithCapture(testId, () => {
        console.log('Second test')
      })

      // Verify generation was incremented
      const secondGen = (capture as any).testGeneration.get(testId)
      expect(secondGen).toBeGreaterThan(firstGen)

      // Wait for grace period to pass
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Buffer for second test should still exist
      const buffer = (capture as any).buffers.get(testId)
      expect(buffer).toBeDefined()
    })

    it('should track generation correctly across multiple tests', () => {
      const testId = 'gen-track-test'

      // First test
      capture.startCapture(testId)
      const gen1 = (capture as any).testGeneration.get(testId)

      // Schedule cleanup (increments generation)
      ;(capture as any).scheduleCleanup(testId)
      const gen2 = (capture as any).testGeneration.get(testId)
      expect(gen2).toBe((gen1 || 0) + 1)

      // Another test with same ID
      capture.startCapture(testId)
      ;(capture as any).scheduleCleanup(testId)
      const gen3 = (capture as any).testGeneration.get(testId)
      expect(gen3).toBe(gen2 + 1)
    })

    it('should clean up generation tracking on reset', () => {
      const testId = 'cleanup-test'

      capture.startCapture(testId)
      ;(capture as any).scheduleCleanup(testId)

      // Verify generation exists
      expect((capture as any).testGeneration.has(testId)).toBe(true)

      // Reset should clear generation tracking
      capture.reset()
      expect((capture as any).testGeneration.size).toBe(0)
    })
  })
})

describe('ConsoleInterceptor', () => {
  let interceptor: ConsoleInterceptor
  const originalLog = console.log
  const originalError = console.error

  beforeEach(() => {
    interceptor = new ConsoleInterceptor()
  })

  afterEach(() => {
    interceptor.unpatchAll()
    // Ensure console is restored
    console.log = originalLog
    console.error = originalError
  })

  describe('Error boundaries', () => {
    it('should not break console when interceptor throws', () => {
      const throwingInterceptor = () => {
        throw new Error('Interceptor error')
      }

      interceptor.patch('log', throwingInterceptor)

      // Console should still work
      expect(() => console.log('Should not throw')).not.toThrow()
    })

    it('should call original method even if interceptor fails', () => {
      const logSpy = vi.fn()
      console.log = logSpy

      const throwingInterceptor = () => {
        throw new Error('Interceptor error')
      }

      interceptor.patch('log', throwingInterceptor)

      console.log('Test message')

      // Original should have been called
      expect(logSpy).toHaveBeenCalledWith('Test message')
    })
  })

  describe('Patch management', () => {
    it('should track patched state correctly', () => {
      expect(interceptor.patched).toBe(false)

      interceptor.patchAll(['log', 'error'], () => {})
      expect(interceptor.patched).toBe(true)

      interceptor.unpatchAll()
      expect(interceptor.patched).toBe(false)
    })

    it('should not double-patch methods', () => {
      const interceptor1 = vi.fn()
      const interceptor2 = vi.fn()

      interceptor.patch('log', interceptor1)
      interceptor.patch('log', interceptor2) // Should be ignored

      console.log('Test')

      // Only first interceptor should be called
      expect(interceptor1).toHaveBeenCalled()
      expect(interceptor2).not.toHaveBeenCalled()
    })

    it('should restore original methods correctly', () => {
      const original = console.log

      interceptor.patch('log', () => {})
      expect(console.log).not.toBe(original)

      interceptor.unpatch('log')
      expect(console.log).toBe(original)
    })
  })
})
