/**
 * Tests for CacheManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CacheManager } from './CacheManager'
import type { CacheConfig, ICache } from '../types'

// Mock the logger utilities
vi.mock('../../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

// Mock IntelligentCache
const mockIntelligentCache = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  size: vi.fn().mockReturnValue(100),
  getMetrics: vi.fn().mockReturnValue({
    hitRatio: 80,
    size: 100,
    capacity: 200,
    evictions: 5,
    averageLookupTime: 2
  }),
  optimize: vi.fn().mockResolvedValue(undefined)
}

vi.mock('./IntelligentCache', () => ({
  IntelligentCache: vi.fn().mockImplementation(() => mockIntelligentCache)
}))

// Mock WarmupService
const mockWarmupService = {
  warmupCache: vi.fn().mockResolvedValue(undefined)
}

vi.mock('./WarmupService', () => ({
  WarmupService: vi.fn().mockImplementation(() => mockWarmupService)
}))

// Mock LRUCache from tokenization (used in LRUCacheWrapper)
const mockLRUCacheInstance = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  size: vi.fn().mockReturnValue(50),
  capacity: vi.fn().mockReturnValue(100)
}

vi.mock('../../tokenization/cache', () => ({
  LRUCache: vi.fn().mockImplementation(() => mockLRUCacheInstance)
}))

describe('CacheManager', () => {
  let cacheManager: CacheManager
  let defaultConfig: CacheConfig

  beforeEach(() => {
    vi.clearAllMocks()

    defaultConfig = {
      enabled: true,
      tokenCacheSize: 1000,
      resultCacheSize: 500,
      templateCacheSize: 100,
      ttl: 3600000,
      targetHitRatio: 80,
      enableWarming: true,
      evictionStrategy: 'lru',
      enableMultiTier: true
    }

    cacheManager = new CacheManager(defaultConfig)
  })

  describe('constructor', () => {
    it('should create cache manager with default config', () => {
      const manager = new CacheManager({})
      expect(manager).toBeDefined()
      expect(manager.getCacheNames()).toContain('token')
      expect(manager.getCacheNames()).toContain('result')
      expect(manager.getCacheNames()).toContain('template')
    })

    it('should apply custom configuration', () => {
      const customConfig: CacheConfig = {
        enabled: false,
        tokenCacheSize: 5000,
        targetHitRatio: 90,
        enableMultiTier: false
      }

      const manager = new CacheManager(customConfig)
      expect(manager).toBeDefined()
    })

    it('should initialize default caches when enabled', () => {
      const manager = new CacheManager({ enabled: true })
      const cacheNames = manager.getCacheNames()

      expect(cacheNames).toContain('token')
      expect(cacheNames).toContain('result')
      expect(cacheNames).toContain('template')
    })

    it('should not initialize caches when disabled', () => {
      const manager = new CacheManager({ enabled: false })
      const cacheNames = manager.getCacheNames()

      expect(cacheNames).toHaveLength(0)
    })

    it('should use intelligent caches when multi-tier enabled', () => {
      const manager = new CacheManager({ enableMultiTier: true })
      expect(manager.getCache('token')).toBeDefined()
      expect(manager.getCache('result')).toBeDefined()
    })

    it('should use LRU caches when multi-tier disabled', () => {
      const manager = new CacheManager({ enableMultiTier: false })
      expect(manager.getCache('token')).toBeDefined()
      expect(manager.getCache('result')).toBeDefined()
    })
  })

  describe('cache registration', () => {
    it('should register custom cache', () => {
      const customCache: ICache = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        size: vi.fn().mockReturnValue(0),
        getMetrics: vi.fn().mockReturnValue({
          hitRatio: 0,
          size: 0,
          capacity: 100,
          evictions: 0,
          averageLookupTime: 0
        })
      }

      cacheManager.registerCache('custom', customCache, 'memory', 10)

      expect(cacheManager.getCache('custom')).toBe(customCache)
      expect(cacheManager.getCacheNames()).toContain('custom')
    })

    it('should track operation statistics for registered caches', () => {
      const customCache: ICache = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        size: vi.fn().mockReturnValue(0),
        getMetrics: vi.fn().mockReturnValue({
          hitRatio: 0,
          size: 0,
          capacity: 100,
          evictions: 0,
          averageLookupTime: 0
        })
      }

      cacheManager.registerCache('custom', customCache, 'memory', 10)
      cacheManager.recordOperation('custom', 'hit', 5)

      const stats = cacheManager.getStatistics()
      expect(stats.custom).toBeDefined()
      expect(stats.custom.hits).toBe(1)
      expect(stats.custom.totalTime).toBe(5)
    })
  })

  describe('getCache', () => {
    it('should return existing cache by name', () => {
      const cache = cacheManager.getCache('token')
      expect(cache).toBeDefined()
    })

    it('should return undefined for non-existent cache', () => {
      const cache = cacheManager.getCache('nonexistent')
      expect(cache).toBeUndefined()
    })
  })

  describe('getCacheNames', () => {
    it('should return all registered cache names', () => {
      const names = cacheManager.getCacheNames()
      expect(names).toContain('token')
      expect(names).toContain('result')
      expect(names).toContain('template')
    })

    it('should return empty array when no caches registered', () => {
      const disabledManager = new CacheManager({ enabled: false })
      const names = disabledManager.getCacheNames()
      expect(names).toHaveLength(0)
    })
  })

  describe('warmup', () => {
    it('should warm up all caches', async () => {
      await cacheManager.warmup()

      expect(mockWarmupService.warmupCache).toHaveBeenCalledTimes(3)
      expect(mockWarmupService.warmupCache).toHaveBeenCalledWith('token', expect.any(Object))
      expect(mockWarmupService.warmupCache).toHaveBeenCalledWith('result', expect.any(Object))
      expect(mockWarmupService.warmupCache).toHaveBeenCalledWith('template', expect.any(Object))
    })

    it('should respect priority order during warmup', async () => {
      await cacheManager.warmup()

      const calls = mockWarmupService.warmupCache.mock.calls
      expect(calls[0][0]).toBe('token') // priority 1
      expect(calls[1][0]).toBe('result') // priority 2
      expect(calls[2][0]).toBe('template') // priority 3
    })

    it('should skip warmup when disabled', async () => {
      const disabledManager = new CacheManager({ enableWarming: false })
      await disabledManager.warmup()

      expect(mockWarmupService.warmupCache).not.toHaveBeenCalled()
    })

    it('should skip warmup when cache manager disabled', async () => {
      const disabledManager = new CacheManager({ enabled: false })
      await disabledManager.warmup()

      expect(mockWarmupService.warmupCache).not.toHaveBeenCalled()
    })

    it('should handle warmup errors gracefully', async () => {
      mockWarmupService.warmupCache.mockRejectedValueOnce(new Error('Warmup failed'))

      await expect(cacheManager.warmup()).resolves.not.toThrow()
    })
  })

  describe('clearAll', () => {
    it('should clear all caches', () => {
      // Clear all mock call histories before testing
      vi.clearAllMocks()

      cacheManager.clearAll()

      // Check that the mocked IntelligentCache clear methods were called
      // Since the default config uses multiTier=true, token and result use IntelligentCache
      expect(mockIntelligentCache.clear).toHaveBeenCalledTimes(2) // token, result

      // The template cache uses LRUCacheWrapper, so check the underlying LRUCache was cleared
      expect(mockLRUCacheInstance.clear).toHaveBeenCalledTimes(1) // template
    })

    it('should record clear operations', () => {
      cacheManager.clearAll()

      const stats = cacheManager.getStatistics()
      expect(stats.token.clears).toBe(1)
      expect(stats.result.clears).toBe(1)
      expect(stats.template.clears).toBe(1)
    })

    it('should handle clear errors gracefully', () => {
      const tokenCache = cacheManager.getCache('token')
      if (tokenCache) {
        vi.mocked(tokenCache.clear).mockImplementationOnce(() => {
          throw new Error('Clear failed')
        }) as unknown
      }

      expect(() => cacheManager.clearAll()).not.toThrow()
    })
  })

  describe('getMetrics', () => {
    beforeEach(() => {
      // Set up mock return values for cache metrics
      mockIntelligentCache.getMetrics.mockReturnValue({
        hitRatio: 80,
        size: 100,
        capacity: 200,
        evictions: 5,
        averageLookupTime: 2
      })
    })

    it('should return aggregate cache metrics', () => {
      // Simulate some operations
      cacheManager.recordOperation('token', 'hit', 2)
      cacheManager.recordOperation('token', 'miss', 3)
      cacheManager.recordOperation('result', 'hit', 1)

      const metrics = cacheManager.getMetrics()

      expect(metrics).toBeDefined()
      expect(metrics.hitRatio).toBeGreaterThan(0)
      expect(metrics.hits).toBe(2)
      expect(metrics.misses).toBe(1)
      expect(metrics.caches.tokenCache).toBeDefined()
      expect(metrics.caches.resultCache).toBeDefined()
      expect(metrics.caches.templateCache).toBeDefined()
    })

    it('should calculate efficiency based on target hit ratio', () => {
      cacheManager.recordOperation('token', 'hit', 2)
      cacheManager.recordOperation('token', 'hit', 2)
      cacheManager.recordOperation('token', 'miss', 3)

      const metrics = cacheManager.getMetrics()

      // 2 hits out of 3 operations = 66.67% hit ratio
      // Target is 80%, so efficiency should be (66.67 / 80) * 100 = 83.33%
      expect(metrics.efficiency).toBeCloseTo(83.33, 1)
    })

    it('should handle empty caches gracefully', () => {
      const emptyManager = new CacheManager({ enabled: false })
      const metrics = emptyManager.getMetrics()

      expect(metrics.hitRatio).toBe(0)
      expect(metrics.hits).toBe(0)
      expect(metrics.misses).toBe(0)
      expect(metrics.efficiency).toBe(0)
    })

    it('should handle metrics collection errors', () => {
      mockIntelligentCache.getMetrics.mockImplementationOnce(() => {
        throw new Error('Metrics collection failed')
      })

      const metrics = cacheManager.getMetrics()

      expect(metrics).toBeDefined()
      expect(metrics.hitRatio).toBe(0)
    })
  })

  describe('optimize', () => {
    it('should optimize all caches', async () => {
      await cacheManager.optimize()

      expect(mockIntelligentCache.optimize).toHaveBeenCalled()
    })

    it('should skip optimization when disabled', async () => {
      const disabledManager = new CacheManager({ enabled: false })
      await disabledManager.optimize()

      expect(mockIntelligentCache.optimize).not.toHaveBeenCalled()
    })

    it('should handle optimization errors gracefully', async () => {
      mockIntelligentCache.optimize.mockRejectedValueOnce(new Error('Optimization failed'))

      await expect(cacheManager.optimize()).resolves.not.toThrow()
    })

    it('should warm up LRU caches with low hit ratios', async () => {
      // Create a manager with LRU caches
      const lruManager = new CacheManager({ enableMultiTier: false })

      await lruManager.optimize()

      // Should attempt warmup for underperforming caches
      expect(mockWarmupService.warmupCache).toHaveBeenCalled()
    })
  })

  describe('getPerformanceSummary', () => {
    it('should return performance summary for all caches', () => {
      cacheManager.recordOperation('token', 'hit', 2)
      cacheManager.recordOperation('token', 'miss', 3)

      const summary = cacheManager.getPerformanceSummary()

      expect(summary).toBeDefined()
      expect(summary.token).toBeDefined()
      expect(summary.token.hitRatio).toBeDefined()
      expect(summary.token.avgLookupTime).toBeDefined()
      expect(summary.token.efficiency).toBeDefined()
      expect(summary.token.utilization).toBeDefined()
    })

    it('should calculate utilization correctly', () => {
      mockIntelligentCache.getMetrics.mockReturnValue({
        hitRatio: 80,
        size: 50,
        capacity: 100,
        evictions: 5,
        averageLookupTime: 2
      })

      const summary = cacheManager.getPerformanceSummary()

      expect(summary.token.utilization).toBe(50) // 50/100 * 100
    })
  })

  describe('invalidatePattern', () => {
    it('should invalidate entries matching string pattern', () => {
      const result = cacheManager.invalidatePattern('test.*')

      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('should invalidate entries matching regex pattern', () => {
      const result = cacheManager.invalidatePattern(/test.*/g)

      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('should handle pattern invalidation errors', () => {
      expect(() => cacheManager.invalidatePattern('[invalid')).not.toThrow()
    })
  })

  describe('recordOperation', () => {
    it('should record hit operation', () => {
      cacheManager.recordOperation('token', 'hit', 5)

      const stats = cacheManager.getStatistics()
      expect(stats.token.hits).toBe(1)
      expect(stats.token.operations).toBe(1)
      expect(stats.token.totalTime).toBe(5)
    })

    it('should record miss operation', () => {
      cacheManager.recordOperation('token', 'miss', 10)

      const stats = cacheManager.getStatistics()
      expect(stats.token.misses).toBe(1)
      expect(stats.token.operations).toBe(1)
      expect(stats.token.totalTime).toBe(10)
    })

    it('should record set operation', () => {
      cacheManager.recordOperation('token', 'set', 3)

      const stats = cacheManager.getStatistics()
      expect(stats.token.sets).toBe(1)
      expect(stats.token.operations).toBe(1)
    })

    it('should record delete operation', () => {
      cacheManager.recordOperation('token', 'delete', 2)

      const stats = cacheManager.getStatistics()
      expect(stats.token.deletes).toBe(1)
    })

    it('should record clear operation', () => {
      cacheManager.recordOperation('token', 'clear', 1)

      const stats = cacheManager.getStatistics()
      expect(stats.token.clears).toBe(1)
    })

    it('should handle recording for non-existent cache', () => {
      expect(() => cacheManager.recordOperation('nonexistent', 'hit', 1)).not.toThrow()
    })
  })

  describe('getStatistics', () => {
    it('should return operation statistics for all caches', () => {
      cacheManager.recordOperation('token', 'hit', 5)
      cacheManager.recordOperation('result', 'miss', 10)

      const stats = cacheManager.getStatistics()

      expect(stats.token).toBeDefined()
      expect(stats.result).toBeDefined()
      expect(stats.template).toBeDefined()

      expect(stats.token.hits).toBe(1)
      expect(stats.result.misses).toBe(1)
    })

    it('should return independent copies of statistics', () => {
      const stats1 = cacheManager.getStatistics()
      const stats2 = cacheManager.getStatistics()

      expect(stats1).not.toBe(stats2)
      expect(stats1).toEqual(stats2)

      // Modifying one shouldn't affect the other
      stats1.token.hits = 999
      expect(stats2.token.hits).not.toBe(999)
    })
  })

  describe('LRUCacheWrapper', () => {
    let wrapper: any

    beforeEach(() => {
      // Reset all mocks before each test
      vi.clearAllMocks()
      // Create LRU cache manager to test the wrapper
      const lruManager = new CacheManager({ enableMultiTier: false })
      wrapper = lruManager.getCache('token')
    })

    it('should track cache hits and misses', () => {
      mockLRUCacheInstance.get.mockReturnValueOnce('value')
      mockLRUCacheInstance.get.mockReturnValueOnce(undefined)

      wrapper.get('key1')
      wrapper.get('key2')

      const metrics = wrapper.getMetrics()
      expect(metrics.hitRatio).toBeCloseTo(50, 1) // 1 hit, 1 miss = 50%
    })

    it('should estimate evictions on set operations', () => {
      mockLRUCacheInstance.size
        .mockReturnValueOnce(100) // size before
        .mockReturnValueOnce(100) // size after (indicating eviction)
      mockLRUCacheInstance.capacity.mockReturnValue(100)

      wrapper.set('key', 'value')

      const metrics = wrapper.getMetrics()
      expect(metrics.evictions).toBe(1)
    })

    it('should reset metrics on clear', () => {
      wrapper.get('key') // Generate some metrics
      wrapper.clear()

      const metrics = wrapper.getMetrics()
      expect(metrics.hitRatio).toBe(0)
    })

    it('should handle delete operations', () => {
      mockLRUCacheInstance.has.mockReturnValue(true)

      const result = wrapper.delete('key')

      expect(result).toBe(true)
      expect(mockLRUCacheInstance.set).toHaveBeenCalledWith('key', undefined)
    })

    it('should return false for delete of non-existent key', () => {
      mockLRUCacheInstance.has.mockReturnValue(false)

      const result = wrapper.delete('nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle cache initialization errors', () => {
      vi.mocked(mockIntelligentCache.getMetrics).mockImplementationOnce(() => {
        throw new Error('Cache init failed')
      })

      expect(() => new CacheManager(defaultConfig)).not.toThrow()
    })

    it('should handle missing cache gracefully in operations', () => {
      const stats = cacheManager.getStatistics()
      expect(stats).toBeDefined()
    })

    it('should handle cache operation errors in metrics collection', () => {
      mockIntelligentCache.getMetrics.mockImplementationOnce(() => {
        throw new Error('Metrics failed')
      })

      const metrics = cacheManager.getMetrics()
      expect(metrics).toBeDefined()
      expect(metrics.hitRatio).toBe(0)
    })
  })

  describe('configuration resolution', () => {
    it('should apply default values for missing config properties', () => {
      const manager = new CacheManager({})
      const config = manager['config']

      expect(config.enabled).toBe(true)
      expect(config.tokenCacheSize).toBe(10000)
      expect(config.targetHitRatio).toBe(80)
      expect(config.evictionStrategy).toBe('lru')
    })

    it('should preserve provided config values', () => {
      const customConfig: CacheConfig = {
        tokenCacheSize: 5000,
        targetHitRatio: 90,
        evictionStrategy: 'ttl'
      }

      const manager = new CacheManager(customConfig)
      const config = manager['config']

      expect(config.tokenCacheSize).toBe(5000)
      expect(config.targetHitRatio).toBe(90)
      expect(config.evictionStrategy).toBe('ttl')
    })
  })
})
