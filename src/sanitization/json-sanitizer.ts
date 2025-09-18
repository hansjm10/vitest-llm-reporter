/**
 * JSON Sanitizer for Vitest LLM Reporter
 *
 * This module provides JSON-specific sanitization for the LLM reporter output.
 * It ensures all strings are properly escaped for valid JSON while maintaining
 * readability for LLM consumption.
 *
 * @module json-sanitizer
 */

import type {
  LLMReporterOutput,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext,
  AssertionValue,
  AssertionDetails,
  StackFrame,
  ConsoleEvent,
  RuntimeEnvironmentSummary
} from '../types/schema.js'
import type { JsonSanitizerConfig } from './types.js'

import { escapeJsonString, escapeJsonArray, createSafeObject } from '../utils/sanitization.js'

// Re-export types for public API
export type { JsonSanitizerConfig } from './types.js'

/**
 * Default sanitization configuration
 */
export const DEFAULT_JSON_SANITIZER_CONFIG: Required<JsonSanitizerConfig> = {
  sanitizeFilePaths: false,
  maxDepth: 50
}

/**
 * JSON sanitizer for LLM reporter output
 *
 * This class ensures all string content is properly escaped for JSON output
 * while preventing prototype pollution and other security issues.
 *
 * @example
 * ```typescript
 * const sanitizer = new JsonSanitizer();
 * const sanitized = sanitizer.sanitize(validatedOutput);
 * ```
 */
export class JsonSanitizer {
  private config: Required<JsonSanitizerConfig>

  constructor(config: JsonSanitizerConfig = {}) {
    this.config = { ...DEFAULT_JSON_SANITIZER_CONFIG, ...config }
  }

  /**
   * Sanitizes validated LLM reporter output for JSON serialization
   *
   * @param output - The validated output to sanitize
   * @returns A new sanitized copy of the output
   */
  public sanitize(output: LLMReporterOutput): LLMReporterOutput {
    // Use createSafeObject to prevent prototype pollution
    const safeOutput = createSafeObject(output as unknown as Record<string, unknown>)

    const summary = createSafeObject(safeOutput.summary as Record<string, unknown>)

    const sanitizedSummary: LLMReporterOutput['summary'] = {
      total: summary.total as number,
      passed: summary.passed as number,
      failed: summary.failed as number,
      skipped: summary.skipped as number,
      duration: summary.duration as number,
      timestamp: escapeJsonString(String(summary.timestamp))
    }

    if (summary.environment) {
      sanitizedSummary.environment = this.sanitizeEnvironment(
        summary.environment as RuntimeEnvironmentSummary
      )
    }

    const sanitized: LLMReporterOutput = {
      summary: sanitizedSummary
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
    const result: TestFailure = {
      test: escapeJsonString(failure.test),
      fileRelative: this.sanitizeFilePath(failure.fileRelative),
      startLine: failure.startLine,
      endLine: failure.endLine,
      error: this.sanitizeTestError(failure.error)
    }

    if (failure.fileAbsolute) {
      result.fileAbsolute = this.sanitizeFilePath(failure.fileAbsolute)
    }

    if (failure.suite) {
      result.suite = failure.suite.map((s) => escapeJsonString(s))
    }

    if (failure.consoleEvents) {
      result.consoleEvents = failure.consoleEvents.map((event) => this.sanitizeConsoleEvent(event))
    }

    return result
  }

  /**
   * Sanitizes a test error object
   */
  private sanitizeTestError(error: TestError): TestError {
    const sanitized: TestError = {
      message: escapeJsonString(error.message),
      type: escapeJsonString(error.type)
    }

    if (error.stack) {
      sanitized.stack = escapeJsonString(error.stack)
    }

    if (error.stackFrames) {
      sanitized.stackFrames = error.stackFrames.map((frame) => this.sanitizeStackFrame(frame))
    }

    if (error.context) {
      sanitized.context = this.sanitizeErrorContext(error.context)
    }

    if (error.assertion) {
      sanitized.assertion = this.sanitizeAssertionDetails(error.assertion)
    }

    return sanitized
  }

  /**
   * Sanitizes a stack frame object
   */
  private sanitizeStackFrame(frame: StackFrame): StackFrame {
    const sanitized: StackFrame = {
      fileRelative: this.sanitizeFilePath(frame.fileRelative),
      line: frame.line,
      inProject: frame.inProject,
      inNodeModules: frame.inNodeModules
    }

    if (frame.column !== undefined) {
      sanitized.column = frame.column
    }

    if (frame.function) {
      sanitized.function = escapeJsonString(frame.function)
    }

    if (frame.fileAbsolute) {
      sanitized.fileAbsolute = this.sanitizeFilePath(frame.fileAbsolute)
    }

    return sanitized
  }

  /**
   * Sanitizes error context
   */
  private sanitizeErrorContext(context: ErrorContext): ErrorContext {
    const safeContext = createSafeObject(context as unknown as Record<string, unknown>)

    const sanitized: ErrorContext = {
      code: escapeJsonArray(safeContext.code as string[])
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
    const sanitized: TestResult = {
      test: escapeJsonString(result.test),
      fileRelative: this.sanitizeFilePath(result.fileRelative),
      startLine: result.startLine,
      endLine: result.endLine,
      status: result.status
    }

    if (result.fileAbsolute) {
      sanitized.fileAbsolute = this.sanitizeFilePath(result.fileAbsolute)
    }

    if (result.duration !== undefined) {
      sanitized.duration = result.duration
    }

    if (result.suite) {
      sanitized.suite = result.suite.map((s) => escapeJsonString(s))
    }

    return sanitized
  }

  /**
   * Sanitizes assertion details
   */
  private sanitizeAssertionDetails(assertion: AssertionDetails): AssertionDetails {
    const sanitized: AssertionDetails = {
      expected: this.sanitizeAssertionValue(assertion.expected),
      actual: this.sanitizeAssertionValue(assertion.actual)
    }

    if (assertion.operator) {
      sanitized.operator = escapeJsonString(assertion.operator)
    }

    // Pass through type metadata unchanged
    if (assertion.expectedType) {
      sanitized.expectedType = assertion.expectedType
    }

    if (assertion.actualType) {
      sanitized.actualType = assertion.actualType
    }

    return sanitized
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
      return escapeJsonString(value)
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
        const sanitizedKey = escapeJsonString(key)
        sanitized[sanitizedKey] = this.sanitizeAssertionValue(val as AssertionValue, depth + 1)
      }
      return sanitized
    }

    return value
  }

  /**
   * Sanitizes a console event
   */
  private sanitizeConsoleEvent(event: ConsoleEvent): ConsoleEvent {
    const sanitized: ConsoleEvent = {
      level: event.level,
      message: escapeJsonString(event.message)
    }

    if (event.timestampMs !== undefined) {
      sanitized.timestampMs = event.timestampMs
    }

    if (event.args) {
      sanitized.args = event.args.map((arg) => escapeJsonString(arg))
    }

    if (event.origin) {
      sanitized.origin = event.origin
    }

    return sanitized
  }

  /**
   * Sanitizes file paths
   */
  private sanitizeFilePath(filePath: string): string {
    const escapedPath = escapeJsonString(filePath)

    if (!this.config.sanitizeFilePaths) {
      return escapedPath
    }

    // Remove user-specific information from paths
    // Handle paths with or without leading slash
    return escapedPath.replace(/(?:^|\/)(?:Users|home)\/[^/]+/, (match) =>
      match.startsWith('/') ? '/Users/***' : 'Users/***'
    )
  }

  private sanitizeEnvironment(environment: RuntimeEnvironmentSummary): RuntimeEnvironmentSummary {
    const safeEnv = createSafeObject(environment as unknown as Record<string, unknown>)
    const osRaw = createSafeObject(safeEnv.os as Record<string, unknown>)
    const nodeRaw = createSafeObject(safeEnv.node as Record<string, unknown>)

    const toSanitizedString = (value: unknown): string => (typeof value === 'string' ? value : '')

    const sanitized: RuntimeEnvironmentSummary = {
      os: {
        platform: escapeJsonString(toSanitizedString(osRaw.platform)),
        release: escapeJsonString(toSanitizedString(osRaw.release)),
        arch: escapeJsonString(toSanitizedString(osRaw.arch))
      },
      node: {
        version: escapeJsonString(toSanitizedString(nodeRaw.version))
      }
    }

    if (osRaw.version !== undefined) {
      sanitized.os.version = escapeJsonString(toSanitizedString(osRaw.version))
    }

    if (nodeRaw.runtime !== undefined) {
      sanitized.node.runtime = escapeJsonString(toSanitizedString(nodeRaw.runtime))
    }

    if (safeEnv.vitest) {
      const vitestRaw = createSafeObject(safeEnv.vitest as Record<string, unknown>)
      const version = vitestRaw.version
      if (version !== undefined) {
        sanitized.vitest = {
          version: escapeJsonString(toSanitizedString(version))
        }
      }
    }

    if (safeEnv.ci !== undefined) {
      sanitized.ci = Boolean(safeEnv.ci)
    }

    if (safeEnv.packageManager !== undefined) {
      sanitized.packageManager = escapeJsonString(toSanitizedString(safeEnv.packageManager))
    }

    return sanitized
  }
}
