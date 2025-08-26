/**
 * Simple Memory Monitor
 *
 * Basic memory monitoring with configurable warning thresholds.
 * No fancy algorithms - just honest memory usage reporting.
 */

import { DEFAULT_MEMORY_WARNING_THRESHOLD } from './constants.js'
import type { MemoryInfo } from './types.js'

export class MemoryMonitor {
  private warningThreshold = DEFAULT_MEMORY_WARNING_THRESHOLD

  constructor(warningThreshold?: number) {
    if (warningThreshold !== undefined) {
      this.warningThreshold = warningThreshold
    }
  }

  checkMemory(): MemoryInfo {
    if (typeof process?.memoryUsage !== 'function') {
      return { used: 0, warning: false }
    }

    const memUsage = process.memoryUsage()
    const used = memUsage.heapUsed
    const total = memUsage.heapTotal

    return {
      used,
      warning: used > this.warningThreshold,
      percentage: total > 0 ? (used / total) * 100 : 0
    }
  }

  getMemoryUsage(): number {
    if (typeof process?.memoryUsage !== 'function') {
      return 0
    }
    return process.memoryUsage().heapUsed
  }

  getDetailedMemory(): NodeJS.MemoryUsage {
    if (typeof process?.memoryUsage !== 'function') {
      return {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      }
    }

    return process.memoryUsage()
  }

  setWarningThreshold(threshold: number): void {
    this.warningThreshold = threshold
  }

  getWarningThreshold(): number {
    return this.warningThreshold
  }
}
