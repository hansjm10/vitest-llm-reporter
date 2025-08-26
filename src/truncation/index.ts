/**
 * Truncation Module
 *
 * Main export module for truncation functionality.
 */

// Export the new simplified truncator
export { TokenBudgetTruncator } from './TokenBudgetTruncator.js'

// Export the late truncator (still needed by OutputBuilder)
export { LateTruncator } from './LateTruncator.js'

// Export core types
export type {
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

// Export utilities
export * from './utils.js'
