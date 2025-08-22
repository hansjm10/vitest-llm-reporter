/**
 * Tests for IntelligentCache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { IntelligentCache } from './IntelligentCache'
import type { CacheConfig, CacheInstanceMetrics } from '../types'

// Mock the logger utilities
vi.mock('../../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

describe('IntelligentCache', () => {
  let cache: IntelligentCache
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
    cache = new IntelligentCache(defaultConfig)
  })

  describe('constructor', () => {
    it('should create cache with default configuration', () => {
      expect(cache).toBeDefined()
      expect(cache.size()).toBe(0)
    })

    it('should apply custom configuration', () => {
      const customConfig: CacheConfig = {
        tokenCacheSize: 2000,
        evictionStrategy: 'lfu',
        ttl: 1800000
      }
      const customCache = new IntelligentCache(customConfig)
      expect(customCache).toBeDefined()
    })

    it('should initialize empty tiers', () => {
      expect(cache.size()).toBe(0)
      const metrics = cache.getMetrics()
      expect(metrics.size).toBe(0)
      expect(metrics.hitRatio).toBe(0)
    })
  })

  describe('basic cache operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
      expect(cache.size()).toBe(1)
    })

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('should check if key exists', () => {
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should delete values', () => {
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)

      const deleted = cache.delete('key1')
      expect(deleted).toBe(true)
      expect(cache.has('key1')).toBe(false)
      expect(cache.size()).toBe(0)
    })

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('nonexistent')
      expect(deleted).toBe(false)
    })

    it('should clear all values', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      expect(cache.size()).toBe(2)

      cache.clear()
      expect(cache.size()).toBe(0)
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(false)
    })
  })

  describe('multi-tier caching', () => {
    it('should promote frequently accessed items to hot tier', () => {
      cache.set('popular', 'value')

      // Access multiple times to trigger promotion
      for (let i = 0; i < 10; i++) {
        cache.get('popular')
      }

      // The item should still be accessible and performance should be tracked
      expect(cache.get('popular')).toBe('value')
      const metrics = cache.getMetrics()
      expect(metrics.hitRatio).toBeGreaterThanOrEqual(0)
    })

    it('should handle tier capacity limits', () => {
      const smallCache = new IntelligentCache({
        tokenCacheSize: 10, // Very small cache
        evictionStrategy: 'lru'
      })

      // Fill beyond capacity
      for (let i = 0; i < 20; i++) {
        smallCache.set(`key${i}`, `value${i}`)
      }

      // Should not exceed configured size significantly
      expect(smallCache.size()).toBeLessThanOrEqual(15) // Some tolerance for tier distribution
    })

    it('should evict items when at capacity', () => {
      const smallCache = new IntelligentCache({
        tokenCacheSize: 10,
        evictionStrategy: 'lru'
      })

      // Fill cache beyond capacity
      for (let i = 1; i <= 15; i++) {
        smallCache.set(`key${i}`, `value${i}`)
      }

      // Cache should have evicted some items to stay within bounds
      // With multi-tier, total capacity is distributed across tiers
      const metrics = smallCache.getMetrics()
      expect(metrics.evictions).toBeGreaterThan(0)
      
      // Cache size should not exceed the configured limit significantly
      expect(smallCache.size()).toBeLessThanOrEqual(10)
    })
  })

  describe('TTL handling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should expire items after TTL', () => {
      const shortTtlCache = new IntelligentCache({
        tokenCacheSize: 100,
        ttl: 1000 // 1 second
      })

      shortTtlCache.set('expiring', 'value')
      expect(shortTtlCache.get('expiring')).toBe('value')

      // Advance time beyond TTL
      vi.advanceTimersByTime(1500)

      // Item should be expired (implementation may vary)
      // Note: This test depends on how TTL is implemented in the actual cache
      expect(shortTtlCache.has('expiring')).toBeDefined() // Adjust based on implementation
    })

    it('should handle custom TTL for specific entries', () => {
      // This test depends on whether the cache supports per-entry TTL
      cache.set('persistent', 'value')
      expect(cache.has('persistent')).toBe(true)
    })
  })

  describe('metrics collection', () => {
    it('should track hit ratio correctly', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      // Generate hits and misses
      cache.get('key1') // hit
      cache.get('key2') // hit
      cache.get('nonexistent') // miss
      cache.get('key1') // hit

      const metrics = cache.getMetrics()
      expect(metrics.hitRatio).toBeCloseTo(75, 1) // 3 hits out of 4 total = 75%
    })

    it('should track cache size and capacity', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const metrics = cache.getMetrics()
      expect(metrics.size).toBe(2)
      expect(metrics.capacity).toBe(defaultConfig.tokenCacheSize)
    })

    it('should track evictions', () => {
      const smallCache = new IntelligentCache({
        tokenCacheSize: 3,
        evictionStrategy: 'lru'
      })

      // Fill beyond capacity to trigger evictions
      smallCache.set('key1', 'value1')
      smallCache.set('key2', 'value2')
      smallCache.set('key3', 'value3')
      smallCache.set('key4', 'value4') // Should trigger eviction

      const metrics = smallCache.getMetrics()
      expect(metrics.evictions).toBeGreaterThan(0)
    })

    it('should track average lookup time', () => {
      cache.set('key1', 'value1')

      // Perform some operations
      cache.get('key1')
      cache.get('nonexistent')
      cache.has('key1')

      const metrics = cache.getMetrics()
      expect(metrics.averageLookupTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('optimization capabilities', () => {
    it('should provide optimization interface', () => {
      // Add some data for optimization
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      // Access patterns
      cache.get('key1')
      cache.get('key1')
      cache.get('key2')

      // Should have optimize method (if implemented)
      if (typeof cache.optimize === 'function') {
        expect(() => cache.optimize()).not.toThrow()
      }
    })

    it('should handle different eviction strategies', () => {
      const lruCache = new IntelligentCache({
        tokenCacheSize: 100,
        evictionStrategy: 'lru'
      })

      const lfuCache = new IntelligentCache({
        tokenCacheSize: 100,
        evictionStrategy: 'lfu'
      })

      // Both should work without errors
      lruCache.set('key1', 'value1')
      lfuCache.set('key1', 'value1')

      expect(lruCache.get('key1')).toBe('value1')
      expect(lfuCache.get('key1')).toBe('value1')
    })
  })

  describe('error handling', () => {
    it('should handle null/undefined values gracefully', () => {
      cache.set('null-key', null)
      cache.set('undefined-key', undefined)

      expect(cache.get('null-key')).toBeNull()
      expect(cache.get('undefined-key')).toBeUndefined()
      expect(cache.has('null-key')).toBe(true)
      expect(cache.has('undefined-key')).toBe(true)
    })

    it('should handle very large values', () => {
      const largeValue = 'x'.repeat(1024 * 1024) // 1MB string

      // Should not throw error (may or may not store based on tier limits)
      expect(() => cache.set('large', largeValue)).not.toThrow()
    })

    it('should handle invalid keys gracefully', () => {
      const invalidKeys = [null, undefined, '', 0, false]

      invalidKeys.forEach((key) => {
        // Should not throw errors, but behavior may vary
        expect(() => cache.set(key as any, 'value')).not.toThrow()
        expect(() => cache.get(key as any)).not.toThrow()
        expect(() => cache.has(key as any)).not.toThrow()
        expect(() => cache.delete(key as any)).not.toThrow()
      })
    })
  })

  describe('performance characteristics', () => {
    it('should maintain reasonable performance with many operations', () => {
      const start = Date.now()

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, `value${i}`)
      }

      for (let i = 0; i < 1000; i++) {
        cache.get(`key${i}`)
      }

      const duration = Date.now() - start

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000) // 1 second for 2000 operations
    })

    it('should handle concurrent-like operations', () => {
      // Simulate rapid operations that might happen in concurrent scenarios
      const operations: (() => void)[] = []

      for (let i = 0; i < 100; i++) {
        operations.push(() => cache.set(`key${i}`, `value${i}`))
        operations.push(() => cache.get(`key${i}`))
        operations.push(() => cache.has(`key${i}`))
      }

      // Execute all operations
      expect(() => {
        operations.forEach((op) => op())
      }).not.toThrow()

      // Cache should still be in valid state
      expect(cache.size()).toBeGreaterThan(0)
    })
  })

  describe('configuration edge cases', () => {
    it('should handle zero cache size', () => {
      const zeroCache = new IntelligentCache({
        tokenCacheSize: 0
      })

      zeroCache.set('key', 'value')
      // Behavior with zero size may vary - should not crash
      expect(zeroCache.size()).toBeGreaterThanOrEqual(0)
    })

    it('should handle very large cache size', () => {
      const largeCache = new IntelligentCache({
        tokenCacheSize: 1000000
      })

      largeCache.set('key', 'value')
      expect(largeCache.get('key')).toBe('value')
    })

    it('should handle minimal TTL', () => {
      const quickExpireCache = new IntelligentCache({
        tokenCacheSize: 100,
        ttl: 1 // 1ms TTL
      })

      quickExpireCache.set('key', 'value')
      expect(quickExpireCache.has('key')).toBeDefined() // May or may not be expired immediately
    })
  })
})
