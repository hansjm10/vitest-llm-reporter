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
import type { TruncationConfig } from '../types/reporter'
import { createTruncationEngine, type ITruncationEngine } from '../truncation/TruncationEngine'

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
  /** Enable streaming mode for real-time output */
  enableStreaming?: boolean
  /** Truncation configuration */
  truncation?: TruncationConfig
}

/**
 * Default output builder configuration
 */
export const DEFAULT_OUTPUT_CONFIG: Required<OutputBuilderConfig> = {
  includePassedTests: false,
  includeSkippedTests: false,
  verbose: false,
  enableStreaming: false,
  truncation: {
    enabled: false,
    maxTokens: undefined,
    model: 'gpt-4',
    strategy: 'smart',
    featureFlag: false,
    enableEarlyTruncation: false,
    enableStreamingTruncation: false,
    enableLateTruncation: false,
    enableMetrics: false
  }
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
  unhandledErrors?: ReadonlyArray<SerializedError>
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
  private truncationEngine?: ITruncationEngine

  constructor(config: OutputBuilderConfig = {}) {
    this.config = { ...DEFAULT_OUTPUT_CONFIG, ...config }
    
    // Initialize truncation engine for late-stage truncation if enabled
    if (this.config.truncation.enabled && this.config.truncation.enableLateTruncation) {
      this.truncationEngine = createTruncationEngine(this.config.truncation)
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
  private buildMinimal(options: BuildOptions): LLMReporterOutput {
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
   * Builds output for a single test result (streaming mode)
   */
  public buildTestResult(result: TestResult | TestFailure): Partial<LLMReporterOutput> {
    if (!this.config.enableStreaming) {
      throw new Error('buildTestResult can only be called in streaming mode')
    }

    const output: Partial<LLMReporterOutput> = {}

    // Check if this is a failure
    if ('error' in result) {
      output.failures = [result]
    } else {
      // Handle passed/skipped tests based on configuration
      if (this.shouldIncludePassedTests([result])) {
        output.passed = [result]
      }
      // Note: Skipped tests would need additional type checking
      // For now, we'll handle them in the full build process
    }

    return output
  }

  /**
   * Builds a streaming summary with current counts
   */
  public buildStreamingSummary(
    passed: number,
    failed: number,
    skipped: number,
    duration: number
  ): TestSummary {
    return {
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
      duration,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Checks if streaming mode is enabled
   */
  public get isStreamingMode(): boolean {
    return this.config.enableStreaming
  }

  /**
   * Applies late-stage truncation to the complete output
   */
  private applyLateTruncation(output: LLMReporterOutput): LLMReporterOutput {
    if (!this.truncationEngine) {
      return output
    }

    // Serialize output to check total size
    const serialized = JSON.stringify(output, null, 2)
    
    if (!this.truncationEngine.needsTruncation(serialized)) {
      return output
    }

    // Apply progressive truncation strategy
    const truncatedOutput = { ...output }
    
    // Strategy 1: Truncate failure details first (keeping errors but reducing context)
    if (truncatedOutput.failures) {
      truncatedOutput.failures = truncatedOutput.failures.map(failure => {
        const failureJson = JSON.stringify(failure)
        if (this.truncationEngine!.needsTruncation(failureJson)) {
          // Truncate console output first
          if (failure.console) {
            const consoleStr = JSON.stringify(failure.console)
            const truncated = this.truncationEngine!.truncate(consoleStr)
            try {
              failure.console = JSON.parse(truncated.content)
            } catch {
              // If parsing fails, create simplified console output
              failure.console = { logs: ['[Console output truncated]'] }
            }
          }
          
          // Truncate error stack if still too large
          if (failure.error && this.truncationEngine!.needsTruncation(JSON.stringify(failure))) {
            // Limit stack trace lines
            if (failure.error.stack) {
              const stackLines = failure.error.stack.split('\n')
              failure.error.stack = stackLines.slice(0, 10).join('\n')
            }
          }
        }
        return failure
      })
    }

    // Check if we still need more truncation
    const newSerialized = JSON.stringify(truncatedOutput, null, 2)
    if (this.truncationEngine.needsTruncation(newSerialized)) {
      // Strategy 2: Remove passed/skipped tests if they exist
      if (truncatedOutput.passed?.length) {
        delete truncatedOutput.passed
      }
      if (truncatedOutput.skipped?.length) {
        delete truncatedOutput.skipped
      }
    }

    return truncatedOutput
  }

  /**
   * Gets truncation metrics if available
   */
  public getTruncationMetrics() {
    return this.truncationEngine?.getMetrics() || []
  }

  /**
   * Check if truncation is enabled
   */
  public get hasTruncation(): boolean {
    return Boolean(this.truncationEngine)
  }

  /**
   * Updates builder configuration
   */
  public updateConfig(config: OutputBuilderConfig): void {
    this.config = { ...this.config, ...config }
    
    // Update truncation engine config
    if (this.truncationEngine && config.truncation) {
      this.truncationEngine.updateConfig(config.truncation)
    }
    
    // Initialize or destroy truncation engine based on config changes
    if (config.truncation?.enabled && config.truncation?.enableLateTruncation && !this.truncationEngine) {
      this.truncationEngine = createTruncationEngine(this.config.truncation)
    } else if (!config.truncation?.enabled && this.truncationEngine) {
      this.truncationEngine = undefined
    }
  }
}
