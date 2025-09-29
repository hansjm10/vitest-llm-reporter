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
  RuntimeEnvironmentSummary,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext,
  AssertionValue,
  RetryAttempt,
  RetryInfo,
  FlakinessInfo
} from './types/schema.js'

// Export validation module
export {
  SchemaValidator,
  type ValidationConfig,
  type ValidationResult,
  DEFAULT_CONFIG
} from './validation/validator.js'

// Export sanitization module
export {
  JsonSanitizer,
  type JsonSanitizerConfig,
  DEFAULT_JSON_SANITIZER_CONFIG
} from './sanitization/json-sanitizer.js'

// Export reporter class and types
export { LLMReporter } from './reporter/reporter.js'
export type { LLMReporterConfig, EnvironmentMetadataConfig } from './types/reporter.js'
export { StreamingReporter } from './streaming/StreamingReporter.js'

// Export output writer
export { OutputWriter } from './output/OutputWriter.js'

// Default export for Vitest to use
import { LLMReporter } from './reporter/reporter.js'
export default LLMReporter
