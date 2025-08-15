/**
 * Output Builder
 *
 * Assembles the final LLM reporter output from test results and statistics.
 * Handles conditional inclusion of test categories based on configuration.
 *
 * @module output
 */

import type { LLMReporterOutput, TestSummary, TestResult, TestFailure } from '../types/schema'
import type { SerializedError } from 'vitest'

/**
 * Output builder configuration
 */
export interface OutputBuilderConfig {
  /** Whether to include passed tests in output */
  includePassedTests?: boolean
  /** Whether to include skipped tests in output */
  includeSkippedTests?: boolean
  /** Whether to use verbose output (includes all categories) */
  verbose?: boolean
}

/**
 * Default output builder configuration
 */
export const DEFAULT_OUTPUT_CONFIG: Required<OutputBuilderConfig> = {
  includePassedTests: false,
  includeSkippedTests: false,
  verbose: false
}

/**
 * Build options for output assembly
 */
export interface BuildOptions {
  /** Test results categorized by status */
  testResults: {
    passed: TestResult[]
    failed: TestFailure[]
    skipped: TestResult[]
  }
  /** Test run duration in milliseconds */
  duration: number
  /** Test run start time */
  startTime?: number
  /** Unhandled errors from the test run */
  unhandledErrors?: SerializedError[]
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

  constructor(config: OutputBuilderConfig = {}) {
    this.config = { ...DEFAULT_OUTPUT_CONFIG, ...config }
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

    return output
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
    unhandledErrors?: SerializedError[]
  ): TestFailure[] {
    const failures = [...testFailures]

    if (unhandledErrors && unhandledErrors.length > 0) {
      const unhandledFailures = this.convertUnhandledErrors(unhandledErrors)
      failures.push(...unhandledFailures)
    }

    return failures
  }

  /**
   * Converts unhandled errors to test failures
   */
  private convertUnhandledErrors(errors: SerializedError[]): TestFailure[] {
    return errors.map((error) => ({
      test: 'Unhandled Error',
      file: '',
      startLine: 0,
      endLine: 0,
      error: {
        message: error.message || 'Unhandled error',
        type: 'UnhandledError',
        stack: error.stack
      }
    }))
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
   * Builds a minimal output (summary only)
   */
  public buildMinimal(options: BuildOptions): LLMReporterOutput {
    return {
      summary: this.buildSummary(options)
    }
  }

  /**
   * Builds a failure-only output
   */
  public buildFailuresOnly(options: BuildOptions): LLMReporterOutput {
    const output = this.buildMinimal(options)

    const allFailures = this.collectAllFailures(options.testResults.failed, options.unhandledErrors)

    if (allFailures.length > 0) {
      output.failures = allFailures
    }

    return output
  }

  /**
   * Merges multiple outputs into one
   */
  public merge(outputs: LLMReporterOutput[]): LLMReporterOutput {
    if (outputs.length === 0) {
      return this.buildMinimal({
        testResults: { passed: [], failed: [], skipped: [] },
        duration: 0
      })
    }

    if (outputs.length === 1) {
      return outputs[0]
    }

    // Aggregate results
    const aggregated: BuildOptions = {
      testResults: {
        passed: [],
        failed: [],
        skipped: []
      },
      duration: 0
    }

    for (const output of outputs) {
      // Add to duration
      aggregated.duration += output.summary.duration

      // Collect test results
      if (output.passed) {
        aggregated.testResults.passed.push(...output.passed)
      }

      if (output.failures) {
        aggregated.testResults.failed.push(...output.failures)
      }

      if (output.skipped) {
        aggregated.testResults.skipped.push(...output.skipped)
      }
    }

    return this.build(aggregated)
  }

  /**
   * Validates output structure
   */
  public validate(output: LLMReporterOutput): boolean {
    // Check summary
    if (!output.summary || typeof output.summary !== 'object') {
      return false
    }

    const { summary } = output

    if (typeof summary.total !== 'number' || summary.total < 0) {
      return false
    }

    if (typeof summary.passed !== 'number' || summary.passed < 0) {
      return false
    }

    if (typeof summary.failed !== 'number' || summary.failed < 0) {
      return false
    }

    if (typeof summary.skipped !== 'number' || summary.skipped < 0) {
      return false
    }

    // Check that totals match
    const calculatedTotal = summary.passed + summary.failed + summary.skipped
    if (summary.total !== calculatedTotal) {
      return false
    }

    // Validate arrays if present
    if (output.failures && !Array.isArray(output.failures)) {
      return false
    }

    if (output.passed && !Array.isArray(output.passed)) {
      return false
    }

    if (output.skipped && !Array.isArray(output.skipped)) {
      return false
    }

    return true
  }

  /**
   * Updates builder configuration
   */
  public updateConfig(config: OutputBuilderConfig): void {
    this.config = { ...this.config, ...config }
  }
}
