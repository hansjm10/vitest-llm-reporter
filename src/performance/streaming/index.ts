/**
 * Streaming Optimization System - Main Exports
 *
 * Central export point for streaming performance optimizations.
 *
 * @module streaming
 */

export { StreamOptimizer } from './StreamOptimizer'
export { BackgroundProcessor } from './BackgroundProcessor'
export { PriorityQueue } from './PriorityQueue'
export { AdaptiveBuffer } from './AdaptiveBuffer'

export type {
  StreamingOptimizationConfig,
  IStreamOptimizer
} from '../types'