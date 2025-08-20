/**
 * Supported language models for tokenization
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
  | 'claude-3-5-haiku';

/**
 * Configuration options for the tokenization service
 */
export interface TokenizationConfig {
  /** Default model to use for tokenization */
  defaultModel?: SupportedModel;
  /** Maximum cache size for LRU cache */
  cacheSize?: number;
  /** Whether to enable lazy loading of tokenizers */
  lazyLoad?: boolean;
}

/**
 * Result of tokenization operation
 */
export interface TokenizationResult {
  /** Number of tokens */
  tokenCount: number;
  /** Model used for tokenization */
  model: SupportedModel;
  /** Whether result was retrieved from cache */
  fromCache: boolean;
}

/**
 * Cache entry for tokenization results
 */
export interface CacheEntry {
  /** Tokenization result */
  result: TokenizationResult;
  /** Timestamp when entry was created */
  timestamp: number;
}

/**
 * Cache key for tokenization operations
 */
export interface CacheKey {
  /** Text content */
  text: string;
  /** Model used */
  model: SupportedModel;
}

/**
 * Tokenizer interface for different models
 */
export interface ITokenizer {
  /** Encode text to tokens */
  encode(text: string): number[];
  /** Count tokens in text */
  countTokens(text: string): number;
  /** Get model name */
  getModel(): SupportedModel;
}

/**
 * Tokenizer factory interface
 */
export interface ITokenizerFactory {
  /** Create tokenizer for specified model */
  createTokenizer(model: SupportedModel): Promise<ITokenizer>;
  /** Check if model is supported */
  isModelSupported(model: string): model is SupportedModel;
}

/**
 * LRU Cache interface
 */
export interface ILRUCache<K, V> {
  /** Get value by key */
  get(key: K): V | undefined;
  /** Set key-value pair */
  set(key: K, value: V): void;
  /** Check if key exists */
  has(key: K): boolean;
  /** Clear all entries */
  clear(): void;
  /** Get current size */
  size(): number;
  /** Get maximum capacity */
  capacity(): number;
}