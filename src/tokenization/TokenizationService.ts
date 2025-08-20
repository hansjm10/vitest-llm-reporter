import { getEncoding, type TiktokenEncoding } from 'js-tiktoken';
import type {
  SupportedModel,
  TokenizationConfig,
  TokenizationResult,
  CacheEntry,
  CacheKey,
  ITokenizer,
  ITokenizerFactory,
} from './types.js';
import { TokenizationCache } from './cache.js';

/**
 * Model to TikToken encoding mapping
 */
const MODEL_ENCODING_MAP: Record<SupportedModel, TiktokenEncoding> = {
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  // Claude models use approximate GPT-4 tokenization
  'claude-3-opus': 'cl100k_base',
  'claude-3-sonnet': 'cl100k_base',
  'claude-3-haiku': 'cl100k_base',
  'claude-3-5-sonnet': 'cl100k_base',
  'claude-3-5-haiku': 'cl100k_base',
};

/**
 * TikToken-based tokenizer implementation
 */
class TikTokenTokenizer implements ITokenizer {
  private encoding: any;

  constructor(
    private model: SupportedModel,
    encoding: any
  ) {
    this.encoding = encoding;
  }

  encode(text: string): number[] {
    return this.encoding.encode(text);
  }

  countTokens(text: string): number {
    return this.encoding.encode(text).length;
  }

  getModel(): SupportedModel {
    return this.model;
  }
}

/**
 * Factory for creating tokenizers
 */
class TokenizerFactory implements ITokenizerFactory {
  private tokenizerCache = new Map<SupportedModel, ITokenizer>();
  private lazyLoad: boolean;

  constructor(lazyLoad = true) {
    this.lazyLoad = lazyLoad;
  }

  async createTokenizer(model: SupportedModel): Promise<ITokenizer> {
    // Return cached tokenizer if available
    const cached = this.tokenizerCache.get(model);
    if (cached) {
      return cached;
    }

    // Create new tokenizer
    const encodingName = MODEL_ENCODING_MAP[model];
    if (!encodingName) {
      throw new Error(`Unsupported model: ${model}`);
    }

    try {
      const encoding = getEncoding(encodingName);
      const tokenizer = new TikTokenTokenizer(model, encoding);
      
      // Cache for future use
      this.tokenizerCache.set(model, tokenizer);
      
      return tokenizer;
    } catch (error) {
      throw new Error(`Failed to initialize tokenizer for model ${model}: ${error}`);
    }
  }

  isModelSupported(model: string): model is SupportedModel {
    return model in MODEL_ENCODING_MAP;
  }

  /**
   * Preload tokenizers for all models (useful when lazyLoad is false)
   */
  async preloadAll(): Promise<void> {
    const models = Object.keys(MODEL_ENCODING_MAP) as SupportedModel[];
    await Promise.all(
      models.map(model => this.createTokenizer(model))
    );
  }

  /**
   * Clear cached tokenizers
   */
  clearCache(): void {
    this.tokenizerCache.clear();
  }
}

/**
 * Main tokenization service
 */
export class TokenizationService {
  private config: Required<TokenizationConfig>;
  private cache: TokenizationCache;
  private factory: ITokenizerFactory;

  constructor(config: TokenizationConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'gpt-4',
      cacheSize: config.cacheSize ?? 1000,
      lazyLoad: config.lazyLoad ?? true,
    };

    this.cache = new TokenizationCache(this.config.cacheSize);
    this.factory = new TokenizerFactory(this.config.lazyLoad);
  }

  /**
   * Count tokens in text using specified model
   */
  async countTokens(
    text: string,
    model: SupportedModel = this.config.defaultModel
  ): Promise<TokenizationResult> {
    if (!text) {
      return {
        tokenCount: 0,
        model,
        fromCache: false,
      };
    }

    // Check cache first
    const cacheKey: CacheKey = { text, model };
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return {
        ...cached.result,
        fromCache: true,
      };
    }

    // Tokenize using appropriate tokenizer
    const tokenizer = await this.factory.createTokenizer(model);
    const tokenCount = tokenizer.countTokens(text);
    
    const result: TokenizationResult = {
      tokenCount,
      model,
      fromCache: false,
    };

    // Cache the result
    const cacheEntry: CacheEntry = {
      result,
      timestamp: Date.now(),
    };
    this.cache.set(cacheKey, cacheEntry);

    return result;
  }

  /**
   * Encode text to tokens using specified model
   */
  async encode(
    text: string,
    model: SupportedModel = this.config.defaultModel
  ): Promise<number[]> {
    if (!text) {
      return [];
    }

    const tokenizer = await this.factory.createTokenizer(model);
    return tokenizer.encode(text);
  }

  /**
   * Batch count tokens for multiple texts
   */
  async batchCountTokens(
    texts: string[],
    model: SupportedModel = this.config.defaultModel
  ): Promise<TokenizationResult[]> {
    return Promise.all(
      texts.map(text => this.countTokens(text, model))
    );
  }

  /**
   * Get supported models
   */
  getSupportedModels(): SupportedModel[] {
    return Object.keys(MODEL_ENCODING_MAP) as SupportedModel[];
  }

  /**
   * Check if a model is supported
   */
  isModelSupported(model: string): model is SupportedModel {
    return this.factory.isModelSupported(model);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; capacity: number } {
    return this.cache.getStats();
  }

  /**
   * Clear tokenization cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Preload all tokenizers (useful for reducing first-time latency)
   */
  async preloadTokenizers(): Promise<void> {
    if (this.factory instanceof TokenizerFactory) {
      await this.factory.preloadAll();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<TokenizationConfig> {
    return { ...this.config };
  }

  /**
   * Estimate token count without loading tokenizer (rough approximation)
   * Useful for quick estimates when exact count isn't needed
   */
  estimateTokenCount(text: string): number {
    if (!text) return 0;
    
    // Rough approximation: ~4 characters per token for English text
    // This is a very rough estimate and should not be used for precise calculations
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if text exceeds token limit for a model
   */
  async exceedsTokenLimit(
    text: string,
    limit: number,
    model: SupportedModel = this.config.defaultModel
  ): Promise<boolean> {
    const result = await this.countTokens(text, model);
    return result.tokenCount > limit;
  }

  /**
   * Truncate text to fit within token limit
   * Note: This is a rough implementation that truncates by characters
   * For precise truncation, you'd need to decode tokens back to text
   */
  async truncateToTokenLimit(
    text: string,
    limit: number,
    model: SupportedModel = this.config.defaultModel
  ): Promise<string> {
    const result = await this.countTokens(text, model);
    
    if (result.tokenCount <= limit) {
      return text;
    }

    // Rough truncation by character ratio
    const ratio = limit / result.tokenCount;
    const targetLength = Math.floor(text.length * ratio * 0.9); // 90% to be safe
    
    return text.substring(0, targetLength);
  }
}

/**
 * Default tokenization service instance
 */
let defaultService: TokenizationService | null = null;

/**
 * Get or create default tokenization service instance
 */
export function getTokenizationService(config?: TokenizationConfig): TokenizationService {
  if (!defaultService) {
    defaultService = new TokenizationService(config);
  }
  return defaultService;
}

/**
 * Reset default tokenization service (useful for testing)
 */
export function resetTokenizationService(): void {
  defaultService = null;
}