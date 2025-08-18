/**
 * LLM Reporter Implementation
 *
 * Core reporter class for Vitest that generates LLM-optimized output.
 * Orchestrates various components to process test results.
 *
 * @module reporter
 */

import type { Vitest, SerializedError, Reporter } from 'vitest'
// These types come from vitest/node exports
import type { TestModule, TestCase, TestSpecification, TestRunEndReason } from 'vitest/node'
import type { LLMReporterConfig } from '../types/reporter'
import type { LLMReporterOutput } from '../types/schema'

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
  private config: Required<LLMReporterConfig>
  private context?: Vitest
  private output?: LLMReporterOutput
  private debug = coreLogger()
  private debugError = errorLogger()

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
    this.config = {
      verbose: config.verbose ?? false,
      outputFile: config.outputFile ?? undefined,
      includePassedTests: config.includePassedTests ?? false,
      includeSkippedTests: config.includeSkippedTests ?? false,
      captureConsoleOnFailure: config.captureConsoleOnFailure ?? true,
      maxConsoleBytes: config.maxConsoleBytes ?? 50_000,
      maxConsoleLines: config.maxConsoleLines ?? 100,
      includeDebugOutput: config.includeDebugOutput ?? false
    } as Required<LLMReporterConfig>

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

  getConfig(): Required<LLMReporterConfig> {
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
    this.orchestrator.handleTestRunStart(specifications)
  }

  onTestModuleQueued(testModule: TestModule): void {
    this.orchestrator.handleTestModuleQueued(testModule)
  }

  onTestModuleCollected(testModule: TestModule): void {
    this.orchestrator.handleTestModuleCollected(testModule)
  }

  onTestModuleStart(testModule: TestModule): void {
    this.orchestrator.handleTestModuleStart(testModule)
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.orchestrator.handleTestModuleEnd(testModule)
  }

  onTestCaseReady(testCase: TestCase): void {
    this.orchestrator.handleTestCaseReady(testCase)
  }

  onTestCaseResult(testCase: TestCase): void {
    this.orchestrator.handleTestCaseResult(testCase)
  }

  onTaskUpdate(packs: any[]): void {
    // Process task updates to extract test results
    packs.forEach((pack) => {
      if (Array.isArray(pack)) {
        pack.forEach((task: any) => {
          if (task?.type === 'test' && task?.result) {
            this.orchestrator.handleTestCaseResult(task)
          }
        })
      } else if (pack && typeof pack === 'object') {
        // Maybe pack itself is the task
        if (pack.type === 'test' && pack.result) {
          this.orchestrator.handleTestCaseResult(pack)
        }
      }
    })
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason
  ): void {
    // Delegate to orchestrator
    this.orchestrator.handleTestRunEnd(testModules, unhandledErrors, reason)

    // Get statistics and test results
    const statistics = this.stateManager.getStatistics()
    const testResults = this.stateManager.getTestResults()

    // Build output using OutputBuilder
    this.output = this.outputBuilder.build({
      testResults,
      duration: statistics.duration,
      startTime: this.stateManager.getStartTime(),
      unhandledErrors: unhandledErrors
    })

    // Write to file if configured
    if (this.config.outputFile && this.output) {
      try {
        this.outputWriter.write(this.config.outputFile, this.output)
        this.debug('Output written to %s', this.config.outputFile)
      } catch (error) {
        this.debugError('Failed to write output file %s: %O', this.config.outputFile, error)
      }
    }
  }
}
