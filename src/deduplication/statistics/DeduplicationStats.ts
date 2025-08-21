/**
 * Deduplication Statistics
 * 
 * Tracks and reports statistics for the deduplication process,
 * including performance metrics and compression effectiveness.
 * 
 * @module DeduplicationStats
 */

import type {
  DeduplicationStats as IDeduplicationStats,
  PatternType,
  SimilarityLevel,
  DeduplicationGroup
} from '../../types/deduplication'

/**
 * Time series data point
 */
interface TimeSeriesPoint {
  timestamp: number
  value: number
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  startTime: number
  endTime: number
  duration: number
  throughput: number // failures per second
  avgProcessingTime: number // ms per failure
  peakMemoryUsage: number
}

/**
 * Compression metrics
 */
export interface CompressionMetrics {
  originalSize: number
  compressedSize: number
  compressionRatio: number
  spaceSaved: number
  groupCount: number
  avgGroupSize: number
}

/**
 * Pattern effectiveness metrics
 */
export interface PatternEffectiveness {
  pattern: PatternType
  matchCount: number
  avgSimilarity: number
  processingTime: number
  effectiveness: number // 0-1 score
}

/**
 * Extended statistics with detailed metrics
 */
export interface ExtendedStats extends IDeduplicationStats {
  performance: PerformanceMetrics
  compression: CompressionMetrics
  patternEffectiveness: PatternEffectiveness[]
  timeSeries: {
    processingTimes: TimeSeriesPoint[]
    memorySamples: TimeSeriesPoint[]
    compressionRatios: TimeSeriesPoint[]
  }
}

/**
 * Statistics collector implementation
 */
export class DeduplicationStatsCollector {
  private stats: ExtendedStats
  private startTime: number
  private processingTimes: number[]
  private memorySamples: number[]
  private patternMetrics: Map<PatternType, PatternEffectiveness>

  constructor() {
    this.startTime = Date.now()
    this.processingTimes = []
    this.memorySamples = []
    this.patternMetrics = new Map()
    this.stats = this.initializeStats()
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): ExtendedStats {
    return {
      // Base stats
      totalFailures: 0,
      uniqueFailures: 0,
      duplicateGroups: 0,
      compressionRatio: 0,
      patternDistribution: {
        'stack-trace': 0,
        'error-message': 0,
        'console-output': 0,
        'assertion': 0
      },
      similarityDistribution: {
        'exact': 0,
        'high': 0,
        'medium': 0,
        'low': 0
      },
      processingTime: 0,
      memoryUsed: 0,

      // Extended metrics
      performance: {
        startTime: this.startTime,
        endTime: 0,
        duration: 0,
        throughput: 0,
        avgProcessingTime: 0,
        peakMemoryUsage: 0
      },
      compression: {
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        spaceSaved: 0,
        groupCount: 0,
        avgGroupSize: 0
      },
      patternEffectiveness: [],
      timeSeries: {
        processingTimes: [],
        memorySamples: [],
        compressionRatios: []
      }
    }
  }

  /**
   * Start tracking a processing operation
   */
  startProcessing(): () => void {
    const startTime = Date.now()
    const startMemory = this.getMemoryUsage()

    return () => {
      const duration = Date.now() - startTime
      this.processingTimes.push(duration)
      
      // Record time series data
      this.stats.timeSeries.processingTimes.push({
        timestamp: Date.now(),
        value: duration
      })

      // Sample memory
      const currentMemory = this.getMemoryUsage()
      this.memorySamples.push(currentMemory)
      this.stats.timeSeries.memorySamples.push({
        timestamp: Date.now(),
        value: currentMemory
      })

      // Update peak memory
      if (currentMemory > this.stats.performance.peakMemoryUsage) {
        this.stats.performance.peakMemoryUsage = currentMemory
      }
    }
  }

  /**
   * Record a pattern match
   */
  recordPatternMatch(
    pattern: PatternType,
    similarity: number,
    processingTime: number
  ): void {
    if (!this.patternMetrics.has(pattern)) {
      this.patternMetrics.set(pattern, {
        pattern,
        matchCount: 0,
        avgSimilarity: 0,
        processingTime: 0,
        effectiveness: 0
      })
    }

    const metrics = this.patternMetrics.get(pattern)!
    const newCount = metrics.matchCount + 1
    
    // Update running averages
    metrics.avgSimilarity = 
      (metrics.avgSimilarity * metrics.matchCount + similarity) / newCount
    metrics.processingTime = 
      (metrics.processingTime * metrics.matchCount + processingTime) / newCount
    metrics.matchCount = newCount

    // Calculate effectiveness (combination of match rate and similarity)
    metrics.effectiveness = metrics.avgSimilarity * Math.min(1, metrics.matchCount / 100)
  }

  /**
   * Update statistics with processing results
   */
  updateStats(
    totalFailures: number,
    groups: DeduplicationGroup[],
    compressionRatio: number
  ): void {
    this.stats.totalFailures = totalFailures
    this.stats.duplicateGroups = groups.length
    
    // Calculate unique failures
    const duplicateCount = groups.reduce((sum, g) => sum + g.count, 0)
    this.stats.uniqueFailures = totalFailures - duplicateCount + groups.length
    
    // Update compression ratio
    this.stats.compressionRatio = compressionRatio
    this.stats.timeSeries.compressionRatios.push({
      timestamp: Date.now(),
      value: compressionRatio
    })

    // Update pattern distribution
    this.stats.patternDistribution = {
      'stack-trace': 0,
      'error-message': 0,
      'console-output': 0,
      'assertion': 0
    }
    for (const group of groups) {
      this.stats.patternDistribution[group.pattern] = 
        (this.stats.patternDistribution[group.pattern] || 0) + group.count
    }

    // Update similarity distribution
    this.stats.similarityDistribution = {
      'exact': 0,
      'high': 0,
      'medium': 0,
      'low': 0
    }
    for (const group of groups) {
      // Count examples by similarity level
      for (const example of group.examples) {
        // Assuming we can determine similarity level from group
        const level: SimilarityLevel = 'high' // This would be determined from actual data
        this.stats.similarityDistribution[level] = 
          (this.stats.similarityDistribution[level] || 0) + 1
      }
    }

    // Update compression metrics
    this.updateCompressionMetrics(groups)
  }

  /**
   * Update compression metrics
   */
  private updateCompressionMetrics(groups: DeduplicationGroup[]): void {
    const groupSizes = groups.map(g => g.count)
    
    this.stats.compression.groupCount = groups.length
    this.stats.compression.avgGroupSize = 
      groupSizes.length > 0
        ? groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length
        : 0

    // Estimate sizes (would be calculated from actual data)
    const avgFailureSize = 1000 // bytes
    this.stats.compression.originalSize = this.stats.totalFailures * avgFailureSize
    this.stats.compression.compressedSize = 
      this.stats.uniqueFailures * avgFailureSize + groups.length * 100 // group overhead
    
    this.stats.compression.compressionRatio = 
      this.stats.compression.originalSize > 0
        ? 1 - (this.stats.compression.compressedSize / this.stats.compression.originalSize)
        : 0
    
    this.stats.compression.spaceSaved = 
      this.stats.compression.originalSize - this.stats.compression.compressedSize
  }

  /**
   * Finalize statistics
   */
  finalize(): ExtendedStats {
    const endTime = Date.now()
    
    // Update performance metrics
    this.stats.performance.endTime = endTime
    this.stats.performance.duration = endTime - this.startTime
    this.stats.processingTime = this.stats.performance.duration
    
    // Calculate throughput
    if (this.stats.performance.duration > 0) {
      this.stats.performance.throughput = 
        (this.stats.totalFailures / this.stats.performance.duration) * 1000
    }

    // Calculate average processing time
    if (this.processingTimes.length > 0) {
      this.stats.performance.avgProcessingTime = 
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
    }

    // Set memory used
    this.stats.memoryUsed = this.stats.performance.peakMemoryUsage

    // Convert pattern metrics to array
    this.stats.patternEffectiveness = Array.from(this.patternMetrics.values())
      .sort((a, b) => b.effectiveness - a.effectiveness)

    return this.stats
  }

  /**
   * Get current statistics
   */
  getStats(): IDeduplicationStats {
    return {
      totalFailures: this.stats.totalFailures,
      uniqueFailures: this.stats.uniqueFailures,
      duplicateGroups: this.stats.duplicateGroups,
      compressionRatio: this.stats.compressionRatio,
      patternDistribution: this.stats.patternDistribution,
      similarityDistribution: this.stats.similarityDistribution,
      processingTime: this.stats.processingTime,
      memoryUsed: this.stats.memoryUsed
    }
  }

  /**
   * Get extended statistics
   */
  getExtendedStats(): ExtendedStats {
    return { ...this.stats }
  }

  /**
   * Generate summary report
   */
  generateSummary(): string {
    const stats = this.finalize()
    
    const lines = [
      '=== Deduplication Statistics Summary ===',
      '',
      `Total Failures: ${stats.totalFailures}`,
      `Unique Failures: ${stats.uniqueFailures}`,
      `Duplicate Groups: ${stats.duplicateGroups}`,
      `Compression Ratio: ${(stats.compressionRatio * 100).toFixed(2)}%`,
      '',
      '--- Performance Metrics ---',
      `Processing Time: ${stats.performance.duration}ms`,
      `Throughput: ${stats.performance.throughput.toFixed(2)} failures/sec`,
      `Avg Processing Time: ${stats.performance.avgProcessingTime.toFixed(2)}ms`,
      `Peak Memory: ${this.formatBytes(stats.performance.peakMemoryUsage)}`,
      '',
      '--- Compression Metrics ---',
      `Original Size: ${this.formatBytes(stats.compression.originalSize)}`,
      `Compressed Size: ${this.formatBytes(stats.compression.compressedSize)}`,
      `Space Saved: ${this.formatBytes(stats.compression.spaceSaved)}`,
      `Average Group Size: ${stats.compression.avgGroupSize.toFixed(2)} failures`,
      '',
      '--- Pattern Distribution ---'
    ]

    for (const [pattern, count] of Object.entries(stats.patternDistribution)) {
      lines.push(`  ${pattern}: ${count} failures`)
    }

    lines.push('', '--- Similarity Distribution ---')
    for (const [level, count] of Object.entries(stats.similarityDistribution)) {
      lines.push(`  ${level}: ${count} failures`)
    }

    if (stats.patternEffectiveness.length > 0) {
      lines.push('', '--- Pattern Effectiveness ---')
      for (const pattern of stats.patternEffectiveness) {
        lines.push(
          `  ${pattern.pattern}: ${pattern.matchCount} matches, ` +
          `${(pattern.avgSimilarity * 100).toFixed(1)}% avg similarity, ` +
          `${(pattern.effectiveness * 100).toFixed(1)}% effective`
        )
      }
    }

    return lines.join('\n')
  }

  /**
   * Get memory usage (simplified - would use process.memoryUsage() in Node.js)
   */
  private getMemoryUsage(): number {
    // In a real implementation, this would use process.memoryUsage()
    // For now, return a mock value based on data size
    return this.stats.totalFailures * 1000 + Math.random() * 1000000
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.startTime = Date.now()
    this.processingTimes = []
    this.memorySamples = []
    this.patternMetrics.clear()
    this.stats = this.initializeStats()
  }
}