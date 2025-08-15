/**
 * Extraction Type Definitions
 *
 * This file contains type definitions for data extraction operations
 * used by the ErrorExtractor and TestCaseExtractor classes.
 *
 * @module extraction-types
 */

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
    code?: string
    line?: number
    column?: number
  }
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
