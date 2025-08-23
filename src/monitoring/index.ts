/**
 * Simple Monitoring System
 * 
 * A straightforward replacement for the over-engineered performance module.
 * No "intelligent" features - just simple, honest monitoring.
 */

import { MonitoringService } from './MonitoringService'
import type { MonitoringConfig } from './types'

export { Cache } from './Cache'
export { MemoryMonitor } from './MemoryMonitor'
export { Metrics } from './Metrics'
export { MonitoringService } from './MonitoringService'
export * from './constants'

export type {
  MonitoringConfig,
  CacheStats,
  MemoryInfo,
  OperationRecord,
  MonitoringMetrics,
  // Backward compatibility aliases
  PerformanceConfig,
  PerformanceMetrics
} from './types'

// For backward compatibility during migration
export { MonitoringService as PerformanceManager } from './MonitoringService'

/**
 * Create a monitoring service with simple configuration
 * 
 * @param config Simple monitoring configuration
 * @returns Configured MonitoringService instance
 */
export function createPerformanceManager(config?: MonitoringConfig): MonitoringService {
  return new MonitoringService(config)
}

/**
 * Create a monitoring service (direct alias)
 * 
 * @param config Simple monitoring configuration
 * @returns Configured MonitoringService instance
 */
export function createMonitoringService(config?: MonitoringConfig) {
  return new MonitoringService(config)
}