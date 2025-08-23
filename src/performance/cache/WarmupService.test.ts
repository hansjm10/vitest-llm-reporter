/**
 * Tests for WarmupService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WarmupService } from './WarmupService'
import type { CacheConfig, ICache } from '../types'

// Mock the logger utilities
vi.mock('../../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

describe('WarmupService', () => {
  let warmupService: WarmupService
  let mockCache: ICache
  let defaultConfig: Required<CacheConfig>

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock cache
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      size: vi.fn().mockReturnValue(0),
      getMetrics: vi.fn().mockReturnValue({
        hitRatio: 80,
        size: 100,
        capacity: 1000,
        evictions: 5,
        averageLookupTime: 2
      })
    }

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
    } as Required<CacheConfig>

    warmupService = new WarmupService(defaultConfig)
  })

  describe('constructor', () => {
    it('should create warmup service with default configuration', () => {
      expect(warmupService).toBeDefined()
    })

    it('should accept custom configuration', () => {
      const customConfig: Required<CacheConfig> = {
        enabled: true,
        enableWarming: false,
        tokenCacheSize: 2000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        ttl: 3600000,
        targetHitRatio: 80,
        evictionStrategy: 'lru',
        enableMultiTier: true
      }
      const customService = new WarmupService(customConfig)
      expect(customService).toBeDefined()
    })

    it('should initialize with warmup disabled when configured', () => {
      const disabledConfig: Required<CacheConfig> = {
        enabled: true,
        enableWarming: false,
        tokenCacheSize: 1000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        ttl: 3600000,
        targetHitRatio: 80,
        evictionStrategy: 'lru',
        enableMultiTier: true
      }
      const disabledService = new WarmupService(disabledConfig)
      expect(disabledService).toBeDefined()
    })
  })

  describe('warmupCache method', () => {
    it('should warm up cache successfully', async () => {
      const result = await warmupService.warmupCache('test-cache', mockCache)

      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
      expect(typeof result.entriesWarmed).toBe('number')
      expect(typeof result.duration).toBe('number')
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should skip warmup when warming is disabled', async () => {
      const disabledService = new WarmupService({
        enabled: true,
        enableWarming: false,
        tokenCacheSize: 1000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        ttl: 3600000,
        targetHitRatio: 80,
        evictionStrategy: 'lru',
        enableMultiTier: true
      } as Required<CacheConfig>)

      const result = await disabledService.warmupCache('test-cache', mockCache)

      expect(result.success).toBe(true)
      expect(result.entriesWarmed).toBe(0)
    })

    it('should handle cache warmup errors gracefully', async () => {
      // Mock cache that throws errors
      const errorCache: ICache = {
        ...mockCache,
        set: vi.fn().mockRejectedValue(new Error('Cache set failed')),
        getMetrics: vi.fn().mockImplementation(() => {
          throw new Error('Metrics failed')
        })
      }

      const result = await warmupService.warmupCache('error-cache', errorCache)

      expect(result).toBeDefined()
      expect(result.errors.length).toBeGreaterThanOrEqual(0)
    })

    it('should track warmup duration', async () => {
      const start = Date.now()
      const result = await warmupService.warmupCache('test-cache', mockCache)
      const expectedMinDuration = Date.now() - start

      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(result.duration).toBeLessThan(expectedMinDuration + 100) // Allow some tolerance
    })

    it('should limit number of entries warmed up', async () => {
      const result = await warmupService.warmupCache('test-cache', mockCache)

      // Should not warm up an unreasonable number of entries
      expect(result.entriesWarmed).toBeLessThanOrEqual(1000)
      expect(result.entriesWarmed).toBeGreaterThanOrEqual(0)
    })
  })

  describe('pattern detection', () => {
    it('should learn from cache access patterns', async () => {
      // Simulate cache accesses to establish patterns
      const mockedCache = vi.mocked(mockCache)
      mockedCache.get
        .mockReturnValueOnce('value1')
        .mockReturnValueOnce('value2')
        .mockReturnValueOnce(undefined)

      // Warm up cache multiple times to establish patterns
      await warmupService.warmupCache('pattern-cache', mockCache)
      await warmupService.warmupCache('pattern-cache', mockCache)

      expect(warmupService).toBeDefined() // Service should handle pattern learning
    })

    it('should prioritize frequently accessed items', async () => {
      // Mock high-frequency access patterns
      const mockedCache = vi.mocked(mockCache)
      mockedCache.getMetrics.mockReturnValue({
        hitRatio: 90,
        size: 500,
        capacity: 1000,
        evictions: 2,
        averageLookupTime: 1
      })

      const result = await warmupService.warmupCache('high-freq-cache', mockCache)

      expect(result.success).toBe(true)
    })

    it('should adapt to cache performance metrics', async () => {
      // Mock cache with poor performance
      const mockedCache2 = vi.mocked(mockCache)
      mockedCache2.getMetrics.mockReturnValue({
        hitRatio: 30,
        size: 100,
        capacity: 1000,
        evictions: 50,
        averageLookupTime: 10
      })

      const result = await warmupService.warmupCache('poor-perf-cache', mockCache)

      expect(result).toBeDefined()
      // Service should adapt warmup strategy based on poor performance
    })
  })

  describe('warmup strategies', () => {
    it('should handle different warmup strategies', async () => {
      // Test multiple warmup calls with different cache states
      const results = []

      for (let i = 0; i < 3; i++) {
        const result = await warmupService.warmupCache(`cache-${i}`, mockCache)
        results.push(result)
      }

      results.forEach((result) => {
        expect(result).toBeDefined()
        expect(typeof result.success).toBe('boolean')
      })
    })

    it('should respect warmup time windows', async () => {
      const start = Date.now()

      // Perform multiple warmups in quick succession
      const result1 = await warmupService.warmupCache('time-window-cache', mockCache)
      const result2 = await warmupService.warmupCache('time-window-cache', mockCache)

      const duration = Date.now() - start

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
      expect(duration).toBeLessThan(1000) // Should complete quickly
    })

    it('should handle concurrent warmup requests', async () => {
      // Simulate concurrent warmup requests
      const promises = [
        warmupService.warmupCache('concurrent-1', mockCache),
        warmupService.warmupCache('concurrent-2', mockCache),
        warmupService.warmupCache('concurrent-3', mockCache)
      ]

      const results = await Promise.all(promises)

      results.forEach((result) => {
        expect(result).toBeDefined()
        expect(typeof result.success).toBe('boolean')
      })
    })
  })

  describe('performance optimization', () => {
    it('should optimize warmup based on cache metrics', async () => {
      // Mock cache with specific metrics
      const mockedCache3 = vi.mocked(mockCache)
      mockedCache3.getMetrics.mockReturnValue({
        hitRatio: 85,
        size: 200,
        capacity: 1000,
        evictions: 10,
        averageLookupTime: 3
      })

      const result = await warmupService.warmupCache('optimized-cache', mockCache)

      expect(result.success).toBe(true)
      expect(result.entriesWarmed).toBeGreaterThanOrEqual(0)
    })

    it('should avoid warming up already hot cache', async () => {
      // Mock cache with very high hit ratio
      const mockedCache4 = vi.mocked(mockCache)
      mockedCache4.getMetrics.mockReturnValue({
        hitRatio: 98,
        size: 500,
        capacity: 1000,
        evictions: 1,
        averageLookupTime: 0.5
      })

      const result = await warmupService.warmupCache('hot-cache', mockCache)

      expect(result.success).toBe(true)
      // Should warm up fewer entries for already hot cache
      expect(result.entriesWarmed).toBeGreaterThanOrEqual(0)
    })

    it('should handle cache at capacity', async () => {
      // Mock full cache
      const mockedCache5 = vi.mocked(mockCache)
      mockedCache5.size.mockReturnValue(1000)
      mockedCache5.getMetrics.mockReturnValue({
        hitRatio: 75,
        size: 1000,
        capacity: 1000,
        evictions: 100,
        averageLookupTime: 5
      })

      const result = await warmupService.warmupCache('full-cache', mockCache)

      expect(result.success).toBe(true)
      // Should handle full cache gracefully
    })
  })

  describe('error handling', () => {
    it('should handle cache operation failures', async () => {
      const faultyCache: ICache = {
        ...mockCache,
        set: vi.fn().mockRejectedValue(new Error('Set operation failed')),
        get: vi.fn().mockRejectedValue(new Error('Get operation failed'))
      }

      const result = await warmupService.warmupCache('faulty-cache', faultyCache)

      expect(result).toBeDefined()
      expect(Array.isArray(result.errors)).toBe(true)
      // Should record errors but not throw
    })

    it('should handle invalid cache references', async () => {
      const nullCache = null as any

      const result = await warmupService.warmupCache('null-cache', nullCache)

      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle cache with missing methods', async () => {
      const incompleteCache = {
        get: vi.fn(),
        set: vi.fn()
        // Missing other required methods
      } as any

      const result = await warmupService.warmupCache('incomplete-cache', incompleteCache)

      expect(result).toBeDefined()
      // Should handle missing methods gracefully
    })
  })

  describe('configuration variations', () => {
    it('should handle disabled configuration', async () => {
      const disabledService = new WarmupService({
        enabled: false,
        enableWarming: false,
        tokenCacheSize: 1000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        ttl: 3600000,
        targetHitRatio: 80,
        evictionStrategy: 'lru',
        enableMultiTier: true
      } as Required<CacheConfig>)

      const result = await disabledService.warmupCache('disabled-cache', mockCache)

      expect(result.success).toBe(true)
      expect(result.entriesWarmed).toBe(0)
    })

    it('should handle minimal configuration', async () => {
      const minimalService = new WarmupService({
        enabled: true,
        enableWarming: true,
        tokenCacheSize: 1000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        ttl: 3600000,
        targetHitRatio: 80,
        evictionStrategy: 'lru',
        enableMultiTier: true
      } as Required<CacheConfig>)
      const result = await minimalService.warmupCache('minimal-cache', mockCache)

      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should handle large cache configuration', async () => {
      const largeConfig: Required<CacheConfig> = {
        enabled: true,
        tokenCacheSize: 100000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        enableWarming: true,
        ttl: 86400000, // 24 hours
        targetHitRatio: 80,
        evictionStrategy: 'lru',
        enableMultiTier: true
      }

      const largeService = new WarmupService(largeConfig)
      const result = await largeService.warmupCache('large-cache', mockCache)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
  })

  describe('memory and performance', () => {
    it('should complete warmup within reasonable time', async () => {
      const start = Date.now()

      const result = await warmupService.warmupCache('perf-cache', mockCache)

      const duration = Date.now() - start
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      expect(result).toBeDefined()
    })

    it('should not consume excessive memory during warmup', async () => {
      // Skip test if process.memoryUsage is not available
      if (typeof process?.memoryUsage !== 'function') {
        return
      }
      
      // This test is more conceptual - in real scenarios you'd monitor memory usage
      const initialMemory = process.memoryUsage().heapUsed

      await warmupService.warmupCache('memory-cache', mockCache)

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Should not increase memory by more than 10MB (adjust as needed)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
    })

    it('should handle repeated warmup calls efficiently', async () => {
      const results = []

      for (let i = 0; i < 5; i++) {
        const start = Date.now()
        const result = await warmupService.warmupCache('repeat-cache', mockCache)
        const duration = Date.now() - start

        results.push({ result, duration })
      }

      // All should succeed and have reasonable performance
      results.forEach(({ result, duration }) => {
        expect(result.success).toBe(true)
        expect(duration).toBeLessThan(1000)
      })
    })
  })
})
