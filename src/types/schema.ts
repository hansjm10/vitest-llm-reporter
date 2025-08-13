/**
 * JSON Schema for LLM-Optimized Test Results
 * 
 * Designed for token efficiency while preserving critical information
 * for LLM consumption and analysis.
 */

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
 * Error context providing code snippets and assertion details
 */
export interface ErrorContext {
  /** Lines of code around the failure point */
  code: string[]
  /** Expected value in assertion (optional) */
  expected?: any
  /** Actual value in assertion (optional) */
  actual?: any
  /** Line number where error occurred */
  lineNumber?: number
  /** Column number where error occurred */
  columnNumber?: number
}

/**
 * Error details for a failed test
 */
export interface TestError {
  /** Error message */
  message: string
  /** Error type/name (e.g., 'AssertionError', 'TypeError') */
  type: string
  /** Stack trace (optional for brevity) */
  stack?: string
  /** Additional context around the error */
  context?: ErrorContext
}

/**
 * Detailed information about a test failure
 */
export interface TestFailure {
  /** Test name/description */
  test: string
  /** Absolute file path */
  file: string
  /** Line number where test is defined */
  line: number
  /** Nested suite hierarchy (optional) */
  suite?: string[]
  /** Error information */
  error: TestError
}

/**
 * Information about a passed test (verbose mode only)
 */
export interface TestResult {
  /** Test name/description */
  test: string
  /** Absolute file path */
  file: string
  /** Line number where test is defined */
  line: number
  /** Test execution time in milliseconds */
  duration?: number
  /** Test status */
  status: 'passed' | 'skipped'
  /** Nested suite hierarchy (optional) */
  suite?: string[]
}

/**
 * Complete LLM Reporter output structure
 */
export interface LLMReporterOutput {
  /** Summary statistics */
  summary: TestSummary
  /** Failed test details (only included if there are failures) */
  failures?: TestFailure[]
  /** Passed test details (only included in verbose mode) */
  passed?: TestResult[]
  /** Skipped test details (only included in verbose mode) */
  skipped?: TestResult[]
}

/**
 * Validates that a TestSummary object is valid
 */
export function isValidTestSummary(summary: any): summary is TestSummary {
  if (!summary || typeof summary !== 'object') return false
  
  // Check required fields exist and are numbers
  const requiredNumbers = ['total', 'passed', 'failed', 'skipped', 'duration']
  for (const field of requiredNumbers) {
    if (typeof summary[field] !== 'number' || summary[field] < 0) {
      return false
    }
  }
  
  // Check timestamp is a string
  if (typeof summary.timestamp !== 'string') return false
  
  // Validate that total equals sum of passed, failed, and skipped
  if (summary.total !== summary.passed + summary.failed + summary.skipped) {
    return false
  }
  
  return true
}

/**
 * Validates that a TestError object is valid
 */
export function isValidTestError(error: any): error is TestError {
  if (!error || typeof error !== 'object') return false
  
  // Check required fields
  if (typeof error.message !== 'string' || typeof error.type !== 'string') {
    return false
  }
  
  // Check optional fields if present
  if (error.stack !== undefined && typeof error.stack !== 'string') {
    return false
  }
  
  if (error.context !== undefined) {
    if (!error.context || typeof error.context !== 'object') return false
    if (!Array.isArray(error.context.code)) return false
    if (!error.context.code.every((line: any) => typeof line === 'string')) {
      return false
    }
  }
  
  return true
}

/**
 * Validates that a TestFailure object is valid
 */
export function isValidTestFailure(failure: any): failure is TestFailure {
  if (!failure || typeof failure !== 'object') return false
  
  // Check required fields
  if (typeof failure.test !== 'string' || 
      typeof failure.file !== 'string' || 
      typeof failure.line !== 'number' || 
      failure.line < 1) {
    return false
  }
  
  // Check error object
  if (!isValidTestError(failure.error)) {
    return false
  }
  
  // Check optional suite array
  if (failure.suite !== undefined) {
    if (!Array.isArray(failure.suite)) return false
    if (!failure.suite.every((s: any) => typeof s === 'string')) {
      return false
    }
  }
  
  return true
}

/**
 * Validates that a TestResult object is valid
 */
export function isValidTestResult(result: any): result is TestResult {
  if (!result || typeof result !== 'object') return false
  
  // Check required fields
  if (typeof result.test !== 'string' || 
      typeof result.file !== 'string' || 
      typeof result.line !== 'number' || 
      result.line < 1) {
    return false
  }
  
  // Check status
  if (result.status !== 'passed' && result.status !== 'skipped') {
    return false
  }
  
  // Check optional duration
  if (result.duration !== undefined && 
      (typeof result.duration !== 'number' || result.duration < 0)) {
    return false
  }
  
  // Check optional suite array
  if (result.suite !== undefined) {
    if (!Array.isArray(result.suite)) return false
    if (!result.suite.every((s: any) => typeof s === 'string')) {
      return false
    }
  }
  
  return true
}

/**
 * Validates the complete LLM Reporter output schema
 */
export function validateSchema(output: any): output is LLMReporterOutput {
  if (!output || typeof output !== 'object') return false
  
  // Validate summary (required)
  if (!isValidTestSummary(output.summary)) {
    return false
  }
  
  // Validate failures array if present
  if (output.failures !== undefined) {
    if (!Array.isArray(output.failures)) return false
    if (!output.failures.every(isValidTestFailure)) {
      return false
    }
  }
  
  // Validate passed array if present
  if (output.passed !== undefined) {
    if (!Array.isArray(output.passed)) return false
    if (!output.passed.every(isValidTestResult)) {
      return false
    }
  }
  
  // Validate skipped array if present
  if (output.skipped !== undefined) {
    if (!Array.isArray(output.skipped)) return false
    if (!output.skipped.every(isValidTestResult)) {
      return false
    }
  }
  
  return true
}