/**
 * Tokenization Types (shared)
 *
 * Public/shared tokenization type definitions used across modules.
 */

/**
 * Configuration options for the tokenization service
 */
export interface TokenizationConfig {
  /** Maximum cache size for LRU cache */
  cacheSize?: number
  /** Whether to enable lazy loading of tokenizers */
  lazyLoad?: boolean
}

/**
 * Result of tokenization operation
 */
export interface TokenizationResult {
  /** Number of tokens */
  tokenCount: number
  /** Whether result was retrieved from cache */
  fromCache: boolean
}

/**
 * Configuration options for token estimation
 */
export interface TokenEstimatorOptions {
  /**
   * Number of characters per token (default: 4)
   * Lower values = more conservative (higher token estimates)
   * Higher values = more optimistic (lower token estimates)
   */
  charsPerToken?: number
}
