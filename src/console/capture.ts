import { AsyncLocalStorage } from 'node:async_hooks'
import { ConsoleBuffer, ConsoleBufferConfig, ConsoleMethod } from './buffer'
import { ConsoleInterceptor } from './interceptor'
import { createLogger } from '../utils/logger'

/**
 * Console Capture
 *
 * Thread-safe console output capture for parallel test execution
 * using AsyncLocalStorage to maintain test context isolation.
 *
 * @module utils/console-capture
 */

interface TestContext {
  testId: string
  startTime: number
}

export interface ConsoleCaptureConfig extends ConsoleBufferConfig {
  enabled?: boolean
  gracePeriodMs?: number // Time to wait for async console output
}

const DEFAULT_CONFIG: ConsoleCaptureConfig = {
  enabled: true,
  gracePeriodMs: 100,
  maxBytes: 50_000,
  maxLines: 100
}

/**
 * Thread-safe console capture using AsyncLocalStorage
 */
export class ConsoleCapture {
  private testContext = new AsyncLocalStorage<TestContext>()
  private buffers = new Map<string, ConsoleBuffer>()
  private interceptor = new ConsoleInterceptor()
  public config: ConsoleCaptureConfig
  private debug = createLogger('console-capture')
  private cleanupTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
  // Track test generation to prevent race conditions in cleanup
  private testGeneration = new Map<string, number>()

  constructor(config: ConsoleCaptureConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Start capturing console output for a test
   */
  startCapture(testId: string): void {
    if (!this.config.enabled) {
      return
    }

    this.debug('Starting console capture for test: %s', testId)

    // Create a new buffer for this test
    const buffer = new ConsoleBuffer(this.config)
    this.buffers.set(testId, buffer)

    // Initialize generation tracking for this test if not exists
    if (!this.testGeneration.has(testId)) {
      this.testGeneration.set(testId, 0)
    }

    // Patch console methods if not already patched
    if (!this.interceptor.patched) {
      this.patchConsole()
    }

    // Clear any existing timer for this test
    this.clearCleanupTimer(testId)
  }

  /**
   * Execute a function with console capture context
   */
  async runWithCapture<T>(testId: string, fn: () => T | Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return await fn()
    }

    const context: TestContext = {
      testId,
      startTime: Date.now()
    }

    try {
      return await this.testContext.run(context, async () => {
        return await fn()
      })
    } finally {
      // Clean up AsyncLocalStorage context to prevent memory leak
      // This ensures the context is properly released for garbage collection
      this.testContext.exit(() => {
        // Empty callback - we just need to exit the context
      })
    }
  }

  /**
   * Stop capturing and retrieve output for a test
   */
  stopCapture(testId: string): ReturnType<ConsoleBuffer['getSimplifiedOutput']> | undefined {
    if (!this.config.enabled) {
      return undefined
    }

    this.debug('Stopping console capture for test: %s', testId)

    // Get the buffer
    const buffer = this.buffers.get(testId)
    if (!buffer) {
      return undefined
    }

    // Get the output before clearing
    const output = buffer.getSimplifiedOutput()

    // Schedule cleanup after grace period (for async console output)
    this.scheduleCleanup(testId)

    return output
  }

  /**
   * Immediately clear buffer for a test (no grace period)
   */
  clearBuffer(testId: string): void {
    this.clearCleanupTimer(testId)
    const buffer = this.buffers.get(testId)
    if (buffer) {
      buffer.clear()
      this.buffers.delete(testId)
    }
  }

  /**
   * Patch console methods to intercept output
   */
  private patchConsole(): void {
    if (this.interceptor.patched) {
      return
    }

    const methods: ConsoleMethod[] = ['log', 'error', 'warn', 'debug', 'info', 'trace']

    // Use the interceptor to handle patching with error boundaries
    this.interceptor.patchAll(methods, (method, args) => {
      // Get current test context
      const context = this.testContext.getStore()

      if (context) {
        // Capture to the test's buffer
        const buffer = this.buffers.get(context.testId)
        if (buffer) {
          const elapsed = Date.now() - context.startTime
          buffer.add(method, args, elapsed)
        }
      }
    })

    this.debug('Console methods patched')
  }

  /**
   * Restore original console methods
   */
  unpatchConsole(): void {
    if (!this.interceptor.patched) {
      return
    }

    this.interceptor.unpatchAll()
    this.debug('Console methods restored')
  }

  /**
   * Schedule buffer cleanup after grace period
   */
  private scheduleCleanup(testId: string): void {
    // Clear any existing timer
    this.clearCleanupTimer(testId)

    // Increment generation for this test ID to track cleanup validity
    const generation = (this.testGeneration.get(testId) || 0) + 1
    this.testGeneration.set(testId, generation)

    // Schedule new cleanup
    const timer = globalThis.setTimeout(() => {
      // Only clear if generation hasn't changed (no new test with same ID)
      const currentGeneration = this.testGeneration.get(testId)
      if (currentGeneration === generation) {
        this.clearBuffer(testId)
        this.cleanupTimers.delete(testId)
        // Clean up generation tracking for this test
        this.testGeneration.delete(testId)
      } else {
        // A new test with the same ID has started, skip cleanup
        this.debug('Skipping cleanup for test %s - generation mismatch', testId)
      }
    }, this.config.gracePeriodMs)

    this.cleanupTimers.set(testId, timer)
  }

  /**
   * Clear cleanup timer for a test
   */
  private clearCleanupTimer(testId: string): void {
    const timer = this.cleanupTimers.get(testId)
    if (timer) {
      globalThis.clearTimeout(timer)
      this.cleanupTimers.delete(testId)
    }
  }

  /**
   * Clear all buffers and restore console
   */
  reset(): void {
    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      globalThis.clearTimeout(timer)
    }
    this.cleanupTimers.clear()

    // Clear all buffers
    for (const buffer of this.buffers.values()) {
      buffer.clear()
    }
    this.buffers.clear()

    // Clear generation tracking
    this.testGeneration.clear()

    // Restore console
    this.unpatchConsole()

    this.debug('Console capture reset')
  }

  /**
   * Get statistics about current capture state
   */
  getStats(): {
    isPatched: boolean
    activeBuffers: number
    pendingCleanups: number
  } {
    return {
      isPatched: this.interceptor.patched,
      activeBuffers: this.buffers.size,
      pendingCleanups: this.cleanupTimers.size
    }
  }
}

// Export singleton instance for use across the reporter
export const consoleCapture = new ConsoleCapture()
