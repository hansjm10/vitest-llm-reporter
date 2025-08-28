/**
 * Simple Monitoring System
 *
 * A straightforward replacement for the over-engineered performance module.
 * No "intelligent" features - just simple, honest monitoring.
 */

import { MonitoringService } from './MonitoringService.js'
import type { MonitoringConfig } from '../types/monitoring.js'

export { Cache } from './Cache.js'
export { MemoryMonitor } from './MemoryMonitor.js'
export { Metrics } from './Metrics.js'
export { MonitoringService } from './MonitoringService.js'
export * from './constants.js'

export type {
  MonitoringConfig,
  CacheStats,
  MemoryInfo,
  OperationRecord,
  MonitoringMetrics,
  // Backward compatibility aliases
  PerformanceConfig,
  PerformanceMetrics
} from '../types/monitoring.js'

// For backward compatibility during migration
export { MonitoringService as PerformanceManager } from './MonitoringService.js'

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
export function createMonitoringService(config?: MonitoringConfig): MonitoringService {
  return new MonitoringService(config)
}
