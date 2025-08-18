import { AsyncLocalStorage } from 'node:async_hooks'
import { ConsoleBuffer, ConsoleBufferConfig, ConsoleMethod } from './console-buffer'
import { createLogger } from './logger'

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
  gracePeriodMs?: number  // Time to wait for async console output
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
  private originalMethods: Partial<Record<ConsoleMethod, Function>> = {}
  private isPatched = false
  public config: ConsoleCaptureConfig
  private debug = createLogger('console-capture')
  private cleanupTimers = new Map<string, NodeJS.Timeout>()

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
    
    // Patch console methods if not already patched
    if (!this.isPatched) {
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

    return this.testContext.run(context, async () => {
      try {
        return await fn()
      } catch (error) {
        // Make sure to capture any error console output
        throw error
      }
    })
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
    if (this.isPatched) {
      return
    }

    const methods: ConsoleMethod[] = ['log', 'error', 'warn', 'debug', 'info', 'trace']
    
    for (const method of methods) {
      const original = console[method]
      this.originalMethods[method] = original
      
      // Create interceptor
      ;(console as any)[method] = (...args: any[]) => {
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
        
        // Always call the original method
        original.apply(console, args)
      }
    }
    
    this.isPatched = true
    this.debug('Console methods patched')
  }

  /**
   * Restore original console methods
   */
  unpatchConsole(): void {
    if (!this.isPatched) {
      return
    }

    for (const [method, original] of Object.entries(this.originalMethods)) {
      if (original) {
        ;(console as any)[method] = original
      }
    }
    
    this.originalMethods = {}
    this.isPatched = false
    this.debug('Console methods restored')
  }

  /**
   * Schedule buffer cleanup after grace period
   */
  private scheduleCleanup(testId: string): void {
    // Clear any existing timer
    this.clearCleanupTimer(testId)
    
    // Schedule new cleanup
    const timer = setTimeout(() => {
      this.clearBuffer(testId)
      this.cleanupTimers.delete(testId)
    }, this.config.gracePeriodMs)
    
    this.cleanupTimers.set(testId, timer)
  }

  /**
   * Clear cleanup timer for a test
   */
  private clearCleanupTimer(testId: string): void {
    const timer = this.cleanupTimers.get(testId)
    if (timer) {
      clearTimeout(timer)
      this.cleanupTimers.delete(testId)
    }
  }

  /**
   * Clear all buffers and restore console
   */
  reset(): void {
    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer)
    }
    this.cleanupTimers.clear()
    
    // Clear all buffers
    for (const buffer of this.buffers.values()) {
      buffer.clear()
    }
    this.buffers.clear()
    
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
      isPatched: this.isPatched,
      activeBuffers: this.buffers.size,
      pendingCleanups: this.cleanupTimers.size
    }
  }
}

// Export singleton instance for use across the reporter
export const consoleCapture = new ConsoleCapture()