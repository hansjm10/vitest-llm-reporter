/**
 * Event Orchestrator
 *
 * Coordinates event handling and delegates to appropriate components.
 * Acts as the central dispatcher for Vitest reporter events.
 *
 * @module events
 */

import type { SerializedError } from 'vitest'
import { StateManager } from '../state/StateManager'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor'
import { ErrorExtractor } from '../extraction/ErrorExtractor'
import { TestResultBuilder } from '../builders/TestResultBuilder'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder'
import { isTestModule, isTestCase } from '../utils/type-guards'

/**
 * Event orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Whether to handle errors gracefully */
  gracefulErrorHandling?: boolean
  /** Whether to log errors to console */
  logErrors?: boolean
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: Required<OrchestratorConfig> = {
  gracefulErrorHandling: true,
  logErrors: false
}

/**
 * Orchestrates event handling for the reporter
 *
 * This class coordinates the flow of data through various components
 * when Vitest events are received, ensuring proper delegation and
 * error handling.
 *
 * @example
 * ```typescript
 * const orchestrator = new EventOrchestrator(
 *   stateManager,
 *   testExtractor,
 *   errorExtractor,
 *   resultBuilder,
 *   contextBuilder
 * );
 * orchestrator.handleTestCaseResult(testCase);
 * ```
 */
export class EventOrchestrator {
  private config: Required<OrchestratorConfig>
  private stateManager: StateManager
  private testExtractor: TestCaseExtractor
  private errorExtractor: ErrorExtractor
  private resultBuilder: TestResultBuilder
  private contextBuilder: ErrorContextBuilder

  constructor(
    stateManager: StateManager,
    testExtractor: TestCaseExtractor,
    errorExtractor: ErrorExtractor,
    resultBuilder: TestResultBuilder,
    contextBuilder: ErrorContextBuilder,
    config: OrchestratorConfig = {}
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config }
    this.stateManager = stateManager
    this.testExtractor = testExtractor
    this.errorExtractor = errorExtractor
    this.resultBuilder = resultBuilder
    this.contextBuilder = contextBuilder
  }

  /**
   * Handles test run start event
   */
  public handleTestRunStart(specifications: ReadonlyArray<unknown>): void {
    this.stateManager.recordRunStart([...specifications])
  }

  /**
   * Handles test module queued event
   */
  public handleTestModuleQueued(module: unknown): void {
    if (isTestModule(module)) {
      this.stateManager.queueModule(module.id)
    }
  }

  /**
   * Handles test module collected event
   */
  public handleTestModuleCollected(module: unknown): void {
    const mod = module as { children?: () => unknown; filepath?: string; id?: string }

    if (mod.children && typeof mod.children === 'function') {
      const tests = mod.children() as Array<{
        id?: string
        name?: string
        mode?: string
        file?: { filepath?: string }
        suite?: string[]
      }>

      const collectedTests = tests.map((test) => ({
        id: test.id,
        name: test.name,
        mode: test.mode,
        file: mod.filepath || test.file?.filepath,
        suite: test.suite
      }))

      this.stateManager.recordCollectedTests(collectedTests)
    }
  }

  /**
   * Handles test module start event
   */
  public handleTestModuleStart(module: unknown): void {
    if (isTestModule(module)) {
      this.stateManager.recordModuleStart(module.id)
    }
  }

  /**
   * Handles test module end event
   */
  public handleTestModuleEnd(module: unknown): void {
    if (isTestModule(module)) {
      this.stateManager.recordModuleEnd(module.id)
    }
  }

  /**
   * Handles test case ready event
   */
  public handleTestCaseReady(testCase: unknown): void {
    if (isTestCase(testCase)) {
      this.stateManager.markTestReady(testCase.id)
    }
  }

  /**
   * Handles test case result event
   */
  public handleTestCaseResult(testCase: unknown): void {
    try {
      this.processTestCase(testCase)
    } catch (error) {
      this.handleError('Error processing test case', error)
    }
  }

  /**
   * Processes a test case result
   */
  private processTestCase(testCase: unknown): void {
    // Extract test case data
    const extracted = this.testExtractor.extract(testCase)
    if (!extracted) {
      return // Invalid test case
    }

    // Handle based on test state
    if (this.testExtractor.isPassedTest(extracted)) {
      const result = this.resultBuilder.buildPassedTest(extracted)
      this.stateManager.recordPassedTest(result)
    } else if (this.testExtractor.isFailedTest(extracted)) {
      this.processFailedTest(extracted)
    } else if (this.testExtractor.isSkippedTest(extracted)) {
      const result = this.resultBuilder.buildSkippedTest(extracted)
      this.stateManager.recordSkippedTest(result)
    }
  }

  /**
   * Processes a failed test
   */
  private processFailedTest(extracted: ReturnType<TestCaseExtractor['extract']>): void {
    if (!extracted) return

    // Extract and normalize error with full context including code snippets
    const normalizedError = this.errorExtractor.extractWithContext(extracted.error)

    // Build error context from the normalized error
    const errorContext = this.contextBuilder.buildFromError(normalizedError)

    // Build failure result
    const failure = this.resultBuilder.buildFailedTest(extracted, normalizedError, errorContext)

    // Record in state
    this.stateManager.recordFailedTest(failure)
  }

  /**
   * Handles test run end event
   */
  public handleTestRunEnd(
    _modules: ReadonlyArray<unknown>,
    _errors: ReadonlyArray<SerializedError>,
    _status: string
  ): void {
    this.stateManager.recordRunEnd()

    // Note: Unhandled errors are processed directly by OutputBuilder
    // to avoid duplicate counting in test statistics
  }

  /**
   * Handles errors based on configuration
   */
  private handleError(context: string, error: unknown): void {
    if (this.config.logErrors) {
      console.error(`${context}:`, error)
    }

    if (!this.config.gracefulErrorHandling) {
      throw error
    }
  }

  /**
   * Gets the current state manager
   */
  public getStateManager(): StateManager {
    return this.stateManager
  }

  /**
   * Resets all components
   */
  public reset(): void {
    this.stateManager.reset()
  }

  /**
   * Updates orchestrator configuration
   */
  public updateConfig(config: OrchestratorConfig): void {
    this.config = { ...this.config, ...config }
  }
}
