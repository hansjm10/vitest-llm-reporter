/**
 * Test Case Data Extractor
 *
 * Extracts and normalizes data from raw Vitest test case objects.
 * Handles the complexity of unknown object shapes with safe property access.
 *
 * @module extraction
 */

import type { TestCaseData } from '../types/reporter-internal'
import type { ExtractedTestCase, ExtractionConfig } from '../types/extraction'

/**
 * Default extraction configuration
 */
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  defaults: {
    name: 'Unknown Test',
    filepath: '',
    startLine: 0,
    endLine: 0,
    duration: 0,
    state: 'unknown'
  }
}

/**
 * Extracts data from raw test case objects
 *
 * This class safely extracts properties from untyped Vitest objects,
 * providing sensible defaults and handling missing or malformed data.
 *
 * @example
 * ```typescript
 * const extractor = new TestCaseExtractor();
 * const extracted = extractor.extract(rawTestCase);
 * ```
 */
export class TestCaseExtractor {
  private config: Required<ExtractionConfig>

  constructor(config: ExtractionConfig = {}) {
    this.config = {
      defaults: {
        ...DEFAULT_EXTRACTION_CONFIG.defaults,
        ...config.defaults
      }
    }
  }

  /**
   * Extracts data from a raw test case object
   *
   * @param testCase - The raw test case object from Vitest
   * @returns Extracted and normalized test case data
   */
  public extract(testCase: unknown): ExtractedTestCase | null {
    if (!this.isValidTestCase(testCase)) {
      return null
    }

    // Handle Vitest v3 structure where test data is in 'task' property
    let tc = testCase as TestCaseData
    const testCaseWithTask = testCase as { task?: unknown }
    if (testCaseWithTask.task && typeof testCaseWithTask.task === 'object') {
      tc = testCaseWithTask.task as TestCaseData
    }

    return {
      name: this.extractName(tc),
      filepath: this.extractFilepath(tc),
      startLine: this.extractStartLine(tc),
      endLine: this.extractEndLine(tc),
      suite: this.extractSuite(tc),
      state: this.extractState(tc),
      mode: this.extractMode(tc),
      duration: this.extractDuration(tc),
      error: this.extractError(tc)
    }
  }

  /**
   * Validates that the input is a valid test case object
   */
  private isValidTestCase(testCase: unknown): boolean {
    return testCase !== null && typeof testCase === 'object'
  }

  /**
   * Extracts the test name
   */
  private extractName(tc: TestCaseData): string {
    return tc.name ?? this.config.defaults.name!
  }

  /**
   * Extracts the file path
   */
  private extractFilepath(tc: TestCaseData): string {
    return tc.file?.filepath ?? tc.filepath ?? this.config.defaults.filepath!
  }

  /**
   * Extracts the start line number
   */
  private extractStartLine(tc: TestCaseData): number {
    return tc.location?.start?.line ?? this.config.defaults.startLine!
  }

  /**
   * Extracts the end line number
   */
  private extractEndLine(tc: TestCaseData): number {
    return tc.location?.end?.line ?? this.config.defaults.endLine!
  }

  /**
   * Extracts the test suite hierarchy
   */
  private extractSuite(tc: TestCaseData): string[] | undefined {
    return tc.suite
  }

  /**
   * Extracts the test state and normalizes it
   */
  private extractState(tc: TestCaseData): string {
    const rawState = tc.result?.state ?? this.config.defaults.state!

    // Normalize Vitest v3 state values to our expected format
    if (rawState === 'pass') return 'passed'
    if (rawState === 'fail') return 'failed'
    if (rawState === 'skip') return 'skipped'

    return rawState
  }

  /**
   * Extracts the test mode
   */
  private extractMode(tc: TestCaseData): string | undefined {
    return tc.mode
  }

  /**
   * Extracts the test duration
   */
  private extractDuration(tc: TestCaseData): number {
    return tc.result?.duration ?? this.config.defaults.duration!
  }

  /**
   * Extracts the error object if present
   */
  private extractError(tc: TestCaseData): unknown {
    return tc.result?.error
  }

  /**
   * Extracts data from multiple test cases
   *
   * @param testCases - Array of raw test case objects
   * @returns Array of extracted test cases (nulls filtered out)
   */
  public extractBatch(testCases: unknown[]): ExtractedTestCase[] {
    return testCases
      .map((tc) => this.extract(tc))
      .filter((tc): tc is ExtractedTestCase => tc !== null)
  }

  /**
   * Checks if a test case represents a failed test
   */
  public isFailedTest(extracted: ExtractedTestCase): boolean {
    return extracted.state === 'failed'
  }

  /**
   * Checks if a test case represents a passed test
   */
  public isPassedTest(extracted: ExtractedTestCase): boolean {
    return extracted.state === 'passed'
  }

  /**
   * Checks if a test case represents a skipped test
   */
  public isSkippedTest(extracted: ExtractedTestCase): boolean {
    return extracted.state === 'skipped' || extracted.mode === 'skip'
  }
}
