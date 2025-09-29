/**
 * Output Builder
 *
 * Assembles the final LLM reporter output from test results and statistics.
 * Handles conditional inclusion of test categories based on configuration.
 *
 * @module output
 */

import type {
  LLMReporterOutput,
  TestSummary,
  TestResult,
  TestFailure,
  TestError,
  TestSuccessLog,
  ConsoleEvent
} from '../types/schema.js'
import type { SerializedError } from 'vitest'
import type { OutputBuilderConfig, BuildOptions } from './types.js'
import type { EnvironmentMetadataConfig, OutputViewConfig } from '../types/reporter.js'
import { LateTruncator } from '../truncation/LateTruncator.js'
import { ErrorExtractor } from '../extraction/ErrorExtractor.js'
import { getRuntimeEnvironmentSummary } from '../utils/runtime-environment.js'

/**
 * Default output builder configuration
 */
interface ResolvedConsoleViewConfig {
  includeTestId: boolean
  includeTimestampMs: boolean
}

interface ResolvedOutputViewConfig {
  console: ResolvedConsoleViewConfig
}

interface ResolvedTruncationConfig {
  enabled: boolean
  maxTokens?: number
  enableEarlyTruncation: boolean
  enableLateTruncation: boolean
  enableMetrics: boolean
}

interface ResolvedOutputBuilderConfig {
  includePassedTests: boolean
  includeSkippedTests: boolean
  verbose: boolean
  filterNodeModules: boolean
  truncation: ResolvedTruncationConfig
  includeStackString: boolean
  includeAbsolutePaths: boolean
  rootDir: string
  environmentMetadata?: EnvironmentMetadataConfig
  view: ResolvedOutputViewConfig
}

const DEFAULT_VIEW_CONFIG: ResolvedOutputViewConfig = {
  console: {
    includeTestId: false,
    includeTimestampMs: false
  }
}

export const DEFAULT_OUTPUT_CONFIG: ResolvedOutputBuilderConfig = {
  includePassedTests: false,
  includeSkippedTests: false,
  verbose: false,
  filterNodeModules: true, // Default to filtering node_modules from stack frames
  includeStackString: false,
  includeAbsolutePaths: false,
  rootDir: process.cwd(),
  truncation: {
    enabled: false,
    maxTokens: undefined,
    enableEarlyTruncation: false,
    enableLateTruncation: false,
    enableMetrics: false
  },
  view: DEFAULT_VIEW_CONFIG,
  environmentMetadata: undefined
}

/**
 * Builds the final reporter output
 *
 * This class assembles the complete LLM reporter output from various
 * components, applying configuration rules for what to include.
 *
 * @example
 * ```typescript
 * const builder = new OutputBuilder({ verbose: true });
 * const output = builder.build({
 *   testResults: stateManager.getTestResults(),
 *   duration: 1000
 * });
 * ```
 */
export class OutputBuilder {
  private config: ResolvedOutputBuilderConfig
  private lateTruncator?: LateTruncator

  constructor(config: OutputBuilderConfig = {}) {
    this.config = this.resolveConfig(config)

    // Initialize late truncator if enabled
    if (this.config.truncation.enabled && this.config.truncation.enableLateTruncation) {
      this.lateTruncator = new LateTruncator()
    }
  }

  /**
   * Builds the complete reporter output
   *
   * @param options - Build options containing test results and metadata
   * @returns Complete LLM reporter output
   */
  public build(options: BuildOptions): LLMReporterOutput {
    const summary = this.buildSummary(options)
    const output: LLMReporterOutput = { summary }

    // Add failures (always included if present)
    const allFailures = this.collectAllFailures(options.testResults.failed, options.unhandledErrors)
    const failuresForView = this.mapFailuresForView(allFailures)

    if (failuresForView.length > 0) {
      output.failures = failuresForView
    }

    // Add passed tests based on configuration
    if (this.shouldIncludePassedTests(options.testResults.passed)) {
      output.passed = options.testResults.passed.map((test) => this.mapTestResultForView(test))
    }

    // Add skipped tests based on configuration
    if (this.shouldIncludeSkippedTests(options.testResults.skipped)) {
      output.skipped = options.testResults.skipped.map((test) => this.mapTestResultForView(test))
    }

    if (options.testResults.successLogs.length > 0) {
      output.successLogs = options.testResults.successLogs.map((log) =>
        this.mapSuccessLogForView(log)
      )
    }

    // Apply late-stage truncation if enabled
    return this.applyLateTruncation(output)
  }

  /**
   * Builds the test summary
   */
  private buildSummary(options: BuildOptions): TestSummary {
    const { passed, failed, skipped } = options.testResults

    // Count unhandled errors (suite-level failures, import errors, etc.)
    const unhandledErrorCount = options.unhandledErrors?.length || 0

    const environment = getRuntimeEnvironmentSummary(this.config.environmentMetadata)

    // Calculate retry statistics
    let flakyCount = 0
    let retriedCount = 0

    // Count retried/flaky tests in failed array
    for (const failure of failed) {
      if (failure.retryInfo) {
        retriedCount++
        if (failure.retryInfo.flakiness.isFlaky) {
          flakyCount++
        }
      }
    }

    // Count retried/flaky tests in passed array (flaky tests that ultimately passed)
    for (const pass of passed) {
      if (pass.retryInfo) {
        retriedCount++
        if (pass.retryInfo.flakiness.isFlaky) {
          flakyCount++
        }
      }
    }

    const summary: TestSummary = {
      total: passed.length + failed.length + skipped.length + unhandledErrorCount,
      passed: passed.length,
      failed: failed.length + unhandledErrorCount, // Include unhandled errors in failed count
      skipped: skipped.length,
      duration: options.duration,
      timestamp: new Date().toISOString(),
      ...(environment ? { environment } : {})
    }

    // Add retry statistics if any tests were retried
    if (retriedCount > 0) {
      summary.retried = retriedCount
    }
    if (flakyCount > 0) {
      summary.flaky = flakyCount
    }

    return summary
  }

  /**
   * Collects all failures including unhandled errors
   */
  private collectAllFailures(
    testFailures: TestFailure[],
    unhandledErrors?: ReadonlyArray<SerializedError>
  ): TestFailure[] {
    const failures = [...testFailures]

    if (unhandledErrors && unhandledErrors.length > 0) {
      const unhandledFailures = this.convertUnhandledErrors([...unhandledErrors])
      failures.push(...unhandledFailures)
    }

    return failures
  }

  private mapFailuresForView(failures: TestFailure[]): TestFailure[] {
    return failures.map((failure) => {
      const consoleEvents = this.mapConsoleEventsForView(failure.consoleEvents)
      return {
        ...failure,
        consoleEvents
      }
    })
  }

  private mapSuccessLogForView(log: TestSuccessLog): TestSuccessLog {
    const consoleEvents = this.mapConsoleEventsForView(log.consoleEvents)
    return {
      ...log,
      consoleEvents
    }
  }

  private mapTestResultForView(result: TestResult): TestResult {
    return { ...result }
  }

  private mapConsoleEventsForView(events?: ConsoleEvent[]): ConsoleEvent[] | undefined {
    if (!events) {
      return events
    }

    if (events.length === 0) {
      return []
    }

    return events.map((event) => this.mapConsoleEventForView(event))
  }

  private mapConsoleEventForView(event: ConsoleEvent): ConsoleEvent {
    const consoleView = this.config.view.console

    const mapped: ConsoleEvent = {
      ...event,
      // Shallow clone of args/deduplication arrays to avoid accidental mutation downstream
      ...(event.args ? { args: [...event.args] } : {}),
      ...(event.deduplication
        ? {
            deduplication: {
              ...event.deduplication,
              ...(event.deduplication.sources ? { sources: [...event.deduplication.sources] } : {})
            }
          }
        : {})
    }

    if (!consoleView.includeTimestampMs) {
      delete mapped.timestampMs
      delete mapped.timestamp
    }

    if (!consoleView.includeTestId) {
      delete mapped.testId
    }

    return mapped
  }

  /**
   * Converts unhandled errors to test failures
   */
  private convertUnhandledErrors(errors: SerializedError[]): TestFailure[] {
    const extractor = new ErrorExtractor({
      includeSourceCode: true,
      filterNodeModules: this.config.filterNodeModules,
      includeAbsolutePaths: this.config.includeAbsolutePaths,
      rootDir: this.config.rootDir
    })

    return errors.map((err) => {
      const normalized = extractor.extractWithContext(err)

      // Map normalized context to schema ErrorContext when available
      const context = normalized.context
        ? {
            code: Array.isArray(normalized.context.code) ? normalized.context.code : [],
            lineNumber: normalized.context.lineNumber,
            columnNumber: normalized.context.columnNumber
          }
        : undefined

      const testError: TestError = {
        message: normalized.message || err.message || 'Unhandled error',
        // Preserve the semantic that this originated outside a test failure
        type: 'UnhandledError' as const,
        stackFrames: normalized.stackFrames,
        assertion: normalized.assertion,
        context,
        // Only include stack if configured to do so
        ...(this.config.includeStackString && (normalized.stack ?? err.stack)
          ? { stack: normalized.stack ?? err.stack }
          : {})
      }

      return {
        test: 'Unhandled Error',
        fileRelative: '',
        startLine: 0,
        endLine: 0,
        error: testError
      }
    })
  }

  /**
   * Determines if passed tests should be included
   */
  private shouldIncludePassedTests(passedTests: TestResult[]): boolean {
    if (passedTests.length === 0) {
      return false
    }

    return this.config.verbose || this.config.includePassedTests
  }

  /**
   * Determines if skipped tests should be included
   */
  private shouldIncludeSkippedTests(skippedTests: TestResult[]): boolean {
    if (skippedTests.length === 0) {
      return false
    }

    return this.config.verbose || this.config.includeSkippedTests
  }

  private resolveConfig(config: OutputBuilderConfig): ResolvedOutputBuilderConfig {
    const resolved: ResolvedOutputBuilderConfig = {
      includePassedTests: DEFAULT_OUTPUT_CONFIG.includePassedTests,
      includeSkippedTests: DEFAULT_OUTPUT_CONFIG.includeSkippedTests,
      verbose: DEFAULT_OUTPUT_CONFIG.verbose,
      filterNodeModules: DEFAULT_OUTPUT_CONFIG.filterNodeModules,
      includeStackString: DEFAULT_OUTPUT_CONFIG.includeStackString,
      includeAbsolutePaths: DEFAULT_OUTPUT_CONFIG.includeAbsolutePaths,
      rootDir: DEFAULT_OUTPUT_CONFIG.rootDir,
      truncation: { ...DEFAULT_OUTPUT_CONFIG.truncation },
      view: {
        console: { ...DEFAULT_OUTPUT_CONFIG.view.console }
      },
      environmentMetadata: DEFAULT_OUTPUT_CONFIG.environmentMetadata
    }

    if (config.includePassedTests !== undefined) {
      resolved.includePassedTests = config.includePassedTests
    }
    if (config.includeSkippedTests !== undefined) {
      resolved.includeSkippedTests = config.includeSkippedTests
    }
    if (config.verbose !== undefined) {
      resolved.verbose = config.verbose
    }
    if (config.filterNodeModules !== undefined) {
      resolved.filterNodeModules = config.filterNodeModules
    }
    if (config.includeStackString !== undefined) {
      resolved.includeStackString = config.includeStackString
    }
    if (config.includeAbsolutePaths !== undefined) {
      resolved.includeAbsolutePaths = config.includeAbsolutePaths
    }
    if (config.rootDir !== undefined) {
      resolved.rootDir = config.rootDir
    }
    if (config.environmentMetadata !== undefined) {
      resolved.environmentMetadata = config.environmentMetadata
    }

    resolved.truncation = { ...resolved.truncation, ...(config.truncation ?? {}) }
    resolved.view = this.mergeViewConfig(resolved.view, config.view)

    return resolved
  }

  private mergeResolvedConfig(
    current: ResolvedOutputBuilderConfig,
    update: OutputBuilderConfig
  ): ResolvedOutputBuilderConfig {
    const next: ResolvedOutputBuilderConfig = {
      ...current,
      truncation: { ...current.truncation },
      view: {
        console: { ...current.view.console }
      }
    }

    if (update.includePassedTests !== undefined) {
      next.includePassedTests = update.includePassedTests
    }
    if (update.includeSkippedTests !== undefined) {
      next.includeSkippedTests = update.includeSkippedTests
    }
    if (update.verbose !== undefined) {
      next.verbose = update.verbose
    }
    if (update.filterNodeModules !== undefined) {
      next.filterNodeModules = update.filterNodeModules
    }
    if (update.includeStackString !== undefined) {
      next.includeStackString = update.includeStackString
    }
    if (update.includeAbsolutePaths !== undefined) {
      next.includeAbsolutePaths = update.includeAbsolutePaths
    }
    if (update.rootDir !== undefined) {
      next.rootDir = update.rootDir
    }
    if (update.environmentMetadata !== undefined) {
      next.environmentMetadata = update.environmentMetadata
    }

    if (update.truncation) {
      next.truncation = { ...next.truncation, ...update.truncation }
    }

    next.view = this.mergeViewConfig(next.view, update.view)

    return next
  }

  private mergeViewConfig(
    current: ResolvedOutputViewConfig,
    override?: OutputViewConfig
  ): ResolvedOutputViewConfig {
    if (!override) {
      return {
        console: { ...current.console }
      }
    }

    return {
      console: {
        includeTestId: override.console?.includeTestId ?? current.console.includeTestId,
        includeTimestampMs:
          override.console?.includeTimestampMs ?? current.console.includeTimestampMs
      }
    }
  }

  /**
   * Applies late-stage truncation to the complete output
   */
  private applyLateTruncation(output: LLMReporterOutput): LLMReporterOutput {
    if (
      !this.lateTruncator ||
      !this.config.truncation.enabled ||
      !this.config.truncation.enableLateTruncation
    ) {
      return output
    }

    return this.lateTruncator.apply(output, this.config.truncation)
  }

  /**
   * Gets truncation metrics if available
   */
  public getTruncationMetrics(): unknown[] {
    return this.lateTruncator?.getMetrics() || []
  }

  /**
   * Check if truncation is enabled
   */
  public get hasTruncation(): boolean {
    return Boolean(this.lateTruncator)
  }

  /**
   * Updates builder configuration
   */
  public updateConfig(config: OutputBuilderConfig): void {
    this.config = this.mergeResolvedConfig(this.config, config)

    // Update late truncator configuration
    if (this.lateTruncator && config.truncation) {
      this.lateTruncator.updateConfig(config.truncation)
    }

    // Initialize or destroy late truncator based on config changes
    if (
      config.truncation?.enabled &&
      config.truncation?.enableLateTruncation &&
      !this.lateTruncator
    ) {
      this.lateTruncator = new LateTruncator()
    } else if (!config.truncation?.enabled && this.lateTruncator) {
      this.lateTruncator = undefined
    }
  }
}
