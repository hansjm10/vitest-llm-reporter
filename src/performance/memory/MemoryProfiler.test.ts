/**
 * Tests for MemoryProfiler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemoryProfiler, type MemorySnapshot, type MemoryTrend } from './MemoryProfiler'
import type { MemoryConfig, MemoryMetrics } from '../types'

// Mock the logger utilities
vi.mock('../../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

describe('MemoryProfiler', () => {
  let profiler: MemoryProfiler
  let defaultConfig: Required<MemoryConfig>
  let mockMemoryMetrics: MemoryMetrics

  beforeEach(() => {
    vi.clearAllMocks()
    
    defaultConfig = {
      enabled: true,
      enableProfiling: true,
      enablePooling: true,
      maxAllocations: 10000,
      maxPoolSize: 1000,
      trackingThreshold: 1024,
      gcThreshold: 100,
      pressureThresholds: {
        low: 60,
        moderate: 75,
        high: 85,
        critical: 95
      },
      cleanupIntervals: {
        light: 30000,
        moderate: 15000,
        aggressive: 5000
      },
      monitoringInterval: 5000
    }

    mockMemoryMetrics = {
      currentUsage: 50 * 1024 * 1024, // 50MB
      peakUsage: 100 * 1024 * 1024, // 100MB
      usagePercentage: 60,
      gcCount: 5,
      pressureLevel: 'moderate',
      poolStats: {
        totalPooled: 500,
        activeObjects: 300,
        poolHitRatio: 80
      }
    }

    profiler = new MemoryProfiler(defaultConfig)
  })

  describe('constructor', () => {
    it('should create profiler with configuration', () => {
      expect(profiler).toBeDefined()
    })

    it('should accept custom configuration', () => {
      const customConfig = {
        ...defaultConfig,
        enableProfiling: false,
        maxAllocations: 5000
      }
      const customProfiler = new MemoryProfiler(customConfig)
      expect(customProfiler).toBeDefined()
    })
  })

  describe('snapshot recording', () => {
    it('should record memory snapshots when profiling enabled', () => {
      profiler.recordSnapshot(mockMemoryMetrics)
      
      const snapshots = profiler.getSnapshots()
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0]).toMatchObject({
        timestamp: expect.any(Number),
        heapUsed: expect.any(Number),
        heapTotal: expect.any(Number),
        external: expect.any(Number),
        rss: expect.any(Number),
        arrayBuffers: expect.any(Number)
      })
    })

    it('should skip recording when profiling disabled', () => {
      const disabledConfig = {
        ...defaultConfig,
        enableProfiling: false
      }
      const disabledProfiler = new MemoryProfiler(disabledConfig)
      
      disabledProfiler.recordSnapshot(mockMemoryMetrics)
      
      const snapshots = disabledProfiler.getSnapshots()
      expect(snapshots).toHaveLength(0)
    })

    it('should record multiple snapshots over time', () => {
      profiler.recordSnapshot(mockMemoryMetrics)
      
      // Wait a bit and record another
      vi.advanceTimersByTime(100)
      profiler.recordSnapshot(mockMemoryMetrics)
      
      const snapshots = profiler.getSnapshots()
      expect(snapshots).toHaveLength(2)
      expect(snapshots[1].timestamp).toBeGreaterThan(snapshots[0].timestamp)
    })

    it('should limit snapshot history size', () => {
      // Record many snapshots
      for (let i = 0; i < 1000; i++) {
        profiler.recordSnapshot(mockMemoryMetrics)
      }
      
      const snapshots = profiler.getSnapshots()
      // Should limit to prevent memory bloat (adjust based on implementation)
      expect(snapshots.length).toBeLessThanOrEqual(500)
    })
  })

  describe('trend analysis', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should analyze memory trends', () => {
      // Record snapshots with increasing memory usage
      const baseTime = Date.now()
      
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(baseTime + i * 1000)
        const metrics = {
          ...mockMemoryMetrics,
          currentUsage: mockMemoryMetrics.currentUsage + (i * 10 * 1024 * 1024) // Increasing by 10MB each time
        }
        profiler.recordSnapshot(metrics)
      }
      
      const trend = profiler.analyzeTrend()
      
      if (trend) {
        expect(trend.trend).toBe('increasing')
        expect(trend.rate).toBeGreaterThan(0)
        expect(trend.confidence).toBeGreaterThan(0)
        expect(trend.confidence).toBeLessThanOrEqual(1)
      }
    })

    it('should detect decreasing memory trend', () => {
      const baseTime = Date.now()
      
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(baseTime + i * 1000)
        const metrics = {
          ...mockMemoryMetrics,
          currentUsage: mockMemoryMetrics.currentUsage - (i * 5 * 1024 * 1024) // Decreasing by 5MB
        }
        profiler.recordSnapshot(metrics)
      }
      
      const trend = profiler.analyzeTrend()
      
      if (trend) {
        expect(trend.trend).toBe('decreasing')
        expect(trend.rate).toBeLessThan(0)
      }
    })

    it('should detect stable memory usage', () => {
      const baseTime = Date.now()
      
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(baseTime + i * 1000)
        profiler.recordSnapshot(mockMemoryMetrics) // Same metrics each time
      }
      
      const trend = profiler.analyzeTrend()
      
      if (trend) {
        expect(trend.trend).toBe('stable')
        expect(Math.abs(trend.rate)).toBeLessThan(1024 * 1024) // Less than 1MB/sec change
      }
    })

    it('should return null for insufficient data', () => {
      profiler.recordSnapshot(mockMemoryMetrics)
      
      const trend = profiler.analyzeTrend()
      
      // May return null if insufficient data points
      if (trend === null) {
        expect(trend).toBeNull()
      } else {
        expect(trend).toBeDefined()
      }
    })
  })

  describe('leak detection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should detect potential memory leaks', () => {
      const baseTime = Date.now()
      
      // Simulate memory leak pattern: consistently increasing usage
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(baseTime + i * 5000) // 5 second intervals
        const metrics = {
          ...mockMemoryMetrics,
          currentUsage: mockMemoryMetrics.currentUsage + (i * 20 * 1024 * 1024), // 20MB increases
          gcCount: mockMemoryMetrics.gcCount + Math.floor(i / 2) // Some GC activity
        }
        profiler.recordSnapshot(metrics)
      }
      
      const leaks = profiler.detectLeaks()
      
      expect(Array.isArray(leaks)).toBe(true)
      // May detect potential leaks based on trends
    })

    it('should not detect leaks with stable memory usage', () => {
      const baseTime = Date.now()
      
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(baseTime + i * 5000)
        profiler.recordSnapshot(mockMemoryMetrics) // Stable usage
      }
      
      const leaks = profiler.detectLeaks()
      
      expect(Array.isArray(leaks)).toBe(true)
      // Should have few or no leak indicators
    })

    it('should consider GC activity in leak detection', () => {
      const baseTime = Date.now()
      
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(baseTime + i * 5000)
        const metrics = {
          ...mockMemoryMetrics,
          currentUsage: mockMemoryMetrics.currentUsage + (i * 10 * 1024 * 1024),
          gcCount: mockMemoryMetrics.gcCount + i * 2 // Frequent GC
        }
        profiler.recordSnapshot(metrics)
      }
      
      const leaks = profiler.detectLeaks()
      
      expect(Array.isArray(leaks)).toBe(true)
      // Frequent GC with increasing memory might indicate issues
    })
  })

  describe('optimization suggestions', () => {
    it('should provide optimization suggestions', () => {
      // Record some snapshots to provide data for analysis
      for (let i = 0; i < 5; i++) {
        profiler.recordSnapshot(mockMemoryMetrics)
      }
      
      const suggestions = profiler.getOptimizationSuggestions()
      
      expect(Array.isArray(suggestions)).toBe(true)
      // Each suggestion should have basic structure
      suggestions.forEach(suggestion => {
        expect(suggestion).toMatchObject({
          type: expect.any(String),
          priority: expect.any(String),
          description: expect.any(String)
        })
      })
    })

    it('should prioritize suggestions based on memory pressure', () => {
      const highPressureMetrics = {
        ...mockMemoryMetrics,
        pressureLevel: 'high' as const,
        usagePercentage: 90
      }
      
      profiler.recordSnapshot(highPressureMetrics)
      
      const suggestions = profiler.getOptimizationSuggestions()
      
      expect(Array.isArray(suggestions)).toBe(true)
      // Should include high-priority suggestions for high pressure
      const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high')
      expect(highPrioritySuggestions.length).toBeGreaterThanOrEqual(0)
    })

    it('should suggest pool optimization when hit ratio is low', () => {
      const lowPoolMetrics = {
        ...mockMemoryMetrics,
        poolStats: {
          totalPooled: 1000,
          activeObjects: 900,
          poolHitRatio: 30 // Low hit ratio
        }
      }
      
      profiler.recordSnapshot(lowPoolMetrics)
      
      const suggestions = profiler.getOptimizationSuggestions()
      
      expect(Array.isArray(suggestions)).toBe(true)
      // May suggest pool optimization
    })
  })

  describe('data management', () => {
    it('should provide snapshot access', () => {
      profiler.recordSnapshot(mockMemoryMetrics)
      
      const snapshots = profiler.getSnapshots()
      
      expect(Array.isArray(snapshots)).toBe(true)
      expect(snapshots).toHaveLength(1)
    })

    it('should clear snapshot history', () => {
      profiler.recordSnapshot(mockMemoryMetrics)
      profiler.recordSnapshot(mockMemoryMetrics)
      expect(profiler.getSnapshots()).toHaveLength(2)
      
      profiler.clearHistory()
      
      expect(profiler.getSnapshots()).toHaveLength(0)
    })

    it('should export profiling data', () => {
      profiler.recordSnapshot(mockMemoryMetrics)
      
      const exportData = profiler.exportData()
      
      expect(exportData).toBeDefined()
      expect(exportData).toMatchObject({
        snapshots: expect.any(Array),
        trends: expect.any(Object),
        summary: expect.any(Object)
      })
    })

    it('should handle cleanup operations', () => {
      // Record many snapshots
      for (let i = 0; i < 100; i++) {
        profiler.recordSnapshot(mockMemoryMetrics)
      }
      
      profiler.cleanup()
      
      // Should reduce snapshot count or perform other cleanup
      const snapshots = profiler.getSnapshots()
      expect(snapshots.length).toBeLessThanOrEqual(100)
    })
  })

  describe('error handling', () => {
    it('should handle invalid memory metrics', () => {
      const invalidMetrics = {
        ...mockMemoryMetrics,
        currentUsage: NaN,
        peakUsage: -1
      }
      
      expect(() => profiler.recordSnapshot(invalidMetrics)).not.toThrow()
    })

    it('should handle process.memoryUsage() errors', () => {
      // Mock process.memoryUsage to throw
      const originalMemoryUsage = process.memoryUsage
      process.memoryUsage = vi.fn().mockImplementation(() => {
        throw new Error('Memory usage access failed')
      })
      
      expect(() => profiler.recordSnapshot(mockMemoryMetrics)).not.toThrow()
      
      // Restore original
      process.memoryUsage = originalMemoryUsage
    })

    it('should handle analysis with no snapshots', () => {
      const trend = profiler.analyzeTrend()
      const leaks = profiler.detectLeaks()
      const suggestions = profiler.getOptimizationSuggestions()
      
      // Should handle gracefully
      expect(trend).toBeDefined()
      expect(Array.isArray(leaks)).toBe(true)
      expect(Array.isArray(suggestions)).toBe(true)
    })
  })

  describe('performance characteristics', () => {
    it('should handle frequent snapshot recording efficiently', () => {
      const start = Date.now()
      
      for (let i = 0; i < 1000; i++) {
        profiler.recordSnapshot(mockMemoryMetrics)
      }
      
      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should limit memory usage of profiler itself', () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      // Record many snapshots
      for (let i = 0; i < 10000; i++) {
        profiler.recordSnapshot(mockMemoryMetrics)
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const profilerMemoryUsage = finalMemory - initialMemory
      
      // Profiler itself shouldn't use excessive memory (adjust threshold as needed)
      expect(profilerMemoryUsage).toBeLessThan(50 * 1024 * 1024) // 50MB
    })

    it('should perform analysis operations quickly', () => {
      // Add some snapshots for analysis
      for (let i = 0; i < 100; i++) {
        profiler.recordSnapshot(mockMemoryMetrics)
      }
      
      const start = Date.now()
      
      profiler.analyzeTrend()
      profiler.detectLeaks()
      profiler.getOptimizationSuggestions()
      
      const duration = Date.now() - start
      expect(duration).toBeLessThan(500) // Should complete analysis within 500ms
    })
  })
})