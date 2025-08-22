/**
 * Context window management for different LLM models
 *
 * This module provides context window size information and utilities
 * for managing token limits across different language models.
 */

import type { SupportedModel } from '../tokenization/types.js'
import type { TruncationContext } from './types.js'
import { ContentPriority } from './types.js'

/**
 * Context window sizes for supported models (in tokens)
 *
 * These values represent the maximum context window size for each model.
 * We use conservative estimates to account for model variations and safety margins.
 */
export const MODEL_CONTEXT_WINDOWS: Record<SupportedModel, number> = {
  // GPT-4 series
  'gpt-4': 128_000, // GPT-4 Turbo and newer
  'gpt-4-turbo': 128_000, // Explicit GPT-4 Turbo
  'gpt-4o': 128_000, // GPT-4o
  'gpt-4o-mini': 128_000, // GPT-4o Mini
  'gpt-3.5-turbo': 16_385, // GPT-3.5 Turbo

  // Claude 3 series
  'claude-3-opus': 200_000, // Claude 3 Opus
  'claude-3-sonnet': 200_000, // Claude 3 Sonnet
  'claude-3-haiku': 200_000, // Claude 3 Haiku
  'claude-3-5-sonnet': 200_000, // Claude 3.5 Sonnet
  'claude-3-5-haiku': 200_000 // Claude 3.5 Haiku
}

/**
 * Recommended safety margins for each model (percentage of context window to reserve)
 *
 * These margins account for:
 * - Model response tokens
 * - System prompts and instructions
 * - Unexpected tokenization variations
 */
export const MODEL_SAFETY_MARGINS: Record<SupportedModel, number> = {
  // GPT models - need more margin for response generation
  'gpt-4': 0.15,
  'gpt-4-turbo': 0.15,
  'gpt-4o': 0.15,
  'gpt-4o-mini': 0.15,
  'gpt-3.5-turbo': 0.2, // Smaller context window, larger margin needed

  // Claude models - generally more efficient with context usage
  'claude-3-opus': 0.1,
  'claude-3-sonnet': 0.1,
  'claude-3-haiku': 0.1,
  'claude-3-5-sonnet': 0.1,
  'claude-3-5-haiku': 0.1
}

/**
 * Get the maximum context window size for a model
 */
export function getContextWindowSize(model: SupportedModel): number {
  return MODEL_CONTEXT_WINDOWS[model] || MODEL_CONTEXT_WINDOWS['gpt-4']
}

/**
 * Get the safety margin percentage for a model
 */
export function getSafetyMargin(model: SupportedModel): number {
  return MODEL_SAFETY_MARGINS[model] || MODEL_SAFETY_MARGINS['gpt-4']
}

/**
 * Calculate the effective maximum tokens available for content
 * after accounting for safety margins
 */
export function getEffectiveMaxTokens(model: SupportedModel, customMaxTokens?: number): number {
  const contextWindow = getContextWindowSize(model)
  const safetyMargin = getSafetyMargin(model)
  const maxTokens = customMaxTokens || contextWindow

  // Use the smaller of context window and custom limit
  const effectiveLimit = Math.min(maxTokens, contextWindow)

  // Apply safety margin
  return Math.floor(effectiveLimit * (1 - safetyMargin))
}

/**
 * Check if content would exceed the context window for a model
 */
export function wouldExceedContext(
  tokenCount: number,
  model: SupportedModel,
  customMaxTokens?: number
): boolean {
  const effectiveMax = getEffectiveMaxTokens(model, customMaxTokens)
  return tokenCount > effectiveMax
}

/**
 * Create a truncation context with appropriate defaults
 */
export function createTruncationContext(
  model: SupportedModel,
  contentType: string,
  options: {
    maxTokens?: number
    priority?: ContentPriority
    preserveStructure?: boolean
    metadata?: Record<string, unknown>
  } = {}
): TruncationContext {
  const effectiveMaxTokens = options.maxTokens || getEffectiveMaxTokens(model)

  return {
    model,
    maxTokens: effectiveMaxTokens,
    contentType,
    priority: options.priority || ContentPriority.MEDIUM,
    preserveStructure: options.preserveStructure ?? false,
    metadata: options.metadata
  }
}

/**
 * Calculate truncation target based on content priority and available tokens
 */
export function calculateTruncationTarget(
  currentTokens: number,
  maxTokens: number,
  priority: ContentPriority
): number {
  if (currentTokens <= maxTokens) {
    return currentTokens // No truncation needed
  }

  // Calculate reduction factor based on priority
  let reductionFactor: number

  switch (priority) {
    case ContentPriority.CRITICAL:
      // Try to preserve 95% if possible, minimum 90%
      reductionFactor = Math.max(0.9, maxTokens / currentTokens)
      break
    case ContentPriority.HIGH:
      // Try to preserve 85% if possible, minimum 70%
      reductionFactor = Math.max(0.7, (maxTokens * 0.85) / currentTokens)
      break
    case ContentPriority.MEDIUM:
      // Target 60-80% preservation based on constraint
      reductionFactor = Math.max(0.6, (maxTokens * 0.8) / currentTokens)
      break
    case ContentPriority.LOW:
      // Target 40-60% preservation
      reductionFactor = Math.max(0.4, (maxTokens * 0.6) / currentTokens)
      break
    case ContentPriority.DISPOSABLE:
      // Aggressive truncation, just fit within limits
      reductionFactor = maxTokens / currentTokens
      break
  }

  return Math.floor(currentTokens * reductionFactor)
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
 * Get comprehensive context information for a model
 */
export function getModelContextInfo(
  model: SupportedModel,
  customMaxTokens?: number
): ModelContextInfo {
  const contextWindow = getContextWindowSize(model)
  const safetyMargin = getSafetyMargin(model)
  const effectiveMaxTokens = getEffectiveMaxTokens(model, customMaxTokens)

  return {
    model,
    contextWindow,
    safetyMargin,
    effectiveMaxTokens,
    truncationThresholds: {
      warning: Math.floor(effectiveMaxTokens * 0.8), // 80% of effective limit
      required: Math.floor(effectiveMaxTokens * 0.95) // 95% of effective limit
    }
  }
}

/**
 * Validate that a model is supported for context management
 */
export function isModelSupported(model: string): model is SupportedModel {
  return model in MODEL_CONTEXT_WINDOWS
}

/**
 * Get all supported models with their context information
 */
export function getAllModelContextInfo(): ModelContextInfo[] {
  return Object.keys(MODEL_CONTEXT_WINDOWS).map((model) =>
    getModelContextInfo(model as SupportedModel)
  )
}
