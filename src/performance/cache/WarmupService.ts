/**
 * Warmup Service - Predictive Cache Warming
 *
 * Intelligent cache warming service that preloads frequently accessed
 * data based on historical patterns and predictive algorithms.
 *
 * @module WarmupService
 */

import type { ICache, CacheConfig } from '../types'
import { coreLogger, errorLogger } from '../../utils/logger'

/**
 * Cache warmup pattern
 */
interface WarmupPattern {
  readonly key: string
  readonly frequency: number
  readonly lastAccessed: number
  readonly averageSize: number
  readonly priority: number
}

/**
 * Warmup strategy configuration
 */
interface WarmupStrategy {
  readonly name: string
  readonly enabled: boolean
  readonly maxEntries: number
  readonly priorityThreshold: number
  readonly timeWindow: number // milliseconds
}

/**
 * Warmup operation result
 */
interface WarmupResult {
  readonly cacheName: string
  readonly entriesWarmed: number
  readonly duration: number
  readonly success: boolean
  readonly errors: string[]
}

/**
 * Predictive cache warmup service
 */
export class WarmupService {
  private readonly config: Required<CacheConfig>
  private readonly accessPatterns: Map<string, Map<string, WarmupPattern>>
  private readonly strategies: Map<string, WarmupStrategy>
  private readonly debug = coreLogger()
  private readonly debugError = errorLogger()

  constructor(config: Required<CacheConfig>) {
    this.config = config
    this.accessPatterns = new Map()
    this.strategies = new Map()

    this.initializeStrategies()
  }

  /**
   * Initialize warmup strategies
   */
  private initializeStrategies(): void {
    // Frequency-based warmup
    this.strategies.set('frequency', {
      name: 'frequency',
      enabled: true,
      maxEntries: 100,
      priorityThreshold: 5,
      timeWindow: 7 * 24 * 60 * 60 * 1000 // 7 days
    })

    // Recency-based warmup
    this.strategies.set('recency', {
      name: 'recency',
      enabled: true,
      maxEntries: 50,
      priorityThreshold: 3,
      timeWindow: 24 * 60 * 60 * 1000 // 1 day
    })

    // Size-optimized warmup (prefer smaller entries)
    this.strategies.set('size-optimized', {
      name: 'size-optimized',
      enabled: true,
      maxEntries: 200,
      priorityThreshold: 2,
      timeWindow: 3 * 24 * 60 * 60 * 1000 // 3 days
    })

    // Predictive warmup (based on time patterns)
    this.strategies.set('predictive', {
      name: 'predictive',
      enabled: true,
      maxEntries: 75,
      priorityThreshold: 4,
      timeWindow: 14 * 24 * 60 * 60 * 1000 // 14 days
    })
  }

  /**
   * Warm up a specific cache
   */
  async warmupCache(cacheName: string, cache: ICache): Promise<WarmupResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let entriesWarmed = 0

    // Check if warming is disabled
    if (!this.config.enableWarming) {
      this.debug('Warming disabled, skipping warmup for cache: %s', cacheName)
      return {
        cacheName,
        entriesWarmed: 0,
        duration: Date.now() - startTime,
        success: true,
        errors: []
      }
    }

    // Validate cache parameter
    if (!cache || typeof cache !== 'object') {
      const errorMsg = `Invalid cache provided for ${cacheName}`
      this.debugError(errorMsg)
      return {
        cacheName,
        entriesWarmed: 0,
        duration: Date.now() - startTime,
        success: false,
        errors: [errorMsg]
      }
    }

    // Validate cache has required methods
    if (!cache.set || typeof cache.set !== 'function') {
      const errorMsg = `Cache ${cacheName} missing required method: set`
      this.debugError(errorMsg)
      return {
        cacheName,
        entriesWarmed: 0,
        duration: Date.now() - startTime,
        success: false,
        errors: [errorMsg]
      }
    }

    try {
      this.debug('Starting warmup for cache: %s', cacheName)

      // Get patterns for this cache
      const patterns = this.accessPatterns.get(cacheName) || new Map()

      if (patterns.size === 0) {
        this.debug('No access patterns found for cache: %s', cacheName)
        return {
          cacheName,
          entriesWarmed: 0,
          duration: Date.now() - startTime,
          success: true,
          errors: []
        }
      }

      // Generate warmup candidates using all enabled strategies
      const candidates = this.generateWarmupCandidates(patterns as Map<string, WarmupPattern>)

      // Sort candidates by priority
      candidates.sort((a, b) => b.priority - a.priority)

      // Warm up top candidates
      const maxWarmupEntries = Math.min(candidates.length, 500) // Limit to prevent overwhelming

      for (let i = 0; i < maxWarmupEntries; i++) {
        const candidate = candidates[i]

        try {
          // Generate mock data for warmup (in real implementation, this would
          // come from a data source or be based on historical data)
          const mockData = this.generateMockDataForKey(candidate.key)

          if (mockData !== null) {
            cache.set(candidate.key, mockData)
            entriesWarmed++
          }
        } catch (error) {
          const errorMsg = `Failed to warm key ${candidate.key}: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMsg)
          this.debugError(errorMsg)
        }

        // Add small delay to prevent overwhelming the system
        if (i % 50 === 0 && i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }

      const duration = Date.now() - startTime
      this.debug(
        'Warmup completed for cache %s: %d entries in %dms',
        cacheName,
        entriesWarmed,
        duration
      )

      return {
        cacheName,
        entriesWarmed,
        duration,
        success: errors.length === 0,
        errors
      }
    } catch (error) {
      const errorMsg = `Cache warmup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMsg)
      this.debugError('Warmup failed for cache %s: %O', cacheName, error)

      return {
        cacheName,
        entriesWarmed,
        duration: Date.now() - startTime,
        success: false,
        errors
      }
    }
  }

  /**
   * Record access pattern for future warmup
   */
  recordAccess(cacheName: string, key: string, dataSize: number): void {
    if (!this.config.enableWarming) {
      return
    }

    try {
      let cachePatterns = this.accessPatterns.get(cacheName)
      if (!cachePatterns) {
        cachePatterns = new Map()
        this.accessPatterns.set(cacheName, cachePatterns)
      }

      const existing = cachePatterns.get(key)
      const now = Date.now()

      if (existing) {
        // Update existing pattern
        const pattern: WarmupPattern = {
          ...existing,
          frequency: existing.frequency + 1,
          lastAccessed: now,
          averageSize: (existing.averageSize + dataSize) / 2,
          priority: this.calculatePriority(existing.frequency + 1, now, dataSize)
        }
        cachePatterns.set(key, pattern)
      } else {
        // Create new pattern
        const pattern: WarmupPattern = {
          key,
          frequency: 1,
          lastAccessed: now,
          averageSize: dataSize,
          priority: this.calculatePriority(1, now, dataSize)
        }
        cachePatterns.set(key, pattern)
      }

      // Limit pattern storage to prevent memory leaks
      if (cachePatterns.size > 10000) {
        this.cleanupOldPatterns(cachePatterns)
      }
    } catch (error) {
      this.debugError('Failed to record access pattern: %O', error)
    }
  }

  /**
   * Generate warmup candidates using all strategies
   */
  private generateWarmupCandidates(patterns: Map<string, WarmupPattern>): WarmupPattern[] {
    const candidates: WarmupPattern[] = []
    const now = Date.now()

    for (const strategy of this.strategies.values()) {
      if (!strategy.enabled) {
        continue
      }

      const strategyCandidates = this.applyCandidateStrategy(strategy, patterns, now)
      candidates.push(...strategyCandidates)
    }

    // Deduplicate candidates (keep highest priority for each key)
    const candidateMap = new Map<string, WarmupPattern>()

    for (const candidate of candidates) {
      const existing = candidateMap.get(candidate.key)
      if (!existing || candidate.priority > existing.priority) {
        candidateMap.set(candidate.key, candidate)
      }
    }

    return Array.from(candidateMap.values())
  }

  /**
   * Apply a specific candidate strategy
   */
  private applyCandidateStrategy(
    strategy: WarmupStrategy,
    patterns: Map<string, WarmupPattern>,
    now: number
  ): WarmupPattern[] {
    const candidates: WarmupPattern[] = []

    for (const pattern of patterns.values()) {
      // Check if pattern is within time window
      if (now - pattern.lastAccessed > strategy.timeWindow) {
        continue
      }

      // Check priority threshold
      if (pattern.priority < strategy.priorityThreshold) {
        continue
      }

      // Apply strategy-specific logic
      let include = false
      let adjustedPriority = pattern.priority

      switch (strategy.name) {
        case 'frequency':
          include = pattern.frequency >= 5
          adjustedPriority = pattern.frequency * 2
          break

        case 'recency': {
          const recencyScore = Math.max(0, 24 - (now - pattern.lastAccessed) / (60 * 60 * 1000))
          include = recencyScore >= 12 // Last 12 hours
          adjustedPriority = recencyScore
          break
        }

        case 'size-optimized':
          include = pattern.averageSize <= 10240 // Prefer entries <= 10KB
          adjustedPriority = Math.max(1, 10 - Math.log10(pattern.averageSize))
          break

        case 'predictive': {
          // Simple predictive logic based on access time patterns
          const hourOfDay = new Date(pattern.lastAccessed).getHours()
          const currentHour = new Date().getHours()
          const hourDiff = Math.abs(currentHour - hourOfDay)

          include = hourDiff <= 2 // Similar time of day
          adjustedPriority = pattern.frequency + (4 - Math.min(4, hourDiff))
          break
        }

        default:
          include = true
          break
      }

      if (include) {
        candidates.push({
          ...pattern,
          priority: adjustedPriority
        })
      }
    }

    // Limit candidates per strategy
    return candidates.sort((a, b) => b.priority - a.priority).slice(0, strategy.maxEntries)
  }

  /**
   * Calculate priority score for a pattern
   */
  private calculatePriority(frequency: number, lastAccessed: number, size: number): number {
    const now = Date.now()
    const hoursSinceAccess = (now - lastAccessed) / (60 * 60 * 1000)

    // Higher frequency = higher priority
    const frequencyScore = Math.log(frequency + 1) * 2

    // More recent access = higher priority
    const recencyScore = Math.max(0, 10 - hoursSinceAccess)

    // Smaller size = higher priority (faster to load)
    const sizeScore = Math.max(1, 5 - Math.log10(size + 1))

    return frequencyScore + recencyScore + sizeScore
  }

  /**
   * Clean up old patterns to prevent memory leaks
   */
  private cleanupOldPatterns(patterns: Map<string, WarmupPattern>): void {
    const now = Date.now()
    const maxAge = 30 * 24 * 60 * 60 * 1000 // 30 days

    const keysToDelete: string[] = []

    for (const [key, pattern] of patterns) {
      if (now - pattern.lastAccessed > maxAge) {
        keysToDelete.push(key)
      }
    }

    // Remove oldest patterns first
    const sortedKeys = keysToDelete
      .map((key) => ({ key, pattern: patterns.get(key)! }))
      .sort((a, b) => a.pattern.lastAccessed - b.pattern.lastAccessed)
      .slice(0, Math.max(1000, patterns.size - 8000)) // Keep size under 8000

    for (const { key } of sortedKeys) {
      patterns.delete(key)
    }

    if (sortedKeys.length > 0) {
      this.debug('Cleaned up %d old patterns', sortedKeys.length)
    }
  }

  /**
   * Generate mock data for cache key (placeholder implementation)
   */
  private generateMockDataForKey(key: string): unknown {
    // In a real implementation, this would:
    // 1. Determine the type of data expected for this key
    // 2. Generate or fetch appropriate mock/default data
    // 3. Return null if data cannot be generated

    // For now, we'll return simple mock data based on key patterns
    if (key.includes('token')) {
      return {
        tokenCount: Math.floor(Math.random() * 1000) + 100,
        model: 'gpt-4',
        fromCache: false
      }
    } else if (key.includes('result')) {
      return {
        test: {
          name: 'mock test',
          file: '/path/to/test.js'
        },
        result: {
          state: 'passed'
        }
      }
    } else if (key.includes('template')) {
      return {
        template: 'mock template',
        variables: ['var1', 'var2']
      }
    }

    // Default mock data
    return {
      key,
      timestamp: Date.now(),
      mockData: true
    }
  }

  /**
   * Get warmup statistics
   */
  getStatistics(): Record<
    string,
    {
      patternCount: number
      totalAccesses: number
      averagePriority: number
      oldestPattern: number
      newestPattern: number
    }
  > {
    const stats: Record<
      string,
      {
        patternCount: number
        totalAccesses: number
        averagePriority: number
        oldestPattern: number
        newestPattern: number
      }
    > = {}

    for (const [cacheName, patterns] of this.accessPatterns) {
      let totalAccesses = 0
      let totalPriority = 0
      let oldestTimestamp = Date.now()
      let newestTimestamp = 0

      for (const pattern of patterns.values()) {
        totalAccesses += pattern.frequency
        totalPriority += pattern.priority
        oldestTimestamp = Math.min(oldestTimestamp, pattern.lastAccessed)
        newestTimestamp = Math.max(newestTimestamp, pattern.lastAccessed)
      }

      stats[cacheName] = {
        patternCount: patterns.size,
        totalAccesses,
        averagePriority: patterns.size > 0 ? totalPriority / patterns.size : 0,
        oldestPattern: oldestTimestamp,
        newestPattern: newestTimestamp
      }
    }

    return stats
  }

  /**
   * Clear all warmup patterns
   */
  clearPatterns(): void {
    this.accessPatterns.clear()
    this.debug('All warmup patterns cleared')
  }

  /**
   * Export patterns for persistence (placeholder)
   */
  exportPatterns(): string {
    const data = {
      timestamp: Date.now(),
      patterns: Object.fromEntries(
        Array.from(this.accessPatterns.entries()).map(([cacheName, patterns]) => [
          cacheName,
          Object.fromEntries(patterns)
        ])
      )
    }

    return JSON.stringify(data)
  }

  /**
   * Import patterns from persistence (placeholder)
   */
  importPatterns(data: string): boolean {
    try {
      const parsed = JSON.parse(data) as {
        patterns?: Record<string, Record<string, WarmupPattern>>
      }

      if (parsed.patterns) {
        this.accessPatterns.clear()

        for (const [cacheName, patterns] of Object.entries(parsed.patterns)) {
          const cachePatterns = new Map<string, WarmupPattern>()

          for (const [key, pattern] of Object.entries(patterns)) {
            cachePatterns.set(key, pattern)
          }

          this.accessPatterns.set(cacheName, cachePatterns)
        }

        this.debug('Imported warmup patterns from persistence')
        return true
      }

      return false
    } catch (error) {
      this.debugError('Failed to import warmup patterns: %O', error)
      return false
    }
  }
}
