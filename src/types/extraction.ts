/**
 * Extraction Type Definitions
 *
 * This file contains type definitions for data extraction operations
 * used by the ErrorExtractor and TestCaseExtractor classes.
 *
 * @module extraction-types
 */
import type { StackFrame, AssertionDetails } from './schema.js'

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
    expected?: unknown
    actual?: unknown
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
  /** Maximum number of context lines to show around errors */
  maxContextLines?: number
  /** Whether to include source code in error context */
  includeSourceCode?: boolean
  /** Whether to filter out node_modules from stack traces */
  filterNodeModules?: boolean
  /** Root directory for resolving relative paths */
  rootDir?: string
}

/**
 * Stack frame information from error stack traces
 */
// StackFrame and AssertionDetails are unified in schema types

/**
 * Extracted test case information
 */
export interface ExtractedTestCase {
  id?: string
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

/**
 * Context extraction options for code snippets
 */
export interface ContextExtractionOptions {
  /** Maximum number of context lines to show around errors */
  maxContextLines?: number
  /** Whether to include line numbers in code output */
  includeLineNumbers?: boolean
  /** Whether to filter out node_modules from stack traces */
  filterNodeModules?: boolean
  /** Root directory for resolving relative paths */
  rootDir?: string
}
