/**
 * Cache System - Main Exports
 *
 * Central export point for the advanced caching system including
 * intelligent caching, warming, and strategy implementations.
 *
 * @module cache
 */

// Core cache components
export { IntelligentCache } from './IntelligentCache'
export { CacheManager } from './CacheManager'
export { WarmupService } from './WarmupService'

// Cache strategies
export {
  type IEvictionStrategy,
  type StrategyCacheEntry,
  type EvictionCandidate,
  type StrategyContext,
  LRUEvictionStrategy,
  LFUEvictionStrategy,
  TTLEvictionStrategy,
  AdaptiveEvictionStrategy,
  SizeBasedEvictionStrategy,
  RandomEvictionStrategy,
  EvictionStrategyFactory
} from './strategies'

// Warming strategies
export {
  type ICacheWarmingStrategy,
  type WarmingMetadata,
  FrequencyWarmingStrategy,
  TimePatternWarmingStrategy,
  SizeOptimizedWarmingStrategy,
  KeyPatternWarmingStrategy,
  WarmingStrategyFactory
} from './strategies'

// Re-export cache types
export type {
  ICache,
  ICacheManager,
  CacheConfig,
  CacheInstanceMetrics,
  CacheMetrics,
  CacheEvictionStrategy
} from '../types'

/**
 * Create a new cache manager with default configuration
 * 
 * @param config Cache configuration
 * @returns Configured CacheManager instance
 */
export function createCacheManager(config?: Partial<import('../types').CacheConfig>): CacheManager {
  return new CacheManager(config || {})
}

/**
 * Create an intelligent cache instance
 * 
 * @param config Cache configuration
 * @returns Configured IntelligentCache instance
 */
export function createIntelligentCache(config?: Partial<import('../types').CacheConfig>): IntelligentCache {
  return new IntelligentCache(config || {})
}

/**
 * Create a warmup service
 * 
 * @param config Cache configuration
 * @returns Configured WarmupService instance
 */
export function createWarmupService(config: Required<import('../types').CacheConfig>): WarmupService {
  return new WarmupService(config)
}

/**
 * Default cache configuration optimized for LLM reporter use cases
 */
export const DEFAULT_CACHE_CONFIG: import('../types').CacheConfig = {
  enabled: true,
  tokenCacheSize: 10000,
  resultCacheSize: 5000,
  templateCacheSize: 1000,
  ttl: 3600000, // 1 hour
  targetHitRatio: 80,
  enableWarming: true,
  evictionStrategy: 'adaptive',
  enableMultiTier: true
}

/**
 * Performance-optimized cache configuration
 */
export const PERFORMANCE_CACHE_CONFIG: import('../types').CacheConfig = {
  enabled: true,
  tokenCacheSize: 20000,
  resultCacheSize: 10000,
  templateCacheSize: 2000,
  ttl: 7200000, // 2 hours
  targetHitRatio: 85,
  enableWarming: true,
  evictionStrategy: 'adaptive',
  enableMultiTier: true
}

/**
 * Memory-constrained cache configuration
 */
export const MEMORY_CONSTRAINED_CACHE_CONFIG: import('../types').CacheConfig = {
  enabled: true,
  tokenCacheSize: 5000,
  resultCacheSize: 2500,
  templateCacheSize: 500,
  ttl: 1800000, // 30 minutes
  targetHitRatio: 75,
  enableWarming: false,
  evictionStrategy: 'lru',
  enableMultiTier: false
}

/**
 * Development cache configuration
 */
export const DEVELOPMENT_CACHE_CONFIG: import('../types').CacheConfig = {
  enabled: true,
  tokenCacheSize: 1000,
  resultCacheSize: 500,
  templateCacheSize: 100,
  ttl: 600000, // 10 minutes
  targetHitRatio: 70,
  enableWarming: false,
  evictionStrategy: 'lru',
  enableMultiTier: false
}

/**
 * Get cache configuration for specific environment
 * 
 * @param environment Target environment
 * @returns Appropriate cache configuration
 */
export function getCacheConfigForEnvironment(
  environment: 'production' | 'development' | 'test' | 'performance'
): import('../types').CacheConfig {
  switch (environment) {
    case 'production':
      return DEFAULT_CACHE_CONFIG
    case 'performance':
      return PERFORMANCE_CACHE_CONFIG
    case 'development':
      return DEVELOPMENT_CACHE_CONFIG
    case 'test':
      return MEMORY_CONSTRAINED_CACHE_CONFIG
    default:
      return DEFAULT_CACHE_CONFIG
  }
}

/**
 * Validate cache configuration
 * 
 * @param config Cache configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateCacheConfig(config: import('../types').CacheConfig): void {
  if (config.tokenCacheSize !== undefined && config.tokenCacheSize < 0) {
    throw new Error('tokenCacheSize must be non-negative')
  }
  
  if (config.resultCacheSize !== undefined && config.resultCacheSize < 0) {
    throw new Error('resultCacheSize must be non-negative')
  }
  
  if (config.templateCacheSize !== undefined && config.templateCacheSize < 0) {
    throw new Error('templateCacheSize must be non-negative')
  }
  
  if (config.ttl !== undefined && config.ttl < 0) {
    throw new Error('ttl must be non-negative')
  }
  
  if (config.targetHitRatio !== undefined && (config.targetHitRatio < 0 || config.targetHitRatio > 100)) {
    throw new Error('targetHitRatio must be between 0 and 100')
  }
  
  if (config.evictionStrategy !== undefined) {
    const validStrategies = EvictionStrategyFactory.getAvailableStrategies()
    if (!validStrategies.includes(config.evictionStrategy)) {
      throw new Error(`Invalid eviction strategy: ${config.evictionStrategy}`)
    }
  }
}

/**
 * Cache utility functions
 */
export const CacheUtils = {
  /**
   * Estimate memory usage of a cache configuration
   */
  estimateMemoryUsage(config: import('../types').CacheConfig): number {
    const tokenCache = (config.tokenCacheSize || 0) * 1024 // Assume 1KB per token entry
    const resultCache = (config.resultCacheSize || 0) * 5120 // Assume 5KB per result entry
    const templateCache = (config.templateCacheSize || 0) * 512 // Assume 512B per template entry
    
    return tokenCache + resultCache + templateCache
  },

  /**
   * Calculate optimal cache sizes based on available memory
   */
  calculateOptimalSizes(availableMemoryMB: number): {
    tokenCacheSize: number
    resultCacheSize: number
    templateCacheSize: number
  } {
    const availableBytes = availableMemoryMB * 1024 * 1024
    const cacheAllocation = availableBytes * 0.1 // Use 10% of available memory
    
    // Distribute cache memory: 50% token, 35% result, 15% template
    const tokenCacheBytes = cacheAllocation * 0.5
    const resultCacheBytes = cacheAllocation * 0.35
    const templateCacheBytes = cacheAllocation * 0.15
    
    return {
      tokenCacheSize: Math.floor(tokenCacheBytes / 1024), // 1KB per entry
      resultCacheSize: Math.floor(resultCacheBytes / 5120), // 5KB per entry
      templateCacheSize: Math.floor(templateCacheBytes / 512) // 512B per entry
    }
  },

  /**
   * Generate cache key with consistent format
   */
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`.toLowerCase()
  },

  /**
   * Parse cache key into components
   */
  parseKey(key: string): { prefix: string; parts: string[] } {
    const [prefix, ...parts] = key.split(':')
    return { prefix, parts }
  }
}