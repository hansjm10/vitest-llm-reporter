/**
 * Schema Processor - Orchestration Layer
 *
 * This module orchestrates validation and sanitization of LLM reporter output.
 * It provides a simple API that combines both concerns while maintaining separation.
 *
 * @module processor
 */

import type { LLMReporterOutput } from '../types/schema'
import { SchemaValidator, ValidationConfig, ValidationResult } from '../validation/validator'
import { JsonSanitizer, JsonSanitizerConfig } from '../sanitization/json-sanitizer'

/**
 * Processing options
 */
export interface ProcessingOptions {
  validate?: boolean
  sanitize?: boolean
  validationConfig?: ValidationConfig
  sanitizationConfig?: JsonSanitizerConfig
}

/**
 * Processing result
 */
export interface ProcessingResult {
  success: boolean
  data?: LLMReporterOutput
  errors?: Array<{ path: string; message: string; value?: unknown }>
  validated?: boolean
  sanitized?: boolean
}

/**
 * Schema processor that orchestrates validation and sanitization
 *
 * This class provides a high-level API for processing LLM reporter output.
 * It combines validation and sanitization while keeping them as separate concerns.
 *
 * @example Basic usage
 * ```typescript
 * const processor = new SchemaProcessor();
 * const result = processor.process(output);
 * if (result.success) {
 *   // Processed output: result.data
 * }
 * ```
 *
 * @example With custom configuration
 * ```typescript
 * const processor = new SchemaProcessor({
 *   validationConfig: { maxCodeLines: 50 },
 *   sanitizationConfig: { strategy: SanitizationStrategy.JSON }
 * });
 * ```
 *
 * @example Validation only
 * ```typescript
 * const result = processor.process(output, { sanitize: false });
 * ```
 */
export class SchemaProcessor {
  private validator: SchemaValidator
  private sanitizer: JsonSanitizer
  private defaultOptions: Required<Pick<ProcessingOptions, 'validate' | 'sanitize'>>

  constructor(options: ProcessingOptions = {}) {
    this.validator = new SchemaValidator(options.validationConfig)
    this.sanitizer = new JsonSanitizer(options.sanitizationConfig)
    this.defaultOptions = {
      validate: options.validate ?? true,
      sanitize: options.sanitize ?? true
    }
  }

  /**
   * Processes LLM reporter output with validation and/or sanitization
   *
   * @param output - The output to process
   * @param options - Processing options (overrides constructor defaults)
   * @returns Processing result with success status and processed data
   */
  public process(output: unknown, options?: ProcessingOptions): ProcessingResult {
    const processOptions = {
      validate: options?.validate ?? this.defaultOptions.validate,
      sanitize: options?.sanitize ?? this.defaultOptions.sanitize
    }

    // If neither validation nor sanitization is requested, just pass through
    if (!processOptions.validate && !processOptions.sanitize) {
      return {
        success: true,
        data: output as LLMReporterOutput,
        validated: false,
        sanitized: false
      }
    }

    // Validation phase
    if (processOptions.validate) {
      const validationResult = this.validator.validate(output)

      if (!validationResult.valid) {
        return {
          success: false,
          errors: validationResult.errors,
          validated: true,
          sanitized: false
        }
      }

      // If only validation was requested, return the validated data
      if (!processOptions.sanitize) {
        return {
          success: true,
          data: validationResult.data,
          validated: true,
          sanitized: false
        }
      }

      // Continue to sanitization with validated data
      output = validationResult.data
    }

    // Sanitization phase
    if (processOptions.sanitize) {
      try {
        const sanitized = this.sanitizer.sanitize(output as LLMReporterOutput)
        return {
          success: true,
          data: sanitized,
          validated: processOptions.validate,
          sanitized: true
        }
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              path: 'sanitization',
              message: error instanceof Error ? error.message : 'Sanitization failed'
            }
          ],
          validated: processOptions.validate,
          sanitized: false
        }
      }
    }

    // This should never be reached - indicates a logic error
    throw new Error(
      'Unexpected state: neither validation nor sanitization was performed despite passing initial check'
    )
  }

  /**
   * Validates output without sanitization
   * Convenience method for validation-only use cases
   */
  public validate(output: unknown): ValidationResult {
    return this.validator.validate(output)
  }

  /**
   * Sanitizes pre-validated output
   * Convenience method for sanitization-only use cases
   *
   * @warning This assumes the input is already validated!
   */
  public sanitize(output: LLMReporterOutput): LLMReporterOutput {
    return this.sanitizer.sanitize(output)
  }

  /**
   * Updates validation configuration
   */
  public updateValidationConfig(config: ValidationConfig): void {
    this.validator = new SchemaValidator(config)
  }

  /**
   * Updates sanitization configuration
   */
  public updateSanitizationConfig(config: JsonSanitizerConfig): void {
    this.sanitizer = new JsonSanitizer(config)
  }
}
