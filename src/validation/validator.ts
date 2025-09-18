/**
 * Pure Schema Validator
 *
 * This module provides validation-only logic for LLM reporter output.
 * No sanitization is performed here - that's handled by the SchemaSanitizer.
 *
 * @module validator
 */

import type {
  LLMReporterOutput,
  TestSummary,
  TestBase,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext,
  AssertionValue,
  RuntimeEnvironmentSummary
} from '../types/schema.js'
import type { ValidationConfig, ValidationError, ValidationResult } from './types.js'

import { validateFilePath, createSafeObject } from '../utils/sanitization.js'
import { hasProperty } from '../utils/type-guards.js'

import { ErrorMessages, BYTES_PER_MB, MAX_TIMESTAMP_LENGTH, MAX_ARRAY_SIZE } from './errors.js'

// Re-export types for public API
export type { ValidationConfig, ValidationError, ValidationResult } from './types.js'

/**
 * Default validation configuration
 */
export const DEFAULT_CONFIG: Required<ValidationConfig> = {
  maxCodeLines: 100,
  maxTotalCodeSize: BYTES_PER_MB, // 1MB
  maxStringLength: 10000,
  maxFailures: 1000,
  maxPassed: 10000,
  maxSkipped: 10000,
  minLineNumber: 1,
  minColumnNumber: 0,
  minDuration: 0
}

/**
 * Internal validation context for stateless validation
 *
 * Note: Each validate() call creates its own context instance, ensuring thread-safety.
 * The totalCodeSize field is accumulated throughout validation but mutations are minimized:
 * - Size calculations happen upfront before any context mutations
 * - totalCodeSize is only updated after all validations pass
 * - This pattern reduces mutation points and simplifies the validation flow
 */
interface ValidationContext {
  totalCodeSize: number
  errors: ValidationError[]
  config: Required<ValidationConfig>
}

/**
 * Optimized ISO 8601 regex pattern - compiled once for performance
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

/**
 * Pure validation class - only validates, no sanitization
 *
 * Each validation operation is isolated and doesn't share mutable state.
 * Safe for concurrent operations.
 *
 * @example
 * ```typescript
 * const validator = new SchemaValidator();
 * const result = validator.validate(testOutput);
 * if (result.valid) {
 *   // Valid output: result.data
 * } else {
 *   // Validation errors: result.errors
 * }
 * ```
 */
export class SchemaValidator {
  private config: Required<ValidationConfig>

  constructor(config: ValidationConfig = {}) {
    this.validateConfig(config)
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Validates configuration values
   */
  private validateConfig(config: ValidationConfig): void {
    if (config.maxCodeLines !== undefined && config.maxCodeLines < 1) {
      throw new Error('maxCodeLines must be positive')
    }
    if (config.maxTotalCodeSize !== undefined && config.maxTotalCodeSize < 1) {
      throw new Error('maxTotalCodeSize must be positive')
    }
    if (config.maxStringLength !== undefined && config.maxStringLength < 1) {
      throw new Error('maxStringLength must be positive')
    }
    if (config.maxFailures !== undefined && config.maxFailures < 0) {
      throw new Error('maxFailures must be non-negative')
    }
    if (config.maxPassed !== undefined && config.maxPassed < 0) {
      throw new Error('maxPassed must be non-negative')
    }
    if (config.maxSkipped !== undefined && config.maxSkipped < 0) {
      throw new Error('maxSkipped must be non-negative')
    }
    if (config.minLineNumber !== undefined && config.minLineNumber < 0) {
      throw new Error('minLineNumber must be non-negative')
    }
    if (config.minColumnNumber !== undefined && config.minColumnNumber < 0) {
      throw new Error('minColumnNumber must be non-negative')
    }
    if (config.minDuration !== undefined && config.minDuration < 0) {
      throw new Error('minDuration must be non-negative')
    }
  }

  /**
   * Validates LLM reporter output
   *
   * @param output - The output to validate
   * @returns Validation result with detailed error information
   */
  public validate(output: unknown): ValidationResult {
    const context: ValidationContext = {
      totalCodeSize: 0,
      errors: [],
      config: this.config
    }

    if (!this.validateStructure(output, context)) {
      return {
        valid: false,
        errors:
          context.errors.length > 0 ? context.errors : [{ path: '', message: 'Invalid structure' }]
      }
    }

    return {
      valid: true,
      errors: [],
      data: output
    }
  }

  /**
   * Validates the structure without mutation
   */
  private validateStructure(
    output: unknown,
    context: ValidationContext
  ): output is LLMReporterOutput {
    if (!output || typeof output !== 'object' || output === null) {
      this.addError(context, ErrorMessages.OUTPUT_NOT_OBJECT(typeof output), 'root', output)
      return false
    }

    const obj = createSafeObject(output as unknown as Record<string, unknown>)

    // Validate summary (required)
    if (!hasProperty(obj, 'summary')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD('summary'), 'summary')
      return false
    }
    if (!this.isValidTestSummary(obj.summary, context, 'summary')) {
      return false
    }

    // Validate failures array if present
    if (hasProperty(obj, 'failures') && obj.failures !== undefined) {
      if (!Array.isArray(obj.failures)) {
        this.addError(
          context,
          ErrorMessages.TYPE_ARRAY('failures', typeof obj.failures),
          'failures',
          obj.failures
        )
        return false
      }

      if (obj.failures.length > context.config.maxFailures) {
        this.addError(
          context,
          `Array exceeds maximum size of ${context.config.maxFailures}`,
          'failures',
          obj.failures.length
        )
        return false
      }

      if (!this.checkArrayMemoryLimit(obj.failures, context, 'failures')) {
        return false
      }

      for (let i = 0; i < obj.failures.length; i++) {
        if (context.totalCodeSize > context.config.maxTotalCodeSize) {
          this.addError(
            context,
            ErrorMessages.MEMORY_LIMIT_DURING(`failures[${i}]`),
            `failures[${i}]`
          )
          return false
        }
        if (!this.isValidTestFailure(obj.failures[i], context, `failures[${i}]`)) {
          return false
        }
      }
    }

    // Validate passed array if present
    if (hasProperty(obj, 'passed') && obj.passed !== undefined) {
      if (!Array.isArray(obj.passed)) {
        this.addError(
          context,
          ErrorMessages.TYPE_ARRAY('passed', typeof obj.passed),
          'passed',
          obj.passed
        )
        return false
      }

      if (obj.passed.length > context.config.maxPassed) {
        this.addError(
          context,
          `Array exceeds maximum size of ${context.config.maxPassed}`,
          'passed',
          obj.passed.length
        )
        return false
      }

      if (!this.checkArrayMemoryLimit(obj.passed, context, 'passed')) {
        return false
      }

      for (let i = 0; i < obj.passed.length; i++) {
        if (context.totalCodeSize > context.config.maxTotalCodeSize) {
          this.addError(context, ErrorMessages.MEMORY_LIMIT_DURING(`passed[${i}]`), `passed[${i}]`)
          return false
        }
        if (!this.isValidTestResult(obj.passed[i], context, `passed[${i}]`)) {
          return false
        }
      }
    }

    // Validate skipped array if present
    if (hasProperty(obj, 'skipped') && obj.skipped !== undefined) {
      if (!Array.isArray(obj.skipped)) {
        this.addError(
          context,
          ErrorMessages.TYPE_ARRAY('skipped', typeof obj.skipped),
          'skipped',
          obj.skipped
        )
        return false
      }

      if (obj.skipped.length > context.config.maxSkipped) {
        this.addError(
          context,
          `Array exceeds maximum size of ${context.config.maxSkipped}`,
          'skipped',
          obj.skipped.length
        )
        return false
      }

      if (!this.checkArrayMemoryLimit(obj.skipped, context, 'skipped')) {
        return false
      }

      for (let i = 0; i < obj.skipped.length; i++) {
        if (context.totalCodeSize > context.config.maxTotalCodeSize) {
          this.addError(
            context,
            ErrorMessages.MEMORY_LIMIT_DURING(`skipped[${i}]`),
            `skipped[${i}]`
          )
          return false
        }
        if (!this.isValidTestResult(obj.skipped[i], context, `skipped[${i}]`)) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Validates TestSummary object
   */
  private isValidTestSummary(
    summary: unknown,
    context: ValidationContext,
    path: string = 'summary'
  ): summary is TestSummary {
    if (!summary || typeof summary !== 'object' || summary === null) {
      this.addError(context, ErrorMessages.TYPE_OBJECT(path, typeof summary), path, summary)
      return false
    }

    const obj = createSafeObject(summary as Record<string, unknown>)

    // Check required numeric fields
    const requiredNumbers = ['total', 'passed', 'failed', 'skipped', 'duration']
    for (const field of requiredNumbers) {
      if (!hasProperty(obj, field)) {
        this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.${field}`), `${path}.${field}`)
        return false
      }
      if (typeof obj[field] !== 'number') {
        this.addError(
          context,
          ErrorMessages.MUST_BE_NUMBER(`${path}.${field}`, typeof obj[field]),
          `${path}.${field}`,
          obj[field]
        )
        return false
      }
      if (obj[field] < 0) {
        this.addError(
          context,
          ErrorMessages.MUST_BE_NON_NEGATIVE(`${path}.${field}`, obj[field]),
          `${path}.${field}`,
          obj[field]
        )
        return false
      }
    }

    // Check timestamp
    if (typeof obj.timestamp !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.timestamp`, typeof obj.timestamp),
        `${path}.timestamp`,
        obj.timestamp
      )
      return false
    }
    if (obj.timestamp.length > context.config.maxStringLength) {
      this.addError(
        context,
        `Exceeds maximum string length of ${context.config.maxStringLength}`,
        `${path}.timestamp`,
        obj.timestamp.length
      )
      return false
    }
    if (!this.isValidISO8601(obj.timestamp)) {
      this.addError(
        context,
        ErrorMessages.INVALID_ISO8601(`${path}.timestamp`, String(obj.timestamp)),
        `${path}.timestamp`,
        obj.timestamp
      )
      return false
    }

    if (hasProperty(obj, 'environment') && obj.environment !== undefined) {
      if (!this.isValidRuntimeEnvironment(obj.environment, context, `${path}.environment`)) {
        return false
      }
    }

    // Validate total equals sum
    const total = obj.total as number
    const passed = obj.passed as number
    const failed = obj.failed as number
    const skipped = obj.skipped as number

    if (total !== passed + failed + skipped) {
      this.addError(
        context,
        `Total (${total}) must equal sum of passed (${passed}) + failed (${failed}) + skipped (${skipped})`,
        `${path}.total`
      )
      return false
    }

    return true
  }

  private isValidRuntimeEnvironment(
    environment: unknown,
    context: ValidationContext,
    path: string
  ): environment is RuntimeEnvironmentSummary {
    if (!environment || typeof environment !== 'object' || environment === null) {
      this.addError(context, ErrorMessages.TYPE_OBJECT(path, typeof environment), path, environment)
      return false
    }

    const envObj = createSafeObject(environment as Record<string, unknown>)

    if (!hasProperty(envObj, 'os') || !envObj.os || typeof envObj.os !== 'object') {
      this.addError(context, ErrorMessages.TYPE_OBJECT(`${path}.os`, typeof envObj.os), `${path}.os`)
      return false
    }

    const osObj = createSafeObject(envObj.os as Record<string, unknown>)
    const osStringFields: Array<keyof RuntimeEnvironmentSummary['os']> = ['platform', 'release', 'arch']
    for (const field of osStringFields) {
      const value = osObj[field]
      if (typeof value !== 'string') {
        this.addError(
          context,
          ErrorMessages.TYPE_STRING(`${path}.os.${field}`, typeof value),
          `${path}.os.${field}`,
          value
        )
        return false
      }
    }

    if (osObj.version !== undefined && typeof osObj.version !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.os.version`, typeof osObj.version),
        `${path}.os.version`,
        osObj.version
      )
      return false
    }

    if (!hasProperty(envObj, 'node') || !envObj.node || typeof envObj.node !== 'object') {
      this.addError(
        context,
        ErrorMessages.TYPE_OBJECT(`${path}.node`, typeof envObj.node),
        `${path}.node`
      )
      return false
    }

    const nodeObj = createSafeObject(envObj.node as Record<string, unknown>)
    if (typeof nodeObj.version !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.node.version`, typeof nodeObj.version),
        `${path}.node.version`,
        nodeObj.version
      )
      return false
    }

    if (nodeObj.runtime !== undefined && typeof nodeObj.runtime !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.node.runtime`, typeof nodeObj.runtime),
        `${path}.node.runtime`,
        nodeObj.runtime
      )
      return false
    }

    if (hasProperty(envObj, 'vitest') && envObj.vitest !== undefined) {
      if (!envObj.vitest || typeof envObj.vitest !== 'object') {
        this.addError(
          context,
          ErrorMessages.TYPE_OBJECT(`${path}.vitest`, typeof envObj.vitest),
          `${path}.vitest`,
          envObj.vitest
        )
        return false
      }

      const vitestObj = createSafeObject(envObj.vitest as Record<string, unknown>)
      if (vitestObj.version !== undefined && typeof vitestObj.version !== 'string') {
        this.addError(
          context,
          ErrorMessages.TYPE_STRING(`${path}.vitest.version`, typeof vitestObj.version),
          `${path}.vitest.version`,
          vitestObj.version
        )
        return false
      }
    }

    if (envObj.ci !== undefined && typeof envObj.ci !== 'boolean') {
      this.addError(
        context,
        ErrorMessages.TYPE_BOOLEAN(`${path}.ci`, typeof envObj.ci),
        `${path}.ci`,
        envObj.ci
      )
      return false
    }

    if (envObj.packageManager !== undefined && typeof envObj.packageManager !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.packageManager`, typeof envObj.packageManager),
        `${path}.packageManager`,
        envObj.packageManager
      )
      return false
    }

    return true
  }

  /**
   * Validates TestBase properties common to all test objects
   */
  private isValidTestBase(
    test: unknown,
    context: ValidationContext,
    path: string = ''
  ): test is TestBase {
    if (!test || typeof test !== 'object' || test === null) {
      this.addError(context, ErrorMessages.TYPE_OBJECT(path, typeof test), path, test)
      return false
    }

    const obj = createSafeObject(test as Record<string, unknown>)

    // Check required string fields with length limits
    if (!hasProperty(obj, 'test')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.test`), `${path}.test`)
      return false
    }
    if (typeof obj.test !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.test`, typeof obj.test),
        `${path}.test`,
        obj.test
      )
      return false
    }
    if (obj.test.length > context.config.maxStringLength) {
      this.addError(
        context,
        `Exceeds maximum string length of ${context.config.maxStringLength}`,
        `${path}.test`,
        obj.test.length
      )
      return false
    }

    if (!hasProperty(obj, 'fileRelative')) {
      this.addError(
        context,
        ErrorMessages.REQUIRED_FIELD(`${path}.fileRelative`),
        `${path}.fileRelative`
      )
      return false
    }
    if (typeof obj.fileRelative !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.fileRelative`, typeof obj.fileRelative),
        `${path}.fileRelative`,
        obj.fileRelative
      )
      return false
    }
    if (obj.fileRelative.length > context.config.maxStringLength) {
      this.addError(
        context,
        `Exceeds maximum string length of ${context.config.maxStringLength}`,
        `${path}.fileRelative`,
        obj.fileRelative.length
      )
      return false
    }

    // Validate file path security
    if (!validateFilePath(obj.fileRelative)) {
      this.addError(
        context,
        ErrorMessages.INVALID_FILE_PATH(`${path}.fileRelative`, String(obj.fileRelative)),
        `${path}.fileRelative`,
        obj.fileRelative
      )
      return false
    }

    // Validate optional fileAbsolute field
    if (hasProperty(obj, 'fileAbsolute')) {
      if (typeof obj.fileAbsolute !== 'string') {
        this.addError(
          context,
          ErrorMessages.TYPE_STRING(`${path}.fileAbsolute`, typeof obj.fileAbsolute),
          `${path}.fileAbsolute`,
          obj.fileAbsolute
        )
        return false
      }
      if (obj.fileAbsolute.length > context.config.maxStringLength) {
        this.addError(
          context,
          `Exceeds maximum string length of ${context.config.maxStringLength}`,
          `${path}.fileAbsolute`,
          obj.fileAbsolute.length
        )
        return false
      }
      if (!validateFilePath(obj.fileAbsolute)) {
        this.addError(
          context,
          ErrorMessages.INVALID_FILE_PATH(`${path}.fileAbsolute`, String(obj.fileAbsolute)),
          `${path}.fileAbsolute`,
          obj.fileAbsolute
        )
        return false
      }
    }

    // Check startLine
    if (!hasProperty(obj, 'startLine')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.startLine`), `${path}.startLine`)
      return false
    }
    if (typeof obj.startLine !== 'number') {
      this.addError(
        context,
        ErrorMessages.TYPE_NUMBER(`${path}.startLine`, typeof obj.startLine),
        `${path}.startLine`,
        obj.startLine
      )
      return false
    }
    if (obj.startLine < context.config.minLineNumber) {
      this.addError(
        context,
        `Must be at least ${context.config.minLineNumber}`,
        `${path}.startLine`,
        obj.startLine
      )
      return false
    }

    // Check endLine
    if (!hasProperty(obj, 'endLine')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.endLine`), `${path}.endLine`)
      return false
    }
    if (typeof obj.endLine !== 'number') {
      this.addError(
        context,
        ErrorMessages.TYPE_NUMBER(`${path}.endLine`, typeof obj.endLine),
        `${path}.endLine`,
        obj.endLine
      )
      return false
    }
    if (obj.endLine < context.config.minLineNumber) {
      this.addError(
        context,
        `Must be at least ${context.config.minLineNumber}`,
        `${path}.endLine`,
        obj.endLine
      )
      return false
    }

    // Validate that endLine >= startLine
    if (obj.endLine < obj.startLine) {
      this.addError(
        context,
        `End line (${obj.endLine}) must be greater than or equal to start line (${obj.startLine})`,
        `${path}.endLine`,
        obj.endLine
      )
      return false
    }

    // Check optional suite array
    if (hasProperty(obj, 'suite') && obj.suite !== undefined) {
      if (!Array.isArray(obj.suite)) {
        this.addError(
          context,
          ErrorMessages.TYPE_ARRAY(`${path}.suite`, typeof obj.suite),
          `${path}.suite`,
          obj.suite
        )
        return false
      }
      if (
        !obj.suite.every((s, i) => {
          if (typeof s !== 'string') {
            this.addError(
              context,
              ErrorMessages.TYPE_STRING(`${path}.suite[${i}]`, typeof s),
              `${path}.suite[${i}]`,
              s
            )
            return false
          }
          if (s.length > context.config.maxStringLength) {
            this.addError(
              context,
              `Exceeds maximum string length of ${context.config.maxStringLength}`,
              `${path}.suite[${i}]`,
              s.length
            )
            return false
          }
          return true
        })
      ) {
        return false
      }
    }

    return true
  }

  /**
   * Validates TestFailure object
   */
  private isValidTestFailure(
    failure: unknown,
    context: ValidationContext,
    path: string = ''
  ): failure is TestFailure {
    // First validate the base properties
    if (!this.isValidTestBase(failure, context, path)) {
      return false
    }

    const obj = createSafeObject(failure as unknown as Record<string, unknown>)

    // Check error object (TestFailure-specific property)
    if (!hasProperty(obj, 'error')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.error`), `${path}.error`)
      return false
    }
    if (!this.isValidTestError(obj.error, context, `${path}.error`)) {
      return false
    }

    return true
  }

  /**
   * Validates TestError object
   */
  private isValidTestError(
    error: unknown,
    context: ValidationContext,
    path: string = ''
  ): error is TestError {
    if (!error || typeof error !== 'object' || error === null) {
      this.addError(context, ErrorMessages.TYPE_OBJECT(path, typeof error), path, error)
      return false
    }

    const obj = createSafeObject(error as Record<string, unknown>)

    // Check required fields with length limits
    if (typeof obj.message !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.message`, typeof obj.message),
        `${path}.message`,
        obj.message
      )
      return false
    }
    if (obj.message.length > context.config.maxStringLength) {
      this.addError(
        context,
        ErrorMessages.MAX_STRING_LENGTH(
          `${path}.message`,
          context.config.maxStringLength,
          obj.message.length
        ),
        `${path}.message`,
        obj.message.length
      )
      return false
    }

    if (typeof obj.type !== 'string') {
      this.addError(
        context,
        ErrorMessages.TYPE_STRING(`${path}.type`, typeof obj.type),
        `${path}.type`,
        obj.type
      )
      return false
    }
    if (obj.type.length > context.config.maxStringLength) {
      this.addError(
        context,
        ErrorMessages.MAX_STRING_LENGTH(
          `${path}.type`,
          context.config.maxStringLength,
          obj.type.length
        ),
        `${path}.type`,
        obj.type.length
      )
      return false
    }

    // Check optional stack
    if (obj.stack !== undefined) {
      if (typeof obj.stack !== 'string') {
        this.addError(
          context,
          ErrorMessages.TYPE_STRING(`${path}.stack`, typeof obj.stack),
          `${path}.stack`,
          obj.stack
        )
        return false
      }
      if (obj.stack.length > context.config.maxStringLength) {
        this.addError(
          context,
          ErrorMessages.MAX_STRING_LENGTH(
            `${path}.stack`,
            context.config.maxStringLength,
            obj.stack.length
          ),
          `${path}.stack`,
          obj.stack.length
        )
        return false
      }
    }

    // Check optional context
    if (obj.context !== undefined) {
      if (!this.isValidErrorContext(obj.context, context, `${path}.context`)) {
        return false
      }
    }

    return true
  }

  /**
   * Validates ErrorContext without mutation
   */
  private isValidErrorContext(
    errorCtx: unknown,
    context: ValidationContext,
    path: string = ''
  ): errorCtx is ErrorContext {
    if (!errorCtx || typeof errorCtx !== 'object' || errorCtx === null) {
      this.addError(context, ErrorMessages.TYPE_OBJECT(path, typeof errorCtx), path, errorCtx)
      return false
    }

    const ctx = createSafeObject(errorCtx as Record<string, unknown>)

    // Validate required code array
    if (!hasProperty(ctx, 'code')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.code`), `${path}.code`)
      return false
    }
    if (!Array.isArray(ctx.code)) {
      this.addError(
        context,
        ErrorMessages.TYPE_ARRAY(`${path}.code`, typeof ctx.code),
        `${path}.code`,
        ctx.code
      )
      return false
    }
    if (ctx.code.length > context.config.maxCodeLines) {
      this.addError(
        context,
        ErrorMessages.MAX_CODE_LINES(`${path}.code`, context.config.maxCodeLines, ctx.code.length),
        `${path}.code`,
        ctx.code.length
      )
      return false
    }

    // Calculate memory usage without mutating context until validation succeeds
    // This approach reduces mutation points and simplifies the flow
    const currentTotal = context.totalCodeSize

    // First, validate all lines are strings and within limits
    let actualCodeSize = 0
    for (let i = 0; i < ctx.code.length; i++) {
      const line = ctx.code[i] as unknown

      if (typeof line !== 'string') {
        this.addError(
          context,
          ErrorMessages.TYPE_STRING(`${path}.code[${i}]`, typeof line),
          `${path}.code[${i}]`,
          line
        )
        return false
      }

      if (line.length > context.config.maxStringLength) {
        this.addError(
          context,
          ErrorMessages.MAX_STRING_LENGTH(
            `${path}.code[${i}]`,
            context.config.maxStringLength,
            line.length
          ),
          `${path}.code[${i}]`,
          line.length
        )
        return false
      }

      actualCodeSize += line.length
    }

    // Check memory constraints with actual size
    const newTotal = currentTotal + actualCodeSize
    if (newTotal > context.config.maxTotalCodeSize) {
      this.addError(
        context,
        ErrorMessages.MEMORY_LIMIT(`${path}.code`, context.config.maxTotalCodeSize, newTotal),
        `${path}.code`
      )
      return false
    }

    // Only update totalCodeSize after all validations pass
    context.totalCodeSize = newTotal

    // Validate optional numeric fields
    if (hasProperty(ctx, 'lineNumber') && ctx.lineNumber !== undefined) {
      if (typeof ctx.lineNumber !== 'number') {
        this.addError(
          context,
          ErrorMessages.TYPE_NUMBER(`${path}.lineNumber`, typeof ctx.lineNumber),
          `${path}.lineNumber`,
          ctx.lineNumber
        )
        return false
      }
      if (ctx.lineNumber < context.config.minLineNumber) {
        this.addError(
          context,
          ErrorMessages.MIN_VALUE(
            `${path}.lineNumber`,
            context.config.minLineNumber,
            ctx.lineNumber
          ),
          `${path}.lineNumber`,
          ctx.lineNumber
        )
        return false
      }
    }

    if (hasProperty(ctx, 'columnNumber') && ctx.columnNumber !== undefined) {
      if (typeof ctx.columnNumber !== 'number') {
        this.addError(
          context,
          ErrorMessages.TYPE_NUMBER(`${path}.columnNumber`, typeof ctx.columnNumber),
          `${path}.columnNumber`,
          ctx.columnNumber
        )
        return false
      }
      if (ctx.columnNumber < context.config.minColumnNumber) {
        this.addError(
          context,
          ErrorMessages.MIN_VALUE(
            `${path}.columnNumber`,
            context.config.minColumnNumber,
            ctx.columnNumber
          ),
          `${path}.columnNumber`,
          ctx.columnNumber
        )
        return false
      }
    }

    return true
  }

  /**
   * Validates TestResult object
   */
  private isValidTestResult(
    result: unknown,
    context: ValidationContext,
    path: string = ''
  ): result is TestResult {
    // First validate the base properties
    if (!this.isValidTestBase(result, context, path)) {
      return false
    }

    const obj = createSafeObject(result as unknown as Record<string, unknown>)

    // Check status (TestResult-specific property)
    if (!hasProperty(obj, 'status')) {
      this.addError(context, ErrorMessages.REQUIRED_FIELD(`${path}.status`), `${path}.status`)
      return false
    }
    if (obj.status !== 'passed' && obj.status !== 'skipped') {
      this.addError(
        context,
        ErrorMessages.INVALID_STATUS(`${path}.status`, obj.status as string),
        `${path}.status`,
        obj.status
      )
      return false
    }

    // Check optional duration (TestResult-specific property)
    if (hasProperty(obj, 'duration') && obj.duration !== undefined) {
      if (typeof obj.duration !== 'number') {
        this.addError(
          context,
          ErrorMessages.TYPE_NUMBER(`${path}.duration`, typeof obj.duration),
          `${path}.duration`,
          obj.duration
        )
        return false
      }
      if (obj.duration < context.config.minDuration) {
        this.addError(
          context,
          ErrorMessages.MIN_VALUE(`${path}.duration`, context.config.minDuration, obj.duration),
          `${path}.duration`,
          obj.duration
        )
        return false
      }
    }

    return true
  }

  /**
   * Validates assertion value (expected/actual values in tests)
   */
  private isValidAssertionValue(
    value: unknown,
    context: ValidationContext,
    path: string = ''
  ): value is AssertionValue {
    const type = typeof value

    // Allow primitives
    if (type === 'string') {
      if ((value as string).length > context.config.maxStringLength) {
        this.addError(
          context,
          ErrorMessages.MAX_STRING_LENGTH(
            path,
            context.config.maxStringLength,
            (value as string).length
          ),
          path,
          (value as string).length
        )
        return false
      }
      return true
    }

    if (type === 'number' || type === 'boolean') {
      return true
    }

    // Allow null and undefined
    if (value === null || value === undefined) {
      return true
    }

    // Allow arrays and objects (handle circular references)
    if (Array.isArray(value) || (type === 'object' && value !== null)) {
      try {
        const seen = new WeakSet()
        const json = JSON.stringify(value, (_key, val) => {
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val as WeakKey)) {
              return '[Circular]'
            }
            seen.add(val as WeakKey)
          }
          return val as unknown
        })
        if (json.length > context.config.maxStringLength) {
          this.addError(
            context,
            ErrorMessages.MAX_STRING_LENGTH(path, 100000, json.length),
            path,
            json.length
          )
          return false
        }
        return true
      } catch {
        this.addError(context, ErrorMessages.CIRCULAR_REFERENCE(path), path)
        return false
      }
    }

    return false
  }

  /**
   * Validates ISO 8601 timestamp format
   */
  private isValidISO8601(timestamp: string): boolean {
    if (
      typeof timestamp !== 'string' ||
      timestamp.length < 19 ||
      timestamp.length > MAX_TIMESTAMP_LENGTH
    ) {
      return false
    }

    if (!ISO_8601_REGEX.test(timestamp)) {
      return false
    }

    try {
      const date = new Date(timestamp)

      if (isNaN(date.getTime())) {
        return false
      }

      const year = date.getFullYear()
      if (year < 1000 || year > 9999) {
        return false
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Estimates the size of an array without full serialization
   */
  private estimateArraySize(array: unknown[]): number {
    let estimate = 100

    const sampleSize = Math.min(array.length, 10)
    let avgItemSize = 0

    for (let i = 0; i < sampleSize; i++) {
      const item = array[i]

      if (item === null) {
        avgItemSize += 4
      } else if (item === undefined) {
        avgItemSize += 9
      } else if (typeof item === 'string') {
        avgItemSize += item.length + 4
      } else if (typeof item === 'number') {
        avgItemSize += 15
      } else if (typeof item === 'boolean') {
        avgItemSize += 6
      } else if (typeof item === 'object') {
        if (Array.isArray(item)) {
          avgItemSize += item.length * 50
        } else {
          try {
            const keys = Object.keys(item)
            avgItemSize += keys.length * 100

            for (const key of keys.slice(0, 5)) {
              const val = (item as Record<string, unknown>)[key]
              if (typeof val === 'string' && val.length > 100) {
                avgItemSize += val.length
              }
            }
          } catch {
            avgItemSize += 500
          }
        }
      } else {
        avgItemSize += 50
      }
    }

    if (sampleSize > 0) {
      avgItemSize = Math.ceil(avgItemSize / sampleSize)
      estimate += avgItemSize * array.length
    }

    estimate += array.length * 2

    return Math.ceil(estimate * 1.2)
  }

  /**
   * Calculates the actual size of an object using JSON.stringify
   */
  private calculateActualSize(obj: unknown): number {
    try {
      const seen = new WeakSet()
      const jsonString = JSON.stringify(obj, (_, value) => {
        if (typeof value === 'bigint') {
          return value.toString()
        }
        if (typeof value === 'function') {
          return '[Function]'
        }
        if (typeof value === 'symbol') {
          return '[Symbol]'
        }
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value as WeakKey)) {
            return '[Circular]'
          }
          seen.add(value as WeakKey)
        }
        return value as unknown
      })
      return jsonString.length
    } catch {
      if (typeof obj === 'object' && obj !== null) {
        return Object.keys(obj).length * 100
      }
      return 1000
    }
  }

  /**
   * Checks if processing an array would exceed memory limits
   * Uses an accumulator pattern to minimize state mutations
   */
  private checkArrayMemoryLimit(
    array: unknown[],
    context: ValidationContext,
    path: string
  ): boolean {
    // Calculate sizes without mutating context until all checks pass
    const currentTotal = context.totalCodeSize
    const estimatedSize = this.estimateArraySize(array)
    const estimatedTotal = currentTotal + estimatedSize

    // Early check with estimate
    if (estimatedTotal > context.config.maxTotalCodeSize) {
      this.addError(
        context,
        ErrorMessages.MEMORY_LIMIT(path, context.config.maxTotalCodeSize, estimatedTotal),
        path
      )
      return false
    }

    // Calculate actual size
    let actualSize: number
    try {
      actualSize = this.calculateActualSize(array)
    } catch {
      this.addError(context, `Failed to calculate array size: Unknown error`, path)
      return false
    }

    // Validate size constraints
    if (actualSize > estimatedSize * 5) {
      this.addError(
        context,
        `Array size validation failed: actual size (${actualSize}) significantly exceeds estimate (${estimatedSize})`,
        path
      )
      return false
    }

    if (actualSize > MAX_ARRAY_SIZE) {
      this.addError(
        context,
        `Array size exceeds maximum allowed (${actualSize} > ${MAX_ARRAY_SIZE} characters)`,
        path
      )
      return false
    }

    const actualTotal = currentTotal + actualSize
    if (actualTotal > context.config.maxTotalCodeSize) {
      this.addError(
        context,
        ErrorMessages.MEMORY_LIMIT(path, context.config.maxTotalCodeSize, actualTotal),
        path
      )
      return false
    }

    // Only update totalCodeSize after all validations pass
    context.totalCodeSize = actualTotal

    return true
  }

  /**
   * Adds a validation error with path information
   */
  private addError(
    context: ValidationContext,
    message: string,
    path: string = '',
    value?: unknown
  ): void {
    context.errors.push({ path, message, value })
  }
}
