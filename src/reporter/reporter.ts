/**
 * LLM Reporter Implementation
 *
 * Core reporter class for Vitest that generates LLM-optimized output.
 * Orchestrates various components to process test results.
 *
 * @module reporter
 */

import type { Vitest, SerializedError, Reporter, UserConsoleLog } from 'vitest'
// These types come from vitest/node exports
import type { TestModule, TestCase, TestSpecification, TestRunEndReason } from 'vitest/node'
import type { LLMReporterConfig } from '../types/reporter.js'
import type { LLMReporterOutput } from '../types/schema.js'

// Type for resolved configuration with explicit undefined handling
interface ResolvedLLMReporterConfig
  extends Omit<LLMReporterConfig, 'outputFile' | 'enableStreaming' | 'truncation'> {
  verbose: boolean
  outputFile: string | undefined // Explicitly undefined, not optional
  includePassedTests: boolean
  includeSkippedTests: boolean
  captureConsoleOnFailure: boolean
  maxConsoleBytes: number
  maxConsoleLines: number
  includeDebugOutput: boolean
  tokenCountingEnabled: boolean
  maxTokens: number | undefined
  enableStreaming: boolean
  includeAbsolutePaths: boolean // Whether to include absolute paths in output
  performance: Required<MonitoringConfig>
  truncation: {
    enabled: boolean
    maxTokens: number | undefined
    strategy: 'simple' | 'smart' | 'priority'
    featureFlag: boolean
    enableEarlyTruncation: boolean
    enableLateTruncation: boolean
    enableMetrics: boolean
  }
  framedOutput: boolean // Gate for console separator frames
  forceConsoleOutput: boolean // Force console write when used standalone
  includeStackString: boolean // Include raw stack strings in error output
  spinner: {
    enabled: boolean
    intervalMs: number
    stream: 'stdout' | 'stderr'
    prefix: string
  }
}

// Import new components
import { StateManager } from '../state/StateManager.js'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor.js'
import { ErrorExtractor } from '../extraction/ErrorExtractor.js'
import { TestResultBuilder } from '../builders/TestResultBuilder.js'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder.js'
import { OutputBuilder } from '../output/OutputBuilder.js'
import { OutputWriter } from '../output/OutputWriter.js'
import { EventOrchestrator } from '../events/EventOrchestrator.js'
import { coreLogger, errorLogger } from '../utils/logger.js'
import { isTTY } from '../utils/environment.js'
import {
  PerformanceManager,
  createPerformanceManager,
  type MonitoringConfig
} from '../monitoring/index.js'

export class LLMReporter implements Reporter {
  private config: ResolvedLLMReporterConfig
  private context?: Vitest
  private output?: LLMReporterOutput
  private debug = coreLogger()
  private debugError = errorLogger()
  private isTestRunActive = false // Track if a test run is in progress (watch mode)
  private rootDir?: string // Root directory from Vitest config

  // Component instances
  private stateManager: StateManager
  private testExtractor: TestCaseExtractor
  private errorExtractor: ErrorExtractor
  private resultBuilder: TestResultBuilder
  private contextBuilder: ErrorContextBuilder
  private outputBuilder: OutputBuilder
  private outputWriter: OutputWriter
  private orchestrator: EventOrchestrator
  private performanceManager?: PerformanceManager
  // Spinner state
  private spinnerTimer?: NodeJS.Timeout
  private spinnerActive = false
  private spinnerIndex = 0
  private spinnerStartTime = 0
  private spinnerLastLength = 0
  private readonly spinnerFrames = ['|', '/', '-', '\\']

  /**
   * Creates a new instance of the LLM Reporter
   *
   * @param config - Configuration options for the reporter
   */
  constructor(config: LLMReporterConfig = {}) {
    // Validate config before using it
    this.validateConfig(config)

    // Detect streaming mode if not explicitly configured
    const shouldEnableStreaming = config.enableStreaming ?? isTTY

    // Properly resolve config without unsafe casting
    this.config = {
      verbose: config.verbose ?? false,
      outputFile: config.outputFile ?? undefined,
      includePassedTests: config.includePassedTests ?? false,
      includeSkippedTests: config.includeSkippedTests ?? false,
      captureConsoleOnFailure: config.captureConsoleOnFailure ?? true,
      maxConsoleBytes: config.maxConsoleBytes ?? 50_000,
      maxConsoleLines: config.maxConsoleLines ?? 100,
      includeDebugOutput: config.includeDebugOutput ?? false,
      tokenCountingEnabled: config.tokenCountingEnabled ?? false,
      maxTokens: config.maxTokens ?? undefined,
      enableStreaming: shouldEnableStreaming,
      includeAbsolutePaths: config.includeAbsolutePaths ?? false,
      filterNodeModules: config.filterNodeModules ?? true,
      performance: {
        enabled: config.performance?.enabled ?? false,
        cacheSize: config.performance?.cacheSize ?? 1000,
        memoryWarningThreshold: config.performance?.memoryWarningThreshold ?? 500 * 1024 * 1024 // 500MB
      },
      truncation: {
        enabled: config.truncation?.enabled ?? false,
        maxTokens: config.truncation?.maxTokens ?? undefined,
        strategy: config.truncation?.strategy ?? 'smart',
        featureFlag: config.truncation?.featureFlag ?? false,
        enableEarlyTruncation: config.truncation?.enableEarlyTruncation ?? false,
        enableLateTruncation: config.truncation?.enableLateTruncation ?? false,
        enableMetrics: config.truncation?.enableMetrics ?? false
      },
      framedOutput: config.framedOutput ?? false,
      forceConsoleOutput: config.forceConsoleOutput ?? false,
      includeStackString: config.includeStackString ?? false,
      spinner: {
        enabled: isTTY,
        intervalMs: 80,
        stream: 'stderr',
        prefix: 'Running tests'
      }
    }

    // Initialize components
    this.stateManager = new StateManager()
    this.testExtractor = new TestCaseExtractor()
    this.errorExtractor = new ErrorExtractor({
      includeAbsolutePaths: false, // Will be updated in onInit with actual config
      filterNodeModules: this.config.filterNodeModules ?? true // Use config value or default to true
    })
    this.resultBuilder = new TestResultBuilder({
      includeAbsolutePaths: false, // Will be updated in onInit with actual config
      includeStackString: this.config.includeStackString
    })
    this.contextBuilder = new ErrorContextBuilder()
    this.outputBuilder = new OutputBuilder({
      verbose: this.config.verbose,
      includePassedTests: this.config.includePassedTests,
      includeSkippedTests: this.config.includeSkippedTests,
      enableStreaming: this.config.enableStreaming,
      filterNodeModules: this.config.filterNodeModules ?? true,
      includeStackString: this.config.includeStackString,
      truncation: this.config.truncation
    })
    this.outputWriter = new OutputWriter()

    // Initialize orchestrator with all dependencies and console config
    this.orchestrator = new EventOrchestrator(
      this.stateManager,
      this.testExtractor,
      this.errorExtractor,
      this.resultBuilder,
      this.contextBuilder,
      {
        captureConsoleOnFailure: this.config.captureConsoleOnFailure,
        maxConsoleBytes: this.config.maxConsoleBytes,
        maxConsoleLines: this.config.maxConsoleLines,
        includeDebugOutput: this.config.includeDebugOutput,
        truncationConfig: this.config.truncation
      }
    )

    // Initialize performance manager if enabled
    if (this.config.performance.enabled) {
      this.performanceManager = createPerformanceManager(this.config.performance)
      void this.initializePerformanceManager()
    }
  }

  /**
   * Initialize performance manager
   */
  private async initializePerformanceManager(): Promise<void> {
    if (!this.performanceManager) {
      return
    }

    try {
      await this.performanceManager.initialize()
      this.debug('Performance manager initialized')
    } catch (error) {
      this.debugError('Failed to initialize performance manager: %O', error)
      // Don't fail the reporter if performance manager fails
      this.performanceManager = undefined
    }
  }

  /**
   * Validates configuration values
   */
  private validateConfig(config: LLMReporterConfig): void {
    if (config.maxConsoleBytes !== undefined && config.maxConsoleBytes < 0) {
      throw new Error('maxConsoleBytes must be a positive number')
    }
    if (config.maxConsoleLines !== undefined && config.maxConsoleLines < 0) {
      throw new Error('maxConsoleLines must be a positive number')
    }
    if (config.maxTokens !== undefined && config.maxTokens < 0) {
      throw new Error('maxTokens must be a positive number')
    }
  }

  /**
   * Cleanup resources (always called in finally blocks)
   */
  private cleanup(): void {
    this.stopSpinner()
    this.orchestrator.reset()
    this.isTestRunActive = false

    // Stop performance monitoring
    if (this.performanceManager) {
      this.performanceManager.stop()
    }
  }

  /**
   * Reset state for watch mode reuse
   */
  private reset(): void {
    this.debug('Resetting reporter state for new test run')
    this.stateManager.reset()
    this.orchestrator.reset()
    this.output = undefined

    // Reset performance state
    if (this.performanceManager) {
      this.performanceManager.reset()
    }
  }

  /**
   * Safe wrapper for orchestrator calls with error handling
   */
  private safeOrchestratorCall<T>(
    methodName: string,
    data: T | undefined | null,
    handler: (data: T) => void
  ): void {
    if (!data) {
      this.debugError(`Received null/undefined data in ${methodName}`)
      return
    }
    try {
      handler(data)
    } catch (error) {
      this.debugError(`Error in ${methodName}: %O`, error)
    }
  }

  /**
   * Get the resolved reporter configuration
   *
   * @returns The resolved configuration with all defaults applied
   */
  getConfig(): ResolvedLLMReporterConfig {
    return this.config
  }

  /**
   * Get the Vitest context
   *
   * @returns The Vitest context if initialized, undefined otherwise
   */
  getContext(): Vitest | undefined {
    return this.context
  }

  /**
   * Get a snapshot of the current test state
   *
   * @returns A snapshot of the state manager's current state
   */
  getState(): ReturnType<StateManager['getSnapshot']> {
    // Return state snapshot for backward compatibility
    return this.stateManager.getSnapshot()
  }

  /**
   * Get the generated LLM reporter output
   *
   * @returns The output if generated, undefined otherwise
   */
  getOutput(): LLMReporterOutput | undefined {
    return this.output
  }

  /**
   * Get performance metrics
   *
   * @returns Performance metrics if available, undefined otherwise
   */
  getPerformanceMetrics(): ReturnType<PerformanceManager['getMetrics']> | undefined {
    return this.performanceManager?.getMetrics()
  }

  /**
   * Check if performance is within configured limits
   *
   * @returns True if within limits, false otherwise
   */
  isPerformanceWithinLimits(): boolean {
    return this.performanceManager?.isWithinLimits() ?? true
  }

  /**
   * Initialize the reporter with Vitest context
   *
   * @param ctx - The Vitest context
   */
  onInit(ctx: Vitest): void {
    this.context = ctx
    this.rootDir = ctx.config.root

    // Update components with root directory and config
    this.resultBuilder.updateConfig({
      rootDir: this.rootDir,
      includeAbsolutePaths: this.config.includeAbsolutePaths,
      includeStackString: this.config.includeStackString
    })
    // Recreate ErrorExtractor with updated rootDir and config
    this.errorExtractor = new ErrorExtractor({
      rootDir: this.rootDir,
      includeAbsolutePaths: this.config.includeAbsolutePaths,
      filterNodeModules: this.config.filterNodeModules ?? true // Default to true if not specified
    })
    // Update the orchestrator's error extractor reference
    this.orchestrator.updateErrorExtractor(this.errorExtractor)
  }

  /**
   * Handle test run start event
   *
   * @param specifications - The test specifications for the run
   */
  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    // Handle watch mode: reset if a test run is already active
    if (this.isTestRunActive) {
      this.reset()
    }
    this.isTestRunActive = true

    try {
      // Start spinner if enabled
      this.startSpinner()

      // Start performance monitoring
      if (this.performanceManager) {
        this.performanceManager.start()
      }

      this.orchestrator.handleTestRunStart(specifications)
    } catch (error) {
      this.debugError('Error in onTestRunStart: %O', error)
      // Continue operation even if orchestrator fails
    }
  }

  /**
   * Handle test module queued event
   *
   * @param testModule - The test module that was queued
   */
  onTestModuleQueued(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleQueued', testModule, (module) =>
      this.orchestrator.handleTestModuleQueued(module)
    )
  }

  /**
   * Handle test module collected event
   *
   * @param testModule - The test module that was collected
   */
  onTestModuleCollected(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleCollected', testModule, (module) =>
      this.orchestrator.handleTestModuleCollected(module)
    )
  }

  /**
   * Handle test module start event
   *
   * @param testModule - The test module that is starting
   */
  onTestModuleStart(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleStart', testModule, (module) =>
      this.orchestrator.handleTestModuleStart(module)
    )
  }

  /**
   * Handle test module end event
   *
   * @param testModule - The test module that has ended
   */
  onTestModuleEnd(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleEnd', testModule, (module) =>
      this.orchestrator.handleTestModuleEnd(module)
    )
  }

  /**
   * Handle test case ready event
   *
   * @param testCase - The test case that is ready to run
   */
  onTestCaseReady(testCase: TestCase): void {
    this.safeOrchestratorCall('onTestCaseReady', testCase, (test) =>
      this.orchestrator.handleTestCaseReady(test)
    )
  }

  /**
   * Handle test case result event
   *
   * @param testCase - The test case with its result
   */
  onTestCaseResult(testCase: TestCase): void {
    this.safeOrchestratorCall('onTestCaseResult', testCase, (test) =>
      this.orchestrator.handleTestCaseResult(test)
    )
  }

  /**
   * Handle test run end event
   *
   * @param testModules - The test modules that were run
   * @param unhandledErrors - Any unhandled errors that occurred
   * @param reason - The reason the test run ended
   */
  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason
  ): Promise<void> {
    try {
      // Stop spinner before emitting final output
      this.stopSpinner()
      // Delegate to orchestrator with error handling
      try {
        this.orchestrator.handleTestRunEnd(testModules, unhandledErrors, reason)
      } catch (orchestratorError) {
        this.debugError('Error in orchestrator.handleTestRunEnd: %O', orchestratorError)
        // Continue to build output even if orchestrator fails
      }

      // Debug-log any unhandled errors in a compact formatted way
      if (unhandledErrors && unhandledErrors.length > 0) {
        for (const ue of unhandledErrors) {
          try {
            const formatted = this.errorExtractor.format(this.errorExtractor.extractWithContext(ue))
            this.debug('Unhandled error (formatted):\n%s', formatted)
          } catch (e) {
            this.debugError('Failed to format unhandled error: %O', e)
          }
        }
      }

      // Get statistics and test results
      const statistics = this.stateManager.getStatistics()
      const testResults = this.stateManager.getTestResults()

      // Build output using OutputBuilder
      try {
        this.output = this.outputBuilder.build({
          testResults,
          duration: statistics.duration,
          startTime: this.stateManager.getStartTime(),
          unhandledErrors: unhandledErrors
        })
      } catch (buildError) {
        this.debugError('Error building output: %O', buildError)
        // Create minimal output if builder fails
        this.output = {
          summary: {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            timestamp: new Date().toISOString()
          }
        }
      }

      // Run performance optimization if enabled
      if (this.performanceManager) {
        try {
          const optimizations = await this.performanceManager.optimize()
          if (optimizations.length > 0) {
            this.debug('Applied %d performance optimizations', optimizations.length)
          }

          // Check if we're within performance limits
          if (!this.performanceManager.isWithinLimits()) {
            this.debugError('Performance overhead exceeded limits')
          }

          // Log performance metrics in debug mode
          const metrics = this.performanceManager.getMetrics()
          this.debug('Performance metrics: %O', {
            testCount: metrics.testCount,
            cacheHitRate: metrics.cache.hitRate,
            memoryUsed: metrics.memory.used,
            uptime: metrics.uptime
          })
        } catch (perfError) {
          this.debugError('Performance optimization failed: %O', perfError)
        }
      }

      // Write output based on configuration
      if (this.output) {
        // Write to file if configured
        if (this.config.outputFile) {
          try {
            this.outputWriter.write(this.config.outputFile, this.output)
            this.debug('Output written to %s', this.config.outputFile)
          } catch (writeError) {
            this.debugError(
              'Failed to write output file %s: %O',
              this.config.outputFile,
              writeError
            )
            // Don't propagate write errors - log is sufficient
          }
        }

        // Also write to console if no file is specified or streaming is enabled
        // Only when running as an actual Vitest reporter (context set) during a test run.
        // This prevents unit tests that directly new LLMReporter() from emitting output.
        if (
          (!this.config.outputFile || this.config.enableStreaming) &&
          ((this.context && this.isTestRunActive) || this.config.forceConsoleOutput)
        ) {
          try {
            // Write to console with proper formatting
            const jsonOutput = JSON.stringify(this.output, null, 2)

            // Only add framing if framedOutput is enabled
            if (this.config.framedOutput) {
              process.stdout.write('\n' + '='.repeat(80) + '\n')
              process.stdout.write('LLM Reporter Output:\n')
              process.stdout.write('='.repeat(80) + '\n')
            }

            process.stdout.write(jsonOutput + '\n')

            if (this.config.framedOutput) {
              process.stdout.write('='.repeat(80) + '\n')
            }

            this.debug('Output written to console')
          } catch (consoleError) {
            this.debugError('Failed to write to console: %O', consoleError)
          }
        }
      }
    } finally {
      // Always cleanup, even if errors occurred
      this.cleanup()
    }
  }

  /**
   * Capture user console logs forwarded by Vitest (v3)
   *
   * @param log - The console log event from Vitest containing test output
   */
  onUserConsoleLog(log: UserConsoleLog): void {
    try {
      this.orchestrator.handleUserConsoleLog(log)
    } catch (error) {
      this.debugError('Error in onUserConsoleLog: %O', error)
    }
  }

  /**
   * Start spinner animation on selected stream
   */
  private startSpinner(): void {
    if (this.spinnerActive || !this.config.spinner.enabled) return
    const stream = this.config.spinner.stream === 'stdout' ? process.stdout : process.stderr
    if (!stream.isTTY) return
    this.spinnerActive = true
    this.spinnerIndex = 0
    this.spinnerStartTime = Date.now()
    this.spinnerLastLength = 0

    const render = (): void => {
      const elapsedMs = Date.now() - this.spinnerStartTime
      const seconds = Math.max(0, Math.round(elapsedMs / 1000))
      const frame = this.spinnerFrames[this.spinnerIndex % this.spinnerFrames.length]
      const message = `${this.config.spinner.prefix} ${frame} ${seconds}s`

      if (this.spinnerLastLength > 0) {
        stream.write('\r' + ' '.repeat(this.spinnerLastLength) + '\r')
      }
      stream.write(message)
      this.spinnerLastLength = message.length
      this.spinnerIndex++
    }

    render()
    this.spinnerTimer = setInterval(render, this.config.spinner.intervalMs)
  }

  /**
   * Stop spinner and clear line
   */
  private stopSpinner(): void {
    if (!this.spinnerActive) return
    if (this.spinnerTimer) clearInterval(this.spinnerTimer)
    this.spinnerTimer = undefined
    const stream = this.config.spinner.stream === 'stdout' ? process.stdout : process.stderr
    if (this.spinnerLastLength > 0 && stream.isTTY) {
      stream.write('\r' + ' '.repeat(this.spinnerLastLength) + '\r')
    }
    this.spinnerActive = false
    this.spinnerLastLength = 0
  }
}
