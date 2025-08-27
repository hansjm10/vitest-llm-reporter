/**
 * Truncation types and interfaces
 *
 * This module defines the core interfaces and types for the truncation system,
 * including the strategy pattern interface and context management types.
 */

import type { SupportedModel } from '../types/tokenization.js'

/**
 * Priority levels for content preservation during truncation
 */
export enum ContentPriority {
  /** Critical content that should never be truncated */
  CRITICAL = 1,
  /** High priority content - truncate only if necessary */
  HIGH = 2,
  /** Medium priority content - can be truncated moderately */
  MEDIUM = 3,
  /** Low priority content - can be truncated aggressively */
  LOW = 4,
  /** Disposable content - truncate first */
  DISPOSABLE = 5
}

/**
 * Context information for truncation operations
 */
export interface TruncationContext {
  /** Target LLM model */
  model: SupportedModel
  /** Maximum allowed tokens */
  maxTokens: number
  /** Content type being truncated */
  contentType: string
  /** Priority of the content */
  priority: ContentPriority
  /** Whether to preserve structure (e.g., JSON validity) */
  preserveStructure: boolean
  /** Custom metadata for strategy decisions */
  metadata?: Record<string, unknown>
}

/**
 * Result of a truncation operation
 */
export interface TruncationResult {
  /** Truncated content */
  content: string
  /** Number of tokens in truncated content */
  tokenCount: number
  /** Number of tokens saved by truncation */
  tokensSaved: number
  /** Whether content was actually truncated */
  wasTruncated: boolean
  /** Strategy used for truncation */
  strategyUsed: string
  /** Any warnings or information about the truncation */
  warnings?: string[]
}

/**
 * Truncation strategy interface
 *
 * Implementations define specific approaches to truncating content
 * while preserving important information based on context.
 */
export interface TruncationStrategy {
  /** Strategy name for identification */
  readonly name: string

  /** Strategy priority (higher means more preferred) */
  readonly priority: number

  /**
   * Truncate content according to this strategy
   * @param content Original content to truncate
   * @param maxTokens Maximum allowed tokens
   * @param context Truncation context and configuration
   * @returns Truncated content and metadata
   */
  truncate(
    content: string,
    maxTokens: number,
    context: TruncationContext
  ): Promise<TruncationResult>

  /**
   * Check if this strategy can handle the given content
   * @param content Content to evaluate
   * @param context Truncation context
   * @returns True if strategy can handle this content
   */
  canTruncate(content: string, context: TruncationContext): boolean

  /**
   * Estimate potential token savings without performing truncation
   * @param content Content to evaluate
   * @param maxTokens Maximum allowed tokens
   * @param context Truncation context
   * @returns Estimated number of tokens that could be saved
   */
  estimateSavings(content: string, maxTokens: number, context: TruncationContext): Promise<number>
}

// Backward compatibility alias
export type ITruncationStrategy = TruncationStrategy

/**
 * Configuration for the truncation engine
 */
export interface TruncationEngineConfig {
  /** Default model for token counting */
  defaultModel?: SupportedModel
  /** Maximum number of truncation attempts before giving up */
  maxAttempts?: number
  /** Whether to enable aggressive truncation as a fallback */
  enableAggressiveFallback?: boolean
  /** Custom strategy configurations */
  strategyConfigs?: Record<string, unknown>
}

/**
 * Statistics about truncation operations
 */
export interface TruncationStats {
  /** Total truncations performed */
  totalTruncations: number
  /** Total tokens saved */
  totalTokensSaved: number
  /** Average tokens saved per truncation */
  averageTokensSaved: number
  /** Strategy usage counts */
  strategyUsage: Record<string, number>
  /** Content type breakdown */
  contentTypeBreakdown: Record<string, number>
}

/**
 * Content type definitions for different kinds of content
 */
export enum ContentType {
  /** Plain text content */
  TEXT = 'text',
  /** JSON formatted content */
  JSON = 'json',
  /** Code content (various languages) */
  CODE = 'code',
  /** Error messages and stack traces */
  ERROR = 'error',
  /** Test case descriptions and results */
  TEST = 'test',
  /** Log messages */
  LOG = 'log',
  /** Markdown formatted content */
  MARKDOWN = 'markdown'
}

/**
 * Configuration for content-specific truncation behavior
 */
export interface ContentTypeConfig {
  /** Content type */
  type: ContentType
  /** Default priority for this content type */
  defaultPriority: ContentPriority
  /** Whether to preserve structure by default */
  preserveStructure: boolean
  /** Preferred strategies for this content type */
  preferredStrategies?: string[]
  /** Maximum truncation percentage allowed */
  maxTruncationPercent?: number
}

/**
 * Late truncation metrics
 */
export interface LateTruncationMetrics {
  originalTokens: number
  truncatedTokens: number
  tokensRemoved: number
  phasesApplied: string[]
  timestamp: number
}

/**
 * Context window information for a specific model
 */
export interface ModelContextInfo {
  /** Model name */
  model: SupportedModel
  /** Total context window size */
  contextWindow: number
  /** Safety margin percentage */
  safetyMargin: number
  /** Effective maximum tokens for content */
  effectiveMaxTokens: number
  /** Recommended truncation thresholds */
  truncationThresholds: {
    warning: number // Warn when approaching this limit
    required: number // Must truncate beyond this point
  }
}

/**
 * Options for safe text trimming
 */
export interface SafeTrimOptions {
  /** Prefer natural boundaries (spaces, newlines) */
  preferBoundaries?: boolean
  /** Safety margin as percentage (0-1) */
  safety?: number
}
