/**
 * LLM Reporter Implementation
 *
 * Core reporter class for Vitest that generates LLM-optimized output.
 * Orchestrates various components to process test results.
 *
 * @module reporter
 */

import type { Vitest, SerializedError, Reporter } from 'vitest'
import type { TaskResultPack, TaskEventPack } from '@vitest/runner'
// These types come from vitest/node exports
import type { TestModule, TestCase, TestSpecification, TestRunEndReason } from 'vitest/node'
import type { LLMReporterConfig } from '../types/reporter'
import type { LLMReporterOutput } from '../types/schema'

// Type for resolved configuration with explicit undefined handling
interface ResolvedLLMReporterConfig extends Omit<LLMReporterConfig, 'outputFile'> {
  verbose: boolean
  outputFile: string | undefined // Explicitly undefined, not optional
  includePassedTests: boolean
  includeSkippedTests: boolean
  captureConsoleOnFailure: boolean
  maxConsoleBytes: number
  maxConsoleLines: number
  includeDebugOutput: boolean
}

// Import new components
import { StateManager } from '../state/StateManager'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor'
import { ErrorExtractor } from '../extraction/ErrorExtractor'
import { TestResultBuilder } from '../builders/TestResultBuilder'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder'
import { OutputBuilder } from '../output/OutputBuilder'
import { OutputWriter } from '../output/OutputWriter'
import { EventOrchestrator } from '../events/EventOrchestrator'
import { coreLogger, errorLogger } from '../utils/logger'

export class LLMReporter implements Reporter {
  private config: ResolvedLLMReporterConfig
  private context?: Vitest
  private output?: LLMReporterOutput
  private debug = coreLogger()
  private debugError = errorLogger()
  private isTestRunActive = false // Track if a test run is in progress (watch mode)

  // Component instances
  private stateManager: StateManager
  private testExtractor: TestCaseExtractor
  private errorExtractor: ErrorExtractor
  private resultBuilder: TestResultBuilder
  private contextBuilder: ErrorContextBuilder
  private outputBuilder: OutputBuilder
  private outputWriter: OutputWriter
  private orchestrator: EventOrchestrator

  constructor(config: LLMReporterConfig = {}) {
    // Validate config before using it
    this.validateConfig(config)

    // Properly resolve config without unsafe casting
    this.config = {
      verbose: config.verbose ?? false,
      outputFile: config.outputFile ?? undefined,
      includePassedTests: config.includePassedTests ?? false,
      includeSkippedTests: config.includeSkippedTests ?? false,
      captureConsoleOnFailure: config.captureConsoleOnFailure ?? true,
      maxConsoleBytes: config.maxConsoleBytes ?? 50_000,
      maxConsoleLines: config.maxConsoleLines ?? 100,
      includeDebugOutput: config.includeDebugOutput ?? false
    }

    // Initialize components
    this.stateManager = new StateManager()
    this.testExtractor = new TestCaseExtractor()
    this.errorExtractor = new ErrorExtractor()
    this.resultBuilder = new TestResultBuilder()
    this.contextBuilder = new ErrorContextBuilder()
    this.outputBuilder = new OutputBuilder({
      verbose: this.config.verbose,
      includePassedTests: this.config.includePassedTests,
      includeSkippedTests: this.config.includeSkippedTests
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
        maxConsoleLines: this.config.maxConsoleLines
      }
    )
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
  }

  /**
   * Cleanup resources (always called in finally blocks)
   */
  private cleanup(): void {
    this.orchestrator.reset()
    this.isTestRunActive = false
  }

  /**
   * Reset state for watch mode reuse
   */
  private reset(): void {
    this.debug('Resetting reporter state for new test run')
    this.stateManager.reset()
    this.orchestrator.reset()
    this.output = undefined
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

  getConfig(): ResolvedLLMReporterConfig {
    return this.config
  }

  getContext(): Vitest | undefined {
    return this.context
  }

  getState(): ReturnType<StateManager['getSnapshot']> {
    // Return state snapshot for backward compatibility
    return this.stateManager.getSnapshot()
  }

  getOutput(): LLMReporterOutput | undefined {
    return this.output
  }

  onInit(ctx: Vitest): void {
    this.context = ctx
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    // Handle watch mode: reset if a test run is already active
    if (this.isTestRunActive) {
      this.reset()
    }
    this.isTestRunActive = true

    try {
      this.orchestrator.handleTestRunStart(specifications)
    } catch (error) {
      this.debugError('Error in onTestRunStart: %O', error)
      // Continue operation even if orchestrator fails
    }
  }

  onTestModuleQueued(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleQueued', testModule, (module) =>
      this.orchestrator.handleTestModuleQueued(module)
    )
  }

  onTestModuleCollected(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleCollected', testModule, (module) =>
      this.orchestrator.handleTestModuleCollected(module)
    )
  }

  onTestModuleStart(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleStart', testModule, (module) =>
      this.orchestrator.handleTestModuleStart(module)
    )
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleEnd', testModule, (module) =>
      this.orchestrator.handleTestModuleEnd(module)
    )
  }

  onTestCaseReady(testCase: TestCase): void {
    this.safeOrchestratorCall('onTestCaseReady', testCase, (test) =>
      this.orchestrator.handleTestCaseReady(test)
    )
  }

  onTestCaseResult(testCase: TestCase): void {
    this.safeOrchestratorCall('onTestCaseResult', testCase, (test) =>
      this.orchestrator.handleTestCaseResult(test)
    )
  }

  onTaskUpdate(_packs: TaskResultPack[], _events: TaskEventPack[]): void {
    // Vitest v3 provides granular hooks (onTestCaseReady/onTestCaseResult/etc.).
    // We implement them directly; this deprecated hook is retained as a no-op
    // for compatibility without double-processing.
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason
  ): void {
    try {
      // Delegate to orchestrator with error handling
      try {
        this.orchestrator.handleTestRunEnd(testModules, unhandledErrors, reason)
      } catch (orchestratorError) {
        this.debugError('Error in orchestrator.handleTestRunEnd: %O', orchestratorError)
        // Continue to build output even if orchestrator fails
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

      // Write to file if configured
      if (this.config.outputFile && this.output) {
        try {
          this.outputWriter.write(this.config.outputFile, this.output)
          this.debug('Output written to %s', this.config.outputFile)
        } catch (writeError) {
          this.debugError('Failed to write output file %s: %O', this.config.outputFile, writeError)
          // Don't propagate write errors - log is sufficient
        }
      }
    } finally {
      // Always cleanup, even if errors occurred
      this.cleanup()
    }
  }
}
