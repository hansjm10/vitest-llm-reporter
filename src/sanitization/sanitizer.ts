/**
 * Pure Schema Sanitizer
 *
 * This module provides sanitization-only logic for LLM reporter output.
 * Assumes input has already been validated by SchemaValidator.
 *
 * @module sanitizer
 */

import type {
  LLMReporterOutput,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext,
  AssertionValue
} from '../types/schema'

import { sanitizeHtml, sanitizeCodeArray, createSafeObject } from '../utils/sanitization'

/**
 * Sanitization strategies for different output formats
 */
export enum SanitizationStrategy {
  HTML = 'html',
  JSON = 'json',
  MARKDOWN = 'markdown',
  NONE = 'none'
}

/**
 * Sanitization configuration
 */
export interface SanitizationConfig {
  strategy?: SanitizationStrategy
  sanitizeFilePaths?: boolean
  maxDepth?: number
}

/**
 * Default sanitization configuration
 */
export const DEFAULT_SANITIZATION_CONFIG: Required<SanitizationConfig> = {
  strategy: SanitizationStrategy.HTML,
  sanitizeFilePaths: false,
  maxDepth: 50
}

/**
 * Pure sanitization class - only sanitizes, assumes valid input
 *
 * This class is designed to work with pre-validated data from SchemaValidator.
 * It performs deep sanitization of all string content to prevent XSS and injection attacks.
 *
 * @example
 * ```typescript
 * const sanitizer = new SchemaSanitizer();
 * const sanitized = sanitizer.sanitize(validatedOutput);
 * ```
 */
export class SchemaSanitizer {
  private config: Required<SanitizationConfig>

  constructor(config: SanitizationConfig = {}) {
    this.config = { ...DEFAULT_SANITIZATION_CONFIG, ...config }
  }

  /**
   * Sanitizes validated LLM reporter output
   *
   * @param output - The validated output to sanitize
   * @returns A new sanitized copy of the output
   */
  public sanitize(output: LLMReporterOutput): LLMReporterOutput {
    // Use createSafeObject to prevent prototype pollution
    const safeOutput = createSafeObject(output as unknown as Record<string, unknown>)

    const sanitized: LLMReporterOutput = {
      summary: {
        ...(safeOutput.summary as Record<string, unknown>)
      } as LLMReporterOutput['summary']
    }

    if (safeOutput.failures && Array.isArray(safeOutput.failures)) {
      sanitized.failures = safeOutput.failures.map((failure) =>
        this.sanitizeTestFailure(failure as TestFailure)
      )
    }

    if (safeOutput.passed && Array.isArray(safeOutput.passed)) {
      sanitized.passed = safeOutput.passed.map((result) =>
        this.sanitizeTestResult(result as TestResult)
      )
    }

    if (safeOutput.skipped && Array.isArray(safeOutput.skipped)) {
      sanitized.skipped = safeOutput.skipped.map((result) =>
        this.sanitizeTestResult(result as TestResult)
      )
    }

    return sanitized
  }

  /**
   * Sanitizes a test failure object
   */
  private sanitizeTestFailure(failure: TestFailure): TestFailure {
    return {
      test: this.sanitizeString(failure.test),
      file: this.sanitizeFilePath(failure.file),
      startLine: failure.startLine,
      endLine: failure.endLine,
      suite: failure.suite?.map((s) => this.sanitizeString(s)),
      error: this.sanitizeTestError(failure.error)
    }
  }

  /**
   * Sanitizes a test error object
   */
  private sanitizeTestError(error: TestError): TestError {
    const sanitized: TestError = {
      message: this.sanitizeString(error.message),
      type: this.sanitizeString(error.type)
    }

    if (error.stack) {
      sanitized.stack = this.sanitizeString(error.stack)
    }

    if (error.context) {
      sanitized.context = this.sanitizeErrorContext(error.context)
    }

    return sanitized
  }

  /**
   * Sanitizes error context
   */
  private sanitizeErrorContext(context: ErrorContext): ErrorContext {
    const safeContext = createSafeObject(context as unknown as Record<string, unknown>)

    const sanitized: ErrorContext = {
      code: this.sanitizeCodeLines(safeContext.code as string[])
    }

    if (safeContext.expected !== undefined) {
      sanitized.expected = this.sanitizeAssertionValue(safeContext.expected as AssertionValue)
    }

    if (safeContext.actual !== undefined) {
      sanitized.actual = this.sanitizeAssertionValue(safeContext.actual as AssertionValue)
    }

    if (safeContext.lineNumber !== undefined) {
      sanitized.lineNumber = safeContext.lineNumber as number
    }

    if (safeContext.columnNumber !== undefined) {
      sanitized.columnNumber = safeContext.columnNumber as number
    }

    return sanitized
  }

  /**
   * Sanitizes a test result object
   */
  private sanitizeTestResult(result: TestResult): TestResult {
    return {
      test: this.sanitizeString(result.test),
      file: this.sanitizeFilePath(result.file),
      startLine: result.startLine,
      endLine: result.endLine,
      duration: result.duration,
      status: result.status,
      suite: result.suite?.map((s) => this.sanitizeString(s))
    }
  }

  /**
   * Sanitizes an assertion value
   */
  private sanitizeAssertionValue(value: AssertionValue, depth: number = 0): AssertionValue {
    if (depth > this.config.maxDepth) {
      return '[Max depth exceeded]'
    }

    if (value === null || value === undefined) {
      return value
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value)
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeAssertionValue(item as AssertionValue, depth + 1))
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(value)) {
        // Sanitize keys as well to prevent injection
        const sanitizedKey = this.sanitizeString(key)
        sanitized[sanitizedKey] = this.sanitizeAssertionValue(val as AssertionValue, depth + 1)
      }
      return sanitized
    }

    return value
  }

  /**
   * Sanitizes a string based on the configured strategy
   */
  private sanitizeString(str: string): string {
    switch (this.config.strategy) {
      case SanitizationStrategy.HTML:
        return sanitizeHtml(str)
      case SanitizationStrategy.JSON:
        // JSON escaping - escape quotes and control characters
        return str
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
      case SanitizationStrategy.MARKDOWN:
        // Markdown escaping - escape special markdown characters
        return str
          .replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      case SanitizationStrategy.NONE:
        return str
      default:
        return sanitizeHtml(str)
    }
  }

  /**
   * Sanitizes code lines
   */
  private sanitizeCodeLines(lines: string[]): string[] {
    if (this.config.strategy === SanitizationStrategy.NONE) {
      return lines
    }
    return sanitizeCodeArray(lines)
  }

  /**
   * Sanitizes file paths
   */
  private sanitizeFilePath(filePath: string): string {
    if (!this.config.sanitizeFilePaths) {
      return filePath
    }
    // Remove user-specific information from paths
    return filePath.replace(/\/(?:Users|home)\/[^/]+/, '/Users/***')
  }
}
