/**
 * Tokenization Service - Simplified token estimation service
 *
 * Provides token counting using simple character-based estimation.
 * All counts are ESTIMATES only, not exact tokenization.
 * Default: 4 characters per token.
 */

import type { SupportedModel, TokenizationConfig, TokenizationResult } from './types.js'
import { estimateTokens, estimateTokensBatch, type TokenEstimatorOptions } from './estimator.js'

/**
 * Main tokenization service using simple estimation
 */
export class TokenizationService {
  private config: Required<TokenizationConfig>
  private estimatorOptions: TokenEstimatorOptions

  constructor(config: TokenizationConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'gpt-4',
      cacheSize: config.cacheSize ?? 1000, // Kept for API compatibility, not used
      lazyLoad: config.lazyLoad ?? true // Kept for API compatibility, not used
    }

    // Could be made configurable in the future
    this.estimatorOptions = {
      charsPerToken: 4
    }
  }

  /**
   * Count tokens in text using estimation
   * NOTE: Returns estimated tokens only, not exact counts
   */
  async countTokens(
    text: string,
    model: SupportedModel = this.config.defaultModel
  ): Promise<TokenizationResult> {
    const tokenCount = estimateTokens(text, this.estimatorOptions)

    return {
      tokenCount,
      model,
      fromCache: false // No caching in estimation-only approach
    }
  }

  /**
   * Batch count tokens for multiple texts using estimation
   * NOTE: Returns estimated tokens only, not exact counts
   */
  async batchCountTokens(
    texts: string[],
    model: SupportedModel = this.config.defaultModel
  ): Promise<TokenizationResult[]> {
    const tokenCounts = estimateTokensBatch(texts, this.estimatorOptions)

    return tokenCounts.map((tokenCount) => ({
      tokenCount,
      model,
      fromCache: false
    }))
  }

  /**
   * Estimate token count (synchronous)
   * NOTE: Returns estimated tokens only, not exact counts
   */
  estimateTokenCount(text: string): number {
    return estimateTokens(text, this.estimatorOptions)
  }

  /**
   * Check if text exceeds token limit using estimation
   */
  async exceedsTokenLimit(
    text: string,
    limit: number,
    model: SupportedModel = this.config.defaultModel
  ): Promise<boolean> {
    const result = await this.countTokens(text, model)
    return result.tokenCount > limit
  }

  /**
   * Truncate text to fit within token limit using character-based approximation
   * NOTE: This is approximate truncation based on estimated tokens
   */
  async truncateToTokenLimit(
    text: string,
    limit: number,
    model: SupportedModel = this.config.defaultModel
  ): Promise<string> {
    const result = await this.countTokens(text, model)

    if (result.tokenCount <= limit) {
      return text
    }

    // Calculate character limit based on token limit
    // Use 90% of calculated length to be conservative
    const charsPerToken = this.estimatorOptions.charsPerToken ?? 4
    const targetCharLength = Math.floor(limit * charsPerToken * 0.9)

    return text.substring(0, targetCharLength)
  }

  /**
   * Get supported models
   * NOTE: Model parameter is now just a pass-through string,
   * no model-specific logic is applied
   */
  getSupportedModels(): SupportedModel[] {
    // Return common models for compatibility
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-3-5-sonnet',
      'claude-3-5-haiku'
    ]
  }

  /**
   * Check if a model is supported
   * NOTE: All models are "supported" since we just do estimation
   */
  isModelSupported(model: string): model is SupportedModel {
    // Accept any model string since we're just estimating
    return typeof model === 'string' && model.length > 0
  }

  /**
   * Get cache statistics
   * NOTE: No caching in estimation-only approach, returns empty stats
   */
  getCacheStats(): { size: number; capacity: number } {
    return { size: 0, capacity: 0 }
  }

  /**
   * Clear tokenization cache
   * NOTE: No-op in estimation-only approach
   */
  clearCache(): void {
    // No cache to clear
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<TokenizationConfig> {
    return { ...this.config }
  }
}

/**
 * Default tokenization service instance
 */
let defaultService: TokenizationService | null = null

/**
 * Get or create default tokenization service instance
 */
export function getTokenizationService(config?: TokenizationConfig): TokenizationService {
  if (!defaultService) {
    defaultService = new TokenizationService(config)
  }
  return defaultService
}

/**
 * Reset default tokenization service (useful for testing)
 */
export function resetTokenizationService(): void {
  defaultService = null
}
