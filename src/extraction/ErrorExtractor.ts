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
  normalizeAssertionValue,
  extractStringProperty,
  extractNumberProperty
} from '../utils/type-guards.js'
import { extractLineNumber } from '../reporter/helpers.js'
import { ContextExtractor } from './ContextExtractor.js'
import type {
  NormalizedError,
  ErrorExtractionConfig,
  StackFrame,
  AssertionDetails
} from '../types/extraction'
import type { ErrorContext } from '../types/schema.js'

/**
 * Default error extraction configuration
 *
 * @example
 * ```typescript
 * import { DEFAULT_ERROR_CONFIG } from './extraction/ErrorExtractor'
 *
 * const customConfig = {
 *   ...DEFAULT_ERROR_CONFIG,
 *   maxContextLines: 5
 * }
 * ```
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
      // Prefer parsed stack frame line for accuracy
      const frame = this.contextExtractor.extractFirstRelevantFrame(extracted.stack)
      if (frame && typeof frame.line === 'number') {
        return frame.line
      }
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

    // Extract code context with proper typing (do not merge assertion values here)
    const codeContext = this.extractCodeContext(filePath, lineNumber, columnNumber, stackFrames)

    // Build final error object
    return {
      ...basicError,
      stackFrames: stackFrames.length > 0 ? stackFrames : undefined,
      // Provide only raw code/position context; assertion enrichment happens in ErrorContextBuilder
      context: codeContext ?? basicError.context,
      assertion: this.buildAssertionDetails(basicError, error)
    }
  }

  /**
   * Extracts code context from error information
   */
  private extractCodeContext(
    filePath: string | undefined,
    lineNumber: number | undefined,
    columnNumber: number | undefined,
    stackFrames: StackFrame[]
  ): ErrorContext | undefined {
    // Try to get context - prefer direct file/line info, otherwise use first stack frame
    if (filePath && lineNumber) {
      // If we have direct file and line info, use them
      return this.contextExtractor.extractCodeContext(filePath, lineNumber, columnNumber)
    }

    if (stackFrames.length > 0) {
      // Otherwise use the first relevant stack frame
      const firstFrame = stackFrames[0]
      return this.contextExtractor.extractCodeContext(
        firstFrame.file,
        firstFrame.line,
        firstFrame.column
      )
    }

    return undefined
  }

  /**
   * Merges context sources with clear priority rules:
   * 1. Fresh code context (from file extraction)
   * 2. Existing error context (from error object)
   * 3. Assertion-only context (when only test values available)
   */
  // Note: Assertion values are intentionally not merged into context here.
  // ErrorContextBuilder is responsible for enriching context with expected/actual
  // to keep a single point of truth for context shaping.

  /**
   * Builds assertion details if present
   */
  private buildAssertionDetails(
    basicError: NormalizedError,
    error: unknown
  ): AssertionDetails | undefined {
    if (basicError.expected !== undefined || basicError.actual !== undefined) {
      return {
        expected: basicError.expected,
        actual: basicError.actual,
        operator: this.extractOperator(error)
      }
    }
    return undefined
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
   * Gets file path from error using safe property extraction
   */
  private getFilePath(error: unknown): string | undefined {
    // Check multiple possible property names for file path
    const candidates = ['file', 'fileName', 'filename', 'filepath', 'path'] as const
    return extractStringProperty(error, candidates)
  }

  /**
   * Gets line number from error using safe property extraction
   */
  private getLineNumber(error: unknown): number | undefined {
    // Check multiple possible property names for line number
    const candidates = ['line', 'lineNumber', 'lineno', 'lineNo'] as const
    // Line numbers must be positive (> 0)
    return extractNumberProperty(error, candidates, (n) => n > 0)
  }

  /**
   * Gets column number from error using safe property extraction
   */
  private getColumnNumber(error: unknown): number | undefined {
    // Check multiple possible property names for column number
    const candidates = ['column', 'columnNumber', 'col', 'colno', 'columnNo'] as const
    // Column numbers can be 0 (first column), so we check >= 0
    return extractNumberProperty(error, candidates, (n) => n >= 0)
  }

  /**
   * Extracts operator from assertion error using safe property extraction
   */
  private extractOperator(error: unknown): string | undefined {
    // Check multiple possible property names for assertion operator
    const candidates = ['operator', 'matcherName', 'assertion', 'matcher', 'op'] as const
    return extractStringProperty(error, candidates)
  }
}
