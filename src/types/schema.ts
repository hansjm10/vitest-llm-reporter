/**
 * JSON Schema Type Definitions for LLM-Optimized Test Results
 *
 * This file contains ONLY type definitions.
 * For validation logic, use the SchemaValidator class from '../validation/validator'
 *
 * @module schema
 */

/**
 * Type for assertion values (replaces 'any')
 */
export type AssertionValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[]

/**
 * High-level test run statistics
 */
export interface TestSummary {
  /** Total number of tests */
  total: number
  /** Number of passed tests */
  passed: number
  /** Number of failed tests */
  failed: number
  /** Number of skipped tests */
  skipped: number
  /** Total execution time in milliseconds */
  duration: number
  /** ISO 8601 timestamp of test run */
  timestamp: string
}

/**
 * Error context with relevant code
 */
export interface ErrorContext {
  /** Relevant code lines around the error */
  code: string[]
  /** Expected value in assertion (optional) */
  expected?: AssertionValue
  /** Actual value in assertion (optional) */
  actual?: AssertionValue
  /** Line number in the code (optional) */
  lineNumber?: number
  /** Column number in the code (optional) */
  columnNumber?: number
}

/**
 * Stack frame information from parsed stack traces
 */
export interface StackFrame {
  /** File path */
  file: string
  /** Line number */
  line: number
  /** Column number (optional) */
  column?: number
  /** Function name (optional) */
  function?: string
}

/**
 * Assertion details from test failures
 */
export interface AssertionDetails {
  /** Expected value */
  expected: AssertionValue
  /** Actual value */
  actual: AssertionValue
  /** Assertion operator (e.g., "toBe", "toEqual") */
  operator?: string
}

/**
 * Detailed error information
 */
export interface TestError {
  /** Error message */
  message: string
  /** Error type/name (e.g., "AssertionError") */
  type: string
  /** Stack trace (optional, may be truncated) */
  stack?: string
  /** Parsed stack frames */
  stackFrames?: StackFrame[]
  /** Assertion details for assertion errors */
  assertion?: AssertionDetails
  /** Additional context for the error */
  context?: ErrorContext
}

/**
 * Base test location and identification information
 */
export interface TestBase {
  /** Test name */
  test: string
  /** File path where the test is defined */
  file: string
  /** Line number where the test starts */
  startLine: number
  /** Line number where the test ends */
  endLine: number
  /** Test suite hierarchy (optional) */
  suite?: string[]
}

/**
 * Failed test information
 */
export interface TestFailure extends TestBase {
  /** Error details */
  error: TestError
}

/**
 * Passed or skipped test information
 */
export interface TestResult extends TestBase {
  /** Test duration in milliseconds (optional) */
  duration?: number
  /** Test status */
  status: 'passed' | 'skipped'
}

/**
 * Complete LLM-optimized reporter output
 */
export interface LLMReporterOutput {
  /** Test run summary */
  summary: TestSummary
  /** Failed test details (optional, only present if there are failures) */
  failures?: TestFailure[]
  /** Passed test details (optional, populated in verbose mode) */
  passed?: TestResult[]
  /** Skipped test details (optional, populated in verbose mode) */
  skipped?: TestResult[]
}
