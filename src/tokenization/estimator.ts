/**
 * Simple token estimation module
 *
 * Provides deterministic, estimation-only token counting without external dependencies.
 * Uses a simple formula: tokens ≈ ceil(characters / charsPerToken)
 * Default: 4 characters per token (reasonable approximation for English text)
 *
 * NOTE: These are ESTIMATES only, not exact token counts.
 * Suitable for budgeting and thresholds, not for exact billing.
 */

import type { TokenEstimatorOptions } from '../types/tokenization.js'

/**
 * Estimate token count for a single text string
 *
 * @param text - The text to estimate tokens for
 * @param opts - Optional configuration
 * @returns Estimated number of tokens (0 for empty text)
 *
 * @example
 * estimateTokens("Hello world") // Returns 3 (11 chars / 4 = 2.75, rounded up)
 * estimateTokens("Test", { charsPerToken: 2 }) // Returns 2 (4 chars / 2 = 2)
 * estimateTokens("") // Returns 0
 */
export function estimateTokens(text: string, opts?: TokenEstimatorOptions): number {
  if (!text || text.length === 0) {
    return 0
  }

  const charsPerToken = opts?.charsPerToken ?? 4

  if (charsPerToken <= 0) {
    throw new Error('charsPerToken must be a positive number')
  }

  return Math.ceil(text.length / charsPerToken)
}

/**
 * Estimate token counts for multiple text strings
 *
 * @param texts - Array of texts to estimate tokens for
 * @param opts - Optional configuration (applies to all texts)
 * @returns Array of estimated token counts (same order as input)
 *
 * @example
 * estimateTokensBatch(["Hello", "World"]) // Returns [2, 2]
 * estimateTokensBatch(["", "Test", ""]) // Returns [0, 1, 0]
 */
export function estimateTokensBatch(texts: string[], opts?: TokenEstimatorOptions): number[] {
  if (!texts || texts.length === 0) {
    return []
  }

  return texts.map((text) => estimateTokens(text, opts))
}

/**
 * Estimate total tokens for multiple texts combined
 *
 * @param texts - Array of texts to estimate tokens for
 * @param opts - Optional configuration
 * @returns Total estimated tokens across all texts
 *
 * @example
 * estimateTotalTokens(["Hello", "World"]) // Returns 4
 */
export function estimateTotalTokens(texts: string[], opts?: TokenEstimatorOptions): number {
  return estimateTokensBatch(texts, opts).reduce((sum, count) => sum + count, 0)
}

/**
 * Check if text exceeds a token limit (estimation-based)
 *
 * @param text - The text to check
 * @param limit - Maximum allowed tokens
 * @param opts - Optional configuration
 * @returns True if estimated tokens exceed limit
 *
 * @example
 * exceedsTokenLimit("Hello world", 10) // Returns false (3 tokens < 10)
 * exceedsTokenLimit("Hello world", 2) // Returns true (3 tokens > 2)
 */
export function exceedsTokenLimit(
  text: string,
  limit: number,
  opts?: TokenEstimatorOptions
): boolean {
  return estimateTokens(text, opts) > limit
}

/**
 * Calculate character limit based on token limit
 *
 * @param tokenLimit - Maximum allowed tokens
 * @param opts - Optional configuration
 * @returns Approximate character limit
 *
 * @example
 * getCharacterLimit(100) // Returns 400 (100 tokens * 4 chars/token)
 * getCharacterLimit(50, { charsPerToken: 3 }) // Returns 150
 */
export function getCharacterLimit(tokenLimit: number, opts?: TokenEstimatorOptions): number {
  const charsPerToken = opts?.charsPerToken ?? 4
  return tokenLimit * charsPerToken
}
