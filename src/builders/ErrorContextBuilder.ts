/**
 * Error Context Builder
 *
 * Builds error context objects for test failures, handling different
 * types of error contexts (assertions, code snippets, etc.).
 *
 * @module builders
 */

import type { ErrorContext } from '../types/schema.js'
import type { NormalizedError } from '../types/extraction.js'
import type { ErrorContextConfig } from './types.js'
import { isAssertionError } from '../utils/type-guards.js'

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
    // Check if we have code context first (prioritize actual code snippets)
    if (error.context) {
      return this.buildCodeContext(error)
    }

    // If no code context but is an assertion error, build assertion context
    if (isAssertionError(error)) {
      return this.buildAssertionContext(error)
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
   * Builds context for assertion errors
   */
  private buildAssertionContext(error: NormalizedError): ErrorContext {
    const context: ErrorContext = {
      code: []
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
      // error.context.code is already an array of strings
      context.code = this.limitCodeLines(error.context.code)
    }

    // Add line number from context or error
    const lineNumber = error.context?.lineNumber ?? error.lineNumber
    if (lineNumber !== undefined && this.config.includeLineNumbers) {
      context.lineNumber = lineNumber
    }

    // Add column number from context
    const columnNumber = error.context?.columnNumber
    if (columnNumber !== undefined && this.config.includeLineNumbers) {
      context.columnNumber = columnNumber
    }

    return context
  }

  /**
   * Splits code into lines
   */
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
    if (primary.lineNumber !== undefined) {
      merged.lineNumber = primary.lineNumber
    } else if (secondary.lineNumber !== undefined) {
      merged.lineNumber = secondary.lineNumber
    }

    if (primary.columnNumber !== undefined) {
      merged.columnNumber = primary.columnNumber
    } else if (secondary.columnNumber !== undefined) {
      merged.columnNumber = secondary.columnNumber
    }

    // Apply code line limit to merged result
    merged.code = this.limitCodeLines(merged.code)

    return merged
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
