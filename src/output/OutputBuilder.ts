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
  TestError
} from '../types/schema.js'
import type { SerializedError } from 'vitest'
import type { OutputBuilderConfig, BuildOptions } from './types.js'
import { LateTruncator } from '../truncation/LateTruncator.js'
import { ErrorExtractor } from '../extraction/ErrorExtractor.js'

/**
 * Default output builder configuration
 */
export const DEFAULT_OUTPUT_CONFIG: Required<OutputBuilderConfig> = {
  includePassedTests: false,
  includeSkippedTests: false,
  verbose: false,
  filterNodeModules: true, // Default to filtering node_modules from stack frames
  includeStackString: false,
  truncation: {
    enabled: false,
    maxTokens: undefined,
    enableEarlyTruncation: false,
    enableLateTruncation: false,
    enableMetrics: false
  }
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
  private config: Required<OutputBuilderConfig>
  private lateTruncator?: LateTruncator

  constructor(config: OutputBuilderConfig = {}) {
    this.config = { ...DEFAULT_OUTPUT_CONFIG, ...config }

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

    if (allFailures.length > 0) {
      output.failures = allFailures
    }

    // Add passed tests based on configuration
    if (this.shouldIncludePassedTests(options.testResults.passed)) {
      output.passed = options.testResults.passed
    }

    // Add skipped tests based on configuration
    if (this.shouldIncludeSkippedTests(options.testResults.skipped)) {
      output.skipped = options.testResults.skipped
    }

    // Apply late-stage truncation if enabled
    return this.applyLateTruncation(output)
  }

  /**
   * Builds the test summary
   */
  private buildSummary(options: BuildOptions): TestSummary {
    const { passed, failed, skipped } = options.testResults

    return {
      total: passed.length + failed.length + skipped.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
      duration: options.duration,
      timestamp: new Date().toISOString()
    }
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

  /**
   * Converts unhandled errors to test failures
   */
  private convertUnhandledErrors(errors: SerializedError[]): TestFailure[] {
    const extractor = new ErrorExtractor({
      includeSourceCode: true,
      filterNodeModules: this.config.filterNodeModules
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
    this.config = { ...this.config, ...config }

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
