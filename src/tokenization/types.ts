/**
 * Supported language models for tokenization
 * NOTE: Model is now a pass-through string, no model-specific logic is applied.
 * Token estimation is the same for all models.
 */
export type SupportedModel =
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-3.5-turbo'
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'claude-3-5-sonnet'
  | 'claude-3-5-haiku'
  | string // Allow any string as model since we're just estimating

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
