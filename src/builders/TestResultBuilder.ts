/**
 * Test Result Builder
 *
 * Factory for creating test result objects conforming to the LLM reporter schema.
 * Uses the builder pattern for constructing complex test result structures.
 *
 * @module builders
 */

import type { TestResult, TestFailure, TestBase, TestError, ConsoleOutput } from '../types/schema.js'
import type { ExtractedTestCase, NormalizedError } from '../types/extraction.js'

/**
 * Builder configuration
 */
export interface BuilderConfig {
  /** Whether to include suite information in results */
  includeSuite?: boolean
  /** Whether to include duration in passed/skipped tests */
  includeDuration?: boolean
}

/**
 * Default builder configuration
 */
export const DEFAULT_BUILDER_CONFIG: Required<BuilderConfig> = {
  includeSuite: true,
  includeDuration: true
}

/**
 * Builds test result objects
 *
 * This class provides factory methods for creating different types
 * of test results (passed, failed, skipped) from extracted test data.
 *
 * @example
 * ```typescript
 * const builder = new TestResultBuilder();
 * const passedTest = builder.buildPassedTest(extractedData);
 * const failedTest = builder.buildFailedTest(extractedData, normalizedError);
 * ```
 */
export class TestResultBuilder {
  private config: Required<BuilderConfig>

  constructor(config: BuilderConfig = {}) {
    this.config = { ...DEFAULT_BUILDER_CONFIG, ...config }
  }

  /**
   * Builds the base test information common to all test types
   */
  private buildBase(extracted: ExtractedTestCase): TestBase {
    const base: TestBase = {
      test: extracted.name,
      file: extracted.filepath,
      startLine: extracted.startLine,
      endLine: extracted.endLine
    }

    if (this.config.includeSuite && extracted.suite) {
      base.suite = extracted.suite
    }

    return base
  }

  /**
   * Builds a passed test result
   */
  public buildPassedTest(extracted: ExtractedTestCase): TestResult {
    const result: TestResult = {
      ...this.buildBase(extracted),
      status: 'passed' as const
    }

    if (this.config.includeDuration) {
      result.duration = extracted.duration
    }

    return result
  }

  /**
   * Builds a skipped test result
   */
  public buildSkippedTest(extracted: ExtractedTestCase): TestResult {
    const result: TestResult = {
      ...this.buildBase(extracted),
      status: 'skipped' as const
    }

    if (this.config.includeDuration) {
      result.duration = extracted.duration
    }

    return result
  }

  /**
   * Builds a failed test result
   */
  public buildFailedTest(
    extracted: ExtractedTestCase,
    error: NormalizedError,
    errorContext?: TestError['context'],
    consoleOutput?: ConsoleOutput
  ): TestFailure {
    const testError: TestError = {
      message: error.message,
      type: error.type
    }

    if (error.stack) {
      testError.stack = error.stack
    }

    if (error.stackFrames && error.stackFrames.length > 0) {
      testError.stackFrames = error.stackFrames
    }

    if (error.assertion) {
      testError.assertion = error.assertion
    }

    if (errorContext) {
      testError.context = errorContext
    }

    const failure: TestFailure = {
      ...this.buildBase(extracted),
      error: testError
    }

    if (consoleOutput) {
      failure.console = consoleOutput
    }

    return failure
  }

  /**
   * Builds a test result based on the extracted state
   */
  public buildFromExtracted(
    extracted: ExtractedTestCase,
    error?: NormalizedError,
    errorContext?: TestError['context'],
    consoleOutput?: ConsoleOutput
  ): TestResult | TestFailure {
    switch (extracted.state) {
      case 'passed':
        return this.buildPassedTest(extracted)

      case 'failed':
        if (!error) {
          // Create a minimal error if none provided
          error = {
            message: 'Test failed',
            type: 'TestFailure'
          }
        }
        return this.buildFailedTest(extracted, error, errorContext, consoleOutput)

      case 'skipped':
        return this.buildSkippedTest(extracted)

      default:
        // Treat unknown states as skipped
        return this.buildSkippedTest(extracted)
    }
  }

  /**
   * Builds an unhandled error failure
   */
  public buildUnhandledError(error: NormalizedError): TestFailure {
    return {
      test: 'Unhandled Error',
      file: '',
      startLine: 0,
      endLine: 0,
      error: {
        message: error.message,
        type: 'UnhandledError',
        stack: error.stack
      }
    }
  }

  /**
   * Updates builder configuration
   */
  public updateConfig(config: BuilderConfig): void {
    this.config = { ...this.config, ...config }
  }
}
