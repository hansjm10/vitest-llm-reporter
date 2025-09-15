import { AsyncLocalStorage } from 'node:async_hooks'
import { ConsoleBuffer } from './buffer.js'
import type { ConsoleCaptureConfig, ConsoleMethod, CaptureResult } from '../types/console.js'
import type { ConsoleEvent } from '../types/schema.js'
import { ConsoleInterceptor } from './interceptor.js'
import { createLogger } from '../utils/logger.js'
import type { ILogDeduplicator } from '../types/deduplication.js'

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

const DEFAULT_CONFIG: ConsoleCaptureConfig = {
  enabled: true,
  gracePeriodMs: 100,
  maxBytes: 50_000,
  maxLines: 100,
  includeDebugOutput: false
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
  public deduplicator?: ILogDeduplicator

  constructor(config: ConsoleCaptureConfig & { deduplicator?: ILogDeduplicator } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.deduplicator = config.deduplicator
  }

  /**
   * Start capturing console output for a test
   */
  startCapture(testId: string, forceNew = false): void {
    if (!this.config.enabled) {
      return
    }

    // Clear any existing timer for this test first
    this.clearCleanupTimer(testId)

    // If buffer already exists, decide whether to keep it or clear it
    if (this.buffers.has(testId)) {
      if (forceNew) {
        // This is a test retry - clear the old buffer
        this.debug('Clearing existing buffer for test retry: %s', testId)
        const existingBuffer = this.buffers.get(testId)
        if (existingBuffer) {
          existingBuffer.clear()
        }
        // Create a new buffer for this test
        const buffer = new ConsoleBuffer(this.config)
        this.buffers.set(testId, buffer)
      } else {
        // Buffer already exists and we're just ensuring it exists
        // Don't clear it - just return
        this.debug('Buffer already exists for test: %s', testId)
        return
      }
    } else {
      // No buffer exists - create one
      this.debug('Starting console capture for test: %s', testId)
      const buffer = new ConsoleBuffer(this.config)
      this.buffers.set(testId, buffer)
    }

    // Initialize generation tracking for this test if not exists
    if (!this.testGeneration.has(testId)) {
      this.testGeneration.set(testId, 0)
    }

    // Patch console methods if not already patched
    if (!this.interceptor.patched) {
      this.patchConsole()
    }
  }

  /**
   * Execute a function with console capture context
   * Note: AsyncLocalStorage automatically cleans up context when run() completes,
   * so no explicit cleanup is needed. The context is only available within the callback.
   */
  async runWithCapture<T>(testId: string, fn: () => T | Promise<T>): Promise<CaptureResult> {
    if (!this.config.enabled) {
      await fn()
      return { entries: [] }
    }

    const context: TestContext = {
      testId,
      startTime: Date.now()
    }

    // Start capturing for this test
    this.startCapture(testId)

    // AsyncLocalStorage.run() automatically cleans up the context after the callback completes
    // This happens even if the callback throws an error
    await this.testContext.run(context, async () => {
      return await fn()
    })
    // Context is automatically cleared here - verified by tests checking getStore() returns undefined

    // Stop capturing and return the output
    return this.stopCapture(testId)
  }

  /**
   * Stop capturing and retrieve output for a test
   */
  stopCapture(testId: string): CaptureResult {
    if (!this.config.enabled) {
      return { entries: [] }
    }

    this.debug('Stopping console capture for test: %s', testId)

    // Get the buffer
    const buffer = this.buffers.get(testId)
    if (!buffer) {
      return { entries: [] }
    }

    // Get the events before scheduling cleanup
    const events = buffer.getEvents()

    // If deduplication is enabled, process events through deduplicator
    if (this.deduplicator?.isEnabled()) {
      const deduplicatedEntries: ConsoleEvent[] = []
      const firstEventMap = new Map<string, ConsoleEvent>()

      // Process all events to build deduplication metadata
      for (const event of events) {
        const logEntry = {
          message: event.text,
          level: event.level,
          timestamp: new Date(),
          testId
        }

        const key = this.deduplicator.generateKey(logEntry)
        // Update deduplicator state
        this.deduplicator.isDuplicate(logEntry)

        // Keep only first occurrence of each key
        if (!firstEventMap.has(key)) {
          firstEventMap.set(key, event)
        }
      }

      // Build output with complete deduplication metadata
      for (const [key, event] of firstEventMap) {
        const metadata = this.deduplicator.getMetadata(key)

        deduplicatedEntries.push({
          message: event.text, // Use message field for deduplication output
          text: event.text, // Keep text for backward compatibility
          level: event.level,
          timestampMs: event.timestampMs,
          timestamp: event.timestampMs,
          args: event.args,
          origin: event.origin,
          deduplication:
            metadata && metadata.count > 1
              ? {
                  count: metadata.count,
                  deduplicated: true,
                  firstSeen: metadata.firstSeen.toISOString(),
                  lastSeen: metadata.lastSeen.toISOString(),
                  sources: metadata.sources.size > 0 ? Array.from(metadata.sources) : undefined
                }
              : undefined
        })
      }

      // Schedule cleanup after grace period (for async console output)
      this.scheduleCleanup(testId)

      return {
        entries: deduplicatedEntries
      }
    }

    // Schedule cleanup after grace period (for async console output)
    this.scheduleCleanup(testId)

    // Return in the expected format even when deduplication is disabled
    // Add message field to each event for consistency
    return {
      entries: events.map((event) => ({
        ...event,
        message: event.text // Add message field for compatibility
      }))
    }
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

          // Always add to buffer - deduplication happens in stopCapture
          buffer.add(method, args, elapsed, 'intercepted')
        }
      }
      // Note: When there's no context (helper functions), we rely on Vitest's
      // onUserConsoleLog to capture the output and ingest it properly
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

    // Clear generation tracking to prevent memory leaks in watch mode
    this.testGeneration.clear()

    // Clear deduplicator if present
    if (this.deduplicator) {
      this.deduplicator.clear()
    }

    // Restore console
    this.unpatchConsole()

    this.debug('Console capture reset')
  }


  /**
   * Capture console output for a test and return the result
   */
  captureForTest(testId: string, fn: () => void): CaptureResult {
    if (!this.config.enabled) {
      fn()
      return { entries: [] }
    }

    const context: TestContext = {
      testId,
      startTime: Date.now()
    }

    // Start capturing for this test
    this.startCapture(testId)

    // Run with context so console methods are captured
    this.testContext.run(context, () => {
      fn()
    })

    // Stop capturing and return the output
    return this.stopCapture(testId)
  }

  /**
   * Ingest a console event coming from reporter hooks (no AsyncLocalStorage context)
   */
  ingest(testId: string, method: ConsoleMethod, args: unknown[], elapsed?: number): void {
    if (!this.config.enabled) return

    // Respect debug/trace filtering
    if (!this.config.includeDebugOutput && (method === 'debug' || method === 'trace')) {
      return
    }

    let buffer = this.buffers.get(testId)
    if (!buffer) {
      buffer = new ConsoleBuffer(this.config)
      this.buffers.set(testId, buffer)
    }

    // Always add to buffer - deduplication happens in stopCapture
    buffer.add(method, args, elapsed, 'task')
  }

  /**
   * Update capture configuration at runtime
   *
   * @param config - Partial configuration to merge with existing config
   */
  updateConfig(config: Partial<ConsoleCaptureConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Clean up stale test generations to prevent memory leaks in watch mode
   * This removes entries for tests that no longer have active buffers or pending cleanups
   */
  private cleanupStaleGenerations(): void {
    for (const [testId] of this.testGeneration) {
      if (!this.buffers.has(testId) && !this.cleanupTimers.has(testId)) {
        // Test has no active buffer or pending cleanup, safe to remove
        this.testGeneration.delete(testId)
        this.debug('Cleaned up stale generation for test: %s', testId)
      }
    }
  }

  /**
   * Get statistics about current capture state
   */
  getStats(): {
    isPatched: boolean
    activeBuffers: number
    pendingCleanups: number
    trackedGenerations: number
  } {
    // Opportunistically clean up stale generations when stats are requested
    this.cleanupStaleGenerations()

    return {
      isPatched: this.interceptor.patched,
      activeBuffers: this.buffers.size,
      pendingCleanups: this.cleanupTimers.size,
      trackedGenerations: this.testGeneration.size
    }
  }
}

/**
 * Singleton instance of ConsoleCapture for use across the reporter
 *
 * @example
 * ```typescript
 * import { consoleCapture } from './console/capture.js'
 *
 * // Start capturing for a test
 * consoleCapture.startCapture('test-id')
 *
 * // Stop and retrieve output
 * const output = consoleCapture.stopCapture('test-id')
 * ```
 */
export const consoleCapture = new ConsoleCapture()
