/**
 * Token Counter - Simple wrapper around TokenizationService
 *
 * Provides a simplified interface for token counting operations
 * used by the Token Metrics Collector system.
 */

import { TokenizationService, getTokenizationService } from './TokenizationService.js'
import type { SupportedModel, TokenizationResult } from './types.js'

/**
 * Configuration for TokenCounter
 */
export interface TokenCounterConfig {
  /** Default model for token counting */
  defaultModel?: SupportedModel
  /** Whether to use batch processing when possible */
  enableBatching?: boolean
  /** Maximum batch size for batch operations */
  maxBatchSize?: number
}

/**
 * Simple token counter wrapper around TokenizationService
 */
export class TokenCounter {
  private service: TokenizationService
  private config: Required<TokenCounterConfig>

  constructor(config: TokenCounterConfig = {}) {
    this.service = getTokenizationService({
      defaultModel: config.defaultModel
    })

    this.config = {
      defaultModel: config.defaultModel ?? 'gpt-4',
      enableBatching: config.enableBatching ?? true,
      maxBatchSize: config.maxBatchSize ?? 50
    }
  }

  /**
   * Count tokens in a single text
   */
  async count(text: string, model?: SupportedModel): Promise<number> {
    if (!text?.trim()) return 0

    const result = await this.service.countTokens(text, model ?? this.config.defaultModel)

    return result.tokenCount
  }

  /**
   * Count tokens in multiple texts
   */
  async countMultiple(texts: string[], model?: SupportedModel): Promise<number[]> {
    if (!texts.length) return []

    const targetModel = model ?? this.config.defaultModel

    // Filter out empty texts but preserve indices
    const nonEmptyTexts: Array<{ text: string; index: number }> = []
    texts.forEach((text, index) => {
      if (text?.trim()) {
        nonEmptyTexts.push({ text, index })
      }
    })

    if (!nonEmptyTexts.length) {
      return new Array(texts.length).fill(0) as number[]
    }

    // Process in batches if enabled
    if (this.config.enableBatching && nonEmptyTexts.length > this.config.maxBatchSize) {
      const results = new Array(texts.length).fill(0)

      for (let i = 0; i < nonEmptyTexts.length; i += this.config.maxBatchSize) {
        const batch = nonEmptyTexts.slice(i, i + this.config.maxBatchSize)
        const batchTexts = batch.map((item) => item.text)
        const batchResults = await this.service.batchCountTokens(batchTexts, targetModel)

        batch.forEach((item, batchIndex) => {
          results[item.index] = batchResults[batchIndex].tokenCount
        })
      }

      return results as number[]
    } else {
      // Process all at once
      const textArray = nonEmptyTexts.map((item) => item.text)
      const batchResults = await this.service.batchCountTokens(textArray, targetModel)

      const results = new Array(texts.length).fill(0)
      nonEmptyTexts.forEach((item, index) => {
        results[item.index] = batchResults[index].tokenCount
      })

      return results as number[]
    }
  }

  /**
   * Count tokens and return full tokenization result
   */
  async countWithDetails(text: string, model?: SupportedModel): Promise<TokenizationResult> {
    if (!text?.trim()) {
      return {
        tokenCount: 0,
        model: model ?? this.config.defaultModel,
        fromCache: false
      }
    }

    return this.service.countTokens(text, model ?? this.config.defaultModel)
  }

  /**
   * Estimate token count without actual tokenization (fast approximation)
   */
  estimate(text: string): number {
    return this.service.estimateTokenCount(text)
  }

  /**
   * Check if text exceeds token limit
   */
  async exceedsLimit(text: string, limit: number, model?: SupportedModel): Promise<boolean> {
    return this.service.exceedsTokenLimit(text, limit, model ?? this.config.defaultModel)
  }

  /**
   * Get supported models
   */
  getSupportedModels(): SupportedModel[] {
    return this.service.getSupportedModels()
  }

  /**
   * Check if model is supported
   */
  isModelSupported(model: string): model is SupportedModel {
    return this.service.isModelSupported(model)
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<TokenCounterConfig> {
    return { ...this.config }
  }

  /**
   * Get cache statistics from underlying service
   */
  getCacheStats(): { size: number; capacity: number } {
    return this.service.getCacheStats()
  }

  /**
   * Clear tokenization cache
   */
  clearCache(): void {
    this.service.clearCache()
  }
}

/**
 * Default token counter instance
 */
let defaultCounter: TokenCounter | null = null

/**
 * Get or create default token counter instance
 */
export function getTokenCounter(config?: TokenCounterConfig): TokenCounter {
  if (!defaultCounter) {
    defaultCounter = new TokenCounter(config)
  }
  return defaultCounter
}

/**
 * Reset default token counter (useful for testing)
 */
export function resetTokenCounter(): void {
  defaultCounter = null
}
