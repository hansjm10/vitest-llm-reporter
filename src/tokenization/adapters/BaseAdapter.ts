import type { SupportedModel, ITokenizer } from '../types.js';

/**
 * Base adapter interface for model-specific tokenization
 */
export interface ITokenizationAdapter {
  /**
   * Get the models this adapter supports
   */
  getSupportedModels(): SupportedModel[];

  /**
   * Check if this adapter supports a specific model
   */
  supportsModel(model: SupportedModel): boolean;

  /**
   * Create a tokenizer for the specified model
   */
  createTokenizer(model: SupportedModel): Promise<ITokenizer>;

  /**
   * Get a display name for this adapter
   */
  getName(): string;

  /**
   * Clear cached tokenizers
   */
  clearCache(): void;

  /**
   * Get cache size
   */
  getCacheSize(): number;
}

/**
 * Abstract base class for tokenization adapters
 */
export abstract class BaseAdapter implements ITokenizationAdapter {
  protected tokenizerCache = new Map<SupportedModel, ITokenizer>();

  abstract getSupportedModels(): SupportedModel[];
  abstract getName(): string;
  
  /**
   * Default implementation checks if model is in supported models list
   */
  supportsModel(model: SupportedModel): boolean {
    return this.getSupportedModels().includes(model);
  }

  /**
   * Create tokenizer with caching
   */
  async createTokenizer(model: SupportedModel): Promise<ITokenizer> {
    if (!this.supportsModel(model)) {
      throw new Error(`Model ${model} is not supported by ${this.getName()}`);
    }

    // Return cached tokenizer if available
    const cached = this.tokenizerCache.get(model);
    if (cached) {
      return cached;
    }

    // Create new tokenizer
    const tokenizer = await this.createTokenizerImplementation(model);
    
    // Cache for future use
    this.tokenizerCache.set(model, tokenizer);
    
    return tokenizer;
  }

  /**
   * Abstract method for creating the actual tokenizer
   * Implementations should override this method
   */
  protected abstract createTokenizerImplementation(model: SupportedModel): Promise<ITokenizer>;

  /**
   * Clear cached tokenizers
   */
  clearCache(): void {
    this.tokenizerCache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.tokenizerCache.size;
  }
}