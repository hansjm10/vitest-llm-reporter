/**
 * Truncation Module
 *
 * Main export module for truncation functionality.
 */

// Export the late truncator (used by OutputBuilder)
export { LateTruncator } from './LateTruncator.js'

// Export only the types that are actually used
export { ContentPriority } from './types.js'
export type { TruncationContext } from './types.js'

// Context utilities removed; truncation uses explicit maxTokens
