/**
 * Event Orchestrator
 *
 * Coordinates event handling and delegates to appropriate components.
 * Acts as the central dispatcher for Vitest reporter events.
 *
 * @module events
 */

import type { SerializedError, UserConsoleLog } from 'vitest'
import type { OrchestratorConfig } from './types.js'
import { StateManager } from '../state/StateManager.js'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor.js'
import { ErrorExtractor } from '../extraction/ErrorExtractor.js'
import { TestResultBuilder } from '../builders/TestResultBuilder.js'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder.js'
import { isTestModule, isTestCase, hasProperty } from '../utils/type-guards.js'
import { extractSuiteNames } from '../utils/suites.js'
import type { ConsoleMethod } from '../types/console.js'
import type { ConsoleEvent, ConsoleLevel } from '../types/schema.js'
import { coreLogger, errorLogger } from '../utils/logger.js'
import { consoleCapture } from '../console/index.js'
import { consoleMerger } from '../console/merge.js'
import { StdioFilterEvaluator } from '../console/stdio-filter.js'
import { LogDeduplicator } from '../console/LogDeduplicator.js'
import type { ILogDeduplicator } from '../types/deduplication.js'
// Truncation handled by LateTruncator in OutputBuilder

/**
 * Default orchestrator configuration
 *
 * @example
 * ```typescript
 * import { DEFAULT_ORCHESTRATOR_CONFIG } from './events/EventOrchestrator.js'
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
  captureConsoleOnSuccess: false,
  maxConsoleBytes: 50_000,
  maxConsoleLines: 100,
  includeDebugOutput: false,
  truncationConfig: {
    enabled: false,
    maxTokens: undefined,
    enableEarlyTruncation: false,
    enableLateTruncation: false,
    enableMetrics: false
  },
  deduplicationConfig: {
    enabled: true,
    maxCacheEntries: 1000,
    normalizeWhitespace: true,
    stripTimestamps: true,
    stripAnsiCodes: true,
    includeSources: false,
    scope: 'global'
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
  private deduplicator?: ILogDeduplicator
  private debug = coreLogger()
  private debugError = errorLogger()
  private stdioFilter?: StdioFilterEvaluator
  private filterSuccessLogs = false
  // Truncator removed - simplified truncation in OutputBuilder

  constructor(
    stateManager: StateManager,
    testExtractor: TestCaseExtractor,
    errorExtractor: ErrorExtractor,
    resultBuilder: TestResultBuilder,
    contextBuilder: ErrorContextBuilder,
    config: OrchestratorConfig = {},
    stdioFilter?: StdioFilterEvaluator,
    filterSuccessLogs = false
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config }
    this.stateManager = stateManager
    this.testExtractor = testExtractor
    this.errorExtractor = errorExtractor
    this.resultBuilder = resultBuilder
    this.contextBuilder = contextBuilder
    this.stdioFilter = stdioFilter
    this.filterSuccessLogs = filterSuccessLogs

    // Initialize deduplicator if config is provided
    if (this.config.deduplicationConfig) {
      this.deduplicator = new LogDeduplicator(this.config.deduplicationConfig)
      consoleCapture.deduplicator = this.deduplicator
    }

    // Configure console capture
    consoleCapture.updateConfig({
      enabled: this.config.captureConsoleOnFailure || this.config.captureConsoleOnSuccess,
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
        try {
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
        } catch (err) {
          this.debugError('Failed to collect tests from module children(): %O', err)
        }
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
      let consoleEvents: ConsoleEvent[] | undefined

      if (this.config.captureConsoleOnSuccess) {
        const consoleFromTask = this.extractConsoleFromTask(testCase)
        const captureResult = extracted.id ? consoleCapture.stopCapture(extracted.id) : undefined
        const consoleFromCapture = captureResult?.entries
        consoleEvents = consoleMerger.merge(consoleFromTask, consoleFromCapture)

        const filtered = this.filterConsoleEventsForSuccess(consoleEvents)

        if ((filtered.events && filtered.events.length > 0) || filtered.suppressedLines > 0) {
          const successLog = this.resultBuilder.buildSuccessLog(extracted, filtered.events, {
            totalLines: filtered.totalLines,
            suppressedLines: filtered.suppressedLines
          })
          this.stateManager.recordSuccessLog(successLog)
        }
      } else if (extracted.id) {
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
    const captureResult = extracted.id ? consoleCapture.stopCapture(extracted.id) : undefined
    const consoleFromCapture = captureResult?.entries

    // Intelligently merge both console sources
    const consoleEvents = consoleMerger.merge(consoleFromTask, consoleFromCapture)

    // Extract and normalize error with full context including code snippets
    const normalizedError = this.errorExtractor.extractWithContext(extracted.error)

    // Build error context from the normalized error
    const errorContext = this.contextBuilder.buildFromError(normalizedError)

    // Build failure result with console events
    const failure = this.resultBuilder.buildFailedTest(
      extracted,
      normalizedError,
      errorContext,
      consoleEvents
    )

    // Record in state
    this.stateManager.recordFailedTest(failure)
    this.unregisterTestFromStreaming(extracted.id)
  }

  /**
   * Extract console output directly from Vitest task if available
   */
  private extractConsoleFromTask(testCase: unknown): ConsoleEvent[] | undefined {
    if (!testCase || typeof testCase !== 'object') return undefined

    // Safe property access for logs
    if (!hasProperty(testCase, 'logs')) return undefined

    const logs = (testCase as Record<string, unknown>).logs
    if (!Array.isArray(logs) || logs.length === 0) return undefined

    const events: ConsoleEvent[] = []
    for (const entry of logs as Array<unknown>) {
      if (!entry || typeof entry !== 'object') continue
      const entryObj = entry as Record<string, unknown>
      const content = entryObj.content
      const type = entryObj.type
      const time = entryObj.time

      if (typeof content !== 'string' || typeof type !== 'string') continue

      // Map Vitest console types to our level structure
      let level: ConsoleLevel
      if (type === 'stdout' || type === 'log') {
        level = 'log'
      } else if (type === 'stderr' || type === 'error') {
        level = 'error'
      } else if (type === 'warn' || type === 'warning') {
        level = 'warn'
      } else if (type === 'info') {
        level = 'info'
      } else if (type === 'debug') {
        level = 'debug'
      } else if (type === 'trace') {
        level = 'trace'
      } else {
        // Unknown type, default to log
        level = 'log'
      }

      // Skip debug/trace if not included
      if (!this.config.includeDebugOutput && (level === 'debug' || level === 'trace')) {
        continue
      }

      // Create the event
      const event: ConsoleEvent = {
        level,
        text: content,
        origin: 'task'
      }

      // Add timestamp if available
      if (typeof time === 'number') {
        event.timestampMs = time
      }

      events.push(event)
    }
    return events.length > 0 ? events : undefined
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

    // Ensure deduplication metadata reflects final counts before clearing state
    this.finalizeDeduplicationMetadata()

    // Clean up console capture resources
    consoleCapture.reset()

    // Note: Unhandled errors are processed directly by OutputBuilder
    // to avoid duplicate counting in test statistics
  }

  /**
   * Update stored console events with final deduplication metadata
   */
  private finalizeDeduplicationMetadata(): void {
    const deduplicator = this.deduplicator
    if (!deduplicator?.isEnabled()) {
      return
    }

    const applyMetadata = (events?: ConsoleEvent[]): void => {
      if (!events || events.length === 0) {
        return
      }

      for (const event of events) {
        const message = event.message ?? event.text
        if (!message) {
          continue
        }

        const key = deduplicator.generateKey({
          message,
          level: event.level as ConsoleMethod,
          timestamp: new Date(),
          testId: event.testId
        })
        const metadata = deduplicator.getMetadata(key)

        if (metadata && metadata.count > 1) {
          event.message = message
          let sources: string[] | undefined
          if (metadata.sources.size > 0) {
            sources = Array.from(metadata.sources)
          }

          event.deduplication = {
            count: metadata.count,
            deduplicated: true,
            firstSeen: metadata.firstSeen.toISOString(),
            lastSeen: metadata.lastSeen.toISOString(),
            sources
          }
        } else if (event.deduplication) {
          delete event.deduplication
        }
      }
    }

    const results = this.stateManager.getTestResults()

    for (const failure of results.failed) {
      applyMetadata(failure.consoleEvents)
    }

    for (const success of results.successLogs) {
      applyMetadata(success.consoleEvents)
    }
  }

  /**
   * Handle a user console log event (Vitest v3 shape)
   *
   * @param log - The console log event from Vitest
   */
  public handleUserConsoleLog(log: UserConsoleLog): void {
    if (!(this.config.captureConsoleOnFailure || this.config.captureConsoleOnSuccess)) return
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
      enabled: this.config.captureConsoleOnFailure || this.config.captureConsoleOnSuccess,
      maxBytes: this.config.maxConsoleBytes,
      maxLines: this.config.maxConsoleLines,
      includeDebugOutput: this.config.includeDebugOutput
    })

    if (config.deduplicationConfig !== undefined) {
      this.deduplicator = new LogDeduplicator(config.deduplicationConfig)
      consoleCapture.deduplicator = this.deduplicator
    }

    // Truncation config updates are now handled in OutputBuilder
    // No need for config updates here
  }

  /**
   * Updates the error extractor instance
   */
  public updateErrorExtractor(errorExtractor: ErrorExtractor): void {
    this.errorExtractor = errorExtractor
  }

  /**
   * Updates the stdio filter used for success console suppression
   */
  public updateStdioFilter(
    filter: StdioFilterEvaluator | undefined,
    filterSuccessLogs: boolean
  ): void {
    this.stdioFilter = filter
    this.filterSuccessLogs = filterSuccessLogs
  }

  private filterConsoleEventsForSuccess(consoleEvents?: ConsoleEvent[]): {
    events?: ConsoleEvent[]
    totalLines: number
    suppressedLines: number
  } {
    if (!consoleEvents || consoleEvents.length === 0) {
      return { events: consoleEvents, totalLines: 0, suppressedLines: 0 }
    }

    if (!this.filterSuccessLogs || !this.stdioFilter) {
      return { events: consoleEvents, totalLines: 0, suppressedLines: 0 }
    }

    const filtered: ConsoleEvent[] = []
    let totalLines = 0
    let suppressedLines = 0

    for (const event of consoleEvents) {
      const originalText = event.text ?? ''
      const hadTrailingNewline = originalText.endsWith('\n')
      const segments = originalText.split('\n')
      if (hadTrailingNewline && segments[segments.length - 1] === '') {
        segments.pop()
      }

      const kept: string[] = []
      for (const segment of segments) {
        const normalized = segment.replace(/\r$/, '')
        if (!normalized) {
          continue
        }
        totalLines += 1
        if (!this.stdioFilter.shouldSuppress(normalized)) {
          kept.push(normalized)
        } else {
          suppressedLines += 1
        }
      }

      if (kept.length === 0) {
        continue
      }

      let text = kept.join('\n')
      if (hadTrailingNewline) {
        text += '\n'
      }

      const filteredEvent: ConsoleEvent = {
        ...event,
        text,
        ...(event.message !== undefined ? { message: text } : {})
      }

      filtered.push(filteredEvent)
    }

    return {
      events: filtered.length > 0 ? filtered : undefined,
      totalLines,
      suppressedLines
    }
  }
}
