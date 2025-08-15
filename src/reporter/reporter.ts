/**
 * LLM Reporter Implementation
 *
 * Core reporter class for Vitest that generates LLM-optimized output.
 * Orchestrates various components to process test results.
 *
 * @module reporter
 */

import type { Vitest, SerializedError } from 'vitest'
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

export class LLMReporter {
  private config: Required<LLMReporterConfig>
  private context?: Vitest
  private output?: LLMReporterOutput

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
      includeSkippedTests: config.includeSkippedTests ?? false
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

    // Initialize orchestrator with all dependencies
    this.orchestrator = new EventOrchestrator(
      this.stateManager,
      this.testExtractor,
      this.errorExtractor,
      this.resultBuilder,
      this.contextBuilder
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

  onTestRunStart(specifications: unknown[]): void {
    this.orchestrator.handleTestRunStart(specifications)
  }

  onTestModuleQueued(module: unknown): void {
    this.orchestrator.handleTestModuleQueued(module)
  }

  onTestModuleCollected(module: unknown): void {
    this.orchestrator.handleTestModuleCollected(module)
  }

  onTestModuleStart(module: unknown): void {
    this.orchestrator.handleTestModuleStart(module)
  }

  onTestModuleEnd(module: unknown): void {
    this.orchestrator.handleTestModuleEnd(module)
  }

  onTestCaseReady(testCase: unknown): void {
    this.orchestrator.handleTestCaseReady(testCase)
  }

  onTestCaseResult(testCase: unknown): void {
    this.orchestrator.handleTestCaseResult(testCase)
  }

  onTestRunEnd(modules: unknown[], errors: SerializedError[], status: string): void {
    // Delegate to orchestrator
    this.orchestrator.handleTestRunEnd(modules, errors, status)

    // Get statistics and test results
    const statistics = this.stateManager.getStatistics()
    const testResults = this.stateManager.getTestResults()

    // Build output using OutputBuilder
    this.output = this.outputBuilder.build({
      testResults,
      duration: statistics.duration,
      startTime: this.stateManager.getStartTime(),
      unhandledErrors: errors
    })

    // Write to file if configured
    if (this.config.outputFile && this.output) {
      const result = this.outputWriter.write(this.config.outputFile, this.output)
      if (!result.success) {
        console.error('Failed to write output file:', result.error)
      }
    }
  }
}
