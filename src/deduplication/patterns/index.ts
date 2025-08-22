/**
 * Pattern Matchers Module
 *
 * Exports for all pattern matching implementations
 *
 * @module patterns
 */

export { StackTracePattern } from './StackTracePattern'
export { ErrorMessagePattern } from './ErrorMessagePattern'
export { ConsoleOutputPattern } from './ConsoleOutputPattern'
export { AssertionPattern } from './AssertionPattern'

// Re-export pattern matcher interface
export type { IPatternMatcher } from '../../types/deduplication'
