/**
 * Resource Pool - Object Pooling Implementation
 *
 * High-performance object pooling system for reducing memory allocation
 * overhead and garbage collection pressure.
 *
 * @module ResourcePool
 */

import { coreLogger, errorLogger } from '../../utils/logger'

/**
 * Pool statistics
 */
export interface PoolStats {
  readonly totalSize: number
  readonly activeCount: number
  readonly availableCount: number
  readonly hits: number
  readonly misses: number
  readonly totalRequests: number
  readonly createdObjects: number
  readonly destroyedObjects: number
  readonly hitRatio: number
  readonly utilizationRatio: number
}

/**
 * Pool configuration
 */
export interface PoolConfig {
  readonly initialSize?: number
  readonly maxSize?: number
  readonly growthFactor?: number
  readonly shrinkThreshold?: number
  readonly maxIdleTime?: number
  readonly validateOnAcquire?: boolean
  readonly validateOnRelease?: boolean
  readonly enableMetrics?: boolean
}

/**
 * Object factory function
 */
export type ObjectFactory<T> = () => T

/**
 * Object reset function
 */
export type ObjectReset<T> = (obj: T) => T

/**
 * Object validator function
 */
export type ObjectValidator<T> = (obj: T) => boolean

/**
 * Pooled object wrapper
 */
interface PooledObject<T> {
  readonly obj: T
  readonly createdAt: number
  lastUsed: number
  useCount: number
  isActive: boolean
}

/**
 * Generic resource pool implementation
 */
export class ResourcePool<T> {
  private readonly config: Required<PoolConfig>
  private readonly factory: ObjectFactory<T>
  private readonly reset: ObjectReset<T>
  private readonly validator?: ObjectValidator<T>
  private readonly available: PooledObject<T>[]
  private readonly active: Set<PooledObject<T>>
  private readonly stats: {
    hits: number
    misses: number
    totalRequests: number
    createdObjects: number
    destroyedObjects: number
  }
  private readonly debug = coreLogger()
  private readonly debugError = errorLogger()
  private maintenanceInterval?: NodeJS.Timeout

  constructor(
    factory: ObjectFactory<T>,
    reset: ObjectReset<T>,
    maxSize: number = 100,
    config: PoolConfig = {},
    validator?: ObjectValidator<T>
  ) {
    this.factory = factory
    this.reset = reset
    this.validator = validator
    this.available = []
    this.active = new Set()
    
    this.config = {
      initialSize: config.initialSize ?? Math.min(10, maxSize),
      maxSize,
      growthFactor: config.growthFactor ?? 1.5,
      shrinkThreshold: config.shrinkThreshold ?? 0.5,
      maxIdleTime: config.maxIdleTime ?? 300000, // 5 minutes
      validateOnAcquire: config.validateOnAcquire ?? false,
      validateOnRelease: config.validateOnRelease ?? false,
      enableMetrics: config.enableMetrics ?? true
    }

    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      createdObjects: 0,
      destroyedObjects: 0
    }

    // Pre-populate pool
    this.prewarm()
    
    // Start maintenance
    this.startMaintenance()
  }

  /**
   * Acquire object from pool
   */
  acquire(): T | null {
    this.stats.totalRequests++

    try {
      // Try to get from available pool
      let pooledObject = this.getAvailableObject()
      
      if (pooledObject) {
        this.stats.hits++
      } else {
        // Create new object if possible
        pooledObject = this.createNewObject()
        if (pooledObject) {
          this.stats.misses++
        } else {
          this.debugError('Failed to acquire object: pool exhausted')
          return null
        }
      }

      // Mark as active
      pooledObject.isActive = true
      pooledObject.lastUsed = Date.now()
      pooledObject.useCount++
      this.active.add(pooledObject)

      this.debug('Object acquired (active: %d, available: %d)', 
        this.active.size, this.available.length)

      return pooledObject.obj
    } catch (error) {
      this.debugError('Failed to acquire object: %O', error)
      return null
    }
  }

  /**
   * Release object back to pool
   */
  release(obj: T): boolean {
    try {
      // Find the pooled object
      const pooledObject = this.findPooledObject(obj)
      if (!pooledObject) {
        this.debugError('Attempted to release unknown object')
        return false
      }

      // Validate if required
      if (this.config.validateOnRelease && this.validator && !this.validator(obj)) {
        this.debugError('Object failed validation on release')
        this.destroyObject(pooledObject)
        return false
      }

      // Reset object state
      try {
        this.reset(obj)
      } catch (error) {
        this.debugError('Failed to reset object: %O', error)
        this.destroyObject(pooledObject)
        return false
      }

      // Mark as available
      pooledObject.isActive = false
      pooledObject.lastUsed = Date.now()
      this.active.delete(pooledObject)
      this.available.push(pooledObject)

      this.debug('Object released (active: %d, available: %d)', 
        this.active.size, this.available.length)

      return true
    } catch (error) {
      this.debugError('Failed to release object: %O', error)
      return false
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const totalSize = this.active.size + this.available.length
    const hitRatio = this.stats.totalRequests > 0 ? 
      (this.stats.hits / this.stats.totalRequests) * 100 : 0
    const utilizationRatio = this.config.maxSize > 0 ? 
      (this.active.size / this.config.maxSize) * 100 : 0

    return {
      totalSize,
      activeCount: this.active.size,
      availableCount: this.available.length,
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalRequests: this.stats.totalRequests,
      createdObjects: this.stats.createdObjects,
      destroyedObjects: this.stats.destroyedObjects,
      hitRatio,
      utilizationRatio
    }
  }

  /**
   * Clear pool and reset statistics
   */
  clear(): void {
    try {
      // Destroy all objects
      [...this.available, ...this.active].forEach(pooledObject => {
        this.destroyObject(pooledObject)
      })

      this.available.length = 0
      this.active.clear()

      // Reset statistics
      this.stats.hits = 0
      this.stats.misses = 0
      this.stats.totalRequests = 0
      this.stats.createdObjects = 0
      this.stats.destroyedObjects = 0

      this.debug('Pool cleared')
    } catch (error) {
      this.debugError('Failed to clear pool: %O', error)
    }
  }

  /**
   * Optimize pool based on usage patterns
   */
  optimize(): void {
    try {
      this.debug('Starting pool optimization')
      
      // Remove idle objects
      this.removeIdleObjects()
      
      // Adjust pool size based on usage
      this.adjustPoolSize()
      
      this.debug('Pool optimization completed')
    } catch (error) {
      this.debugError('Pool optimization failed: %O', error)
    }
  }

  /**
   * Clean up expired objects and optimize pool
   */
  cleanup(): void {
    try {
      const beforeSize = this.available.length
      
      // Remove expired objects
      this.removeIdleObjects()
      
      // Shrink pool if underutilized
      const utilizationRatio = this.active.size / this.config.maxSize
      if (utilizationRatio < this.config.shrinkThreshold) {
        const targetSize = Math.max(
          this.config.initialSize,
          Math.ceil(this.active.size * 1.2)
        )
        
        while (this.available.length > targetSize) {
          const pooledObject = this.available.pop()
          if (pooledObject) {
            this.destroyObject(pooledObject)
          }
        }
      }
      
      const afterSize = this.available.length
      const cleaned = beforeSize - afterSize
      
      if (cleaned > 0) {
        this.debug('Pool cleanup removed %d objects', cleaned)
      }
    } catch (error) {
      this.debugError('Pool cleanup failed: %O', error)
    }
  }

  /**
   * Destroy pool and cleanup resources
   */
  destroy(): void {
    try {
      // Stop maintenance
      if (this.maintenanceInterval) {
        clearInterval(this.maintenanceInterval)
        this.maintenanceInterval = undefined
      }

      // Clear all objects
      this.clear()
      
      this.debug('Pool destroyed')
    } catch (error) {
      this.debugError('Failed to destroy pool: %O', error)
    }
  }

  /**
   * Prewarm pool with initial objects
   */
  private prewarm(): void {
    try {
      for (let i = 0; i < this.config.initialSize; i++) {
        const pooledObject = this.createNewObject()
        if (pooledObject) {
          this.available.push(pooledObject)
        }
      }
      
      this.debug('Pool prewarmed with %d objects', this.available.length)
    } catch (error) {
      this.debugError('Failed to prewarm pool: %O', error)
    }
  }

  /**
   * Get available object from pool
   */
  private getAvailableObject(): PooledObject<T> | null {
    while (this.available.length > 0) {
      const pooledObject = this.available.pop()!
      
      // Validate if required
      if (this.config.validateOnAcquire && this.validator) {
        if (!this.validator(pooledObject.obj)) {
          this.destroyObject(pooledObject)
          continue
        }
      }
      
      return pooledObject
    }
    
    return null
  }

  /**
   * Create new pooled object
   */
  private createNewObject(): PooledObject<T> | null {
    if (this.getTotalSize() >= this.config.maxSize) {
      return null
    }

    try {
      const obj = this.factory()
      const pooledObject: PooledObject<T> = {
        obj,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        useCount: 0,
        isActive: false
      }
      
      this.stats.createdObjects++
      return pooledObject
    } catch (error) {
      this.debugError('Failed to create new object: %O', error)
      return null
    }
  }

  /**
   * Find pooled object by reference
   */
  private findPooledObject(obj: T): PooledObject<T> | undefined {
    for (const pooledObject of this.active) {
      if (pooledObject.obj === obj) {
        return pooledObject
      }
    }
    return undefined
  }

  /**
   * Destroy pooled object
   */
  private destroyObject(pooledObject: PooledObject<T>): void {
    this.active.delete(pooledObject)
    
    // Remove from available if present
    const index = this.available.indexOf(pooledObject)
    if (index >= 0) {
      this.available.splice(index, 1)
    }
    
    this.stats.destroyedObjects++
  }

  /**
   * Remove idle objects that haven't been used recently
   */
  private removeIdleObjects(): void {
    const now = Date.now()
    const maxIdleTime = this.config.maxIdleTime
    
    const toRemove: number[] = []
    
    for (let i = 0; i < this.available.length; i++) {
      const pooledObject = this.available[i]
      if (now - pooledObject.lastUsed > maxIdleTime) {
        toRemove.push(i)
      }
    }
    
    // Remove in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const index = toRemove[i]
      const pooledObject = this.available.splice(index, 1)[0]
      this.destroyObject(pooledObject)
    }
    
    if (toRemove.length > 0) {
      this.debug('Removed %d idle objects', toRemove.length)
    }
  }

  /**
   * Adjust pool size based on usage patterns
   */
  private adjustPoolSize(): void {
    const stats = this.getStats()
    
    // If utilization is high and we have requests, consider growing
    if (stats.utilizationRatio > 80 && stats.totalRequests > 0) {
      const targetSize = Math.min(
        this.config.maxSize,
        Math.ceil(this.getTotalSize() * this.config.growthFactor)
      )
      
      const toCreate = targetSize - this.getTotalSize()
      for (let i = 0; i < toCreate; i++) {
        const pooledObject = this.createNewObject()
        if (pooledObject) {
          this.available.push(pooledObject)
        }
      }
      
      if (toCreate > 0) {
        this.debug('Grew pool by %d objects to %d total', toCreate, this.getTotalSize())
      }
    }
  }

  /**
   * Get total pool size (active + available)
   */
  private getTotalSize(): number {
    return this.active.size + this.available.length
  }

  /**
   * Start maintenance routine
   */
  private startMaintenance(): void {
    const maintenanceInterval = 60000 // 1 minute
    
    this.maintenanceInterval = setInterval(() => {
      try {
        this.removeIdleObjects()
      } catch (error) {
        this.debugError('Pool maintenance error: %O', error)
      }
    }, maintenanceInterval)
  }
}

/**
 * Specialized pools for common object types
 */

/**
 * String pool for reusing string objects
 */
export class StringPool extends ResourcePool<{ value: string }> {
  constructor(maxSize = 1000) {
    super(
      () => ({ value: '' }),
      (obj) => { obj.value = ''; return obj },
      maxSize
    )
  }

  acquireString(initialValue = ''): { value: string } | null {
    const obj = this.acquire()
    if (obj) {
      obj.value = initialValue
    }
    return obj
  }
}

/**
 * Array pool for reusing array objects
 */
export class ArrayPool<T> extends ResourcePool<T[]> {
  constructor(maxSize = 1000) {
    super(
      () => [],
      (arr) => { arr.length = 0; return arr },
      maxSize
    )
  }
}

/**
 * Buffer pool for reusing buffer objects
 */
export class BufferPool extends ResourcePool<Buffer> {
  constructor(bufferSize: number, maxSize = 100) {
    super(
      () => Buffer.allocUnsafe(bufferSize),
      (buffer) => { buffer.fill(0); return buffer },
      maxSize,
      { validateOnAcquire: true },
      (buffer) => buffer.length === bufferSize
    )
  }
}

/**
 * Object pool factory
 */
export class PoolFactory {
  private static pools = new Map<string, ResourcePool<any>>()

  /**
   * Get or create a pool for a specific type
   */
  static getPool<T>(
    name: string,
    factory: ObjectFactory<T>,
    reset: ObjectReset<T>,
    maxSize = 100,
    config?: PoolConfig
  ): ResourcePool<T> {
    let pool = this.pools.get(name)
    
    if (!pool) {
      pool = new ResourcePool(factory, reset, maxSize, config)
      this.pools.set(name, pool)
    }
    
    return pool as ResourcePool<T>
  }

  /**
   * Destroy a pool
   */
  static destroyPool(name: string): boolean {
    const pool = this.pools.get(name)
    if (pool) {
      pool.destroy()
      this.pools.delete(name)
      return true
    }
    return false
  }

  /**
   * Destroy all pools
   */
  static destroyAllPools(): void {
    for (const [name, pool] of this.pools) {
      pool.destroy()
    }
    this.pools.clear()
  }

  /**
   * Get pool statistics for all pools
   */
  static getAllStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {}
    
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats()
    }
    
    return stats
  }
}