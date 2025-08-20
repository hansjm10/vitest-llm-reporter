/**
 * Reporter Stream Integration
 *
 * Coordinates streaming components with the main reporter infrastructure.
 * Provides a bridge between the reporter events and streaming output system.
 *
 * @module streaming/ReporterStreamIntegration
 */

import type { TestResult, TestFailure } from '../types/schema'
import type { StreamingConfig } from '../types/reporter'
import { OutputSynchronizer, type SynchronizerConfig } from './OutputSynchronizer'
import { OutputBuilder } from '../output/OutputBuilder'
import { OutputWriter } from '../output/OutputWriter'
import { coreLogger, errorLogger } from '../utils/logger'
import { detectEnvironment, hasTTY } from '../utils/environment'

/**
 * Stream integration configuration
 */
export interface StreamIntegrationConfig {
  /** Base streaming configuration */
  streaming: StreamingConfig
  /** Output file path for dual-mode output */
  outputFile?: string
  /** Whether to enable graceful degradation */
  gracefulDegradation?: boolean
}

/**
 * Stream event types for real-time output
 */
export enum StreamEventType {
  TEST_START = 'test-start',
  TEST_COMPLETE = 'test-complete',
  TEST_FAILURE = 'test-failure',
  SUITE_START = 'suite-start',
  SUITE_COMPLETE = 'suite-complete',
  RUN_COMPLETE = 'run-complete'
}

/**
 * Stream event data
 */
export interface StreamEvent {
  type: StreamEventType
  timestamp: number
  data: any
}

/**
 * Coordinates streaming components with reporter
 */
export class ReporterStreamIntegration {
  private config: Required<StreamIntegrationConfig>
  private synchronizer: OutputSynchronizer
  private outputBuilder: OutputBuilder
  private outputWriter: OutputWriter
  private debug = coreLogger()
  private debugError = errorLogger()
  private isActive = false
  private testCounts = { passed: 0, failed: 0, skipped: 0 }
  private startTime = 0
  private listeners = new Map<StreamEventType, Array<(event: StreamEvent) => void>>()

  constructor(config: StreamIntegrationConfig) {
    this.config = {
      streaming: config.streaming,
      outputFile: config.outputFile,
      gracefulDegradation: config.gracefulDegradation ?? true
    }

    // Convert streaming config to synchronizer config
    const syncConfig: SynchronizerConfig = {
      enableTestGrouping: this.config.streaming.enableTestGrouping,
      maxConcurrentTests: this.config.streaming.maxConcurrentTests,
      deadlockCheckInterval: this.config.streaming.deadlockCheckInterval,
      enableMonitoring: this.config.streaming.enableMonitoring,
      queue: this.config.streaming.queue,
      locks: this.config.streaming.locks
    }

    this.synchronizer = new OutputSynchronizer(syncConfig)
    this.outputBuilder = new OutputBuilder({ enableStreaming: true })
    this.outputWriter = new OutputWriter()

    this.debug('Stream integration initialized')
  }

  /**
   * Start streaming session
   */
  async start(): Promise<void> {
    if (this.isActive) {
      this.debug('Stream integration already active')
      return
    }

    // Check environment capabilities
    const envInfo = detectEnvironment()
    if (!hasTTY(envInfo) && this.config.gracefulDegradation) {
      this.debug('No TTY detected, streaming will degrade gracefully')
    }

    this.isActive = true
    this.startTime = Date.now()
    this.testCounts = { passed: 0, failed: 0, skipped: 0 }

    this.emitEvent(StreamEventType.SUITE_START, {
      timestamp: this.startTime,
      environment: envInfo
    })

    this.debug('Stream integration started')
  }

  /**
   * Stop streaming session
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      return
    }

    try {
      // Flush any pending operations
      await this.synchronizer.flush()

      // Emit final summary
      const duration = Date.now() - this.startTime
      const finalSummary = this.outputBuilder.buildStreamingSummary(
        this.testCounts.passed,
        this.testCounts.failed,
        this.testCounts.skipped,
        duration
      )

      this.emitEvent(StreamEventType.RUN_COMPLETE, {
        summary: finalSummary,
        duration
      })

      // Shutdown synchronizer
      await this.synchronizer.shutdown()
    } catch (error) {
      this.debugError('Error stopping stream integration: %O', error)
    } finally {
      this.isActive = false
      this.debug('Stream integration stopped')
    }
  }

  /**
   * Stream a test result in real-time
   */
  async streamTestResult(result: TestResult | TestFailure): Promise<void> {
    if (!this.isActive) {
      this.debugError('Cannot stream test result: integration not active')
      return
    }

    try {
      // Update counters
      if ('error' in result) {
        this.testCounts.failed++
        this.emitEvent(StreamEventType.TEST_FAILURE, { result })
      } else {
        this.testCounts.passed++
      }

      // Build streaming output for this test
      const streamOutput = this.outputBuilder.buildTestResult(result)

      // Stream the result
      await this.synchronizer.writeOutput({
        priority: 'error' in result ? 0 : 2, // HIGH for failures, NORMAL for passes
        source: 'test',
        data: JSON.stringify(streamOutput),
        stream: 'stdout'
      })

      this.emitEvent(StreamEventType.TEST_COMPLETE, { result })

      this.debug('Streamed test result for: %s', result.test)
    } catch (error) {
      this.debugError('Error streaming test result: %O', error)
      
      if (!this.config.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Write dual-mode output (streaming + file)
   */
  async writeDualOutput(finalOutput: any): Promise<void> {
    if (!this.config.outputFile) {
      return
    }

    try {
      await this.outputWriter.write(this.config.outputFile, finalOutput)
      this.debug('Dual-mode output written to: %s', this.config.outputFile)
    } catch (error) {
      this.debugError('Error writing dual-mode output: %O', error)
      
      if (!this.config.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Add event listener
   */
  on(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(listener)
  }

  /**
   * Remove event listener
   */
  off(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Emit stream event
   */
  private emitEvent(type: StreamEventType, data: any): void {
    const event: StreamEvent = {
      type,
      timestamp: Date.now(),
      data
    }

    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          this.debugError('Error in stream event listener: %O', error)
        }
      })
    }
  }

  /**
   * Get current test statistics
   */
  getStats(): {
    isActive: boolean
    testCounts: typeof this.testCounts
    duration: number
    synchronizerStats: ReturnType<OutputSynchronizer['getStats']>
  } {
    return {
      isActive: this.isActive,
      testCounts: { ...this.testCounts },
      duration: this.isActive ? Date.now() - this.startTime : 0,
      synchronizerStats: this.synchronizer.getStats()
    }
  }

  /**
   * Check if streaming is currently active
   */
  get active(): boolean {
    return this.isActive
  }

  /**
   * Get current environment information
   */
  getEnvironmentInfo(): ReturnType<typeof detectEnvironment> {
    return detectEnvironment()
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StreamIntegrationConfig>): void {
    this.config = { ...this.config, ...config }
    this.debug('Stream integration configuration updated')
  }
}