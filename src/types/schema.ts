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
 * Runtime environment details captured alongside the summary
 */
export interface RuntimeEnvironmentSummary {
  /** Operating system information */
  os: {
    /** Platform identifier (e.g., linux, darwin, win32) */
    platform: string
    /** OS release string (e.g., kernel version) */
    release: string
    /** CPU architecture */
    arch: string
    /** Optional OS version string when available */
    version?: string
  }
  /** Node.js runtime information */
  node: {
    /** Normalized Node.js version */
    version: string
    /** Optional runtime identifier (e.g., node) */
    runtime?: string
  }
  /** Vitest runtime metadata, when available */
  vitest?: {
    /** Installed vitest version */
    version?: string
  }
  /** Indicates whether the reporter detected a CI environment */
  ci?: boolean
  /** Package manager identifier derived from npm_config_user_agent */
  packageManager?: string
}

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
  /** Runtime environment metadata */
  environment?: RuntimeEnvironmentSummary
  /** Number of flaky tests (passed after retry) */
  flaky?: number
  /** Number of tests that were retried */
  retried?: number
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
  /** Serialized message representation of the console call */
  message: string
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
 * Individual retry attempt for a test
 */
export interface RetryAttempt {
  /** Attempt number (1-indexed: 1, 2, 3...) */
  attemptNumber: number
  /** Status of this attempt */
  status: 'passed' | 'failed'
  /** Duration of this attempt in milliseconds */
  duration: number
  /** Error details if this attempt failed */
  error?: TestError
  /** ISO 8601 timestamp when this attempt started */
  timestamp: string
}

/**
 * Flakiness information for tests that were retried
 */
export interface FlakinessInfo {
  /** Whether the test is flaky (failed at least once but eventually passed) */
  isFlaky: boolean
  /** Total number of attempts made */
  totalAttempts: number
  /** Number of attempts that failed */
  failedAttempts: number
  /** Which attempt number succeeded (if any) */
  successAttempt?: number
}

/**
 * Retry information for a test
 */
export interface RetryInfo {
  /** All attempts made for this test */
  attempts: RetryAttempt[]
  /** Flakiness analysis */
  flakiness: FlakinessInfo
}

/**
 * Failed test information
 */
export interface TestFailure extends TestBase {
  /** Error details */
  error: TestError
  /** Console events captured during test (optional) */
  consoleEvents?: ConsoleEvent[]
  /** Retry information if test was retried (optional) */
  retryInfo?: RetryInfo
}

/**
 * Passed or skipped test information
 */
export interface TestResult extends TestBase {
  /** Test duration in milliseconds (optional) */
  duration?: number
  /** Test status */
  status: 'passed' | 'skipped'
  /** Retry information if test was retried (optional) */
  retryInfo?: RetryInfo
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
