/**
 * Output Synchronizer for Concurrent Tests
 *
 * Simplified synchronizer that uses a basic buffer for experimental streaming.
 * Replaces complex lock/queue system with lightweight alternative.
 *
 * @module streaming/OutputSynchronizer
 */

import { StreamBuffer, type StreamBufferConfig } from './StreamBuffer'
import { coreLogger } from '../utils/logger'
import type { TestResult } from '../types/schema'

/**
 * Configuration for the OutputSynchronizer
 */
export interface SynchronizerConfig {
  /** Enable test grouping */
  enableTestGrouping?: boolean
  /** Maximum concurrent test outputs */
  maxConcurrentTests?: number
  /** Deadlock detection interval (ms) - kept for compatibility */
  deadlockCheckInterval?: number
  /** Enable performance monitoring */
  enableMonitoring?: boolean
}

/**
 * Test context for synchronization
 */
export interface TestContext {
  testId: string
  testName: string
  filePath?: string
  startTime: number
  consoleOutput?: string[]
}

/**
 * Simplified Output Synchronizer using StreamBuffer
 */
export class OutputSynchronizer {
  private buffer: StreamBuffer
  private config: Required<SynchronizerConfig>
  private debug = coreLogger()
  private activeTests = new Map<string, TestContext>()
  private isEnabled = false

  constructor(config: SynchronizerConfig = {}) {
    this.config = {
      enableTestGrouping: config.enableTestGrouping ?? true,
      maxConcurrentTests: config.maxConcurrentTests ?? 10,
      deadlockCheckInterval: config.deadlockCheckInterval ?? 5000,
      enableMonitoring: config.enableMonitoring ?? false
    }

    // Initialize buffer with experimental streaming
    this.buffer = new StreamBuffer({
      enabled: true,
      maxBufferSize: 10000,
      flushOnError: true
    })
  }

  /**
   * Initialize the synchronizer
   */
  async initialize(): Promise<void> {
    this.isEnabled = true
    this.buffer.start()
    this.debug('OutputSynchronizer initialized with simplified buffer')
  }

  /**
   * Register a test start
   */
  async registerTestStart(context: TestContext): Promise<void> {
    if (!this.isEnabled) return

    this.activeTests.set(context.testId, context)
    this.buffer.addEvent('test-start', {
      testId: context.testId,
      testName: context.testName,
      filePath: context.filePath
    })

    if (this.config.enableMonitoring) {
      this.debug(`Test started: ${context.testName}`)
    }
  }

  /**
   * Register a test completion
   */
  async registerTestComplete(testId: string, result?: TestResult): Promise<void> {
    if (!this.isEnabled) return

    const context = this.activeTests.get(testId)
    if (context) {
      const duration = Date.now() - context.startTime
      this.buffer.addEvent('test-complete', {
        testId,
        testName: context.testName,
        duration,
        result
      })

      if (this.config.enableMonitoring) {
        this.debug(`Test completed: ${context.testName} (${duration}ms)`)
      }

      this.activeTests.delete(testId)
    }
  }

  /**
   * Register a test error
   */
  async registerTestError(testId: string, error: Error): Promise<void> {
    if (!this.isEnabled) return

    const context = this.activeTests.get(testId)
    this.buffer.addEvent('test-error', {
      testId,
      testName: context?.testName,
      error: {
        message: error.message,
        stack: error.stack
      }
    })

    if (this.config.enableMonitoring) {
      this.debug(`Test error: ${context?.testName ?? testId} - ${error.message}`)
    }
  }

  /**
   * Write console output for a test
   */
  async writeConsoleOutput(testId: string, output: string): Promise<void> {
    if (!this.isEnabled) return

    const context = this.activeTests.get(testId)
    if (context) {
      if (!context.consoleOutput) {
        context.consoleOutput = []
      }
      context.consoleOutput.push(output)
    }
  }

  /**
   * Flush all pending output
   */
  async flush(): Promise<void> {
    if (!this.isEnabled) return

    const events = this.buffer.flush()
    if (this.config.enableMonitoring) {
      this.debug(`Flushed ${events.length} events`)
    }
  }

  /**
   * Shutdown the synchronizer
   */
  async shutdown(): Promise<void> {
    if (!this.isEnabled) return

    // Flush any remaining events
    await this.flush()

    // Clear active tests
    this.activeTests.clear()
    this.isEnabled = false

    this.debug('OutputSynchronizer shutdown complete')
  }

  /**
   * Get synchronizer statistics
   */
  getStats() {
    return {
      activeTests: this.activeTests.size,
      bufferStats: this.buffer.getStats(),
      enabled: this.isEnabled
    }
  }
}