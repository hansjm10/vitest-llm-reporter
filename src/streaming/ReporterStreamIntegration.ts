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
import { OutputSource, OutputPriority } from './queue'
import { OutputBuilder } from '../output/OutputBuilder'
import { OutputWriter } from '../output/OutputWriter'
import { coreLogger, errorLogger } from '../utils/logger'
import { detectEnvironment, hasTTY } from '../utils/environment'
import {
  detectTerminalCapabilities,
  supportsColor,
  type TerminalCapabilities
} from '../utils/terminal'
import { StreamErrorHandler, StreamErrorType, RecoveryStrategy } from './ErrorHandler'
import { StreamRecovery, StreamHealth, RecoveryMode } from './StreamRecovery'
import { StreamingDiagnostics, DiagnosticLevel } from './diagnostics'

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

interface ResolvedStreamIntegrationConfig {
  streaming: StreamingConfig
  outputFile: string | undefined
  gracefulDegradation: boolean
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
  private config: ResolvedStreamIntegrationConfig
  private synchronizer: OutputSynchronizer
  private outputBuilder: OutputBuilder
  private outputWriter: OutputWriter
  private debug = coreLogger()
  private debugError = errorLogger()
  private isActive = false
  private testCounts = { passed: 0, failed: 0, skipped: 0 }
  private startTime = 0
  private listeners = new Map<StreamEventType, Array<(event: StreamEvent) => void>>()
  private terminalCapabilities?: TerminalCapabilities
  private degradationMode = false
  private errorHandler: StreamErrorHandler
  private streamRecovery: StreamRecovery
  private diagnostics: StreamingDiagnostics

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

    // Initialize error handling components
    this.errorHandler = new StreamErrorHandler({
      enableFallbackFile: true,
      enableFallbackConsole: true,
      fallbackFilePath: this.config.outputFile
        ? this.config.outputFile.replace('.json', '-fallback.json')
        : 'vitest-llm-fallback.json',
      enableErrorReporting: true
    })

    this.diagnostics = new StreamingDiagnostics({
      enabled: true,
      enableOperationTracking: true,
      enablePerformanceWarnings: true,
      enableResourceMonitoring: true
    })

    this.streamRecovery = new StreamRecovery(this.errorHandler)

    this.debug('Stream integration initialized with error handling and recovery')
  }

  /**
   * Start streaming session
   */
  async start(): Promise<void> {
    if (this.isActive) {
      this.debug('Stream integration already active')
      return
    }

    try {
      // Start diagnostics and recovery systems
      this.diagnostics.start()
      this.streamRecovery.start()

      // Detect terminal and environment capabilities
      const envInfo = detectEnvironment()
      this.terminalCapabilities = detectTerminalCapabilities()

      // Determine if we need to run in degradation mode
      this.degradationMode = this.shouldDegradeGracefully(envInfo, this.terminalCapabilities)

      if (this.degradationMode) {
        this.debug(
          'Running in degradation mode: TTY=%s, CI=%s, Color=%s',
          this.terminalCapabilities.isTTY,
          envInfo.ci.isCI,
          this.terminalCapabilities.supportsColor
        )
      }

      this.isActive = true
      this.startTime = Date.now()
      this.testCounts = { passed: 0, failed: 0, skipped: 0 }

      this.emitEvent(StreamEventType.SUITE_START, {
        timestamp: this.startTime,
        environment: envInfo,
        terminalCapabilities: this.terminalCapabilities,
        degradationMode: this.degradationMode
      })

      this.debug('Stream integration started (degradation mode: %s)', this.degradationMode)
    } catch (error) {
      const recoveryResult = await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'start_streaming',
          priority: OutputPriority.CRITICAL,
          source: OutputSource.SYSTEM
        }
      )

      if (!recoveryResult.success) {
        throw new Error(`Failed to start streaming integration: ${error}`)
      }

      // If recovery succeeded, we might be in degraded mode
      this.degradationMode = true
      this.isActive = true
      this.startTime = Date.now()
      this.testCounts = { passed: 0, failed: 0, skipped: 0 }
    }
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

      // Try to handle the error gracefully
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'stop_streaming',
          priority: OutputPriority.HIGH,
          source: OutputSource.SYSTEM
        }
      )
    } finally {
      // Stop error handling components
      this.streamRecovery.stop()
      this.diagnostics.stop()

      this.isActive = false
      this.debug('Stream integration stopped')
    }
  }

  /**
   * Determines if streaming should degrade gracefully
   */
  private shouldDegradeGracefully(envInfo: any, terminalCaps: TerminalCapabilities): boolean {
    if (!this.config.gracefulDegradation) {
      return false
    }

    // Degrade if no TTY (CI environments, redirected output)
    if (!terminalCaps.isTTY) {
      return true
    }

    // Degrade if in CI environment (even with TTY)
    if (envInfo.ci.isCI) {
      return true
    }

    // Degrade if terminal doesn't support basic capabilities
    if (!terminalCaps.supportsColor && terminalCaps.size.width < 40) {
      return true
    }

    return false
  }

  /**
   * Stream a test result in real-time
   */
  async streamTestResult(result: TestResult | TestFailure): Promise<void> {
    if (!this.isActive) {
      this.debugError('Cannot stream test result: integration not active')
      return
    }

    const operationId = this.diagnostics.trackOperationStart(
      'streamTestResult',
      'error' in result ? OutputPriority.HIGH : OutputPriority.NORMAL,
      OutputSource.TEST,
      { testName: result.test, hasError: 'error' in result }
    )

    try {
      // Update counters
      if ('error' in result) {
        this.testCounts.failed++
        this.emitEvent(StreamEventType.TEST_FAILURE, { result })
      } else {
        this.testCounts.passed++
      }

      // In degradation mode, use simpler output
      if (this.degradationMode) {
        this.handleDegradedOutput(result)
      } else {
        // Build streaming output for this test
        const streamOutput = this.outputBuilder.buildTestResult(result)

        // Stream the result
        await this.synchronizer.writeOutput({
          priority: 'error' in result ? OutputPriority.HIGH : OutputPriority.NORMAL,
          source: OutputSource.TEST,
          data: JSON.stringify(streamOutput),
          stream: 'stdout'
        })
      }

      this.emitEvent(StreamEventType.TEST_COMPLETE, { result })
      this.diagnostics.trackOperationComplete(operationId, true)

      this.debug('Streamed test result for: %s', result.test)
    } catch (error) {
      this.debugError('Error streaming test result: %O', error)

      // Track the error
      this.diagnostics.trackOperationError(operationId, {
        type: StreamErrorType.EXECUTION,
        severity: 'error' in result ? ('high' as any) : ('normal' as any),
        source: {
          operation: 'streamTestResult',
          priority: 'error' in result ? OutputPriority.HIGH : OutputPriority.NORMAL,
          source: OutputSource.TEST,
          testName: result.test
        },
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
        attempt: 1
      })

      // Handle the error
      const recoveryResult = await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'streamTestResult',
          priority: 'error' in result ? OutputPriority.HIGH : OutputPriority.NORMAL,
          source: OutputSource.TEST,
          metadata: { testResult: result }
        }
      )

      if (recoveryResult.success) {
        if (
          recoveryResult.strategy === RecoveryStrategy.FALLBACK_CONSOLE ||
          recoveryResult.strategy === RecoveryStrategy.DEGRADE
        ) {
          // Fall back to degraded output
          this.handleDegradedOutput(result)
        }
      } else if (!this.config.gracefulDegradation) {
        throw error
      } else {
        // Fall back to degraded output on error
        this.handleDegradedOutput(result)
      }
    }
  }

  /**
   * Handle output in degradation mode (simpler, non-streaming)
   */
  private handleDegradedOutput(result: TestResult | TestFailure): void {
    // In degradation mode, just emit minimal console output
    const status = 'error' in result ? 'FAIL' : 'PASS'
    const message = `${status} ${result.test}`

    // Use simple console output instead of complex streaming
    try {
      process.stdout.write(`${message}\n`)
    } catch (error) {
      // Even console.log can fail in extreme cases
      this.debugError('Failed to write degraded output: %O', error)
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
      listeners.forEach((listener) => {
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
  getStats() {
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
   * Check if running in degradation mode
   */
  get isDegraded(): boolean {
    return this.degradationMode
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

  /**
   * Get stream health status
   */
  getStreamHealth(): StreamHealth {
    return this.streamRecovery.getHealth()
  }

  /**
   * Get error handler statistics
   */
  getErrorStats() {
    return this.errorHandler.getStats()
  }

  /**
   * Get diagnostics report
   */
  getDiagnosticsReport() {
    return this.diagnostics.generateReport()
  }

  /**
   * Get recovery monitoring data
   */
  getRecoveryData() {
    return this.streamRecovery.getMonitoringData()
  }

  /**
   * Manually trigger recovery for testing purposes
   */
  async triggerManualRecovery(failureType: any): Promise<void> {
    await this.streamRecovery.manualRecovery(failureType)
  }

  /**
   * Reset circuit breaker for testing purposes
   */
  resetCircuitBreaker(): void {
    this.streamRecovery.resetCircuitBreaker()
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    return this.streamRecovery.isCircuitBreakerOpen()
  }
}
