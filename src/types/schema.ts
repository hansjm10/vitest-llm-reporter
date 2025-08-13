/**
 * JSON Schema for LLM-Optimized Test Results
 * 
 * Designed for token efficiency while preserving critical information
 * for LLM consumption and analysis.
 */

import { 
  sanitizeCodeArray, 
  validateFilePath, 
  createSafeObject,
  hasOwnProperty 
} from '../utils/sanitization'

/**
 * Validation constants
 */
const VALIDATION_CONSTANTS = {
  MIN_LINE_NUMBER: 1,
  MIN_COLUMN_NUMBER: 0,
  MIN_DURATION: 0,
  MAX_CODE_LINES: 100, // Reasonable limit for context
  MAX_TOTAL_CODE_SIZE: 1024 * 1024, // 1MB total code size limit
  MAX_STRING_LENGTH: 10000, // Maximum length for any single string
} as const;

/**
 * Strict ISO 8601 regex pattern to prevent ReDoS
 */
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

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
  | unknown[];

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
   * NOTE: Automatically sanitized during validation to prevent XSS
   */
  code: string[]
  /** Expected value in assertion (optional) */
  expected?: AssertionValue
  /** Actual value in assertion (optional) */
  actual?: AssertionValue
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
 * Validates an ISO 8601 timestamp with strict regex to prevent ReDoS
 */
function isValidISO8601(timestamp: string): boolean {
  // First check with strict regex to prevent ReDoS
  if (!ISO8601_REGEX.test(timestamp)) {
    return false;
  }
  
  try {
    const date = new Date(timestamp);
    // Check if the date is valid and matches the input
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
  
  // Create safe object to prevent prototype pollution
  const obj = createSafeObject(summary as Record<string, unknown>);
  
  // Check required fields exist and are numbers
  const requiredNumbers = ['total', 'passed', 'failed', 'skipped', 'duration']
  for (const field of requiredNumbers) {
    if (!hasOwnProperty(obj, field)) return false;
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
 * Track total code size to prevent memory exhaustion
 */
let totalCodeSize = 0;

/**
 * Resets the total code size counter (call before validating a new schema)
 */
export function resetCodeSizeCounter(): void {
  totalCodeSize = 0;
}

/**
 * Validates ErrorContext with security checks
 */
function isValidErrorContext(context: unknown): context is ErrorContext {
  if (!context || typeof context !== 'object' || context === null) return false
  
  // Create safe object to prevent prototype pollution
  const ctx = createSafeObject(context as Record<string, unknown>);
  
  // Validate required code array
  if (!hasOwnProperty(ctx, 'code')) return false;
  if (!Array.isArray(ctx.code)) return false
  if (ctx.code.length > VALIDATION_CONSTANTS.MAX_CODE_LINES) return false
  
  // Validate each line is a string using for loop (performance)
  let codeSize = 0;
  for (let i = 0; i < ctx.code.length; i++) {
    if (typeof ctx.code[i] !== 'string') return false;
    codeSize += (ctx.code[i] as string).length;
  }
  
  // Check memory limits
  totalCodeSize += codeSize;
  if (totalCodeSize > VALIDATION_CONSTANTS.MAX_TOTAL_CODE_SIZE) {
    return false;
  }
  
  // Sanitize the code array to prevent XSS
  ctx.code = sanitizeCodeArray(ctx.code as string[]);
  
  // Validate optional numeric fields
  if (hasOwnProperty(ctx, 'lineNumber') && ctx.lineNumber !== undefined) {
    if (typeof ctx.lineNumber !== 'number' || 
        ctx.lineNumber < VALIDATION_CONSTANTS.MIN_LINE_NUMBER) {
      return false
    }
  }
  
  if (hasOwnProperty(ctx, 'columnNumber') && ctx.columnNumber !== undefined) {
    if (typeof ctx.columnNumber !== 'number' || 
        ctx.columnNumber < VALIDATION_CONSTANTS.MIN_COLUMN_NUMBER) {
      return false
    }
  }
  
  // Validate expected and actual are valid assertion values (not 'any')
  if (hasOwnProperty(ctx, 'expected') && ctx.expected !== undefined) {
    if (!isValidAssertionValue(ctx.expected)) return false;
  }
  
  if (hasOwnProperty(ctx, 'actual') && ctx.actual !== undefined) {
    if (!isValidAssertionValue(ctx.actual)) return false;
  }
  
  return true
}

/**
 * Validates that a value is a valid assertion value
 */
function isValidAssertionValue(value: unknown): value is AssertionValue {
  const type = typeof value;
  
  // Allow primitives
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true;
  }
  
  // Allow null and undefined
  if (value === null || value === undefined) {
    return true;
  }
  
  // Allow arrays and objects (but check for circular references during serialization)
  if (Array.isArray(value) || (type === 'object' && value !== null)) {
    try {
      // Test if it can be serialized (catches circular references)
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }
  
  return false;
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
  
  // Create safe object to prevent prototype pollution
  const obj = createSafeObject(failure as Record<string, unknown>);
  
  // Check required fields
  if (!hasOwnProperty(obj, 'test') || typeof obj.test !== 'string') {
    return false
  }
  if (!hasOwnProperty(obj, 'file') || typeof obj.file !== 'string') {
    return false
  }
  // Validate file path security
  if (!validateFilePath(obj.file as string)) {
    return false;
  }
  
  if (!hasOwnProperty(obj, 'line') || typeof obj.line !== 'number' || 
      obj.line < VALIDATION_CONSTANTS.MIN_LINE_NUMBER) {
    return false
  }
  
  // Check error object
  if (!isValidTestError(obj.error)) {
    return false
  }
  
  // Check optional suite array
  if (hasOwnProperty(obj, 'suite') && obj.suite !== undefined) {
    if (!Array.isArray(obj.suite)) return false
    // Use for loop for performance
    for (let i = 0; i < obj.suite.length; i++) {
      if (typeof obj.suite[i] !== 'string') {
        return false;
      }
    }
  }
  
  return true
}

/**
 * Validates that a TestResult object is valid
 */
export function isValidTestResult(result: unknown): result is TestResult {
  if (!result || typeof result !== 'object' || result === null) return false
  
  // Create safe object to prevent prototype pollution
  const obj = createSafeObject(result as Record<string, unknown>);
  
  // Check required fields
  if (!hasOwnProperty(obj, 'test') || typeof obj.test !== 'string') {
    return false
  }
  if (!hasOwnProperty(obj, 'file') || typeof obj.file !== 'string') {
    return false
  }
  // Validate file path security
  if (!validateFilePath(obj.file as string)) {
    return false;
  }
  
  if (!hasOwnProperty(obj, 'line') || typeof obj.line !== 'number' || 
      obj.line < VALIDATION_CONSTANTS.MIN_LINE_NUMBER) {
    return false
  }
  
  // Check status
  if (!hasOwnProperty(obj, 'status') || 
      (obj.status !== 'passed' && obj.status !== 'skipped')) {
    return false
  }
  
  // Check optional duration
  if (hasOwnProperty(obj, 'duration') && obj.duration !== undefined) {
    if (typeof obj.duration !== 'number' || obj.duration < VALIDATION_CONSTANTS.MIN_DURATION) {
      return false
    }
  }
  
  // Check optional suite array
  if (hasOwnProperty(obj, 'suite') && obj.suite !== undefined) {
    if (!Array.isArray(obj.suite)) return false
    // Use for loop for performance
    for (let i = 0; i < obj.suite.length; i++) {
      if (typeof obj.suite[i] !== 'string') {
        return false;
      }
    }
  }
  
  return true
}

/**
 * Validates the complete LLM Reporter output schema
 */
export function validateSchema(output: unknown): output is LLMReporterOutput {
  if (!output || typeof output !== 'object' || output === null) return false
  
  // Reset code size counter for new validation
  resetCodeSizeCounter();
  
  // Create safe object to prevent prototype pollution
  const obj = createSafeObject(output as Record<string, unknown>);
  
  // Validate summary (required)
  if (!hasOwnProperty(obj, 'summary') || !isValidTestSummary(obj.summary)) {
    return false
  }
  
  // Validate failures array if present - using for loop for performance
  if (hasOwnProperty(obj, 'failures') && obj.failures !== undefined) {
    if (!Array.isArray(obj.failures)) return false
    for (let i = 0; i < obj.failures.length; i++) {
      if (!isValidTestFailure(obj.failures[i])) {
        return false;
      }
    }
  }
  
  // Validate passed array if present - using for loop for performance
  if (hasOwnProperty(obj, 'passed') && obj.passed !== undefined) {
    if (!Array.isArray(obj.passed)) return false
    for (let i = 0; i < obj.passed.length; i++) {
      if (!isValidTestResult(obj.passed[i])) {
        return false;
      }
    }
  }
  
  // Validate skipped array if present - using for loop for performance
  if (hasOwnProperty(obj, 'skipped') && obj.skipped !== undefined) {
    if (!Array.isArray(obj.skipped)) return false
    for (let i = 0; i < obj.skipped.length; i++) {
      if (!isValidTestResult(obj.skipped[i])) {
        return false;
      }
    }
  }
  
  return true
}