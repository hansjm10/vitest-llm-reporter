/**
 * Event Orchestrator
 *
 * Coordinates event handling and delegates to appropriate components.
 * Acts as the central dispatcher for Vitest reporter events.
 *
 * @module events
 */

import type { SerializedError, UserConsoleLog } from 'vitest'
import { StateManager } from '../state/StateManager.js'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor.js'
import { ErrorExtractor } from '../extraction/ErrorExtractor.js'
import { TestResultBuilder } from '../builders/TestResultBuilder.js'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder.js'
import { isTestModule, isTestCase, hasProperty } from '../utils/type-guards.js'
import { extractSuiteNames } from '../utils/suites.js'
import type { ConsoleMethod } from '../types/console.js'
import { coreLogger, errorLogger } from '../utils/logger.js'
import { consoleCapture } from '../console/index.js'
import { consoleMerger } from '../console/merge.js'
import type { TruncationConfig } from '../types/reporter.js'
// Truncation handled by LateTruncator in OutputBuilder

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
  // Streaming removed - simplified implementation
  /** Truncation configuration */
  truncationConfig?: TruncationConfig
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
  includeDebugOutput: false,
  truncationConfig: {
    enabled: false,
    maxTokens: undefined,
    model: 'gpt-4',
    strategy: 'smart',
    featureFlag: false,
    enableEarlyTruncation: false,
    enableLateTruncation: false,
    enableMetrics: false
  }
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
  // Truncator removed - simplified truncation in OutputBuilder

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

    // Initialize truncator if enabled
    if (
      this.config.truncationConfig.enabled &&
      this.config.truncationConfig.enableEarlyTruncation
    ) {
      // Truncation now handled in OutputBuilder
      this.debug('Early truncation enabled')

      // Enable global metrics if configured
      if (this.config.truncationConfig.enableMetrics) {
        // Metrics tracking removed
      }
    }
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
    if (!module || typeof module !== 'object') {
      return
    }

    // Safe property access with type guards
    if (hasProperty(module, 'children')) {
      const children = (module as Record<string, unknown>).children
      if (typeof children === 'function') {
        const tests = (children as () => unknown)() as Array<{
          id?: string
          name?: string
          mode?: string
          file?: { filepath?: string }
          suite?: string[]
        }>

        const filepath =
          hasProperty(module, 'filepath') &&
          typeof (module as Record<string, unknown>).filepath === 'string'
            ? ((module as Record<string, unknown>).filepath as string)
            : undefined

        const collectedTests = tests.map((test) => ({
          id: test.id,
          name: test.name,
          mode: test.mode,
          file: filepath || test.file?.filepath,
          suite: extractSuiteNames(test.suite)
        }))

        this.stateManager.recordCollectedTests(collectedTests)
      }
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

      // Streaming removed - simplified implementation
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
      this.unregisterTestFromStreaming(extracted.id)
    } else if (this.testExtractor.isFailedTest(extracted)) {
      this.processFailedTest(extracted, testCase)
    } else if (this.testExtractor.isSkippedTest(extracted)) {
      // Stop console capture for skipped test (discard output)
      if (extracted.id) {
        consoleCapture.clearBuffer(extracted.id)
      }
      const result = this.resultBuilder.buildSkippedTest(extracted)
      this.stateManager.recordSkippedTest(result)
      this.unregisterTestFromStreaming(extracted.id)
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
    this.unregisterTestFromStreaming(extracted.id)
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

    // Safe property access for logs
    if (!hasProperty(testCase, 'logs')) return undefined

    const logs = (testCase as Record<string, unknown>).logs
    if (!Array.isArray(logs) || logs.length === 0) return undefined

    const out: {
      logs?: string[]
      errors?: string[]
      warns?: string[]
      info?: string[]
      debug?: string[]
    } = {}
    for (const entry of logs as Array<unknown>) {
      if (!entry || typeof entry !== 'object') continue
      const entryObj = entry as Record<string, unknown>
      const content = entryObj.content
      const type = entryObj.type
      const time = entryObj.time

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
   * Unregisters a test from streaming synchronizer
   */
  private unregisterTestFromStreaming(_testId?: string): void {
    // Streaming removed - simplified implementation
  }

  /**
   * Resets all components
   */
  public reset(): void {
    this.stateManager.reset()
    consoleCapture.reset()

    // Streaming removed - simplified implementation
    // this.activeTests.clear() // Removed with streaming
  }

  /**
   * Gets truncation metrics if available
   */
  public getTruncationMetrics(): unknown[] {
    return [] // Metrics removed
  }

  /**
   * Gets global truncation metrics summary
   */
  public getGlobalTruncationMetrics(): unknown {
    return { totalTruncations: 0, totalCharsSaved: 0 } // Metrics removed
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

    // Truncation config updates are now handled in OutputBuilder
    // No need for config updates here
  }
}
