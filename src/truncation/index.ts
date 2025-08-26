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
} from './types.js'

// Export context utilities
export * from './context.js'

// Export priorities
export * from './priorities.js'

// Export the synchronous early truncator
export {
  EarlyTruncator,
  ContentCategory,
  // Note: TruncationMetrics and TruncationResult from EarlyTruncator
  // are different from those in types.ts, so we export them with aliases
  type TruncationMetrics as EarlyTruncationMetrics,
  type TruncationResult as EarlyTruncationResult
} from './EarlyTruncator.js'

// Export utilities
export * from './utils.js'

// Export metrics tracker
export * from './MetricsTracker.js'

// Export late truncator
export { LateTruncator } from './LateTruncator.js'
