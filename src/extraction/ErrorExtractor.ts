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
import type { NormalizedError, ErrorExtractionConfig } from '../types/extraction'

/**
 * Default error extraction configuration
 */
export const DEFAULT_ERROR_CONFIG: Required<ErrorExtractionConfig> = {
  defaultErrorType: 'Error',
  defaultErrorMessage: 'Unknown error',
  extractLineFromStack: true
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

  constructor(config: ErrorExtractionConfig = {}) {
    this.config = { ...DEFAULT_ERROR_CONFIG, ...config }
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
      context.code = extracted.context.code
    }

    if (extracted.context.line !== undefined) {
      context.line = extracted.context.line
    }

    if (extracted.context.column !== undefined) {
      context.column = extracted.context.column
    }

    // Only return context if it has at least one property
    return Object.keys(context).length > 0 ? context : undefined
  }

  /**
   * Checks if the error has location information
   */
  public hasLocationInfo(error: NormalizedError): boolean {
    return error.lineNumber !== undefined || error.context?.line !== undefined
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
}
