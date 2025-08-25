/**
 * Truncation Module
 *
 * Main export module for truncation functionality including
 * the early truncator, types, and utilities.
 */

// Export core types (excluding duplicates)
export {
  ContentPriority,
  TruncationContext,
  ITruncationStrategy,
  TruncationEngineConfig,
  TruncationStats,
  ContentType,
  ContentTypeConfig
} from './types'

// Export context utilities
export * from './context'

// Export priorities
export * from './priorities'

// Export the synchronous early truncator
export { 
  EarlyTruncator,
  ContentCategory,
  // Note: TruncationMetrics and TruncationResult from EarlyTruncator 
  // are different from those in types.ts, so we export them with aliases
  type TruncationMetrics as EarlyTruncationMetrics,
  type TruncationResult as EarlyTruncationResult
} from './EarlyTruncator'

// Export utilities
export * from './utils'

// Export metrics tracker
export * from './MetricsTracker'

// Export late truncator
export { LateTruncator } from './LateTruncator'