/**
 * Event Orchestrator
 *
 * Coordinates event handling and delegates to appropriate components.
 * Acts as the central dispatcher for Vitest reporter events.
 *
 * @module events
 */

import type { SerializedError, UserConsoleLog } from 'vitest'
import type { VitestSuite } from '../types/reporter-internal'
import { StateManager } from '../state/StateManager'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor'
import { ErrorExtractor } from '../extraction/ErrorExtractor'
import { TestResultBuilder } from '../builders/TestResultBuilder'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder'
import { isTestModule, isTestCase, isStringArray } from '../utils/type-guards'
import type { ConsoleMethod } from '../types/console'
import { coreLogger, errorLogger } from '../utils/logger'
import { consoleCapture } from '../console'
import { consoleMerger } from '../console/merge'

/**
 * Event orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Whether to handle errors gracefully */
  gracefulErrorHandling?: boolean
  /** Whether to log errors to console */
  logErrors?: boolean
  /** Whether to capture console output for failing tests */
  captureConsoleOnFailure?: boolean
  /** Maximum bytes of console output to capture per test */
  maxConsoleBytes?: number
  /** Maximum lines of console output to capture per test */
  maxConsoleLines?: number
  /** Include debug/trace console output */
  includeDebugOutput?: boolean
}

/**
 * Default orchestrator configuration
 * 
 * @example
 * ```typescript
 * import { DEFAULT_ORCHESTRATOR_CONFIG } from './events/EventOrchestrator'
 * 
 * const customConfig = {
 *   ...DEFAULT_ORCHESTRATOR_CONFIG,
 *   logErrors: true
 * }
 * ```
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: Required<OrchestratorConfig> = {
  gracefulErrorHandling: true,
  logErrors: false,
  captureConsoleOnFailure: true,
  maxConsoleBytes: 50_000,
  maxConsoleLines: 100,
  includeDebugOutput: false
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
  private debug = coreLogger()
  private debugError = errorLogger()

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

    // Configure console capture
    consoleCapture.updateConfig({
      enabled: this.config.captureConsoleOnFailure,
      maxBytes: this.config.maxConsoleBytes,
      maxLines: this.config.maxConsoleLines,
      gracePeriodMs: 100,
      includeDebugOutput: this.config.includeDebugOutput
    })
  }

  /**
   * Extracts suite names from a Vitest suite object
   */
  private extractSuiteNames(suite: unknown): string[] | undefined {
    // Handle case where suite is already a string array
    if (isStringArray(suite)) {
      return suite
    }

    // Handle Vitest suite object structure
    if (suite && typeof suite === 'object') {
      const names: string[] = []
      let current = suite as VitestSuite

      // Traverse up the suite hierarchy collecting names
      while (current && typeof current === 'object') {
        if (current.name && typeof current.name === 'string') {
          // Add to beginning since we're traversing from child to parent
          names.unshift(current.name)
        }
        current = current.suite as VitestSuite
      }

      return names.length > 0 ? names : undefined
    }

    return undefined
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
        suite: this.extractSuiteNames(test.suite)
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
      // Start console capture for this test
      consoleCapture.startCapture(testCase.id)
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
      // Stop console capture for passed test (discard output)
      if (extracted.id) {
        consoleCapture.clearBuffer(extracted.id)
      }
      const result = this.resultBuilder.buildPassedTest(extracted)
      this.stateManager.recordPassedTest(result)
    } else if (this.testExtractor.isFailedTest(extracted)) {
      this.processFailedTest(extracted, testCase)
    } else if (this.testExtractor.isSkippedTest(extracted)) {
      // Stop console capture for skipped test (discard output)
      if (extracted.id) {
        consoleCapture.clearBuffer(extracted.id)
      }
      const result = this.resultBuilder.buildSkippedTest(extracted)
      this.stateManager.recordSkippedTest(result)
    }
  }

  /**
   * Processes a failed test
   */
  private processFailedTest(
    extracted: ReturnType<TestCaseExtractor['extract']>,
    originalTestCase?: unknown
  ): void {
    if (!extracted) return

    // Try to get console logs from Vitest task (built-in capture)
    const consoleFromTask = this.extractConsoleFromTask(originalTestCase)
    // Also try our custom capture
    const consoleFromCapture = extracted.id ? consoleCapture.stopCapture(extracted.id) : undefined
    
    // Intelligently merge both console sources instead of choosing one
    const consoleOutput = consoleMerger.merge(consoleFromTask, consoleFromCapture)

    // Extract and normalize error with full context including code snippets
    const normalizedError = this.errorExtractor.extractWithContext(extracted.error)

    // Build error context from the normalized error
    const errorContext = this.contextBuilder.buildFromError(normalizedError)

    // Build failure result with console output
    const failure = this.resultBuilder.buildFailedTest(
      extracted,
      normalizedError,
      errorContext,
      consoleOutput
    )

    // Record in state
    this.stateManager.recordFailedTest(failure)
  }

  /**
   * Extract console output directly from Vitest task if available
   */
  private extractConsoleFromTask(testCase: unknown):
    | {
        logs?: string[]
        errors?: string[]
        warns?: string[]
        info?: string[]
        debug?: string[]
      }
    | undefined {
    if (!testCase || typeof testCase !== 'object') return undefined
    // Vitest augments TaskBase with `logs?: UserConsoleLog[]`
    const logs = (testCase as { logs?: Array<{ content: string; type: string; taskId?: string; time?: number }> }).logs
    
    // Debug: Log what we're getting from Vitest
    if (process.env.DEBUG_CONSOLE_CAPTURE) {
      console.log('[ConsoleCapture] Vitest logs:', JSON.stringify(logs, null, 2))
    }
    
    if (!Array.isArray(logs) || logs.length === 0) return undefined

    const out: { logs?: string[]; errors?: string[]; warns?: string[]; info?: string[]; debug?: string[] } = {}
    for (const entry of logs) {
      const content = entry?.content
      const type = entry?.type
      const time = entry?.time
      
      if (typeof content !== 'string' || typeof type !== 'string') continue
      
      // Add timestamp if available (for better correlation with custom capture)
      const formattedContent = time !== undefined ? `[${time}ms] ${content}` : content
      
      // Map Vitest console types to our output structure
      // Vitest uses 'stdout' and 'stderr' for raw output
      // But console methods might be captured differently
      if (type === 'stdout' || type === 'log') {
        if (!out.logs) out.logs = []
        out.logs.push(formattedContent)
      } else if (type === 'stderr' || type === 'error') {
        if (!out.errors) out.errors = []
        out.errors.push(formattedContent)
      } else if (type === 'warn' || type === 'warning') {
        if (!out.warns) out.warns = []
        out.warns.push(formattedContent)
      } else if (type === 'info') {
        if (!out.info) out.info = []
        out.info.push(formattedContent)
      } else if (type === 'debug' || type === 'trace') {
        if (!out.debug) out.debug = []
        out.debug.push(formattedContent)
      }
    }
    return Object.keys(out).length ? out : undefined
  }

  /**
   * Handles test run end event
   */
  public handleTestRunEnd(
    _modules: ReadonlyArray<unknown>,
    _errors: ReadonlyArray<SerializedError>,
    _status: import('vitest/node').TestRunEndReason
  ): void {
    this.stateManager.recordRunEnd()

    // Clean up console capture resources
    consoleCapture.reset()

    // Note: Unhandled errors are processed directly by OutputBuilder
    // to avoid duplicate counting in test statistics
  }

  /**
   * Handle a user console log event (Vitest v3 shape)
   * 
   * @param log - The console log event from Vitest
   */
  public handleUserConsoleLog(log: UserConsoleLog): void {
    if (!this.config.captureConsoleOnFailure) return
    const testId = log.taskId
    if (!testId) return
    
    // Ensure buffer exists for this test
    // This is crucial for capturing console from helper functions
    // that may run before handleTestCaseReady is called
    consoleCapture.startCapture(testId)
    
    // Map Vitest log types to console methods
    // Vitest only provides stdout/stderr, not the specific console method
    // console.error typically goes to stderr, everything else to stdout
    const method: ConsoleMethod = log.type === 'stderr' ? 'error' : 'log'
    
    try {
      consoleCapture.ingest(testId, method, [log.content])
    } catch (error) {
      this.debugError('Failed to ingest console log: %O', error)
    }
  }

  /**
   * Handles errors based on configuration
   */
  private handleError(context: string, error: unknown): void {
    this.debugError('%s: %O', context, error)

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
    consoleCapture.reset()
  }

  /**
   * Updates orchestrator configuration
   */
  public updateConfig(config: OrchestratorConfig): void {
    this.config = { ...this.config, ...config }
    // Propagate to console capture
    consoleCapture.updateConfig({
      enabled: this.config.captureConsoleOnFailure,
      maxBytes: this.config.maxConsoleBytes,
      maxLines: this.config.maxConsoleLines,
      includeDebugOutput: this.config.includeDebugOutput
    })
  }
}
