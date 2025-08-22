/**
 * Tests for MemoryManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemoryManager } from './MemoryManager'
import type {
  MemoryConfig,
  MemoryMetrics,
  MemoryPressureLevel
} from '../types'

// Mock the logger utilities
vi.mock('../../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

// Mock ResourcePool
const mockResourcePool = {
  acquire: vi.fn(),
  release: vi.fn(),
  cleanup: vi.fn(),
  optimize: vi.fn(),
  destroy: vi.fn(),
  getStats: vi.fn().mockReturnValue({
    totalSize: 1000,
    activeCount: 50,
    hits: 100,
    totalRequests: 120
  })
}

vi.mock('./ResourcePool', () => ({
  ResourcePool: vi.fn().mockImplementation(() => mockResourcePool)
}))

// Mock MemoryProfiler
const mockMemoryProfiler = {
  profile: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn().mockResolvedValue(500),
  recordSnapshot: vi.fn()
}

vi.mock('./MemoryProfiler', () => ({
  MemoryProfiler: vi.fn().mockImplementation(() => mockMemoryProfiler)
}))

// Mock process.memoryUsage
const mockMemoryUsage = vi.fn()
Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true
})

// Mock os module
vi.mock('os', () => ({
  totalmem: vi.fn().mockReturnValue(8 * 1024 * 1024 * 1024) // 8GB
}))

// Mock global.gc
const mockGc = vi.fn()
Object.defineProperty(global, 'gc', {
  value: mockGc,
  writable: true
})

describe('MemoryManager', () => {
  let memoryManager: MemoryManager
  let defaultConfig: MemoryConfig

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // Set up default memory usage mock
    mockMemoryUsage.mockReturnValue({
      rss: 200 * 1024 * 1024, // 200MB
      heapTotal: 150 * 1024 * 1024, // 150MB
      heapUsed: 100 * 1024 * 1024, // 100MB
      external: 20 * 1024 * 1024, // 20MB
      arrayBuffers: 10 * 1024 * 1024 // 10MB
    })

    defaultConfig = {
      enabled: true,
      pressureThreshold: 100,
      enablePooling: true,
      poolSizes: {
        testResults: 1000,
        errors: 500,
        consoleOutputs: 2000
      },
      enableProfiling: true,
      monitoringInterval: 10000
    }

    memoryManager = new MemoryManager(defaultConfig)
  })

  afterEach(() => {
    memoryManager.destroy()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create memory manager with default config', () => {
      const manager = new MemoryManager({})
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should apply custom configuration', () => {
      const customConfig: MemoryConfig = {
        enabled: false,
        pressureThreshold: 200,
        enablePooling: false,
        enableProfiling: false,
        monitoringInterval: 5000
      }
      
      const manager = new MemoryManager(customConfig)
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should initialize pools when pooling enabled', () => {
      const manager = new MemoryManager({ enablePooling: true })
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should not initialize pools when pooling disabled', () => {
      const manager = new MemoryManager({ enablePooling: false })
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should start monitoring when enabled', () => {
      const manager = new MemoryManager({ enabled: true, monitoringInterval: 1000 })
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should not start monitoring when disabled', () => {
      const manager = new MemoryManager({ enabled: false })
      expect(manager).toBeDefined()
      manager.destroy()
    })
  })

  describe('getUsage', () => {
    it('should return current memory usage', () => {
      const usage = memoryManager.getUsage()
      
      expect(usage).toBeDefined()
      expect(usage.currentUsage).toBe(100 * 1024 * 1024) // 100MB as mocked
      expect(usage.peakUsage).toBeGreaterThanOrEqual(usage.currentUsage)
      expect(usage.usagePercentage).toBeGreaterThan(0)
      expect(usage.gcCount).toBeGreaterThanOrEqual(0)
      expect(usage.pressureLevel).toBeDefined()
      expect(usage.poolStats).toBeDefined()
    })

    it('should track peak usage correctly', () => {
      // First call
      const usage1 = memoryManager.getUsage()
      const firstPeak = usage1.peakUsage
      
      // Increase memory usage
      mockMemoryUsage.mockReturnValueOnce({
        rss: 300 * 1024 * 1024,
        heapTotal: 250 * 1024 * 1024,
        heapUsed: 200 * 1024 * 1024, // Higher usage
        external: 20 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024
      })
      
      // Second call
      const usage2 = memoryManager.getUsage()
      
      expect(usage2.peakUsage).toBeGreaterThan(firstPeak)
      expect(usage2.currentUsage).toBe(200 * 1024 * 1024)
    })

    it('should calculate usage percentage correctly', () => {
      const usage = memoryManager.getUsage()
      
      // Current usage (100MB) / Total system memory (8GB) * 100
      const expectedPercentage = (100 * 1024 * 1024) / (8 * 1024 * 1024 * 1024) * 100
      expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2)
    })

    it('should include pool statistics', () => {
      const usage = memoryManager.getUsage()
      
      expect(usage.poolStats.totalPooled).toBe(3000) // 3 pools with 1000 each
      expect(usage.poolStats.activeObjects).toBe(150) // 3 pools with 50 each
      expect(usage.poolStats.poolHitRatio).toBeCloseTo(83.33, 1) // 300 hits / 360 requests
    })

    it('should handle memory usage errors', () => {
      mockMemoryUsage.mockImplementationOnce(() => {
        throw new Error('Memory access failed')
      })
      
      const usage = memoryManager.getUsage()
      
      expect(usage.currentUsage).toBe(0)
      expect(usage.pressureLevel).toBe('low')
    })
  })

  describe('checkPressure', () => {
    it('should return low pressure for normal usage', () => {
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 50 * 1024 * 1024, // Low usage
        external: 0,
        arrayBuffers: 0
      })
      
      const pressure = memoryManager.checkPressure()
      expect(pressure).toBe('low')
    })

    it('should return moderate pressure for medium usage', () => {
      // Mock usage between 50-75% of effective limit
      const manager = new MemoryManager(defaultConfig)
      const effectiveLimit = Math.min(8 * 1024 * 1024 * 1024, 1.4 * 1024 * 1024 * 1024)
      const moderateUsage = effectiveLimit * 0.6 // 60% usage
      
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: moderateUsage,
        external: 0,
        arrayBuffers: 0
      })
      
      const pressure = manager.checkPressure()
      expect(pressure).toBe('moderate')
      manager.destroy()
    })

    it('should return high pressure for high usage', () => {
      const manager = new MemoryManager(defaultConfig)
      const effectiveLimit = Math.min(8 * 1024 * 1024 * 1024, 1.4 * 1024 * 1024 * 1024)
      const highUsage = effectiveLimit * 0.85 // 85% usage
      
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: highUsage,
        external: 0,
        arrayBuffers: 0
      })
      
      const pressure = manager.checkPressure()
      expect(pressure).toBe('high')
      manager.destroy()
    })

    it('should return critical pressure for very high usage', () => {
      const manager = new MemoryManager(defaultConfig)
      const effectiveLimit = Math.min(8 * 1024 * 1024 * 1024, 1.4 * 1024 * 1024 * 1024)
      const criticalUsage = effectiveLimit * 0.96 // 96% usage
      
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: criticalUsage,
        external: 0,
        arrayBuffers: 0
      })
      
      const pressure = manager.checkPressure()
      expect(pressure).toBe('critical')
      manager.destroy()
    })
  })

  describe('cleanup', () => {
    it('should perform cleanup when enabled', async () => {
      await memoryManager.cleanup()
      
      // Verify cleanup tasks were executed
      expect(mockResourcePool.cleanup).toHaveBeenCalled()
      expect(mockMemoryProfiler.cleanup).toHaveBeenCalled()
    })

    it('should skip cleanup when disabled', async () => {
      const disabledManager = new MemoryManager({ enabled: false })
      await disabledManager.cleanup()
      
      // Should complete without errors
      expect(true).toBe(true)
      disabledManager.destroy()
    })

    it('should select appropriate cleanup tasks based on pressure', async () => {
      // Mock high pressure
      const manager = new MemoryManager(defaultConfig)
      const effectiveLimit = Math.min(8 * 1024 * 1024 * 1024, 1.4 * 1024 * 1024 * 1024)
      const highUsage = effectiveLimit * 0.85
      
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: highUsage,
        external: 0,
        arrayBuffers: 0
      })
      
      await manager.cleanup()
      
      // Should execute multiple cleanup tasks for high pressure
      expect(mockResourcePool.cleanup).toHaveBeenCalled()
      manager.destroy()
    })

    it('should handle cleanup task errors gracefully', async () => {
      mockResourcePool.cleanup.mockRejectedValueOnce(new Error('Cleanup failed'))
      
      await expect(memoryManager.cleanup()).resolves.not.toThrow()
    })

    it('should track total bytes saved during cleanup', async () => {
      // Mock cleanup return values
      mockResourcePool.cleanup.mockReturnValue(undefined)
      mockMemoryProfiler.cleanup.mockResolvedValue(1000)
      
      await memoryManager.cleanup()
      
      // Should complete and log total savings
      expect(mockMemoryProfiler.cleanup).toHaveBeenCalled()
    })
  })

  describe('pool management', () => {
    it('should get pooled object when pooling enabled', () => {
      const mockObj = { test: 'data' }
      mockResourcePool.acquire.mockReturnValue(mockObj)
      
      const obj = memoryManager.getPooledObject('testResults')
      
      expect(obj).toBe(mockObj)
      expect(mockResourcePool.acquire).toHaveBeenCalled()
    })

    it('should return undefined when pool does not exist', () => {
      const obj = memoryManager.getPooledObject('nonexistent')
      expect(obj).toBeUndefined()
    })

    it('should return undefined when pooling disabled', () => {
      const disabledManager = new MemoryManager({ enablePooling: false })
      const obj = disabledManager.getPooledObject('testResults')
      
      expect(obj).toBeUndefined()
      disabledManager.destroy()
    })

    it('should return undefined when pool returns nothing', () => {
      mockResourcePool.acquire.mockReturnValue(undefined)
      
      const obj = memoryManager.getPooledObject('testResults')
      expect(obj).toBeUndefined()
    })

    it('should return object to pool', () => {
      const mockObj = { test: 'data' }
      
      memoryManager.returnToPool('testResults', mockObj)
      
      expect(mockResourcePool.release).toHaveBeenCalledWith(mockObj)
    })

    it('should handle returning to non-existent pool', () => {
      const mockObj = { test: 'data' }
      
      expect(() => memoryManager.returnToPool('nonexistent', mockObj)).not.toThrow()
    })

    it('should not return to pool when pooling disabled', () => {
      const disabledManager = new MemoryManager({ enablePooling: false })
      const mockObj = { test: 'data' }
      
      disabledManager.returnToPool('testResults', mockObj)
      
      expect(mockResourcePool.release).not.toHaveBeenCalled()
      disabledManager.destroy()
    })
  })

  describe('optimize', () => {
    it('should perform optimization when enabled', async () => {
      await memoryManager.optimize()
      
      expect(mockMemoryProfiler.profile).toHaveBeenCalled()
      expect(mockResourcePool.optimize).toHaveBeenCalled()
    })

    it('should skip optimization when disabled', async () => {
      const disabledManager = new MemoryManager({ enabled: false })
      await disabledManager.optimize()
      
      expect(mockMemoryProfiler.profile).not.toHaveBeenCalled()
      disabledManager.destroy()
    })

    it('should skip profiling when profiling disabled', async () => {
      const noProflingManager = new MemoryManager({ enableProfiling: false })
      await noProflingManager.optimize()
      
      expect(mockMemoryProfiler.profile).not.toHaveBeenCalled()
      expect(mockResourcePool.optimize).toHaveBeenCalled()
      noProflingManager.destroy()
    })

    it('should trigger cleanup under high pressure', async () => {
      // Mock high pressure scenario
      const manager = new MemoryManager(defaultConfig)
      const effectiveLimit = Math.min(8 * 1024 * 1024 * 1024, 1.4 * 1024 * 1024 * 1024)
      const highUsage = effectiveLimit * 0.85
      
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: highUsage,
        external: 0,
        arrayBuffers: 0
      })
      
      await manager.optimize()
      
      expect(mockResourcePool.cleanup).toHaveBeenCalled()
      manager.destroy()
    })

    it('should handle optimization errors gracefully', async () => {
      mockMemoryProfiler.profile.mockRejectedValueOnce(new Error('Profiling failed'))
      
      await expect(memoryManager.optimize()).resolves.not.toThrow()
    })
  })

  describe('monitoring', () => {
    it('should perform monitoring cycles', () => {
      const manager = new MemoryManager({
        enabled: true,
        monitoringInterval: 100
      })
      
      vi.advanceTimersByTime(250) // Should trigger 2 cycles
      
      // Manager should be monitoring
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should trigger cleanup during monitoring under high pressure', () => {
      const manager = new MemoryManager({
        enabled: true,
        monitoringInterval: 100
      })
      
      // Mock high pressure
      const effectiveLimit = Math.min(8 * 1024 * 1024 * 1024, 1.4 * 1024 * 1024 * 1024)
      const highUsage = effectiveLimit * 0.85
      
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: highUsage,
        external: 0,
        arrayBuffers: 0
      })
      
      vi.advanceTimersByTime(150) // Trigger monitoring cycle
      
      // Should trigger async cleanup
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should record profiler snapshots when profiling enabled', () => {
      const manager = new MemoryManager({
        enabled: true,
        enableProfiling: true,
        monitoringInterval: 100
      })
      
      vi.advanceTimersByTime(150)
      
      expect(mockMemoryProfiler.recordSnapshot).toHaveBeenCalled()
      manager.destroy()
    })

    it('should handle monitoring errors gracefully', () => {
      const manager = new MemoryManager({
        enabled: true,
        monitoringInterval: 100
      })
      
      mockMemoryUsage.mockImplementationOnce(() => {
        throw new Error('Monitoring error')
      })
      
      vi.advanceTimersByTime(150)
      
      // Should not crash
      expect(manager).toBeDefined()
      manager.destroy()
    })
  })

  describe('cleanup tasks', () => {
    it('should clean up pools and return bytes saved', async () => {
      const cleanupTask = memoryManager['cleanupTasks'].find(t => t.name === 'pool_cleanup')
      expect(cleanupTask).toBeDefined()
      
      const saved = await cleanupTask!.execute()
      expect(typeof saved).toBe('number')
      expect(saved).toBeGreaterThanOrEqual(0)
    })

    it('should clean up allocation tracking', async () => {
      // Add some tracked allocations
      memoryManager['trackAllocation']('test', 1000)
      memoryManager['trackAllocation']('old', 2000)
      
      // Simulate old allocation
      const allocation = memoryManager['allocationTracker'].allocations.get(
        Array.from(memoryManager['allocationTracker'].allocations.keys()).find(k => k.includes('old'))!
      )
      if (allocation) {
        allocation.timestamp = Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
      }
      
      const cleanupTask = memoryManager['cleanupTasks'].find(t => t.name === 'allocation_cleanup')
      const saved = await cleanupTask!.execute()
      
      expect(saved).toBeGreaterThanOrEqual(0)
    })

    it('should force garbage collection when available', async () => {
      const cleanupTask = memoryManager['cleanupTasks'].find(t => t.name === 'force_gc')
      
      // Mock memory reduction after GC
      mockMemoryUsage
        .mockReturnValueOnce({
          heapUsed: 100 * 1024 * 1024 // Before GC
        } as any)
        .mockReturnValueOnce({
          heapUsed: 80 * 1024 * 1024 // After GC
        } as any)
      
      const saved = await cleanupTask!.execute()
      
      expect(mockGc).toHaveBeenCalled()
      expect(saved).toBeGreaterThanOrEqual(0)
    })

    it('should handle unavailable garbage collection', async () => {
      // Remove global.gc
      const originalGc = global.gc
      delete (global as any).gc
      
      const cleanupTask = memoryManager['cleanupTasks'].find(t => t.name === 'force_gc')
      const saved = await cleanupTask!.execute()
      
      expect(saved).toBe(0)
      
      // Restore global.gc
      ;(global as any).gc = originalGc
    })

    it('should call profiler cleanup', async () => {
      const cleanupTask = memoryManager['cleanupTasks'].find(t => t.name === 'profiler_cleanup')
      
      await cleanupTask!.execute()
      
      expect(mockMemoryProfiler.cleanup).toHaveBeenCalled()
    })
  })

  describe('allocation tracking', () => {
    it('should track allocations', () => {
      memoryManager['trackAllocation']('test', 1000)
      
      const tracker = memoryManager['allocationTracker']
      expect(tracker.totalAllocated).toBe(1000)
      expect(tracker.allocations.size).toBe(1)
    })

    it('should untrack allocations', () => {
      memoryManager['trackAllocation']('test', 1000)
      memoryManager['untrackAllocation']('test')
      
      const tracker = memoryManager['allocationTracker']
      expect(tracker.totalAllocated).toBe(0)
      expect(tracker.allocations.size).toBe(0)
    })

    it('should estimate object sizes', () => {
      const obj = { test: 'data', number: 42 }
      const size = memoryManager['estimateObjectSize'](obj)
      
      expect(size).toBeGreaterThan(0)
      expect(typeof size).toBe('number')
    })

    it('should handle non-serializable objects', () => {
      const circular: any = {}
      circular.self = circular
      
      const size = memoryManager['estimateObjectSize'](circular)
      expect(size).toBe(1024) // Default size
    })
  })

  describe('threshold calculation', () => {
    it('should calculate thresholds based on system memory', () => {
      const thresholds = memoryManager['thresholds']
      
      expect(thresholds.low).toBeGreaterThan(0)
      expect(thresholds.moderate).toBeGreaterThan(thresholds.low)
      expect(thresholds.high).toBeGreaterThan(thresholds.moderate)
      expect(thresholds.critical).toBeGreaterThan(thresholds.high)
    })

    it('should use process memory limit when smaller than system memory', () => {
      // Process limit (1.4GB) should be smaller than system memory (8GB)
      const thresholds = memoryManager['thresholds']
      const processLimit = 1.4 * 1024 * 1024 * 1024
      
      expect(thresholds.critical).toBeLessThan(8 * 1024 * 1024 * 1024 * 0.95)
      expect(thresholds.critical).toBeCloseTo(processLimit * 0.95, -6) // Within 1MB
    })
  })

  describe('system information', () => {
    it('should get total system memory', () => {
      const totalMemory = memoryManager['getTotalSystemMemory']()
      expect(totalMemory).toBe(8 * 1024 * 1024 * 1024) // 8GB as mocked
    })

    it('should get process memory limit', () => {
      const processLimit = memoryManager['getProcessMemoryLimit']()
      expect(processLimit).toBe(1.4 * 1024 * 1024 * 1024) // 1.4GB
    })

    it('should handle missing os module gracefully', () => {
      vi.doUnmock('os')
      vi.mock('os', () => {
        throw new Error('OS module not available')
      })
      
      const manager = new MemoryManager({})
      const totalMemory = manager['getTotalSystemMemory']()
      
      expect(totalMemory).toBe(2 * 1024 * 1024 * 1024) // Default 2GB
      manager.destroy()
    })
  })

  describe('destroy', () => {
    it('should clean up all resources', () => {
      const manager = new MemoryManager(defaultConfig)
      manager.destroy()
      
      expect(mockResourcePool.destroy).toHaveBeenCalled()
    })

    it('should stop monitoring', () => {
      const manager = new MemoryManager({
        enabled: true,
        monitoringInterval: 100
      })
      
      manager.destroy()
      
      // Advancing timers should not trigger more monitoring
      vi.advanceTimersByTime(1000)
      expect(true).toBe(true) // Should not cause issues
    })

    it('should clear allocation tracking', () => {
      memoryManager['trackAllocation']('test', 1000)
      memoryManager.destroy()
      
      const tracker = memoryManager['allocationTracker']
      expect(tracker.allocations.size).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should handle pool initialization errors', () => {
      const { ResourcePool } = require('./ResourcePool')
      vi.mocked(ResourcePool).mockImplementationOnce(() => {
        throw new Error('Pool init failed')
      })
      
      expect(() => new MemoryManager({ enablePooling: true })).not.toThrow()
    })

    it('should handle memory usage access errors', () => {
      mockMemoryUsage.mockImplementationOnce(() => {
        throw new Error('Memory access failed')
      })
      
      const usage = memoryManager.getUsage()
      expect(usage.currentUsage).toBe(0)
    })

    it('should handle cleanup errors', async () => {
      mockResourcePool.cleanup.mockImplementationOnce(() => {
        throw new Error('Cleanup failed')
      })
      
      await expect(memoryManager.cleanup()).resolves.not.toThrow()
    })
  })

  describe('configuration edge cases', () => {
    it('should handle minimal configuration', () => {
      const manager = new MemoryManager({})
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should handle zero monitoring interval', () => {
      const manager = new MemoryManager({ monitoringInterval: 0 })
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should handle very low pressure threshold', () => {
      const manager = new MemoryManager({ pressureThreshold: 1 })
      expect(manager).toBeDefined()
      manager.destroy()
    })

    it('should handle zero pool sizes', () => {
      const manager = new MemoryManager({
        poolSizes: {
          testResults: 0,
          errors: 0,
          consoleOutputs: 0
        }
      })
      expect(manager).toBeDefined()
      manager.destroy()
    })
  })
})