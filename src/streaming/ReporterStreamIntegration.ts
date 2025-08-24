/**
 * Reporter Stream Integration
 *
 * Coordinates streaming components with the main reporter infrastructure.
 * Provides a bridge between the reporter events and streaming output system.
 *
 * @module streaming/ReporterStreamIntegration
 */

import type { TestResult, TestFailure, LLMReporterOutput } from '../types/schema'
import type { StreamingConfig } from '../types/reporter'
import type { EnvironmentInfo } from '../types/environment'
import { OutputSynchronizer, type SynchronizerConfig } from './OutputSynchronizer'
import { OutputBuilder } from '../output/OutputBuilder'
import { OutputWriter } from '../output/OutputWriter'
import { coreLogger, errorLogger } from '../utils/logger'
import { detectEnvironment } from '../utils/environment'
import { detectTerminalCapabilities, type TerminalCapabilities } from '../utils/terminal'

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
  data: unknown
}

/**
 * Integration between reporter and streaming infrastructure
 */
export class ReporterStreamIntegration {
  private config: ResolvedStreamIntegrationConfig
  private synchronizer: OutputSynchronizer
  private outputBuilder: OutputBuilder
  private outputWriter: OutputWriter
  private debug = coreLogger()
  private debugError = errorLogger()
  private environment: EnvironmentInfo
  private terminalCapabilities: TerminalCapabilities
  private isInitialized = false
  private eventQueue: StreamEvent[] = []
  private stats = {
    eventsProcessed: 0,
    eventsQueued: 0,
    eventsWritten: 0,
    errors: 0,
    startTime: Date.now()
  }

  constructor(config: StreamIntegrationConfig) {
    this.config = {
      streaming: config.streaming,
      outputFile: config.outputFile,
      gracefulDegradation: config.gracefulDegradation ?? true
    }

    // Initialize environment detection
    this.environment = detectEnvironment()
    this.terminalCapabilities = detectTerminalCapabilities()

    // Initialize components
    this.synchronizer = new OutputSynchronizer({
      enableTestGrouping: config.streaming.enableTestGrouping,
      maxConcurrentTests: config.streaming.maxConcurrentTests,
      deadlockCheckInterval: config.streaming.deadlockCheckInterval,
      enableMonitoring: config.streaming.enableMonitoring
    })

    this.outputBuilder = new OutputBuilder({
      verbose: false,
      includePassedTests: false,
      includeSkippedTests: false
    })

    this.outputWriter = new OutputWriter({
      createDirectories: true,
      jsonSpacing: 2, // Pretty print
      handleCircularRefs: true,
      gracefulErrorHandling: true
    })

    this.debug('ReporterStreamIntegration initialized')
  }

  /**
   * Initialize streaming infrastructure
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.synchronizer.initialize()
      this.isInitialized = true
      this.debug('Stream integration initialized successfully')
    } catch (error) {
      this.debugError('Failed to initialize stream integration:', error)
      if (!this.config.gracefulDegradation) {
        throw error
      }
      // Continue without streaming in graceful degradation mode
    }
  }

  /**
   * Process a stream event
   */
  async processEvent(event: StreamEvent): Promise<void> {
    if (!this.isInitialized) {
      this.eventQueue.push(event)
      this.stats.eventsQueued++
      return
    }

    try {
      // Process queued events first
      if (this.eventQueue.length > 0) {
        const queuedEvents = [...this.eventQueue]
        this.eventQueue = []
        for (const queuedEvent of queuedEvents) {
          await this.handleEvent(queuedEvent)
        }
      }

      // Process current event
      await this.handleEvent(event)
      this.stats.eventsProcessed++
    } catch (error) {
      this.stats.errors++
      this.debugError('Error processing stream event:', error)
      if (!this.config.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Handle individual event
   */
  private async handleEvent(event: StreamEvent): Promise<void> {
    switch (event.type) {
      case StreamEventType.TEST_START:
        await this.handleTestStart(event)
        break
      case StreamEventType.TEST_COMPLETE:
        await this.handleTestComplete(event)
        break
      case StreamEventType.TEST_FAILURE:
        await this.handleTestFailure(event)
        break
      case StreamEventType.SUITE_START:
        await this.handleSuiteStart(event)
        break
      case StreamEventType.SUITE_COMPLETE:
        await this.handleSuiteComplete(event)
        break
      case StreamEventType.RUN_COMPLETE:
        await this.handleRunComplete(event)
        break
    }
  }

  /**
   * Handle test start event
   */
  private async handleTestStart(event: StreamEvent): Promise<void> {
    const data = event.data as { testId: string; testName: string; filePath?: string }
    await this.synchronizer.registerTestStart({
      testId: data.testId,
      testName: data.testName,
      filePath: data.filePath,
      startTime: event.timestamp
    })
  }

  /**
   * Handle test complete event
   */
  private async handleTestComplete(event: StreamEvent): Promise<void> {
    const data = event.data as { testId: string; result: TestResult }
    await this.synchronizer.registerTestComplete(data.testId, data.result)

    // Write incremental output if in streaming mode
    if (this.terminalCapabilities.supportsColor) {
      await this.writeIncrementalOutput(data.result)
    }
  }

  /**
   * Handle test failure event
   */
  private async handleTestFailure(event: StreamEvent): Promise<void> {
    const data = event.data as { testId: string; failure: TestFailure }
    
    // Write failure immediately for fast feedback
    if (this.terminalCapabilities.supportsColor) {
      await this.writeFailureOutput(data.failure)
    }
  }

  /**
   * Handle suite start event
   */
  private async handleSuiteStart(event: StreamEvent): Promise<void> {
    const data = event.data as { suiteId: string; suiteName: string }
    this.debug(`Suite started: ${data.suiteName}`)
  }

  /**
   * Handle suite complete event
   */
  private async handleSuiteComplete(event: StreamEvent): Promise<void> {
    const data = event.data as { suiteId: string; suiteName: string }
    this.debug(`Suite completed: ${data.suiteName}`)
  }

  /**
   * Handle run complete event
   */
  private async handleRunComplete(event: StreamEvent): Promise<void> {
    const data = event.data as { output: LLMReporterOutput }
    
    // Final flush
    await this.synchronizer.flush()
    
    // Write final output to file if configured
    if (this.config.outputFile) {
      this.outputWriter.write(this.config.outputFile, data.output)
    }
    this.stats.eventsWritten++
  }

  /**
   * Write incremental test output
   */
  private async writeIncrementalOutput(result: TestResult): Promise<void> {
    // TestResult only has passed/skipped status, failures are handled separately
    // Nothing to write for passed/skipped tests in streaming mode
  }

  /**
   * Write failure output to console
   */
  private async writeFailureOutput(failure: TestFailure): Promise<void> {
    // Format failure for console output
    const output = JSON.stringify({
      test: failure.test,
      suite: failure.suite,
      error: failure.error.message
    }, null, 2)
    process.stderr.write(output + '\n')
    this.stats.eventsWritten++
  }

  /**
   * Shutdown streaming infrastructure
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    try {
      await this.synchronizer.shutdown()
      this.isInitialized = false
      
      const runtime = Date.now() - this.stats.startTime
      this.debug(`Stream integration shutdown. Stats: ${JSON.stringify({
        ...this.stats,
        runtime
      })}`)
    } catch (error) {
      this.debugError('Error during stream integration shutdown:', error)
      if (!this.config.gracefulDegradation) {
        throw error
      }
    }
  }

  /**
   * Get integration statistics
   */
  getStats() {
    return {
      ...this.stats,
      synchronizerStats: this.synchronizer.getStats(),
      queueLength: this.eventQueue.length,
      isInitialized: this.isInitialized
    }
  }
}