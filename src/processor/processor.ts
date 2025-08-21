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
import type { TruncationConfig } from '../types/reporter'
import { createTruncationEngine, type ITruncationEngine } from '../truncation/TruncationEngine'

/**
 * Processing options
 */
export interface ProcessingOptions {
  validate?: boolean
  sanitize?: boolean
  truncate?: boolean
  validationConfig?: ValidationConfig
  sanitizationConfig?: JsonSanitizerConfig
  truncationConfig?: TruncationConfig
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
  truncated?: boolean
  truncationMetrics?: Array<{ originalTokens: number; truncatedTokens: number; wasTruncated: boolean }>
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
  private truncationEngine?: ITruncationEngine
  private defaultOptions: Required<Pick<ProcessingOptions, 'validate' | 'sanitize' | 'truncate'>>

  constructor(options: ProcessingOptions = {}) {
    this.validator = new SchemaValidator(options.validationConfig)
    this.sanitizer = new JsonSanitizer(options.sanitizationConfig)
    
    // Initialize truncation engine if enabled
    if (options.truncationConfig?.enabled) {
      this.truncationEngine = createTruncationEngine(options.truncationConfig)
    }
    
    this.defaultOptions = {
      validate: options.validate ?? true,
      sanitize: options.sanitize ?? true,
      truncate: options.truncate ?? (options.truncationConfig?.enabled ?? false)
    }
  }

  /**
   * Processes LLM reporter output with validation, sanitization, and/or truncation
   *
   * @param output - The output to process
   * @param options - Processing options (overrides constructor defaults)
   * @returns Processing result with success status and processed data
   */
  public process(output: unknown, options?: ProcessingOptions): ProcessingResult {
    const processOptions = {
      validate: options?.validate ?? this.defaultOptions.validate,
      sanitize: options?.sanitize ?? this.defaultOptions.sanitize,
      truncate: options?.truncate ?? this.defaultOptions.truncate
    }

    let truncationMetrics: ProcessingResult['truncationMetrics']

    // If nothing is requested, just pass through
    if (!processOptions.validate && !processOptions.sanitize && !processOptions.truncate) {
      return {
        success: true,
        data: output as LLMReporterOutput,
        validated: false,
        sanitized: false,
        truncated: false
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
          sanitized: false,
          truncated: false
        }
      }

      output = validationResult.data
    }

    // Sanitization phase
    if (processOptions.sanitize) {
      try {
        output = this.sanitizer.sanitize(output as LLMReporterOutput)
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
          sanitized: false,
          truncated: false
        }
      }
    }

    // Truncation phase
    if (processOptions.truncate && this.truncationEngine) {
      try {
        const serialized = JSON.stringify(output)
        if (this.truncationEngine.needsTruncation(serialized)) {
          const truncationResult = this.truncationEngine.truncate(serialized)
          output = JSON.parse(truncationResult.content)
          truncationMetrics = [truncationResult.metrics]
        }
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              path: 'truncation',
              message: error instanceof Error ? error.message : 'Truncation failed'
            }
          ],
          validated: processOptions.validate,
          sanitized: processOptions.sanitize,
          truncated: false
        }
      }
    }

    return {
      success: true,
      data: output as LLMReporterOutput,
      validated: processOptions.validate,
      sanitized: processOptions.sanitize,
      truncated: processOptions.truncate,
      truncationMetrics
    }
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
   * Truncates pre-processed output
   * Convenience method for truncation-only use cases
   *
   * @warning This assumes the input is already processed!
   */
  public truncate(output: LLMReporterOutput): { output: LLMReporterOutput; metrics?: any } {
    if (!this.truncationEngine) {
      return { output }
    }

    const serialized = JSON.stringify(output)
    if (!this.truncationEngine.needsTruncation(serialized)) {
      return { output }
    }

    const result = this.truncationEngine.truncate(serialized)
    return {
      output: JSON.parse(result.content),
      metrics: result.metrics
    }
  }

  /**
   * Gets truncation metrics if available
   */
  public getTruncationMetrics() {
    return this.truncationEngine?.getMetrics() || []
  }

  /**
   * Updates sanitization configuration
   */
  public updateSanitizationConfig(config: JsonSanitizerConfig): void {
    this.sanitizer = new JsonSanitizer(config)
  }

  /**
   * Updates truncation configuration
   */
  public updateTruncationConfig(config: TruncationConfig): void {
    if (config.enabled) {
      this.truncationEngine = createTruncationEngine(config)
    } else {
      this.truncationEngine = undefined
    }
  }
}
