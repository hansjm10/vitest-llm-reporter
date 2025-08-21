/**
 * Memory Manager - Pressure Detection and Management
 *
 * Advanced memory management system with pressure detection,
 * object pooling, and intelligent cleanup strategies.
 *
 * @module MemoryManager
 */

import type {
  IMemoryManager,
  MemoryMetrics,
  MemoryPressureLevel,
  MemoryConfig
} from '../types'
import { ResourcePool } from './ResourcePool'
import { MemoryProfiler } from './MemoryProfiler'
import { coreLogger, errorLogger } from '../../utils/logger'

/**
 * Memory pressure thresholds
 */
interface MemoryThresholds {
  readonly low: number      // < 50% usage
  readonly moderate: number // 50-75% usage
  readonly high: number     // 75-90% usage
  readonly critical: number // > 90% usage
}

/**
 * Memory cleanup task
 */
interface CleanupTask {
  readonly name: string
  readonly priority: number
  readonly estimatedSavings: number
  readonly execute: () => Promise<number>
}

/**
 * Memory allocation tracking
 */
interface AllocationTracker {
  allocations: Map<string, { size: number; timestamp: number }>
  totalAllocated: number
  peakAllocated: number
}

/**
 * Memory manager implementation
 */
export class MemoryManager implements IMemoryManager {
  private readonly config: Required<MemoryConfig>
  private readonly pools: Map<string, ResourcePool<any>>
  private readonly profiler: MemoryProfiler
  private readonly thresholds: MemoryThresholds
  private readonly allocationTracker: AllocationTracker
  private readonly cleanupTasks: CleanupTask[]
  private monitoringInterval?: NodeJS.Timeout
  private lastGCTime = 0
  private gcCount = 0
  private readonly debug = coreLogger()
  private readonly debugError = errorLogger()

  constructor(config: MemoryConfig) {
    this.config = this.resolveConfig(config)
    this.pools = new Map()
    this.profiler = new MemoryProfiler(this.config)
    this.thresholds = this.calculateThresholds()
    this.allocationTracker = {
      allocations: new Map(),
      totalAllocated: 0,
      peakAllocated: 0
    }
    this.cleanupTasks = []

    this.initializePools()
    this.setupCleanupTasks()
    this.startMonitoring()
  }

  /**
   * Resolve memory configuration with defaults
   */
  private resolveConfig(config: MemoryConfig): Required<MemoryConfig> {
    return {
      enabled: config.enabled ?? true,
      pressureThreshold: config.pressureThreshold ?? 100,
      enablePooling: config.enablePooling ?? true,
      poolSizes: {
        testResults: config.poolSizes?.testResults ?? 1000,
        errors: config.poolSizes?.errors ?? 500,
        consoleOutputs: config.poolSizes?.consoleOutputs ?? 2000
      },
      enableProfiling: config.enableProfiling ?? false,
      monitoringInterval: config.monitoringInterval ?? 10000
    }
  }

  /**
   * Calculate memory thresholds based on available memory
   */
  private calculateThresholds(): MemoryThresholds {
    // Get available memory information
    const totalMemory = this.getTotalSystemMemory()
    const processMemoryLimit = this.getProcessMemoryLimit()
    
    // Use the smaller of system memory and process limit
    const effectiveLimit = Math.min(totalMemory, processMemoryLimit)
    
    return {
      low: effectiveLimit * 0.5,
      moderate: effectiveLimit * 0.75,
      high: effectiveLimit * 0.9,
      critical: effectiveLimit * 0.95
    }
  }

  /**
   * Initialize object pools
   */
  private initializePools(): void {
    if (!this.config.enablePooling) {
      return
    }

    try {
      // Test result pool
      this.pools.set('testResults', new ResourcePool<any>(
        () => ({
          test: { name: '', file: '', duration: 0 },
          result: { state: 'pending', errors: [] },
          console: []
        }),
        (obj) => {
          obj.test.name = ''
          obj.test.file = ''
          obj.test.duration = 0
          obj.result.state = 'pending'
          obj.result.errors.length = 0
          obj.console.length = 0
          return obj
        },
        this.config.poolSizes.testResults
      ))

      // Error pool
      this.pools.set('errors', new ResourcePool<any>(
        () => ({
          message: '',
          stack: '',
          name: '',
          cause: undefined
        }),
        (obj) => {
          obj.message = ''
          obj.stack = ''
          obj.name = ''
          obj.cause = undefined
          return obj
        },
        this.config.poolSizes.errors
      ))

      // Console output pool
      this.pools.set('consoleOutputs', new ResourcePool<any>(
        () => ({
          type: 'log',
          output: '',
          timestamp: 0,
          source: ''
        }),
        (obj) => {
          obj.type = 'log'
          obj.output = ''
          obj.timestamp = 0
          obj.source = ''
          return obj
        },
        this.config.poolSizes.consoleOutputs
      ))

      this.debug('Initialized %d object pools', this.pools.size)
    } catch (error) {
      this.debugError('Failed to initialize pools: %O', error)
    }
  }

  /**
   * Setup cleanup tasks
   */
  private setupCleanupTasks(): void {
    this.cleanupTasks.push(
      {
        name: 'pool_cleanup',
        priority: 1,
        estimatedSavings: 5 * 1024 * 1024, // 5MB
        execute: async () => this.cleanupPools()
      },
      {
        name: 'allocation_cleanup',
        priority: 2,
        estimatedSavings: 10 * 1024 * 1024, // 10MB
        execute: async () => this.cleanupAllocations()
      },
      {
        name: 'force_gc',
        priority: 3,
        estimatedSavings: 20 * 1024 * 1024, // 20MB
        execute: async () => this.forceGarbageCollection()
      },
      {
        name: 'profiler_cleanup',
        priority: 4,
        estimatedSavings: 2 * 1024 * 1024, // 2MB
        execute: async () => this.profiler.cleanup()
      }
    )
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    if (!this.config.enabled) {
      return
    }

    this.monitoringInterval = setInterval(() => {
      try {
        this.performMonitoringCycle()
      } catch (error) {
        this.debugError('Memory monitoring error: %O', error)
      }
    }, this.config.monitoringInterval)

    this.debug('Memory monitoring started (interval: %dms)', this.config.monitoringInterval)
  }

  /**
   * Stop memory monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
      this.debug('Memory monitoring stopped')
    }
  }

  /**
   * Get current memory usage
   */
  getUsage(): MemoryMetrics {
    try {
      const memUsage = process.memoryUsage()
      const currentUsage = memUsage.heapUsed
      const totalMemory = this.getTotalSystemMemory()
      
      // Update peak tracking
      this.allocationTracker.peakAllocated = Math.max(
        this.allocationTracker.peakAllocated,
        currentUsage
      )
      
      const usagePercentage = (currentUsage / totalMemory) * 100
      const pressureLevel = this.calculatePressureLevel(currentUsage)
      
      // Get pool statistics
      const poolStats = this.getPoolStatistics()
      
      return {
        currentUsage,
        peakUsage: this.allocationTracker.peakAllocated,
        usagePercentage,
        gcCount: this.gcCount,
        pressureLevel,
        poolStats
      }
    } catch (error) {
      this.debugError('Failed to get memory usage: %O', error)
      return this.createEmptyMemoryMetrics()
    }
  }

  /**
   * Check current memory pressure level
   */
  checkPressure(): MemoryPressureLevel {
    const currentUsage = process.memoryUsage().heapUsed
    return this.calculatePressureLevel(currentUsage)
  }

  /**
   * Clean up memory
   */
  async cleanup(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    try {
      this.debug('Starting memory cleanup')
      const pressureLevel = this.checkPressure()
      
      // Select cleanup tasks based on pressure level
      const tasksToRun = this.selectCleanupTasks(pressureLevel)
      
      let totalSaved = 0
      for (const task of tasksToRun) {
        try {
          const saved = await task.execute()
          totalSaved += saved
          this.debug('Cleanup task %s saved %d bytes', task.name, saved)
        } catch (error) {
          this.debugError('Cleanup task %s failed: %O', task.name, error)
        }
      }
      
      this.debug('Memory cleanup completed, saved %d bytes', totalSaved)
    } catch (error) {
      this.debugError('Memory cleanup failed: %O', error)
    }
  }

  /**
   * Get object from pool
   */
  getPooledObject<T>(type: string): T | undefined {
    if (!this.config.enablePooling) {
      return undefined
    }

    const pool = this.pools.get(type)
    if (pool) {
      const obj = pool.acquire()
      if (obj) {
        this.trackAllocation(type, this.estimateObjectSize(obj))
        return obj as T
      }
    }
    
    return undefined
  }

  /**
   * Return object to pool
   */
  returnToPool<T>(type: string, obj: T): void {
    if (!this.config.enablePooling) {
      return
    }

    const pool = this.pools.get(type)
    if (pool) {
      pool.release(obj)
      this.untrackAllocation(type)
    }
  }

  /**
   * Optimize memory usage
   */
  async optimize(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    try {
      this.debug('Starting memory optimization')
      
      // Run profiling if enabled
      if (this.config.enableProfiling) {
        await this.profiler.profile()
      }
      
      // Optimize pools
      for (const [type, pool] of this.pools) {
        pool.optimize()
      }
      
      // Cleanup if under pressure
      const pressureLevel = this.checkPressure()
      if (pressureLevel === 'high' || pressureLevel === 'critical') {
        await this.cleanup()
      }
      
      this.debug('Memory optimization completed')
    } catch (error) {
      this.debugError('Memory optimization failed: %O', error)
    }
  }

  /**
   * Perform monitoring cycle
   */
  private performMonitoringCycle(): void {
    const usage = this.getUsage()
    
    // Check if we need to take action
    if (usage.pressureLevel === 'high' || usage.pressureLevel === 'critical') {
      this.debug('High memory pressure detected: %s (%d%% usage)', 
        usage.pressureLevel, usage.usagePercentage.toFixed(1))
      
      // Trigger async cleanup
      this.cleanup().catch(error => {
        this.debugError('Async cleanup failed: %O', error)
      })
    }
    
    // Update profiler if enabled
    if (this.config.enableProfiling) {
      this.profiler.recordSnapshot(usage)
    }
  }

  /**
   * Calculate pressure level based on current usage
   */
  private calculatePressureLevel(currentUsage: number): MemoryPressureLevel {
    if (currentUsage >= this.thresholds.critical) {
      return 'critical'
    } else if (currentUsage >= this.thresholds.high) {
      return 'high'
    } else if (currentUsage >= this.thresholds.moderate) {
      return 'moderate'
    } else {
      return 'low'
    }
  }

  /**
   * Select cleanup tasks based on pressure level
   */
  private selectCleanupTasks(pressureLevel: MemoryPressureLevel): CleanupTask[] {
    const tasks = [...this.cleanupTasks].sort((a, b) => a.priority - b.priority)
    
    switch (pressureLevel) {
      case 'critical':
        return tasks // Run all tasks
      case 'high':
        return tasks.slice(0, 3) // Run first 3 tasks
      case 'moderate':
        return tasks.slice(0, 2) // Run first 2 tasks
      default:
        return tasks.slice(0, 1) // Run only first task
    }
  }

  /**
   * Clean up object pools
   */
  private async cleanupPools(): Promise<number> {
    let totalSaved = 0
    
    for (const [type, pool] of this.pools) {
      const beforeSize = pool.getStats().totalSize
      pool.cleanup()
      const afterSize = pool.getStats().totalSize
      
      const saved = beforeSize - afterSize
      totalSaved += saved
      
      this.debug('Pool %s cleanup saved %d bytes', type, saved)
    }
    
    return totalSaved
  }

  /**
   * Clean up allocation tracking
   */
  private async cleanupAllocations(): Promise<number> {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000 // 1 hour
    let cleaned = 0
    
    for (const [key, allocation] of this.allocationTracker.allocations) {
      if (now - allocation.timestamp > maxAge) {
        cleaned += allocation.size
        this.allocationTracker.allocations.delete(key)
      }
    }
    
    this.allocationTracker.totalAllocated -= cleaned
    return cleaned
  }

  /**
   * Force garbage collection
   */
  private async forceGarbageCollection(): Promise<number> {
    const beforeUsage = process.memoryUsage().heapUsed
    
    if (global.gc) {
      global.gc()
      this.gcCount++
      this.lastGCTime = Date.now()
      
      const afterUsage = process.memoryUsage().heapUsed
      const saved = beforeUsage - afterUsage
      
      this.debug('Forced GC saved %d bytes', saved)
      return Math.max(0, saved)
    } else {
      this.debug('GC not available (run with --expose-gc)')
      return 0
    }
  }

  /**
   * Track memory allocation
   */
  private trackAllocation(type: string, size: number): void {
    const key = `${type}_${Date.now()}_${Math.random()}`
    
    this.allocationTracker.allocations.set(key, {
      size,
      timestamp: Date.now()
    })
    
    this.allocationTracker.totalAllocated += size
  }

  /**
   * Untrack memory allocation
   */
  private untrackAllocation(type: string): void {
    // Find and remove most recent allocation of this type
    for (const [key, allocation] of this.allocationTracker.allocations) {
      if (key.startsWith(type)) {
        this.allocationTracker.allocations.delete(key)
        this.allocationTracker.totalAllocated -= allocation.size
        break
      }
    }
  }

  /**
   * Estimate object size in bytes
   */
  private estimateObjectSize(obj: unknown): number {
    try {
      return JSON.stringify(obj).length * 2 // Rough estimate (UTF-16)
    } catch {
      return 1024 // Default size for non-serializable objects
    }
  }

  /**
   * Get pool statistics
   */
  private getPoolStatistics(): MemoryMetrics['poolStats'] {
    let totalPooled = 0
    let activeObjects = 0
    let totalHits = 0
    let totalRequests = 0
    
    for (const pool of this.pools.values()) {
      const stats = pool.getStats()
      totalPooled += stats.totalSize
      activeObjects += stats.activeCount
      totalHits += stats.hits
      totalRequests += stats.totalRequests
    }
    
    const poolHitRatio = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0
    
    return {
      totalPooled,
      activeObjects,
      poolHitRatio
    }
  }

  /**
   * Get total system memory
   */
  private getTotalSystemMemory(): number {
    try {
      const os = require('os')
      return os.totalmem()
    } catch {
      return 2 * 1024 * 1024 * 1024 // Default to 2GB
    }
  }

  /**
   * Get process memory limit
   */
  private getProcessMemoryLimit(): number {
    try {
      // Node.js default heap limit is roughly 1.4GB on 64-bit systems
      return 1.4 * 1024 * 1024 * 1024
    } catch {
      return 1 * 1024 * 1024 * 1024 // Default to 1GB
    }
  }

  /**
   * Create empty memory metrics for fallback
   */
  private createEmptyMemoryMetrics(): MemoryMetrics {
    return {
      currentUsage: 0,
      peakUsage: 0,
      usagePercentage: 0,
      gcCount: 0,
      pressureLevel: 'low',
      poolStats: {
        totalPooled: 0,
        activeObjects: 0,
        poolHitRatio: 0
      }
    }
  }

  /**
   * Cleanup and destroy manager
   */
  destroy(): void {
    this.stopMonitoring()
    
    for (const pool of this.pools.values()) {
      pool.destroy()
    }
    
    this.pools.clear()
    this.allocationTracker.allocations.clear()
    
    this.debug('Memory manager destroyed')
  }
}