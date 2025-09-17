/**
 * JSON Schema Type Definitions for LLM-Optimized Test Results
 *
 * This file contains ONLY type definitions.
 * For validation logic, use the SchemaValidator class from '../validation/validator.js'
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
 * Note: Assertion values (expected/actual) are stored in error.assertion, not in context
 */
export interface ErrorContext {
  /** Relevant code lines around the error */
  code: string[]
  /** Line number in the code (optional) */
  lineNumber?: number
  /** Column number in the code (optional) */
  columnNumber?: number
}

/**
 * Stack frame information from parsed stack traces
 */
export interface StackFrame {
  /** Repo-relative file path */
  fileRelative: string
  /** Line number */
  line: number
  /** Column number (optional) */
  column?: number
  /** Function name (optional) */
  function?: string
  /** Whether the frame is in the project (not external) */
  inProject: boolean
  /** Whether the frame is in node_modules */
  inNodeModules: boolean
  /** Absolute file path (optional, for tooling) */
  fileAbsolute?: string
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
  /** Type of the expected value */
  expectedType?: 'string' | 'number' | 'boolean' | 'null' | 'Record<string, unknown>' | 'array'
  /** Type of the actual value */
  actualType?: 'string' | 'number' | 'boolean' | 'null' | 'Record<string, unknown>' | 'array'
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
  /** Repo-relative file path where the test is defined */
  fileRelative: string
  /** Line number where the test starts */
  startLine: number
  /** Line number where the test ends */
  endLine: number
  /** Test suite hierarchy (optional) */
  suite?: string[]
  /** Absolute file path (optional, for tooling) */
  fileAbsolute?: string
}

/**
 * Console method level types
 */
export type ConsoleLevel = 'log' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

/**
 * Individual console event with metadata
 */
export interface ConsoleEvent {
  /** Console method level */
  level: ConsoleLevel
  /** Serialized text representation of the console call */
  text: string
  /** Message content (same as text, for deduplication compatibility) */
  message?: string
  /** Timestamp in milliseconds since test start (optional) */
  timestampMs?: number
  /** Timestamp (alias for timestampMs, optional) */
  timestamp?: number
  /** Array of individually serialized arguments (optional) */
  args?: string[]
  /** Origin of the console event */
  origin?: 'intercepted' | 'task'
  /** Test ID that produced the log (if known) */
  testId?: string
  /** Deduplication metadata if this log was deduplicated */
  deduplication?: {
    count: number
    deduplicated: boolean
    firstSeen: string
    lastSeen: string
    sources?: string[]
  }
}

/**
 * Failed test information
 */
export interface TestFailure extends TestBase {
  /** Error details */
  error: TestError
  /** Console events captured during test (optional) */
  consoleEvents?: ConsoleEvent[]
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
 * Console output captured from successful tests
 */
export interface TestSuccessLog extends TestBase {
  /** Successful status indicator */
  status: 'passed'
  /** Test duration in milliseconds (optional) */
  duration?: number
  /** Console events recorded during the successful test (after filtering) */
  consoleEvents?: ConsoleEvent[]
  /** Summary of suppressed log lines */
  suppressed?: {
    /** Total log lines observed (kept + suppressed) */
    totalLines: number
    /** Log lines removed by suppression filters */
    suppressedLines: number
  }
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
  /** Console output from successful tests (optional) */
  successLogs?: TestSuccessLog[]
}
