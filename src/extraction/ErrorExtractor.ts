/**
 * Error Data Extractor
 *
 * Specializes in extracting and normalizing error information from
 * test failures, handling various error formats and edge cases.
 *
 * @module extraction
 */

import {
  extractErrorProperties,
  ExtractedError,
  isAssertionError,
  normalizeAssertionValue
} from '../utils/type-guards'
import { extractLineNumber } from '../reporter/helpers'
import { ContextExtractor } from './ContextExtractor'
import type {
  NormalizedError,
  ErrorExtractionConfig,
  StackFrame,
  AssertionDetails
} from '../types/extraction'

/**
 * Default error extraction configuration
 */
export const DEFAULT_ERROR_CONFIG: Required<ErrorExtractionConfig> = {
  defaultErrorType: 'Error',
  defaultErrorMessage: 'Unknown error',
  extractLineFromStack: true,
  maxContextLines: 3,
  includeSourceCode: true,
  filterNodeModules: true,
  rootDir: process.cwd()
}

/**
 * Extracts and normalizes error information
 *
 * This class handles the complexity of extracting meaningful error
 * information from various error object formats, including Vitest
 * errors, standard JavaScript errors, and assertion errors.
 *
 * @example
 * ```typescript
 * const extractor = new ErrorExtractor();
 * const normalized = extractor.extract(rawError);
 * ```
 */
export class ErrorExtractor {
  private config: Required<ErrorExtractionConfig>
  private contextExtractor: ContextExtractor

  constructor(config: ErrorExtractionConfig = {}) {
    this.config = { ...DEFAULT_ERROR_CONFIG, ...config }
    this.contextExtractor = new ContextExtractor({
      maxContextLines: this.config.maxContextLines,
      includeLineNumbers: true,
      filterNodeModules: this.config.filterNodeModules,
      rootDir: this.config.rootDir
    })
  }

  /**
   * Extracts and normalizes error information
   *
   * @param error - The raw error object
   * @returns Normalized error information
   */
  public extract(error: unknown): NormalizedError {
    if (!error || typeof error !== 'object') {
      return this.createDefaultError()
    }

    const extracted = extractErrorProperties(error)

    return {
      message: this.extractMessage(extracted),
      type: this.extractType(extracted),
      stack: extracted.stack,
      expected: extracted.expected,
      actual: extracted.actual,
      lineNumber: this.extractLineNumber(extracted),
      context: this.extractContext(extracted)
    }
  }

  /**
   * Creates a default error when no valid error is provided
   */
  private createDefaultError(): NormalizedError {
    return {
      message: this.config.defaultErrorMessage,
      type: this.config.defaultErrorType
    }
  }

  /**
   * Extracts the error message
   */
  private extractMessage(extracted: ExtractedError): string {
    return extracted.message ?? this.config.defaultErrorMessage
  }

  /**
   * Extracts the error type with multiple fallback strategies
   */
  private extractType(extracted: ExtractedError): string {
    // Priority order: name, type, constructorName, default
    if (extracted.name) {
      return extracted.name
    }

    if (extracted.type) {
      return extracted.type
    }

    if (extracted.constructorName && extracted.constructorName !== 'Object') {
      return extracted.constructorName
    }

    return this.config.defaultErrorType
  }

  /**
   * Extracts the line number from various sources
   */
  private extractLineNumber(extracted: ExtractedError): number | undefined {
    // Direct line number takes priority
    if (extracted.lineNumber !== undefined) {
      return extracted.lineNumber
    }

    // Try to extract from stack trace if configured
    if (this.config.extractLineFromStack && extracted.stack) {
      return extractLineNumber(extracted.stack)
    }

    // Check if context has line information
    if (extracted.context?.line !== undefined) {
      return extracted.context.line
    }

    return undefined
  }

  /**
   * Extracts error context information
   */
  private extractContext(extracted: ExtractedError): NormalizedError['context'] | undefined {
    if (!extracted.context) {
      return undefined
    }

    const context: NormalizedError['context'] = {}

    if (extracted.context.code) {
      // Handle old format where code might be a string
      context.code = Array.isArray(extracted.context.code)
        ? extracted.context.code
        : [extracted.context.code]
    }

    if (extracted.context.line !== undefined) {
      context.lineNumber = extracted.context.line
    }

    if (extracted.context.column !== undefined) {
      context.columnNumber = extracted.context.column
    }

    // Only return context if it has at least one property
    return Object.keys(context).length > 0 ? context : undefined
  }

  /**
   * Checks if the error has location information
   */
  public hasLocationInfo(error: NormalizedError): boolean {
    return error.lineNumber !== undefined || error.context?.lineNumber !== undefined
  }

  /**
   * Merges multiple errors into a single normalized error
   * Useful for aggregating multiple error sources
   */
  public merge(primary: NormalizedError, secondary: NormalizedError): NormalizedError {
    return {
      message: primary.message || secondary.message,
      type: primary.type || secondary.type,
      stack: primary.stack || secondary.stack,
      expected: primary.expected ?? secondary.expected,
      actual: primary.actual ?? secondary.actual,
      lineNumber: primary.lineNumber ?? secondary.lineNumber,
      context: primary.context || secondary.context
    }
  }

  /**
   * Formats an error for display
   */
  public format(error: NormalizedError): string {
    const parts: string[] = [`${error.type}: ${error.message}`]

    if (error.lineNumber !== undefined) {
      parts.push(`  at line ${error.lineNumber}`)
    }

    if (isAssertionError(error)) {
      parts.push(`  Expected: ${JSON.stringify(normalizeAssertionValue(error.expected))}`)
      parts.push(`  Actual: ${JSON.stringify(normalizeAssertionValue(error.actual))}`)
    }

    return parts.join('\n')
  }

  /**
   * Extracts error with full context including code snippets
   */
  public extractWithContext(error: unknown): NormalizedError {
    const basicError = this.extract(error)

    if (!this.config.includeSourceCode) {
      return basicError
    }

    // Get error details
    const stack = this.getStackString(error)
    const filePath = this.getFilePath(error)
    const lineNumber = this.getLineNumber(error)
    const columnNumber = this.getColumnNumber(error)

    // Parse stack trace to get frames
    const stackFrames = this.contextExtractor.parseStackTrace(stack)
    
    // Try to get context - prefer direct file/line info, otherwise use first stack frame
    let context: any = undefined
    
    if (filePath && lineNumber) {
      // If we have direct file and line info, use them
      context = this.contextExtractor.extractCodeContext(filePath, lineNumber, columnNumber)
    } else if (stackFrames.length > 0) {
      // Otherwise use the first relevant stack frame
      const firstFrame = stackFrames[0]
      context = this.contextExtractor.extractCodeContext(firstFrame.file, firstFrame.line, firstFrame.column)
    }

    // Merge context with assertion details if present
    const finalContext = context
      ? {
          code: context.code,
          lineNumber: context.lineNumber,
          columnNumber: context.columnNumber,
          expected: basicError.expected,
          actual: basicError.actual
        }
      : basicError.context
        ? {
            ...basicError.context,
            expected: basicError.expected,
            actual: basicError.actual
          }
        : undefined

    return {
      ...basicError,
      stackFrames: stackFrames.length > 0 ? stackFrames : undefined,
      context: finalContext,
      assertion: basicError.expected !== undefined || basicError.actual !== undefined
        ? {
            expected: basicError.expected,
            actual: basicError.actual,
            operator: this.extractOperator(error)
          }
        : undefined
    }
  }

  /**
   * Extracts stack frames from an error
   */
  public extractStackFrames(error: unknown): { stackFrames?: StackFrame[] } {
    const stack = this.getStackString(error)
    const stackFrames = this.contextExtractor.parseStackTrace(stack)
    // Return empty array for malformed stack traces to match test expectations
    return { stackFrames: stackFrames.length > 0 ? stackFrames : [] }
  }

  /**
   * Extracts assertion details from an error
   */
  public extractAssertionDetails(error: unknown): { assertion?: AssertionDetails } {
    if (!error || typeof error !== 'object') {
      return {}
    }

    const extracted = extractErrorProperties(error)

    if (extracted.expected !== undefined || extracted.actual !== undefined) {
      return {
        assertion: {
          expected: extracted.expected,
          actual: extracted.actual,
          operator: this.extractOperator(error)
        }
      }
    }

    return {}
  }

  /**
   * Gets stack string from error
   */
  private getStackString(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return ''
    }

    const extracted = extractErrorProperties(error)
    return extracted.stack || ''
  }

  /**
   * Gets file path from error
   */
  private getFilePath(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined
    }

    const errorObj = error as Record<string, unknown>
    const file = errorObj.file || errorObj.fileName || errorObj.filename
    return typeof file === 'string' ? file : undefined
  }

  /**
   * Gets line number from error
   */
  private getLineNumber(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined
    }

    const errorObj = error as Record<string, unknown>
    const line = errorObj.line || errorObj.lineNumber || errorObj.lineno
    return typeof line === 'number' ? line : undefined
  }

  /**
   * Gets column number from error
   */
  private getColumnNumber(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined
    }

    const errorObj = error as Record<string, unknown>
    const column = errorObj.column || errorObj.columnNumber
    return typeof column === 'number' ? column : undefined
  }

  /**
   * Extracts operator from assertion error
   */
  private extractOperator(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined
    }

    const errorObj = error as Record<string, unknown>
    const operator = errorObj.operator || errorObj.matcherName || errorObj.assertion
    return typeof operator === 'string' ? operator : undefined
  }
}
