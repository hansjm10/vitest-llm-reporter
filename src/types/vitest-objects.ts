/**
 * Vitest Object Types
 * 
 * Type definitions for extracted data from Vitest reporter hooks.
 * While Vitest exports File and Test types, we validate and extract
 * only the properties we need at runtime.
 * 
 * @module vitest-objects
 */

/**
 * Structured error information extracted from Vitest errors
 */
export interface ExtractedError {
  message?: string
  name?: string
  type?: string
  stack?: string
  expected?: unknown
  actual?: unknown
  lineNumber?: number
  constructorName?: string
  context?: VitestErrorContext
}

/**
 * Error context information extracted from Vitest errors
 * This is different from the schema's ErrorContext which is for output
 */
export interface VitestErrorContext {
  code?: string
  line?: number
  column?: number
}