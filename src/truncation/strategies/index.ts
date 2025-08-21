/**
 * Truncation Strategies Export Module
 *
 * Exports all truncation strategy implementations for easy importing.
 */

export { HeadTailStrategy } from './HeadTailStrategy'
export { SmartStrategy } from './SmartStrategy'
export { ErrorFocusedStrategy } from './ErrorFocusedStrategy'
export { StackTraceStrategy } from './StackTraceStrategy'

// Re-export types for convenience
export type {
  ITruncationStrategy,
  TruncationContext,
  TruncationResult
} from '../types'