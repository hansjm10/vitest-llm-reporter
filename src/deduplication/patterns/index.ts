/**
 * Pattern Matchers Module
 *
 * Exports for all pattern matching implementations
 *
 * @module patterns
 */

export { StackTracePattern } from './StackTracePattern.js'
export { ErrorMessagePattern } from './ErrorMessagePattern.js'
export { ConsoleOutputPattern } from './ConsoleOutputPattern.js'
export { AssertionPattern } from './AssertionPattern.js'

// Re-export pattern matcher interface
export type { IPatternMatcher } from '../../types/deduplication.js'
