/**
 * Monitoring Types
 *
 * Simple type definitions for the monitoring system.
 * No complex hierarchies or over-engineered interfaces.
 */

export interface MonitoringConfig {
  enabled?: boolean
  cacheSize?: number
  memoryWarningThreshold?: number
}

export interface CacheStats {
  size: number
  maxSize: number
  hitCount: number
  missCount: number
  hitRate: number
}

export interface MemoryInfo {
  used: number
  warning: boolean
  percentage?: number
}

export interface OperationRecord {
  name: string
  duration: number
  timestamp: number
}

export interface MonitoringMetrics {
  duration: number
  testCount: number
  errorCount: number
  cacheHitRate: number
  cacheHits: number
  cacheMisses: number
  memoryUsed: number
  operationCount: number
  averageOperationTime: number
  uptime: number
  memory: MemoryInfo
  cache: CacheStats
  enabled: boolean
  started: boolean
}

// Backward compatibility type aliases
export type PerformanceConfig = MonitoringConfig
export type PerformanceMetrics = MonitoringMetrics
