/**
 * Supported language models for tokenization
 * NOTE: Model is now a pass-through string, no model-specific logic is applied.
 * Token estimation is the same for all models.
 */
export type SupportedModel = string

/**
 * Configuration options for the tokenization service
 */
export interface TokenizationConfig {
  /** Default model to use for tokenization */
  defaultModel?: SupportedModel
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
  /** Model used for tokenization */
  model: SupportedModel
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
