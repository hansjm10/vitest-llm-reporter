/**
 * Early Truncator - Synchronous truncation for early pipeline stage
 *
 * Fast, deterministic truncation that preserves error signals and
 * important content while staying within token limits.
 */

import type { TruncationConfig } from '../types/reporter.js'
import type { SupportedModel } from '../tokenization/types.js'
import { TokenCounter } from '../tokenization/TokenCounter.js'
import { getEffectiveMaxTokens } from './context.js'
import { ContentPriority } from './types.js'
import { getContentPriority } from './priorities.js'
import {
  safeTrimToChars,
  joinWithEllipsis,
  isStackFrameLine,
  isErrorMessageLine,
  isUserCodePath,
  hasPriorityKeyword,
  handleTinyLimit,
  extractLinesWithContext,
  splitHeadTail,
  estimateCharsForTokens
} from './utils.js'

/**
 * Truncation metrics for a single operation
 */
export interface TruncationMetrics {
  originalTokens: number
  truncatedTokens: number
  tokensRemoved: number
  strategy: string
  timestamp: number
}

/**
 * Result of truncation operation
 */
export interface TruncationResult {
  content: string
  metrics: TruncationMetrics
}

/**
 * Category types for content-aware truncation
 */
export type ContentCategory = 'errors' | 'logs' | 'warns' | 'info' | 'debug'

/**
 * Synchronous early truncator for fast content reduction
 */
export class EarlyTruncator {
  private tokenCounter: TokenCounter
  private config: TruncationConfig
  private metrics: TruncationMetrics[] = []
  private model: SupportedModel

  constructor(config: TruncationConfig) {
    this.config = config
    this.model = (config.model as SupportedModel) || 'gpt-4'
    this.tokenCounter = new TokenCounter({ defaultModel: this.model })
  }

  /**
   * Check if content needs truncation
   */
  needsTruncation(content: string): boolean {
    if (!content || !content.trim()) {
      return false
    }

    const estimatedTokens = this.tokenCounter.estimate(content)
    const maxTokens = getEffectiveMaxTokens(this.model, this.config.maxTokens)
    
    return estimatedTokens > maxTokens
  }

  /**
   * Truncate content using appropriate strategy
   */
  truncate(
    content: string,
    category?: ContentCategory
  ): TruncationResult {
    const originalTokens = this.tokenCounter.estimate(content)
    const maxTokens = getEffectiveMaxTokens(this.model, this.config.maxTokens)

    // If content doesn't need truncation, return as-is
    if (!this.needsTruncation(content)) {
      return this.createResult(content, originalTokens, 'none')
    }

    // Handle tiny limits
    if (maxTokens < 10) {
      const truncated = handleTinyLimit(maxTokens, content)
      return this.createResult(truncated, originalTokens, 'tiny-limit')
    }

    // Apply strategy based on configuration
    let truncated: string
    const strategy = this.config.strategy || 'smart'

    switch (strategy) {
      case 'simple':
        truncated = this.applySimpleStrategy(content, maxTokens)
        break
      case 'priority':
        truncated = this.applyPriorityStrategy(content, maxTokens, category)
        break
      case 'smart':
      default:
        // Special handling for error categories when using smart strategy
        if (category === 'errors' && isStackFrameLine(content)) {
          truncated = this.applyErrorStrategy(content, maxTokens)
          return this.createResult(truncated, originalTokens, 'error-strategy')
        }
        truncated = this.applySmartStrategy(content, maxTokens, category)
        break
    }

    return this.createResult(truncated, originalTokens, strategy)
  }

  /**
   * Simple head/tail strategy
   */
  private applySimpleStrategy(content: string, maxTokens: number): string {
    const targetChars = estimateCharsForTokens(maxTokens)
    const lines = content.split('\n')
    
    // If content is short, just trim it
    if (lines.length <= 3) {
      return safeTrimToChars(content, targetChars)
    }
    
    // Calculate how many lines we can afford for head and tail
    const availableCharsPerSection = targetChars * 0.4
    
    // Build head section
    let headLines: string[] = []
    let headChars = 0
    for (let i = 0; i < Math.floor(lines.length * 0.4); i++) {
      if (headChars + lines[i].length > availableCharsPerSection) break
      headLines.push(lines[i])
      headChars += lines[i].length + 1
    }
    
    // Build tail section (from the end)
    let tailLines: string[] = []
    let tailChars = 0
    for (let i = lines.length - 1; i >= lines.length - Math.floor(lines.length * 0.4); i--) {
      if (tailChars + lines[i].length > availableCharsPerSection) break
      tailLines.unshift(lines[i]) // Add to beginning to maintain order
      tailChars += lines[i].length + 1
    }
    
    const headContent = headLines.join('\n')
    const tailContent = tailLines.join('\n')

    return joinWithEllipsis([headContent, tailContent], '\n...\n')
  }

  /**
   * Smart strategy - preserve lines with keywords
   */
  private applySmartStrategy(
    content: string,
    maxTokens: number,
    category?: ContentCategory
  ): string {
    const lines = content.split('\n')
    const targetChars = estimateCharsForTokens(maxTokens)

    // Find important lines
    const importantIndices: number[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (
        isErrorMessageLine(line) ||
        hasPriorityKeyword(line) ||
        (category === 'errors' && isStackFrameLine(line) && isUserCodePath(line))
      ) {
        importantIndices.push(i)
      }
    }

    // Extract with context
    const selectedIndices = extractLinesWithContext(lines, importantIndices, 1)
    
    // Build result with selected lines
    const chunks: string[] = []
    let currentChunk: string[] = []
    let lastIndex = -2
    let totalChars = 0

    for (const idx of selectedIndices) {
      // Check if we need to add ellipsis
      if (idx > lastIndex + 1 && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'))
        currentChunk = []
      }

      const line = lines[idx]
      if (totalChars + line.length > targetChars * 0.9) {
        break // Stop if we're approaching the limit
      }

      currentChunk.push(line)
      totalChars += line.length + 1
      lastIndex = idx
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'))
    }

    // If we didn't find enough important content, fall back to simple strategy
    if (chunks.length === 0 || totalChars < targetChars * 0.3) {
      return this.applySimpleStrategy(content, maxTokens)
    }

    return joinWithEllipsis(chunks, '\n...\n')
  }

  /**
   * Priority-based strategy
   */
  private applyPriorityStrategy(
    content: string,
    maxTokens: number,
    category?: ContentCategory
  ): string {
    // Determine content priority based on category and content
    let priority: ContentPriority
    
    if (category === 'errors') {
      priority = ContentPriority.CRITICAL
    } else if (category === 'warns') {
      priority = ContentPriority.HIGH
    } else if (category === 'info') {
      priority = ContentPriority.MEDIUM
    } else if (category === 'debug') {
      priority = ContentPriority.LOW
    } else {
      // Check content for priority keywords
      const contentType = category === 'errors' ? 'error' : 'log'
      priority = getContentPriority(content, contentType as any)
    }

    // Preservation ratio: higher priority = keep more content
    const preserveRatio = {
      [ContentPriority.CRITICAL]: 0.9,  // Keep 90% of allowed tokens
      [ContentPriority.HIGH]: 0.7,      // Keep 70% of allowed tokens
      [ContentPriority.MEDIUM]: 0.5,    // Keep 50% of allowed tokens
      [ContentPriority.LOW]: 0.3,       // Keep 30% of allowed tokens
      [ContentPriority.DISPOSABLE]: 0.1 // Keep 10% of allowed tokens
    }[priority]

    // Calculate target size based on priority
    const targetTokens = Math.floor(maxTokens * preserveRatio)
    const targetChars = estimateCharsForTokens(targetTokens)
    
    // Apply trimming based on priority
    if (priority <= ContentPriority.HIGH) {
      // For high priority, try to preserve important parts
      const lines = content.split('\n')
      const importantLines: string[] = []
      let totalChars = 0
      
      // First pass: collect lines with priority keywords
      for (const line of lines) {
        if (hasPriorityKeyword(line) || isErrorMessageLine(line)) {
          if (totalChars + line.length < targetChars * 0.8) {
            importantLines.push(line)
            totalChars += line.length + 1
          }
        }
      }
      
      // Second pass: fill remaining space with other content
      for (const line of lines) {
        if (!importantLines.includes(line)) {
          if (totalChars + line.length < targetChars) {
            importantLines.push(line)
            totalChars += line.length + 1
          }
        }
      }
      
      return importantLines.join('\n') + '\n...[priority-based truncation]'
    }

    // For lower priority, use aggressive trimming
    const trimmed = safeTrimToChars(content, targetChars, { safety: 0.1 })
    return trimmed + '\n...[truncated]'
  }

  /**
   * Special strategy for error stack traces
   */
  private applyErrorStrategy(content: string, maxTokens: number): string {
    const lines = content.split('\n')
    const targetChars = estimateCharsForTokens(maxTokens)
    
    const result: string[] = []
    let currentChars = 0

    // First pass: Keep error headers
    for (const line of lines) {
      if (isErrorMessageLine(line)) {
        result.push(line)
        currentChars += line.length + 1
        if (currentChars > targetChars * 0.3) break
      }
    }

    // Second pass: Keep user code frames (filter out node_modules)
    const userFrames: string[] = []
    const nodeModulesFrames: string[] = []
    
    for (const line of lines) {
      if (isStackFrameLine(line)) {
        if (isUserCodePath(line)) {
          userFrames.push(line)
          if (userFrames.length >= 5) break // Limit user frame count
        } else if (line.includes('node_modules')) {
          nodeModulesFrames.push(line)
        }
      }
    }

    // Combine with budget management
    if (userFrames.length > 0) {
      result.push('Stack trace (user code):')
      for (const frame of userFrames) {
        if (currentChars + frame.length > targetChars * 0.8) break
        result.push(frame)
        currentChars += frame.length + 1
      }
      
      // Add indication of filtered frames if any were removed
      if (nodeModulesFrames.length > 0) {
        result.push(`...[${nodeModulesFrames.length} node_modules frames omitted]`)
      }
    }

    return result.join('\n')
  }

  /**
   * Create truncation result with metrics
   */
  private createResult(
    content: string,
    originalTokens: number,
    strategy: string
  ): TruncationResult {
    const truncatedTokens = this.tokenCounter.estimate(content)
    const tokensRemoved = Math.max(0, originalTokens - truncatedTokens)

    const metrics: TruncationMetrics = {
      originalTokens,
      truncatedTokens,
      tokensRemoved,
      strategy,
      timestamp: Date.now()
    }

    // Only record metrics if tokens were actually removed
    if (tokensRemoved > 0) {
      this.metrics.push(metrics)
      // Keep only last 100 metrics
      if (this.metrics.length > 100) {
        this.metrics = this.metrics.slice(-100)
      }
    }

    return { content, metrics }
  }

  /**
   * Get truncation metrics
   */
  getMetrics(): TruncationMetrics[] {
    return [...this.metrics]
  }

  /**
   * Update configuration
   */
  updateConfig(config: TruncationConfig): void {
    this.config = { ...this.config, ...config }
    if (config.model) {
      this.model = config.model as SupportedModel
      this.tokenCounter = new TokenCounter({ defaultModel: this.model })
    }
  }
}