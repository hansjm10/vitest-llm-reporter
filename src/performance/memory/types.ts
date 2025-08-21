/**
 * Memory Management Type Definitions
 *
 * Type definitions specific to memory management components.
 *
 * @module memory-types
 */

// Re-export main types from parent module
export type {
  MemoryMetrics,
  MemoryPressureLevel,
  MemoryConfig,
  IMemoryManager
} from '../types'

// Memory profiler specific types
export interface MemorySnapshot {
  readonly timestamp: number
  readonly heapUsed: number
  readonly heapTotal: number
  readonly external: number
  readonly rss: number
  readonly arrayBuffers: number
}

export interface MemoryTrend {
  readonly trend: 'increasing' | 'decreasing' | 'stable'
  readonly rate: number
  readonly confidence: number
}

// Resource pool types
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

export type ObjectFactory<T> = () => T
export type ObjectReset<T> = (obj: T) => T
export type ObjectValidator<T> = (obj: T) => boolean