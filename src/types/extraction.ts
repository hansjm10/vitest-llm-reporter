/**
 * Extraction Type Definitions
 *
 * This file contains type definitions for data extraction operations
 * used by the ErrorExtractor and TestCaseExtractor classes.
 *
 * @module extraction-types
 */

/**
 * Stack frame information from parsed stack traces
 */
export interface StackFrame {
  file: string
  line: number
  column?: number
  function?: string
}

/**
 * Assertion details from test failures
 */
export interface AssertionDetails {
  expected: unknown
  actual: unknown
  operator?: string
}

/**
 * Normalized error information
 */
export interface NormalizedError {
  message: string
  type: string
  stack?: string
  expected?: unknown
  actual?: unknown
  lineNumber?: number
  context?: {
    code?: string[]
    lineNumber?: number
    columnNumber?: number
  }
  stackFrames?: StackFrame[]
  assertion?: AssertionDetails
}

/**
 * Error extraction configuration
 */
export interface ErrorExtractionConfig {
  /** Default error type when none can be determined */
  defaultErrorType?: string
  /** Default error message when none is provided */
  defaultErrorMessage?: string
  /** Whether to extract line numbers from stack traces */
  extractLineFromStack?: boolean
  /** Maximum number of context lines to show before and after error */
  maxContextLines?: number
  /** Whether to include source code in error context */
  includeSourceCode?: boolean
  /** Whether to filter out node_modules from stack traces */
  filterNodeModules?: boolean
  /** Root directory for resolving relative paths */
  rootDir?: string
}

/**
 * Extracted test case information
 */
export interface ExtractedTestCase {
  name: string
  filepath: string
  startLine: number
  endLine: number
  suite?: string[]
  state: string
  mode?: string
  duration: number
  error?: unknown
}

/**
 * Test case extraction configuration
 */
export interface ExtractionConfig {
  /** Default values for missing properties */
  defaults?: {
    name?: string
    filepath?: string
    startLine?: number
    endLine?: number
    duration?: number
    state?: string
  }
}
