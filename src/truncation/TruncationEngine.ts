/**
 * TruncationEngine - Main engine implementing the strategy pattern
 * 
 * This is the core orchestrator for content truncation, managing multiple
 * truncation strategies and applying them based on content type, priority,
 * and context requirements.
 */

import type { 
  ITruncationStrategy, 
  TruncationContext, 
  TruncationResult, 
  TruncationEngineConfig,
  TruncationStats,
  ContentType
} from './types.js'
import type { SupportedModel } from '../tokenization/types.js'
import type { TruncationConfig } from '../types/reporter.js'
import { TokenCounter, getTokenCounter } from '../tokenization/TokenCounter.js'
import { 
  createTruncationContext,
  getEffectiveMaxTokens,
  wouldExceedContext,
  calculateTruncationTarget
} from './context.js'
import { 
  PriorityManager, 
  defaultPriorityManager,
  getContentPriority
} from './priorities.js'

/**
 * Main truncation engine implementing strategy pattern
 */
export class TruncationEngine {
  private strategies: Map<string, ITruncationStrategy> = new Map()
  private tokenCounter: TokenCounter
  private priorityManager: PriorityManager
  private config: Required<TruncationEngineConfig>
  private stats: TruncationStats

  constructor(
    config: TruncationEngineConfig = {},
    tokenCounter?: TokenCounter,
    priorityManager?: PriorityManager
  ) {
    this.config = {
      defaultModel: config.defaultModel || 'gpt-4',
      maxAttempts: config.maxAttempts || 3,
      enableAggressiveFallback: config.enableAggressiveFallback ?? true,
      strategyConfigs: config.strategyConfigs || {}
    }

    this.tokenCounter = tokenCounter || getTokenCounter({
      defaultModel: this.config.defaultModel
    })
    
    this.priorityManager = priorityManager || defaultPriorityManager

    this.stats = {
      totalTruncations: 0,
      totalTokensSaved: 0,
      averageTokensSaved: 0,
      strategyUsage: {},
      contentTypeBreakdown: {}
    }
  }

  /**
   * Register a truncation strategy
   */
  registerStrategy(strategy: ITruncationStrategy): void {
    this.strategies.set(strategy.name, strategy)
  }

  /**
   * Unregister a truncation strategy
   */
  unregisterStrategy(strategyName: string): void {
    this.strategies.delete(strategyName)
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): ITruncationStrategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * Get strategy by name
   */
  getStrategy(name: string): ITruncationStrategy | undefined {
    return this.strategies.get(name)
  }

  /**
   * Main truncation method - orchestrates the truncation process
   */
  async truncate(
    content: string,
    model: SupportedModel,
    contentType: ContentType | string,
    options: {
      maxTokens?: number
      priority?: import('./types.js').ContentPriority
      preserveStructure?: boolean
      preferredStrategies?: string[]
      metadata?: Record<string, unknown>
    } = {}
  ): Promise<TruncationResult> {
    // Validate input
    if (!content || !content.trim()) {
      return this.createEmptyResult('empty-content')
    }

    // Count initial tokens
    const initialTokens = await this.tokenCounter.count(content, model)
    const effectiveMaxTokens = options.maxTokens || getEffectiveMaxTokens(model)

    // Check if truncation is needed
    if (initialTokens <= effectiveMaxTokens) {
      return {
        content,
        tokenCount: initialTokens,
        tokensSaved: 0,
        wasTruncated: false,
        strategyUsed: 'none',
        warnings: []
      }
    }

    // Create truncation context
    const priority = options.priority || getContentPriority(content, contentType as ContentType)
    const context = createTruncationContext(model, contentType, {
      maxTokens: effectiveMaxTokens,
      priority,
      preserveStructure: options.preserveStructure,
      metadata: options.metadata
    })

    // Find applicable strategies
    const applicableStrategies = this.findApplicableStrategies(content, context, options.preferredStrategies)

    if (applicableStrategies.length === 0) {
      // No strategies available - return aggressive fallback if enabled
      if (this.config.enableAggressiveFallback) {
        return this.performAggressiveFallback(content, context, initialTokens)
      } else {
        return this.createFailureResult(content, initialTokens, 'no-strategies')
      }
    }

    // Attempt truncation with available strategies
    let bestResult: TruncationResult | null = null
    let attempts = 0

    for (const strategy of applicableStrategies) {
      if (attempts >= this.config.maxAttempts) {
        break
      }

      try {
        const result = await strategy.truncate(content, effectiveMaxTokens, context)
        
        // Validate result
        const actualTokens = await this.tokenCounter.count(result.content, model)
        
        if (actualTokens <= effectiveMaxTokens) {
          // Success! Update result with actual token count
          const finalResult: TruncationResult = {
            ...result,
            tokenCount: actualTokens,
            tokensSaved: initialTokens - actualTokens,
            wasTruncated: true,
            strategyUsed: strategy.name
          }

          // Update statistics
          this.updateStats(finalResult, contentType)
          
          return finalResult
        } else {
          // Strategy didn't achieve target, but might be our best attempt
          if (!bestResult || actualTokens < bestResult.tokenCount) {
            bestResult = {
              ...result,
              tokenCount: actualTokens,
              tokensSaved: initialTokens - actualTokens,
              wasTruncated: true,
              strategyUsed: strategy.name,
              warnings: [
                ...(result.warnings || []),
                `Strategy ${strategy.name} did not achieve target token count`
              ]
            }
          }
        }

        attempts++
      } catch (error) {
        // Strategy failed, try next one
        console.warn(`Truncation strategy ${strategy.name} failed:`, error)
        attempts++
        continue
      }
    }

    // If we have a best result that's at least an improvement, use it
    if (bestResult && bestResult.tokenCount < initialTokens) {
      this.updateStats(bestResult, contentType)
      return bestResult
    }

    // All strategies failed - try aggressive fallback if enabled
    if (this.config.enableAggressiveFallback) {
      const fallbackResult = this.performAggressiveFallback(content, context, initialTokens)
      this.updateStats(fallbackResult, contentType)
      return fallbackResult
    }

    // Complete failure
    return this.createFailureResult(content, initialTokens, 'all-strategies-failed')
  }

  /**
   * Estimate potential savings without performing actual truncation
   */
  async estimateSavings(
    content: string,
    model: SupportedModel,
    contentType: ContentType | string,
    options: {
      maxTokens?: number
      priority?: import('./types.js').ContentPriority
      preferredStrategies?: string[]
    } = {}
  ): Promise<number> {
    const initialTokens = await this.tokenCounter.count(content, model)
    const effectiveMaxTokens = options.maxTokens || getEffectiveMaxTokens(model)

    if (initialTokens <= effectiveMaxTokens) {
      return 0 // No truncation needed
    }

    const priority = options.priority || getContentPriority(content, contentType as ContentType)
    const context = createTruncationContext(model, contentType, {
      maxTokens: effectiveMaxTokens,
      priority
    })

    const applicableStrategies = this.findApplicableStrategies(content, context, options.preferredStrategies)

    if (applicableStrategies.length === 0) {
      // Fallback to simple estimation
      return Math.max(0, initialTokens - effectiveMaxTokens)
    }

    // Get estimates from all applicable strategies and return the best (highest savings)
    let bestSavings = 0
    
    for (const strategy of applicableStrategies) {
      try {
        const estimatedSavings = await strategy.estimateSavings(content, effectiveMaxTokens, context)
        bestSavings = Math.max(bestSavings, estimatedSavings)
      } catch (error) {
        // Skip failed estimates
        continue
      }
    }

    return bestSavings
  }

  /**
   * Check if content needs truncation for a given model
   */
  async needsTruncation(
    content: string,
    model: SupportedModel,
    maxTokens?: number
  ): Promise<boolean> {
    const tokenCount = await this.tokenCounter.count(content, model)
    return wouldExceedContext(tokenCount, model, maxTokens)
  }

  /**
   * Get truncation statistics
   */
  getStats(): TruncationStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalTruncations: 0,
      totalTokensSaved: 0,
      averageTokensSaved: 0,
      strategyUsage: {},
      contentTypeBreakdown: {}
    }
  }

  /**
   * Get engine configuration
   */
  getConfig(): Required<TruncationEngineConfig> {
    return { ...this.config }
  }

  // Private helper methods

  private findApplicableStrategies(
    content: string,
    context: TruncationContext,
    preferredStrategies?: string[]
  ): ITruncationStrategy[] {
    let strategies = Array.from(this.strategies.values())
    
    // Filter to strategies that can handle this content
    strategies = strategies.filter(strategy => 
      strategy.canTruncate(content, context)
    )

    // If preferred strategies are specified, prioritize them
    if (preferredStrategies && preferredStrategies.length > 0) {
      const preferred = strategies.filter(s => preferredStrategies.includes(s.name))
      const others = strategies.filter(s => !preferredStrategies.includes(s.name))
      strategies = [...preferred, ...others]
    }

    // Sort by strategy priority (higher priority first)
    strategies.sort((a, b) => b.priority - a.priority)

    return strategies
  }

  private performAggressiveFallback(
    content: string,
    context: TruncationContext,
    initialTokens: number
  ): TruncationResult {
    // Calculate target length based on token ratio
    const targetTokens = calculateTruncationTarget(
      initialTokens,
      context.maxTokens,
      context.priority
    )

    // Simple character-based truncation as last resort
    const tokenRatio = targetTokens / initialTokens
    const targetLength = Math.floor(content.length * tokenRatio * 0.9) // 10% safety margin
    
    let truncated = content.substring(0, targetLength)
    
    // Try to end at a reasonable boundary
    const lastSpace = truncated.lastIndexOf(' ')
    const lastNewline = truncated.lastIndexOf('\n')
    const lastSentence = truncated.lastIndexOf('.')
    
    const boundary = Math.max(lastSpace, lastNewline, lastSentence)
    if (boundary > targetLength * 0.8) { // Don't cut too much
      truncated = truncated.substring(0, boundary + 1)
    }

    // Add truncation indicator
    truncated += '\n... [Content truncated by aggressive fallback]'

    return {
      content: truncated,
      tokenCount: targetTokens, // Estimate
      tokensSaved: initialTokens - targetTokens,
      wasTruncated: true,
      strategyUsed: 'aggressive-fallback',
      warnings: ['Used aggressive fallback truncation - content may be incomplete']
    }
  }

  private createEmptyResult(strategy: string): TruncationResult {
    return {
      content: '',
      tokenCount: 0,
      tokensSaved: 0,
      wasTruncated: false,
      strategyUsed: strategy
    }
  }

  private createFailureResult(
    content: string,
    initialTokens: number,
    strategy: string
  ): TruncationResult {
    return {
      content,
      tokenCount: initialTokens,
      tokensSaved: 0,
      wasTruncated: false,
      strategyUsed: strategy,
      warnings: ['Truncation failed - content exceeds token limits']
    }
  }

  private updateStats(result: TruncationResult, contentType: string): void {
    this.stats.totalTruncations++
    this.stats.totalTokensSaved += result.tokensSaved
    this.stats.averageTokensSaved = this.stats.totalTokensSaved / this.stats.totalTruncations

    // Update strategy usage
    this.stats.strategyUsage[result.strategyUsed] = 
      (this.stats.strategyUsage[result.strategyUsed] || 0) + 1

    // Update content type breakdown
    this.stats.contentTypeBreakdown[contentType] = 
      (this.stats.contentTypeBreakdown[contentType] || 0) + 1
  }
}

/**
 * Default truncation engine instance
 */
let defaultEngine: TruncationEngine | null = null

/**
 * Get or create default truncation engine instance
 */
export function getTruncationEngine(config?: TruncationEngineConfig): TruncationEngine {
  if (!defaultEngine) {
    defaultEngine = new TruncationEngine(config)
  }
  return defaultEngine
}

/**
 * Reset default truncation engine (useful for testing)
 */
export function resetTruncationEngine(): void {
  defaultEngine = null
}

// Compatibility layer for existing codebase

/**
 * Legacy interface for truncation engine (compatibility with existing code)
 */
export interface ITruncationEngine {
  /** Check if content needs truncation */
  needsTruncation(content: string): boolean
  /** Truncate content and return result with metrics */
  truncate(content: string): {
    content: string
    metrics: {
      originalTokens: number
      truncatedTokens: number
      tokensRemoved: number
    }
  }
  /** Get truncation metrics */
  getMetrics(): Array<{
    originalTokens: number
    truncatedTokens: number
    tokensRemoved: number
    strategy: string
    timestamp: number
  }>
  /** Update configuration */
  updateConfig(config: TruncationConfig): void
}

/**
 * Legacy wrapper that adapts TruncationEngine to ITruncationEngine interface
 */
class LegacyTruncationEngineAdapter implements ITruncationEngine {
  private engine: TruncationEngine
  private model: SupportedModel
  private maxTokens?: number
  private metrics: Array<{
    originalTokens: number
    truncatedTokens: number
    tokensRemoved: number
    strategy: string
    timestamp: number
  }> = []

  constructor(config: TruncationConfig) {
    const engineConfig: TruncationEngineConfig = {
      defaultModel: (config.model as SupportedModel) || 'gpt-4',
      maxAttempts: 3,
      enableAggressiveFallback: true
    }
    
    this.engine = new TruncationEngine(engineConfig)
    this.model = engineConfig.defaultModel
    this.maxTokens = config.maxTokens
  }

  needsTruncation(content: string): boolean {
    // Use a synchronous approximation for compatibility
    const estimatedTokens = this.engine['tokenCounter'].estimate(content)
    const effectiveMax = this.maxTokens || getEffectiveMaxTokens(this.model)
    return estimatedTokens > effectiveMax
  }

  truncate(content: string): {
    content: string
    metrics: {
      originalTokens: number
      truncatedTokens: number
      tokensRemoved: number
    }
  } {
    // For compatibility, we need to provide synchronous behavior
    // This is a simplified version that uses character-based truncation
    const estimatedTokens = this.engine['tokenCounter'].estimate(content)
    const effectiveMax = this.maxTokens || getEffectiveMaxTokens(this.model)
    
    if (estimatedTokens <= effectiveMax) {
      return {
        content,
        metrics: {
          originalTokens: estimatedTokens,
          truncatedTokens: estimatedTokens,
          tokensRemoved: 0
        }
      }
    }

    // Simple character-based truncation for compatibility
    const ratio = effectiveMax / estimatedTokens
    const targetLength = Math.floor(content.length * ratio * 0.9) // 10% safety margin
    
    let truncated = content.substring(0, targetLength)
    
    // Try to end at a reasonable boundary
    const lastSpace = truncated.lastIndexOf(' ')
    const lastNewline = truncated.lastIndexOf('\n')
    const boundary = Math.max(lastSpace, lastNewline)
    
    if (boundary > targetLength * 0.8) {
      truncated = truncated.substring(0, boundary)
    }
    
    const truncatedTokens = this.engine['tokenCounter'].estimate(truncated)
    const tokensRemoved = estimatedTokens - truncatedTokens
    
    // Record metrics
    const metric = {
      originalTokens: estimatedTokens,
      truncatedTokens,
      tokensRemoved,
      strategy: 'legacy-character-based',
      timestamp: Date.now()
    }
    this.metrics.push(metric)
    
    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100)
    }

    return {
      content: truncated,
      metrics: {
        originalTokens: estimatedTokens,
        truncatedTokens,
        tokensRemoved
      }
    }
  }

  getMetrics(): Array<{
    originalTokens: number
    truncatedTokens: number
    tokensRemoved: number
    strategy: string
    timestamp: number
  }> {
    return [...this.metrics]
  }

  updateConfig(config: TruncationConfig): void {
    if (config.maxTokens !== undefined) {
      this.maxTokens = config.maxTokens
    }
    if (config.model) {
      this.model = config.model as SupportedModel
    }
  }
}

/**
 * Factory function to create truncation engine (compatibility with existing code)
 */
export function createTruncationEngine(config: TruncationConfig): ITruncationEngine {
  return new LegacyTruncationEngineAdapter(config)
}