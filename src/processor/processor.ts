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
import type { TruncationConfig, DeduplicationConfig } from '../types/reporter'
import { createTruncationEngine, type ITruncationEngine } from '../truncation/TruncationEngine'
import { createDeduplicationService, type IDeduplicationService } from '../deduplication'
import type { DeduplicationResult, DuplicateEntry } from '../types/deduplication'

/**
 * Processing options
 */
export interface ProcessingOptions {
  validate?: boolean
  sanitize?: boolean
  truncate?: boolean
  deduplicate?: boolean
  validationConfig?: ValidationConfig
  sanitizationConfig?: JsonSanitizerConfig
  truncationConfig?: TruncationConfig
  deduplicationConfig?: DeduplicationConfig
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
  deduplicated?: boolean
  truncationMetrics?: Array<{ originalTokens: number; truncatedTokens: number; wasTruncated: boolean }>
  deduplicationResult?: DeduplicationResult
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
  private deduplicationService?: IDeduplicationService
  private defaultOptions: Required<Pick<ProcessingOptions, 'validate' | 'sanitize' | 'truncate' | 'deduplicate'>>

  constructor(options: ProcessingOptions = {}) {
    this.validator = new SchemaValidator(options.validationConfig)
    this.sanitizer = new JsonSanitizer(options.sanitizationConfig)
    
    // Initialize truncation engine if enabled
    if (options.truncationConfig?.enabled) {
      this.truncationEngine = createTruncationEngine(options.truncationConfig)
    }
    
    // Initialize deduplication service if enabled
    if (options.deduplicationConfig?.enabled) {
      this.deduplicationService = createDeduplicationService(options.deduplicationConfig)
    }
    
    this.defaultOptions = {
      validate: options.validate ?? true,
      sanitize: options.sanitize ?? true,
      truncate: options.truncate ?? (options.truncationConfig?.enabled ?? false),
      deduplicate: options.deduplicate ?? (options.deduplicationConfig?.enabled ?? false)
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
      truncate: options?.truncate ?? this.defaultOptions.truncate,
      deduplicate: options?.deduplicate ?? this.defaultOptions.deduplicate
    }

    let truncationMetrics: ProcessingResult['truncationMetrics']
    let deduplicationResult: ProcessingResult['deduplicationResult']

    // If nothing is requested, just pass through
    if (!processOptions.validate && !processOptions.sanitize && !processOptions.truncate && !processOptions.deduplicate) {
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
          truncated: false,
          deduplicated: false
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
          truncated: false,
          deduplicated: false
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
          truncated: false,
          deduplicated: false
        }
      }
    }

    // Deduplication phase
    if (processOptions.deduplicate && this.deduplicationService) {
      try {
        const reporterOutput = output as LLMReporterOutput
        if (reporterOutput.failures && reporterOutput.failures.length > 0) {
          // Convert failures to DuplicateEntry format
          const duplicateEntries: DuplicateEntry[] = reporterOutput.failures.map(failure => ({
            testId: failure.test.name,
            testName: failure.test.name,
            filePath: failure.test.file || '',
            timestamp: new Date(),
            errorMessage: failure.error?.message,
            stackTrace: failure.error?.stack,
            consoleOutput: failure.console?.map(c => c.output) || []
          }))

          // Process deduplication
          deduplicationResult = this.deduplicationService.process(duplicateEntries)
          
          // Optionally update the output with deduplication info
          // This could be extended to actually modify the output structure
        }
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              path: 'deduplication',
              message: error instanceof Error ? error.message : 'Deduplication failed'
            }
          ],
          validated: processOptions.validate,
          sanitized: processOptions.sanitize,
          truncated: processOptions.truncate,
          deduplicated: false
        }
      }
    }

    return {
      success: true,
      data: output as LLMReporterOutput,
      validated: processOptions.validate,
      sanitized: processOptions.sanitize,
      truncated: processOptions.truncate,
      deduplicated: processOptions.deduplicate,
      truncationMetrics,
      deduplicationResult
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
