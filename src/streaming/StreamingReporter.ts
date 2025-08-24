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
 * Streaming statistics interface
 */
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
  private streamingStartTime = Date.now()

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

      this.streamDebug('Streaming integration initialized successfully')
    } catch (error) {
      this.streamDebugError('Failed to initialize streaming integration: %O', error)

      if (!this.streamingConfig.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Override onInit to start streaming
   */
  onInit(ctx: Vitest): void {
    super.onInit(ctx)

    if (this.streamIntegration) {
      this.streamIntegration.initialize().catch((error) => {
        this.streamDebugError('Failed to initialize streaming: %O', error)
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
        .initialize()
        .then(() => {
          this.isStreamingActive = true
          this.streamingStartTime = Date.now()
          this.streamDebug('Streaming session started')

          // Send run start event
          const event: StreamEvent = {
            type: StreamEventType.SUITE_START,
            timestamp: Date.now(),
            data: { suiteId: 'test-run', suiteName: 'Test Run' }
          }
          return this.streamIntegration?.processEvent(event)
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
        // Send appropriate event based on result type
        let eventType: StreamEventType
        let eventData: any

        if ('error' in result) {
          // This is a TestFailure
          eventType = StreamEventType.TEST_FAILURE
          eventData = { testId: testCase.id || testCase.name, failure: result }
          
          // Also send a test complete event
          await this.streamIntegration.processEvent({
            type: eventType,
            timestamp: Date.now(),
            data: eventData
          })
        }

        // Always send a test complete event
        eventType = StreamEventType.TEST_COMPLETE
        eventData = { testId: testCase.id || testCase.name, result: result }

        await this.streamIntegration.processEvent({
          type: eventType,
          timestamp: Date.now(),
          data: eventData
        })

        // Handle custom output callback
        if (this.streamingConfig.onStreamOutput) {
          const status = 'error' in result ? 'FAIL' : 'PASS'
          const output = `${status} ${result.test}${('error' in result && result.error?.message) ? ` - ${result.error.message}` : ''}\n`
          this.streamingConfig.onStreamOutput(output)
        }
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
      await this.completeStreaming()
    } catch (error) {
      this.streamDebugError('Error in onTestRunEnd: %O', error)

      // Ensure streaming is cleaned up even if there's an error
      await this.completeStreaming()

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

      // Send run complete event
      if (finalOutput) {
        await this.streamIntegration.processEvent({
          type: StreamEventType.RUN_COMPLETE,
          timestamp: Date.now(),
          data: { output: finalOutput }
        })

        // Handle custom output callback for run completion
        if (this.streamingConfig.onStreamOutput && finalOutput.summary) {
          const summary = finalOutput.summary
          const output = `\nTest run completed: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${summary.duration}ms)\n`
          this.streamingConfig.onStreamOutput(output)
        }
      }

      // Shutdown streaming session
      await this.streamIntegration.shutdown()
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
    if (!this.streamIntegration) {
      return null
    }
    
    const stats = this.streamIntegration.getStats()
    
    // Convert to StreamingStats format
    return {
      eventsProcessed: stats.eventsProcessed,
      testCount: stats.eventsProcessed, // Use events processed as test count approximation
      startTime: this.streamingStartTime,
      endTime: this.isStreamingActive ? undefined : Date.now()
    }
  }

  /**
   * Check if streaming is currently active
   */
  get isStreaming(): boolean {
    return this.isStreamingActive && Boolean(this.streamIntegration)
  }

  /**
   * Get environment information
   */
  getEnvironmentInfo(): ReturnType<typeof detectEnvironment> {
    return detectEnvironment()
  }

  /**
   * Enable or disable streaming at runtime
   */
  setStreamingEnabled(enabled: boolean): void {
    if (enabled && !this.streamIntegration) {
      this.initializeStreaming()
    } else if (!enabled && this.streamIntegration && this.isStreamingActive) {
      void this.completeStreaming()
    }
  }

  /**
   * Add custom stream event listener (stub - no longer supported in simplified API)
   */
  onStreamEvent(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    this.streamDebug('Event listeners are not supported in the simplified streaming API')
  }

  /**
   * Remove custom stream event listener (stub - no longer supported in simplified API)
   */
  offStreamEvent(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    this.streamDebug('Event listeners are not supported in the simplified streaming API')
  }
}
