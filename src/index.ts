/**
 * Vitest LLM Reporter
 *
 * A Vitest reporter optimized for LLM consumption with structured,
 * token-efficient output.
 */

// Export schema types
export type {
  LLMReporterOutput,
  TestSummary,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext,
  AssertionValue
} from './types/schema'

// Export validation module
export {
  SchemaValidator,
  type ValidationConfig,
  type ValidationResult,
  DEFAULT_CONFIG
} from './validation/validator'

// Export sanitization module
export {
  SchemaSanitizer,
  SanitizationStrategy,
  type SanitizationConfig,
  DEFAULT_SANITIZATION_CONFIG
} from './sanitization/sanitizer'

// Export processor module (primary API)
export {
  SchemaProcessor,
  type ProcessingOptions,
  type ProcessingResult
} from './processor/processor'

// TODO: Export reporter class once implemented
// export { LLMReporter } from './reporter'
