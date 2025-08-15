/**
 * Error Context Builder
 *
 * Builds error context objects for test failures, handling different
 * types of error contexts (assertions, code snippets, etc.).
 *
 * @module builders
 */

import type { ErrorContext, AssertionValue } from '../types/schema'
import type { NormalizedError } from '../extraction/ErrorExtractor'

/**
 * Error context builder configuration
 */
export interface ErrorContextConfig {
  /** Maximum number of code lines to include */
  maxCodeLines?: number
  /** Whether to include line numbers in context */
  includeLineNumbers?: boolean
}

/**
 * Default error context configuration
 */
export const DEFAULT_CONTEXT_CONFIG: Required<ErrorContextConfig> = {
  maxCodeLines: 10,
  includeLineNumbers: true
}

/**
 * Builds error context objects
 *
 * This class constructs error context objects that provide additional
 * information about test failures, including assertions, code snippets,
 * and location information.
 *
 * @example
 * ```typescript
 * const builder = new ErrorContextBuilder();
 * const context = builder.buildFromError(normalizedError);
 * ```
 */
export class ErrorContextBuilder {
  private config: Required<ErrorContextConfig>

  constructor(config: ErrorContextConfig = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  }

  /**
   * Builds error context from a normalized error
   */
  public buildFromError(error: NormalizedError): ErrorContext | undefined {
    // Check if this is an assertion error
    if (this.isAssertionError(error)) {
      return this.buildAssertionContext(error)
    }

    // Check if we have code context from Vitest
    if (error.context) {
      return this.buildCodeContext(error)
    }

    // If we only have a line number, create minimal context
    if (error.lineNumber !== undefined && this.config.includeLineNumbers) {
      return {
        code: [],
        lineNumber: error.lineNumber
      }
    }

    return undefined
  }

  /**
   * Checks if an error is an assertion error
   */
  private isAssertionError(error: NormalizedError): boolean {
    return error.expected !== undefined || error.actual !== undefined
  }

  /**
   * Builds context for assertion errors
   */
  private buildAssertionContext(error: NormalizedError): ErrorContext {
    const context: ErrorContext = {
      code: []
    }

    // Add expected and actual values
    if (error.expected !== undefined) {
      context.expected = this.normalizeAssertionValue(error.expected)
    }

    if (error.actual !== undefined) {
      context.actual = this.normalizeAssertionValue(error.actual)
    }

    // Add line number if available
    if (error.lineNumber !== undefined && this.config.includeLineNumbers) {
      context.lineNumber = error.lineNumber
    }

    return context
  }

  /**
   * Builds context from Vitest error context
   */
  private buildCodeContext(error: NormalizedError): ErrorContext {
    const context: ErrorContext = {
      code: []
    }

    // Add code snippet if available
    if (error.context?.code) {
      const codeLines = this.splitCodeLines(error.context.code)
      context.code = this.limitCodeLines(codeLines)
    }

    // Add line number from context or error
    const lineNumber = error.context?.line ?? error.lineNumber
    if (lineNumber !== undefined && this.config.includeLineNumbers) {
      context.lineNumber = lineNumber
    }

    return context
  }

  /**
   * Normalizes assertion values to schema-compatible types
   */
  private normalizeAssertionValue(value: unknown): AssertionValue {
    // Handle primitive types directly
    if (value === null || value === undefined) {
      return value
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value as unknown[]
    }

    // Handle objects
    if (typeof value === 'object') {
      return value as Record<string, unknown>
    }

    // Fallback: convert to string representation
    try {
      return JSON.stringify(value)
    } catch {
      return '[object]'
    }
  }

  /**
   * Splits code into lines
   */
  private splitCodeLines(code: string): string[] {
    return code.split('\n').filter((line) => line.trim().length > 0)
  }

  /**
   * Limits the number of code lines
   */
  private limitCodeLines(lines: string[]): string[] {
    if (lines.length <= this.config.maxCodeLines) {
      return lines
    }

    // Take first half and last half of allowed lines
    const halfLimit = Math.floor(this.config.maxCodeLines / 2)
    const firstHalf = lines.slice(0, halfLimit)
    const lastHalf = lines.slice(-halfLimit)

    return [
      ...firstHalf,
      '...', // Indicate truncation
      ...lastHalf
    ]
  }

  /**
   * Merges multiple error contexts
   */
  public merge(primary: ErrorContext, secondary: ErrorContext): ErrorContext {
    const merged: ErrorContext = {
      code: [...primary.code, ...secondary.code]
    }

    // Prefer primary values but fall back to secondary
    if (primary.expected !== undefined) {
      merged.expected = primary.expected
    } else if (secondary.expected !== undefined) {
      merged.expected = secondary.expected
    }

    if (primary.actual !== undefined) {
      merged.actual = primary.actual
    } else if (secondary.actual !== undefined) {
      merged.actual = secondary.actual
    }

    if (primary.lineNumber !== undefined) {
      merged.lineNumber = primary.lineNumber
    } else if (secondary.lineNumber !== undefined) {
      merged.lineNumber = secondary.lineNumber
    }

    // Apply code line limit to merged result
    merged.code = this.limitCodeLines(merged.code)

    return merged
  }

  /**
   * Validates error context
   */
  public validate(context: ErrorContext): boolean {
    // Check code array
    if (!Array.isArray(context.code)) {
      return false
    }

    // Check that all code entries are strings
    if (!context.code.every((line) => typeof line === 'string')) {
      return false
    }

    // Check line number if present
    if (context.lineNumber !== undefined) {
      if (typeof context.lineNumber !== 'number' || context.lineNumber < 0) {
        return false
      }
    }

    return true
  }

  /**
   * Creates an empty error context
   */
  public createEmpty(): ErrorContext {
    return { code: [] }
  }

  /**
   * Updates builder configuration
   */
  public updateConfig(config: ErrorContextConfig): void {
    this.config = { ...this.config, ...config }
  }
}
