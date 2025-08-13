/**
 * JSON Schema for LLM-Optimized Test Results
 * 
 * Designed for token efficiency while preserving critical information
 * for LLM consumption and analysis.
 */

/**
 * Validation constants
 */
const VALIDATION_CONSTANTS = {
  MIN_LINE_NUMBER: 1,
  MIN_COLUMN_NUMBER: 0,
  MIN_DURATION: 0,
  MAX_CODE_LINES: 100, // Reasonable limit for context
} as const;

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
  /** 
   * Lines of code around the failure point
   * WARNING: Must be escaped when rendering in HTML contexts
   */
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
 * Validates an ISO 8601 timestamp
 */
function isValidISO8601(timestamp: string): boolean {
  try {
    const date = new Date(timestamp);
    // Check if the date is valid
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Validates that a TestSummary object is valid
 */
export function isValidTestSummary(summary: unknown): summary is TestSummary {
  if (!summary || typeof summary !== 'object' || summary === null) return false
  
  const obj = summary as Record<string, unknown>;
  
  // Check required fields exist and are numbers
  const requiredNumbers = ['total', 'passed', 'failed', 'skipped', 'duration']
  for (const field of requiredNumbers) {
    if (typeof obj[field] !== 'number' || (obj[field] as number) < 0) {
      return false
    }
  }
  
  // Check timestamp is a valid ISO 8601 string
  if (typeof obj.timestamp !== 'string') return false
  if (!isValidISO8601(obj.timestamp as string)) return false
  
  // Validate that total equals sum of passed, failed, and skipped
  const total = obj.total as number;
  const passed = obj.passed as number;
  const failed = obj.failed as number;
  const skipped = obj.skipped as number;
  
  if (total !== passed + failed + skipped) {
    return false
  }
  
  return true
}

/**
 * Validates ErrorContext
 */
function isValidErrorContext(context: unknown): context is ErrorContext {
  if (!context || typeof context !== 'object' || context === null) return false
  
  const ctx = context as Record<string, unknown>;
  
  // Validate required code array
  if (!Array.isArray(ctx.code)) return false
  if (!ctx.code.every((line: unknown) => typeof line === 'string')) return false
  if (ctx.code.length > VALIDATION_CONSTANTS.MAX_CODE_LINES) return false
  
  // Validate optional numeric fields
  if (ctx.lineNumber !== undefined) {
    if (typeof ctx.lineNumber !== 'number' || 
        ctx.lineNumber < VALIDATION_CONSTANTS.MIN_LINE_NUMBER) {
      return false
    }
  }
  
  if (ctx.columnNumber !== undefined) {
    if (typeof ctx.columnNumber !== 'number' || 
        ctx.columnNumber < VALIDATION_CONSTANTS.MIN_COLUMN_NUMBER) {
      return false
    }
  }
  
  // expected and actual can be any type, so no validation needed
  
  return true
}

/**
 * Validates that a TestError object is valid
 */
export function isValidTestError(error: unknown): error is TestError {
  if (!error || typeof error !== 'object' || error === null) return false
  
  const obj = error as Record<string, unknown>;
  
  // Check required fields
  if (typeof obj.message !== 'string' || typeof obj.type !== 'string') {
    return false
  }
  
  // Check optional fields if present
  if (obj.stack !== undefined && typeof obj.stack !== 'string') {
    return false
  }
  
  if (obj.context !== undefined) {
    if (!isValidErrorContext(obj.context)) {
      return false
    }
  }
  
  return true
}

/**
 * Validates that a TestFailure object is valid
 */
export function isValidTestFailure(failure: unknown): failure is TestFailure {
  if (!failure || typeof failure !== 'object' || failure === null) return false
  
  const obj = failure as Record<string, unknown>;
  
  // Check required fields
  if (typeof obj.test !== 'string' || 
      typeof obj.file !== 'string' || 
      typeof obj.line !== 'number' || 
      obj.line < VALIDATION_CONSTANTS.MIN_LINE_NUMBER) {
    return false
  }
  
  // Check error object
  if (!isValidTestError(obj.error)) {
    return false
  }
  
  // Check optional suite array
  if (obj.suite !== undefined) {
    if (!Array.isArray(obj.suite)) return false
    if (!obj.suite.every((s: unknown) => typeof s === 'string')) {
      return false
    }
  }
  
  return true
}

/**
 * Validates that a TestResult object is valid
 */
export function isValidTestResult(result: unknown): result is TestResult {
  if (!result || typeof result !== 'object' || result === null) return false
  
  const obj = result as Record<string, unknown>;
  
  // Check required fields
  if (typeof obj.test !== 'string' || 
      typeof obj.file !== 'string' || 
      typeof obj.line !== 'number' || 
      obj.line < VALIDATION_CONSTANTS.MIN_LINE_NUMBER) {
    return false
  }
  
  // Check status
  if (obj.status !== 'passed' && obj.status !== 'skipped') {
    return false
  }
  
  // Check optional duration
  if (obj.duration !== undefined && 
      (typeof obj.duration !== 'number' || obj.duration < VALIDATION_CONSTANTS.MIN_DURATION)) {
    return false
  }
  
  // Check optional suite array
  if (obj.suite !== undefined) {
    if (!Array.isArray(obj.suite)) return false
    if (!obj.suite.every((s: unknown) => typeof s === 'string')) {
      return false
    }
  }
  
  return true
}

/**
 * Validates the complete LLM Reporter output schema
 */
export function validateSchema(output: unknown): output is LLMReporterOutput {
  if (!output || typeof output !== 'object' || output === null) return false
  
  const obj = output as Record<string, unknown>;
  
  // Validate summary (required)
  if (!isValidTestSummary(obj.summary)) {
    return false
  }
  
  // Validate failures array if present - using for loop for performance
  if (obj.failures !== undefined) {
    if (!Array.isArray(obj.failures)) return false
    for (const failure of obj.failures) {
      if (!isValidTestFailure(failure)) {
        return false;
      }
    }
  }
  
  // Validate passed array if present - using for loop for performance
  if (obj.passed !== undefined) {
    if (!Array.isArray(obj.passed)) return false
    for (const result of obj.passed) {
      if (!isValidTestResult(result)) {
        return false;
      }
    }
  }
  
  // Validate skipped array if present - using for loop for performance
  if (obj.skipped !== undefined) {
    if (!Array.isArray(obj.skipped)) return false
    for (const result of obj.skipped) {
      if (!isValidTestResult(result)) {
        return false;
      }
    }
  }
  
  return true
}