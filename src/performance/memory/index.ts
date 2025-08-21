/**
 * Memory Management System - Main Exports
 *
 * Central export point for the memory management system.
 *
 * @module memory
 */

export { MemoryManager } from './MemoryManager'
export { ResourcePool, StringPool, ArrayPool, BufferPool, PoolFactory } from './ResourcePool'
export { MemoryProfiler } from './MemoryProfiler'

export type {
  MemoryMetrics,
  MemoryPressureLevel,
  MemoryConfig,
  IMemoryManager,
  MemorySnapshot,
  MemoryTrend,
  PoolStats,
  PoolConfig,
  ObjectFactory,
  ObjectReset,
  ObjectValidator
} from './types'