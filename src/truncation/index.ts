/**
 * Truncation Module
 *
 * Main export module for all truncation functionality including
 * strategies, types, and utilities.
 */

// Export all strategies
export * from './strategies/index.js'

// Export all types
export * from './types.js'

// Export strategy factory function
import { HeadTailStrategy } from './strategies/HeadTailStrategy.js'
import { SmartStrategy } from './strategies/SmartStrategy.js'
import { ErrorFocusedStrategy } from './strategies/ErrorFocusedStrategy.js'
import { StackTraceStrategy } from './strategies/StackTraceStrategy.js'
import type { ITruncationStrategy, ContentType } from './types.js'

/**
 * Strategy registry for easy access
 */
export const TRUNCATION_STRATEGIES = {
  'head-tail': HeadTailStrategy,
  'smart': SmartStrategy,
  'error-focused': ErrorFocusedStrategy,
  'stack-trace': StackTraceStrategy
} as const

export type StrategyName = keyof typeof TRUNCATION_STRATEGIES

/**
 * Create a truncation strategy instance
 */
export function createTruncationStrategy(name: StrategyName): ITruncationStrategy {
  const StrategyClass = TRUNCATION_STRATEGIES[name]
  return new StrategyClass()
}

/**
 * Get the best strategy for a content type
 */
export function getBestStrategyForContentType(contentType: ContentType): StrategyName {
  switch (contentType) {
    case 'stack-trace':
      return 'stack-trace'
    case 'error-message':
    case 'assertion':
      return 'error-focused'
    case 'code-context':
    case 'console-output':
      return 'smart'
    case 'metadata':
    case 'generic':
    default:
      return 'head-tail'
  }
}

/**
 * Get all available strategy names
 */
export function getAvailableStrategies(): StrategyName[] {
  return Object.keys(TRUNCATION_STRATEGIES) as StrategyName[]
}