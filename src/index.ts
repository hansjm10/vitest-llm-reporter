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
  ErrorContext
} from './types/schema'

// Export validation utilities
export {
  validateSchema,
  isValidTestSummary,
  isValidTestFailure,
  isValidTestError,
  isValidTestResult
} from './types/schema'

// TODO: Export reporter class once implemented
// export { LLMReporter } from './reporter'