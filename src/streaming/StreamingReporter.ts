/**
 * Streaming LLM Reporter
 *
 * Enhanced reporter that extends LLMReporter with real-time streaming capabilities.
 * Provides live test result streaming while maintaining full backward compatibility.
 *
 * @module streaming/StreamingReporter
 */

import type { Vitest, TestModule, TestCase, TestSpecification, TestRunEndReason } from 'vitest/node'
import type { SerializedError } from 'vitest'
import type { LLMReporterConfig } from '../types/reporter'
import type { TestFailure, TestResult, TestSummary } from '../types/schema'
import { LLMReporter } from '../reporter/reporter'
import {
  ReporterStreamIntegration,
  StreamEventType,
  type StreamIntegrationConfig,
  type StreamEvent
} from './ReporterStreamIntegration'
import { coreLogger, errorLogger } from '../utils/logger'
import { detectEnvironment, hasTTY } from '../utils/environment'

/**
 * Typed event data interfaces for stream events
 */
interface TestFailureEventData {
  result: TestFailure
}

interface TestCompleteEventData {
  result: TestResult | TestFailure
}

interface RunCompleteEventData {
  summary: TestSummary
}

interface StreamingStats {
  eventsProcessed: number
  testCount: number
  startTime: number
  endTime?: number
}

/**
 * Streaming reporter configuration extends base configuration
 */
export interface StreamingReporterConfig extends LLMReporterConfig {
  /** Enable real-time streaming output */
  enableStreaming?: boolean
  /** Enable graceful degradation for non-TTY environments */
  gracefulDegradation?: boolean
  /** Custom stream output handler */
  onStreamOutput?: (output: string) => void
}

/**
 * Enhanced LLM Reporter with streaming capabilities
 *
 * This reporter extends the base LLMReporter to provide real-time streaming
 * of test results while maintaining full compatibility with the standard reporter.
 *
 * @example
 * ```typescript
 * const reporter = new StreamingReporter({
 *   enableStreaming: true,
 *   outputFile: 'results.json',
 *   gracefulDegradation: true
 * });
 * ```
 */
export class StreamingReporter extends LLMReporter {
  private streamIntegration?: ReporterStreamIntegration
  private streamingConfig: StreamingReporterConfig
  private streamDebug = coreLogger()
  private streamDebugError = errorLogger()
  private isStreamingActive = false

  constructor(config: StreamingReporterConfig = {}) {
    // Initialize base reporter
    super(config)

    this.streamingConfig = config

    // Initialize streaming if enabled and environment supports it
    this.initializeStreaming()
  }

  /**
   * Initialize streaming integration if conditions are met
   */
  private initializeStreaming(): void {
    const resolvedConfig = this.getConfig()

    if (!resolvedConfig.enableStreaming) {
      this.streamDebug('Streaming disabled in configuration')
      return
    }

    const envInfo = detectEnvironment()

    // Check if environment supports streaming
    if (!hasTTY(envInfo) && !this.streamingConfig.gracefulDegradation) {
      this.streamDebug(
        'Environment does not support streaming and graceful degradation is disabled'
      )
      return
    }

    try {
      const integrationConfig: StreamIntegrationConfig = {
        streaming: resolvedConfig.streaming,
        outputFile: resolvedConfig.outputFile,
        gracefulDegradation: this.streamingConfig.gracefulDegradation ?? true
      }

      this.streamIntegration = new ReporterStreamIntegration(integrationConfig)

      // Set up event listeners for streaming output
      this.setupStreamEventListeners()

      this.streamDebug('Streaming integration initialized successfully')
    } catch (error) {
      this.streamDebugError('Failed to initialize streaming integration: %O', error)

      if (!this.streamingConfig.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Set up event listeners for stream events
   */
  private setupStreamEventListeners(): void {
    if (!this.streamIntegration) return

    // Listen for test failures to provide immediate feedback
    this.streamIntegration.on(StreamEventType.TEST_FAILURE, (event) => {
      const data = event.data as TestFailureEventData
      this.handleStreamTestFailure(data.result)
    })

    // Listen for test completions for progress updates
    this.streamIntegration.on(StreamEventType.TEST_COMPLETE, (event) => {
      const data = event.data as TestCompleteEventData
      this.handleStreamTestComplete(data.result)
    })

    // Listen for run completion
    this.streamIntegration.on(StreamEventType.RUN_COMPLETE, (event) => {
      const data = event.data as RunCompleteEventData
      this.handleStreamRunComplete(data)
    })
  }

  /**
   * Handle streaming test failure
   */
  private handleStreamTestFailure(result: TestFailure): void {
    if (this.streamingConfig.onStreamOutput) {
      const output = `FAIL ${result.test} - ${result.error?.message || 'Unknown error'}\n`
      this.streamingConfig.onStreamOutput(output)
    }
  }

  /**
   * Handle streaming test completion
   */
  private handleStreamTestComplete(result: TestResult | TestFailure): void {
    if (this.streamingConfig.onStreamOutput) {
      const status = 'error' in result ? 'FAIL' : 'PASS'
      const output = `${status} ${result.test}\n`
      this.streamingConfig.onStreamOutput(output)
    }
  }

  /**
   * Handle streaming run completion
   */
  private handleStreamRunComplete(data: RunCompleteEventData): void {
    if (this.streamingConfig.onStreamOutput) {
      const summary = data.summary
      const output = `\nTest run completed: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${summary.duration}ms)\n`
      this.streamingConfig.onStreamOutput(output)
    }
  }

  /**
   * Override onInit to start streaming
   */
  onInit(ctx: Vitest): void {
    super.onInit(ctx)

    if (this.streamIntegration) {
      this.streamIntegration.start().catch((error) => {
        this.streamDebugError('Failed to start streaming: %O', error)
      })
    }
  }

  /**
   * Override onTestRunStart to initialize streaming session
   */
  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    super.onTestRunStart(specifications)

    if (this.streamIntegration && !this.isStreamingActive) {
      this.streamIntegration
        .start()
        .then(() => {
          this.isStreamingActive = true
          this.streamDebug('Streaming session started')
        })
        .catch((error) => {
          this.streamDebugError('Failed to start streaming session: %O', error)
        })
    }
  }

  /**
   * Override onTestCaseResult to stream individual results
   */
  onTestCaseResult(testCase: TestCase): void {
    // Call parent implementation first
    super.onTestCaseResult(testCase)

    // Stream the result if streaming is active
    if (this.streamIntegration && this.isStreamingActive) {
      this.streamTestResult(testCase).catch((error) => {
        this.streamDebugError('Failed to stream test result: %O', error)
      })
    }
  }

  /**
   * Stream individual test result
   */
  private async streamTestResult(testCase: TestCase): Promise<void> {
    if (!this.streamIntegration) return

    try {
      // Extract result from state manager
      const state = this.getState()
      const testResults = state.testResults

      // Find the corresponding result
      let result: TestResult | TestFailure | undefined = testResults.failed.find(
        (f) => f.test === testCase.name
      )
      if (!result) {
        result = testResults.passed.find((p) => p.test === testCase.name)
      }
      if (!result) {
        result = testResults.skipped.find((s) => s.test === testCase.name)
      }

      if (result) {
        await this.streamIntegration.streamTestResult(result)
      }
    } catch (error) {
      this.streamDebugError('Error streaming test result: %O', error)
    }
  }

  /**
   * Override onTestRunEnd to complete streaming and write dual output
   */
  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason
  ): Promise<void> {
    try {
      // Call parent implementation to build final output
      await super.onTestRunEnd(testModules, unhandledErrors, reason)

      // Handle streaming completion
      void this.completeStreaming()
    } catch (error) {
      this.streamDebugError('Error in onTestRunEnd: %O', error)

      // Ensure streaming is cleaned up even if there's an error
      void this.completeStreaming()

      if (!this.streamingConfig.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Complete streaming session and write dual output
   */
  private async completeStreaming(): Promise<void> {
    if (!this.streamIntegration || !this.isStreamingActive) {
      return
    }

    try {
      // Get final output
      const finalOutput = this.getOutput()

      // Write dual-mode output (streaming + file)
      if (finalOutput) {
        this.streamIntegration.writeDualOutput(finalOutput)
      }

      // Stop streaming session
      await this.streamIntegration.stop()
      this.isStreamingActive = false

      this.streamDebug('Streaming session completed')
    } catch (error) {
      this.streamDebugError('Error completing streaming session: %O', error)
      this.isStreamingActive = false
    }
  }

  /**
   * Get streaming statistics
   */
  getStreamingStats(): StreamingStats | null {
    return (this.streamIntegration?.getStats() as StreamingStats) || null
  }

  /**
   * Check if streaming is currently active
   */
  get isStreaming(): boolean {
    return this.isStreamingActive && Boolean(this.streamIntegration?.active)
  }

  /**
   * Get environment information
   */
  getEnvironmentInfo(): ReturnType<typeof detectEnvironment> {
    return this.streamIntegration?.getEnvironmentInfo() || detectEnvironment()
  }

  /**
   * Enable or disable streaming at runtime
   */
  setStreamingEnabled(enabled: boolean): void {
    if (enabled && !this.streamIntegration) {
      this.initializeStreaming()
    } else if (!enabled && this.streamIntegration) {
      void this.completeStreaming()
    }
  }

  /**
   * Add custom stream event listener
   */
  onStreamEvent(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    this.streamIntegration?.on(event, listener)
  }

  /**
   * Remove custom stream event listener
   */
  offStreamEvent(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    this.streamIntegration?.off(event, listener)
  }
}
