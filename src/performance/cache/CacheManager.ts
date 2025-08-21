/**
 * Cache Manager - Cache Orchestration
 *
 * Central orchestrator for multiple cache instances, providing unified
 * cache management, warming, optimization, and metrics aggregation.
 *
 * @module CacheManager
 */

import type {
  ICacheManager,
  ICache,
  CacheMetrics,
  CacheConfig,
  CacheInstanceMetrics
} from '../types'
import { IntelligentCache } from './IntelligentCache'
import { WarmupService } from './WarmupService'
import { LRUCache } from '../../tokenization/cache'
import { coreLogger, errorLogger } from '../../utils/logger'

/**
 * Cache instance with metadata
 */
interface CacheInstance {
  readonly name: string
  readonly cache: ICache
  readonly config: CacheConfig
  readonly type: CacheType
  readonly priority: number
}

/**
 * Cache types for different use cases
 */
type CacheType = 'intelligent' | 'lru' | 'memory' | 'persistent'

/**
 * Cache operation statistics
 */
interface CacheOperationStats {
  operations: number
  hits: number
  misses: number
  sets: number
  deletes: number
  clears: number
  totalTime: number
}

/**
 * Cache manager implementation
 */
export class CacheManager implements ICacheManager {
  private readonly config: Required<CacheConfig>
  private readonly caches: Map<string, CacheInstance>
  private readonly warmupService: WarmupService
  private readonly operationStats: Map<string, CacheOperationStats>
  private readonly debug = coreLogger()
  private readonly debugError = errorLogger()

  constructor(config: CacheConfig) {
    this.config = this.resolveConfig(config)
    this.caches = new Map()
    this.warmupService = new WarmupService(this.config)
    this.operationStats = new Map()

    // Initialize default caches
    this.initializeDefaultCaches()
  }

  /**
   * Resolve cache configuration with defaults
   */
  private resolveConfig(config: CacheConfig): Required<CacheConfig> {
    return {
      enabled: config.enabled ?? true,
      tokenCacheSize: config.tokenCacheSize ?? 10000,
      resultCacheSize: config.resultCacheSize ?? 5000,
      templateCacheSize: config.templateCacheSize ?? 1000,
      ttl: config.ttl ?? 3600000,
      targetHitRatio: config.targetHitRatio ?? 80,
      enableWarming: config.enableWarming ?? true,
      evictionStrategy: config.evictionStrategy ?? 'lru',
      enableMultiTier: config.enableMultiTier ?? true
    }
  }

  /**
   * Initialize default cache instances
   */
  private initializeDefaultCaches(): void {
    if (!this.config.enabled) {
      this.debug('Cache manager disabled')
      return
    }

    try {
      // Token counting cache (intelligent multi-tier)
      if (this.config.enableMultiTier) {
        const tokenCache = new IntelligentCache({
          ...this.config,
          tokenCacheSize: this.config.tokenCacheSize
        })
        this.registerCache('token', tokenCache, 'intelligent', 1)
      } else {
        const tokenCache = new LRUCacheWrapper(this.config.tokenCacheSize)
        this.registerCache('token', tokenCache, 'lru', 1)
      }

      // Result cache (intelligent multi-tier)
      if (this.config.enableMultiTier) {
        const resultCache = new IntelligentCache({
          ...this.config,
          tokenCacheSize: this.config.resultCacheSize
        })
        this.registerCache('result', resultCache, 'intelligent', 2)
      } else {
        const resultCache = new LRUCacheWrapper(this.config.resultCacheSize)
        this.registerCache('result', resultCache, 'lru', 2)
      }

      // Template cache (simple LRU for templates)
      const templateCache = new LRUCacheWrapper(this.config.templateCacheSize)
      this.registerCache('template', templateCache, 'lru', 3)

      this.debug('Initialized %d cache instances', this.caches.size)
    } catch (error) {
      this.debugError('Failed to initialize default caches: %O', error)
    }
  }

  /**
   * Register a cache instance
   */
  registerCache(name: string, cache: ICache, type: CacheType, priority: number): void {
    const instance: CacheInstance = {
      name,
      cache,
      config: this.config,
      type,
      priority
    }

    this.caches.set(name, instance)
    this.operationStats.set(name, {
      operations: 0,
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0,
      totalTime: 0
    })

    this.debug('Registered cache: %s (type: %s, priority: %d)', name, type, priority)
  }

  /**
   * Get cache instance by name
   */
  getCache(name: string): ICache | undefined {
    const instance = this.caches.get(name)
    return instance?.cache
  }

  /**
   * Get all cache names
   */
  getCacheNames(): string[] {
    return Array.from(this.caches.keys())
  }

  /**
   * Warm up all caches
   */
  async warmup(): Promise<void> {
    if (!this.config.enabled || !this.config.enableWarming) {
      this.debug('Cache warming disabled')
      return
    }

    try {
      this.debug('Starting cache warmup')
      
      // Get ordered cache instances by priority
      const orderedCaches = Array.from(this.caches.values())
        .sort((a, b) => a.priority - b.priority)

      // Warm up caches sequentially to avoid overwhelming the system
      for (const instance of orderedCaches) {
        await this.warmupService.warmupCache(instance.name, instance.cache)
      }

      this.debug('Cache warmup completed')
    } catch (error) {
      this.debugError('Cache warmup failed: %O', error)
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    try {
      for (const [name, instance] of this.caches) {
        instance.cache.clear()
        this.recordOperation(name, 'clear', 0)
      }
      
      this.debug('All caches cleared')
    } catch (error) {
      this.debugError('Failed to clear all caches: %O', error)
    }
  }

  /**
   * Get aggregate cache metrics
   */
  getMetrics(): CacheMetrics {
    try {
      let totalHits = 0
      let totalMisses = 0
      let totalSize = 0
      let totalCapacity = 0
      let totalEvictions = 0
      let totalLookupTime = 0

      // Collect metrics from all caches
      const cacheMetrics: Record<string, CacheInstanceMetrics> = {}
      
      for (const [name, instance] of this.caches) {
        const metrics = instance.cache.getMetrics()
        const stats = this.operationStats.get(name)!
        
        cacheMetrics[name] = metrics
        
        totalHits += stats.hits
        totalMisses += stats.misses
        totalSize += metrics.size
        totalCapacity += metrics.capacity
        totalEvictions += metrics.evictions
        totalLookupTime += stats.totalTime
      }

      // Calculate aggregate metrics
      const totalOperations = totalHits + totalMisses
      const hitRatio = totalOperations > 0 ? (totalHits / totalOperations) * 100 : 0
      const efficiency = Math.min(hitRatio / this.config.targetHitRatio * 100, 100)
      const averageLookupTime = totalOperations > 0 ? totalLookupTime / totalOperations : 0

      return {
        hitRatio,
        hits: totalHits,
        misses: totalMisses,
        size: totalSize,
        capacity: totalCapacity,
        efficiency,
        caches: {
          tokenCache: cacheMetrics.token || this.createEmptyCacheMetrics(),
          resultCache: cacheMetrics.result || this.createEmptyCacheMetrics(),
          templateCache: cacheMetrics.template || this.createEmptyCacheMetrics()
        }
      }
    } catch (error) {
      this.debugError('Failed to get cache metrics: %O', error)
      return this.createEmptyAggregateMetrics()
    }
  }

  /**
   * Optimize all caches
   */
  async optimize(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    try {
      this.debug('Starting cache optimization')
      
      const optimizationPromises: Promise<void>[] = []

      // Optimize each cache
      for (const [name, instance] of this.caches) {
        const promise = this.optimizeCache(name, instance)
        optimizationPromises.push(promise)
      }

      // Wait for all optimizations to complete
      await Promise.all(optimizationPromises)

      // Rebalance cache sizes if needed
      await this.rebalanceCacheSizes()

      this.debug('Cache optimization completed')
    } catch (error) {
      this.debugError('Cache optimization failed: %O', error)
    }
  }

  /**
   * Get cache performance summary
   */
  getPerformanceSummary(): Record<string, {
    hitRatio: number
    avgLookupTime: number
    efficiency: number
    utilization: number
  }> {
    const summary: Record<string, any> = {}

    for (const [name, instance] of this.caches) {
      const metrics = instance.cache.getMetrics()
      const stats = this.operationStats.get(name)!
      
      const operations = stats.hits + stats.misses
      const avgLookupTime = operations > 0 ? stats.totalTime / operations : 0
      const utilization = metrics.capacity > 0 ? (metrics.size / metrics.capacity) * 100 : 0

      summary[name] = {
        hitRatio: metrics.hitRatio,
        avgLookupTime,
        efficiency: Math.min(metrics.hitRatio / this.config.targetHitRatio * 100, 100),
        utilization
      }
    }

    return summary
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    let invalidatedCount = 0

    try {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
      
      for (const [name, instance] of this.caches) {
        // This would require extending the ICache interface to support pattern invalidation
        // For now, we'll implement a simple approach
        if ('invalidatePattern' in instance.cache && typeof instance.cache.invalidatePattern === 'function') {
          const count = (instance.cache as any).invalidatePattern(regex)
          invalidatedCount += count
        }
      }

      this.debug('Invalidated %d entries matching pattern: %s', invalidatedCount, pattern)
    } catch (error) {
      this.debugError('Pattern invalidation failed: %O', error)
    }

    return invalidatedCount
  }

  /**
   * Get cache statistics
   */
  getStatistics(): Record<string, CacheOperationStats> {
    const stats: Record<string, CacheOperationStats> = {}
    
    for (const [name, operationStats] of this.operationStats) {
      stats[name] = { ...operationStats }
    }
    
    return stats
  }

  /**
   * Record cache operation for statistics
   */
  recordOperation(cacheName: string, operation: 'hit' | 'miss' | 'set' | 'delete' | 'clear', duration: number): void {
    const stats = this.operationStats.get(cacheName)
    if (!stats) return

    stats.operations++
    stats.totalTime += duration

    switch (operation) {
      case 'hit':
        stats.hits++
        break
      case 'miss':
        stats.misses++
        break
      case 'set':
        stats.sets++
        break
      case 'delete':
        stats.deletes++
        break
      case 'clear':
        stats.clears++
        break
    }
  }

  /**
   * Optimize individual cache
   */
  private async optimizeCache(name: string, instance: CacheInstance): Promise<void> {
    try {
      // Call cache-specific optimization if available
      if ('optimize' in instance.cache && typeof instance.cache.optimize === 'function') {
        await (instance.cache as any).optimize()
      }

      // Additional optimizations based on cache type
      switch (instance.type) {
        case 'intelligent':
          // Intelligent caches handle their own optimization
          break
        case 'lru':
          // For LRU caches, we might want to adjust size based on hit ratio
          await this.optimizeLRUCache(name, instance)
          break
        default:
          // Generic optimization
          break
      }
    } catch (error) {
      this.debugError('Failed to optimize cache %s: %O', name, error)
    }
  }

  /**
   * Optimize LRU cache
   */
  private async optimizeLRUCache(name: string, instance: CacheInstance): Promise<void> {
    const metrics = instance.cache.getMetrics()
    
    // If hit ratio is significantly below target, consider warming
    if (metrics.hitRatio < this.config.targetHitRatio * 0.8) {
      await this.warmupService.warmupCache(name, instance.cache)
    }
  }

  /**
   * Rebalance cache sizes based on usage patterns
   */
  private async rebalanceCacheSizes(): Promise<void> {
    try {
      // Analyze usage patterns across caches
      const cacheUsage = new Map<string, number>()
      
      for (const [name, stats] of this.operationStats) {
        const utilizationScore = stats.operations > 0 ? stats.hits / stats.operations : 0
        cacheUsage.set(name, utilizationScore)
      }

      // Sort caches by usage score
      const sortedCaches = Array.from(cacheUsage.entries())
        .sort((a, b) => b[1] - a[1])

      // This is a placeholder for dynamic cache rebalancing
      // In a real implementation, this would adjust cache sizes
      // based on usage patterns and available memory
      
      this.debug('Cache usage analysis: %O', Object.fromEntries(sortedCaches))
    } catch (error) {
      this.debugError('Cache rebalancing failed: %O', error)
    }
  }

  /**
   * Create empty cache metrics for fallback
   */
  private createEmptyCacheMetrics(): CacheInstanceMetrics {
    return {
      hitRatio: 0,
      size: 0,
      capacity: 0,
      evictions: 0,
      averageLookupTime: 0
    }
  }

  /**
   * Create empty aggregate metrics for fallback
   */
  private createEmptyAggregateMetrics(): CacheMetrics {
    return {
      hitRatio: 0,
      hits: 0,
      misses: 0,
      size: 0,
      capacity: 0,
      efficiency: 0,
      caches: {
        tokenCache: this.createEmptyCacheMetrics(),
        resultCache: this.createEmptyCacheMetrics(),
        templateCache: this.createEmptyCacheMetrics()
      }
    }
  }
}

/**
 * Wrapper for LRU cache to implement ICache interface
 */
class LRUCacheWrapper implements ICache {
  private cache: LRUCache<string, unknown>
  private metrics: {
    hits: number
    misses: number
    evictions: number
    totalLookupTime: number
    operations: number
  }

  constructor(maxSize: number) {
    this.cache = new LRUCache<string, unknown>(maxSize)
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalLookupTime: 0,
      operations: 0
    }
  }

  get(key: string): unknown {
    const startTime = Date.now()
    const value = this.cache.get(key)
    const duration = Date.now() - startTime
    
    this.metrics.operations++
    this.metrics.totalLookupTime += duration
    
    if (value !== undefined) {
      this.metrics.hits++
    } else {
      this.metrics.misses++
    }
    
    return value
  }

  set(key: string, value: unknown, ttl?: number): void {
    const sizeBefore = this.cache.size()
    this.cache.set(key, value)
    const sizeAfter = this.cache.size()
    
    // Estimate evictions (rough approximation)
    if (sizeBefore >= this.cache.capacity() && sizeAfter < sizeBefore + 1) {
      this.metrics.evictions++
    }
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  delete(key: string): boolean {
    const hadKey = this.cache.has(key)
    if (hadKey) {
      // LRU cache doesn't have delete method, so we'll set to undefined
      this.cache.set(key, undefined)
    }
    return hadKey
  }

  clear(): void {
    this.cache.clear()
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalLookupTime: 0,
      operations: 0
    }
  }

  size(): number {
    return this.cache.size()
  }

  getMetrics(): CacheInstanceMetrics {
    const totalOperations = this.metrics.hits + this.metrics.misses
    const hitRatio = totalOperations > 0 ? (this.metrics.hits / totalOperations) * 100 : 0
    const averageLookupTime = this.metrics.operations > 0 ? 
      this.metrics.totalLookupTime / this.metrics.operations : 0

    return {
      hitRatio,
      size: this.cache.size(),
      capacity: this.cache.capacity(),
      evictions: this.metrics.evictions,
      averageLookupTime
    }
  }
}