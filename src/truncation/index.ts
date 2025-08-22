/**
 * Truncation Module
 *
 * Main export module for all truncation functionality including
 * strategies, types, and utilities.
 */

// Export all strategies
export * from './strategies/index'

// Export core types and engine
export * from './types'
export * from './TruncationEngine'
export * from './context'
export * from './priorities'

// Export strategy factory function for convenience
import { HeadTailStrategy } from './strategies/HeadTailStrategy'
import { SmartStrategy } from './strategies/SmartStrategy'
import { ErrorFocusedStrategy } from './strategies/ErrorFocusedStrategy'
import { StackTraceStrategy } from './strategies/StackTraceStrategy'
import type { ITruncationStrategy } from './types'

/**
 * Strategy registry for easy access
 */
export const TRUNCATION_STRATEGIES = {
  'head-tail': HeadTailStrategy,
  smart: SmartStrategy,
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
 * Get all available strategy names
 */
export function getAvailableStrategies(): StrategyName[] {
  return Object.keys(TRUNCATION_STRATEGIES) as StrategyName[]
}
