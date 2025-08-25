/**
 * Truncation Module
 *
 * Main export module for truncation functionality including
 * the early truncator, types, and utilities.
 */

// Export core types
export * from './types'
export * from './context'
export * from './priorities'

// Export the synchronous early truncator
export * from './EarlyTruncator'

// Export utilities
export * from './utils'

// Export metrics tracker
export * from './MetricsTracker'