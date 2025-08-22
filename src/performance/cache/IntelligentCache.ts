/**
 * Intelligent Cache - Multi-Tier Caching System
 *
 * Advanced caching implementation with multiple tiers, intelligent eviction,
 * and adaptive sizing based on usage patterns and performance metrics.
 *
 * @module IntelligentCache
 */

import type { ICache, CacheInstanceMetrics, CacheEvictionStrategy, CacheConfig } from '../types'
import { coreLogger, errorLogger } from '../../utils/logger'

/**
 * Cache entry with metadata
 */
interface CacheEntryMetadata {
  readonly key: string
  readonly value: unknown
  readonly timestamp: number
  readonly lastAccessed: number
  readonly accessCount: number
  readonly size: number
  readonly ttl?: number
  readonly tier: CacheTier
}

/**
 * Cache tiers for multi-tier caching
 */
type CacheTier = 'hot' | 'warm' | 'cold'

/**
 * Cache tier configuration
 */
interface CacheTierConfig {
  readonly maxSize: number
  readonly maxEntrySize: number
  readonly defaultTtl: number
  readonly evictionStrategy: CacheEvictionStrategy
}

/**
 * Access pattern tracking
 */
interface AccessPattern {
  readonly frequency: number
  readonly recency: number
  readonly size: number
  readonly score: number
}

/**
 * Intelligent multi-tier cache implementation
 */
export class IntelligentCache implements ICache {
  private readonly config: Required<CacheConfig>
  private readonly tiers: Map<CacheTier, Map<string, CacheEntryMetadata>>
  private readonly tierConfigs: Map<CacheTier, CacheTierConfig>
  private readonly accessPatterns: Map<string, AccessPattern>
  private readonly metrics: {
    hits: number
    misses: number
    evictions: number
    promotions: number
    demotions: number
    totalOperations: number
    totalLookupTime: number
  }
  private readonly debug = coreLogger()
  private readonly debugError = errorLogger()

  constructor(config: CacheConfig) {
    this.config = this.resolveConfig(config)
    this.tiers = new Map([
      ['hot', new Map<string, CacheEntryMetadata>()],
      ['warm', new Map<string, CacheEntryMetadata>()],
      ['cold', new Map<string, CacheEntryMetadata>()]
    ]) as Map<CacheTier, Map<string, CacheEntryMetadata>>

    this.tierConfigs = new Map([
      [
        'hot',
        {
          maxSize: Math.floor(this.config.tokenCacheSize * 0.2), // 20% for hot
          maxEntrySize: 1024 * 1024, // 1MB max entry size
          defaultTtl: this.config.ttl / 2, // Shorter TTL for hot tier
          evictionStrategy: 'lru'
        }
      ],
      [
        'warm',
        {
          maxSize: Math.floor(this.config.tokenCacheSize * 0.5), // 50% for warm
          maxEntrySize: 512 * 1024, // 512KB max entry size
          defaultTtl: this.config.ttl,
          evictionStrategy: this.config.evictionStrategy
        }
      ],
      [
        'cold',
        {
          maxSize: Math.floor(this.config.tokenCacheSize * 0.3), // 30% for cold
          maxEntrySize: 256 * 1024, // 256KB max entry size
          defaultTtl: this.config.ttl * 2, // Longer TTL for cold tier
          evictionStrategy: 'ttl'
        }
      ]
    ])

    this.accessPatterns = new Map()
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      promotions: 0,
      demotions: 0,
      totalOperations: 0,
      totalLookupTime: 0
    }

    // Start periodic maintenance
    this.startMaintenance()
  }

  /**
   * Resolve cache configuration with defaults
   */
  private resolveConfig(config: CacheConfig): Required<CacheConfig> {
    return {
      enabled: config.enabled ?? true,
      tokenCacheSize: config.tokenCacheSize ?? 10000,
      resultCacheSize: config.resultCacheSize ?? 5000,
      templateCacheSize: config.templateCacheSize ?? 1000,
      ttl: config.ttl ?? 3600000,
      targetHitRatio: config.targetHitRatio ?? 80,
      enableWarming: config.enableWarming ?? true,
      evictionStrategy: config.evictionStrategy ?? 'lru',
      enableMultiTier: config.enableMultiTier ?? true
    }
  }

  /**
   * Get value by key with intelligent tier management
   */
  get(key: string): unknown {
    const startTime = Date.now()
    this.metrics.totalOperations++

    try {
      // Search through tiers (hot -> warm -> cold)
      for (const [tierName, tier] of this.tiers) {
        const entry = tier.get(key)
        if (entry && !this.isExpired(entry)) {
          // Update access metadata
          const updatedEntry = this.updateAccessMetadata(entry)
          tier.set(key, updatedEntry)

          // Update access patterns
          this.updateAccessPattern(key, updatedEntry)

          // Consider promotion to higher tier
          if (tierName !== 'hot') {
            this.considerPromotion(key, updatedEntry)
          }

          this.metrics.hits++
          this.metrics.totalLookupTime += Date.now() - startTime

          this.debug('Cache hit for key %s in %s tier', key, tierName)
          return entry.value
        } else if (entry) {
          // Entry is expired, remove it
          tier.delete(key)
          this.accessPatterns.delete(key)
        }
      }

      // Cache miss
      this.metrics.misses++
      this.metrics.totalLookupTime += Date.now() - startTime

      this.debug('Cache miss for key %s', key)
      return undefined
    } catch (error) {
      this.debugError('Error during cache get: %O', error)
      return undefined
    }
  }

  /**
   * Set key-value pair with intelligent tier placement
   */
  set(key: string, value: unknown, ttl?: number): void {
    try {
      const now = Date.now()
      const entrySize = this.estimateSize(value)
      const effectiveTtl = ttl ?? this.config.ttl

      // Determine initial tier based on size and patterns
      const targetTier = this.determineInitialTier(key, entrySize)
      const tierConfig = this.tierConfigs.get(targetTier)!

      // Check if entry is too large for any tier
      if (entrySize > tierConfig.maxEntrySize) {
        this.debug('Entry too large for cache: %s (%d bytes)', key, entrySize)
        return
      }

      // Remove existing entry from any tier
      this.delete(key)

      // Create new entry
      const entry: CacheEntryMetadata = {
        key,
        value,
        timestamp: now,
        lastAccessed: now,
        accessCount: 1,
        size: entrySize,
        ttl: effectiveTtl,
        tier: targetTier
      }

      // Ensure capacity in target tier
      this.ensureCapacity(targetTier, entrySize)

      // Add to target tier
      const tier = this.tiers.get(targetTier)!
      tier.set(key, entry)

      // Update access patterns
      this.updateAccessPattern(key, entry)

      this.debug('Cached entry %s in %s tier (%d bytes)', key, targetTier, entrySize)
    } catch (error) {
      this.debugError('Error during cache set: %O', error)
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    for (const tier of this.tiers.values()) {
      const entry = tier.get(key)
      if (entry && !this.isExpired(entry)) {
        return true
      } else if (entry) {
        // Remove expired entry
        tier.delete(key)
        this.accessPatterns.delete(key)
      }
    }
    return false
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    let deleted = false
    for (const tier of this.tiers.values()) {
      if (tier.delete(key)) {
        deleted = true
      }
    }
    this.accessPatterns.delete(key)
    return deleted
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    for (const tier of this.tiers.values()) {
      tier.clear()
    }
    this.accessPatterns.clear()

    // Reset metrics
    this.metrics.hits = 0
    this.metrics.misses = 0
    this.metrics.evictions = 0
    this.metrics.promotions = 0
    this.metrics.demotions = 0
    this.metrics.totalOperations = 0
    this.metrics.totalLookupTime = 0

    this.debug('Cache cleared')
  }

  /**
   * Get total cache size
   */
  size(): number {
    return Array.from(this.tiers.values()).reduce((total, tier) => total + tier.size, 0)
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheInstanceMetrics {
    const totalOperations = this.metrics.hits + this.metrics.misses
    const hitRatio = totalOperations > 0 ? (this.metrics.hits / totalOperations) * 100 : 0
    const averageLookupTime =
      this.metrics.totalOperations > 0
        ? this.metrics.totalLookupTime / this.metrics.totalOperations
        : 0

    return {
      hitRatio,
      size: this.size(),
      capacity: this.config.tokenCacheSize,
      evictions: this.metrics.evictions,
      averageLookupTime
    }
  }

  /**
   * Get detailed tier metrics
   */
  getTierMetrics(): Record<CacheTier, { size: number; capacity: number; utilization: number }> {
    const result: Record<CacheTier, { size: number; capacity: number; utilization: number }> = {
      hot: { size: 0, capacity: 0, utilization: 0 },
      warm: { size: 0, capacity: 0, utilization: 0 },
      cold: { size: 0, capacity: 0, utilization: 0 }
    }

    for (const [tierName, tier] of this.tiers) {
      const tierConfig = this.tierConfigs.get(tierName)!
      result[tierName] = {
        size: tier.size,
        capacity: tierConfig.maxSize,
        utilization: (tier.size / tierConfig.maxSize) * 100
      }
    }

    return result
  }

  /**
   * Force optimization of cache tiers
   */
  optimize(): void {
    this.debug('Starting cache optimization')

    // Clean up expired entries
    this.cleanupExpiredEntries()

    // Rebalance tiers based on access patterns
    this.rebalanceTiers()

    // Adjust tier sizes if needed
    this.adjustTierSizes()

    this.debug('Cache optimization completed')
  }

  /**
   * Update access metadata for an entry
   */
  private updateAccessMetadata(entry: CacheEntryMetadata): CacheEntryMetadata {
    return {
      ...entry,
      lastAccessed: Date.now(),
      accessCount: entry.accessCount + 1
    }
  }

  /**
   * Update access pattern for a key
   */
  private updateAccessPattern(key: string, entry: CacheEntryMetadata): void {
    const now = Date.now()
    const existing = this.accessPatterns.get(key)

    const frequency = existing
      ? existing.frequency * 0.9 + entry.accessCount * 0.1
      : entry.accessCount

    const recency = (now - entry.lastAccessed) / 1000 // seconds
    const size = entry.size

    // Calculate access score (higher is better)
    const score = frequency * 10 + Math.max(0, 100 - recency) + 1 / Math.log(size + 1)

    this.accessPatterns.set(key, {
      frequency,
      recency,
      size,
      score
    })
  }

  /**
   * Determine initial tier for new entry
   */
  private determineInitialTier(key: string, size: number): CacheTier {
    // Check if we have historical access patterns
    const pattern = this.accessPatterns.get(key)

    if (pattern && pattern.score > 50) {
      return 'hot'
    } else if (pattern && pattern.score > 20) {
      return 'warm'
    } else if (size < 1024) {
      // Small entries go to warm tier initially
      return 'warm'
    } else {
      return 'cold'
    }
  }

  /**
   * Consider promoting an entry to a higher tier
   */
  private considerPromotion(key: string, entry: CacheEntryMetadata): void {
    const pattern = this.accessPatterns.get(key)
    if (!pattern) return

    const currentTier = entry.tier
    let targetTier: CacheTier | null = null

    if (currentTier === 'cold' && pattern.score > 30) {
      targetTier = 'warm'
    } else if (currentTier === 'warm' && pattern.score > 60) {
      targetTier = 'hot'
    }

    if (targetTier && this.canFitInTier(targetTier, entry.size)) {
      this.promoteTo(key, entry, targetTier)
    }
  }

  /**
   * Promote entry to higher tier
   */
  private promoteTo(key: string, entry: CacheEntryMetadata, targetTier: CacheTier): void {
    const currentTier = entry.tier

    // Remove from current tier
    this.tiers.get(currentTier)?.delete(key)

    // Ensure capacity in target tier
    this.ensureCapacity(targetTier, entry.size)

    // Add to target tier
    const promotedEntry = { ...entry, tier: targetTier }
    this.tiers.get(targetTier)?.set(key, promotedEntry)

    this.metrics.promotions++
    this.debug('Promoted %s from %s to %s tier', key, currentTier, targetTier)
  }

  /**
   * Check if entry can fit in tier
   */
  private canFitInTier(tier: CacheTier, size: number): boolean {
    const tierConfig = this.tierConfigs.get(tier)!
    const currentTier = this.tiers.get(tier)!

    return currentTier.size < tierConfig.maxSize && size <= tierConfig.maxEntrySize
  }

  /**
   * Ensure capacity in tier by evicting if necessary
   */
  private ensureCapacity(tier: CacheTier, _requiredSize: number): void {
    const tierConfig = this.tierConfigs.get(tier)!
    const currentTier = this.tiers.get(tier)!

    if (currentTier.size >= tierConfig.maxSize) {
      this.evictFromTier(tier, 1) // Evict at least one entry
    }
  }

  /**
   * Evict entries from tier based on strategy
   */
  private evictFromTier(tier: CacheTier, count: number): void {
    const tierConfig = this.tierConfigs.get(tier)!
    const currentTier = this.tiers.get(tier)!
    const entries = Array.from(currentTier.values())

    if (entries.length === 0) return

    let toEvict: CacheEntryMetadata[]

    switch (tierConfig.evictionStrategy) {
      case 'lru':
        toEvict = entries.sort((a, b) => a.lastAccessed - b.lastAccessed).slice(0, count)
        break

      case 'lfu':
        toEvict = entries.sort((a, b) => a.accessCount - b.accessCount).slice(0, count)
        break

      case 'ttl':
        toEvict = entries.filter((e) => this.isExpired(e)).slice(0, count)

        // If not enough expired entries, fall back to LRU
        if (toEvict.length < count) {
          const remaining = entries
            .filter((e) => !this.isExpired(e))
            .sort((a, b) => a.lastAccessed - b.lastAccessed)
            .slice(0, count - toEvict.length)
          toEvict = [...toEvict, ...remaining]
        }
        break

      case 'adaptive':
      default:
        // Use access score for adaptive eviction
        toEvict = entries
          .map((e) => ({
            entry: e,
            pattern: this.accessPatterns.get(e.key)
          }))
          .sort((a, b) => (a.pattern?.score ?? 0) - (b.pattern?.score ?? 0))
          .slice(0, count)
          .map((item) => item.entry)
        break
    }

    // Evict selected entries
    for (const entry of toEvict) {
      currentTier.delete(entry.key)
      this.accessPatterns.delete(entry.key)
      this.metrics.evictions++
      this.debug('Evicted %s from %s tier', entry.key, tier)
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntryMetadata): boolean {
    if (!entry.ttl) return false
    return Date.now() - entry.timestamp > entry.ttl
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2 // Rough estimate (UTF-16)
    } catch {
      return 1024 // Default size for non-serializable values
    }
  }

  /**
   * Clean up expired entries from all tiers
   */
  private cleanupExpiredEntries(): void {
    const _now = Date.now()
    let cleanedCount = 0

    for (const [_tierName, tier] of this.tiers) {
      for (const [key, entry] of tier) {
        if (this.isExpired(entry)) {
          tier.delete(key)
          this.accessPatterns.delete(key)
          cleanedCount++
        }
      }
    }

    if (cleanedCount > 0) {
      this.debug('Cleaned up %d expired entries', cleanedCount)
    }
  }

  /**
   * Rebalance entries across tiers based on access patterns
   */
  private rebalanceTiers(): void {
    const allEntries: Array<{ key: string; entry: CacheEntryMetadata; pattern?: AccessPattern }> =
      []

    // Collect all entries with their patterns
    for (const tier of this.tiers.values()) {
      for (const [key, entry] of tier) {
        allEntries.push({
          key,
          entry,
          pattern: this.accessPatterns.get(key)
        })
      }
    }

    // Clear all tiers
    for (const tier of this.tiers.values()) {
      tier.clear()
    }

    // Redistribute based on scores
    allEntries
      .sort((a, b) => (b.pattern?.score ?? 0) - (a.pattern?.score ?? 0))
      .forEach(({ key, entry, pattern }) => {
        const score = pattern?.score ?? 0
        let targetTier: CacheTier

        if (score > 50) {
          targetTier = 'hot'
        } else if (score > 20) {
          targetTier = 'warm'
        } else {
          targetTier = 'cold'
        }

        // Check if we can fit in the target tier
        if (this.canFitInTier(targetTier, entry.size)) {
          const updatedEntry = { ...entry, tier: targetTier }
          this.tiers.get(targetTier)?.set(key, updatedEntry)
        } else {
          // Find the first tier that can accommodate this entry
          for (const tier of ['hot', 'warm', 'cold'] as CacheTier[]) {
            if (this.canFitInTier(tier, entry.size)) {
              const updatedEntry = { ...entry, tier }
              this.tiers.get(tier)?.set(key, updatedEntry)
              break
            }
          }
        }
      })
  }

  /**
   * Adjust tier sizes based on usage patterns
   */
  private adjustTierSizes(): void {
    // This is a placeholder for dynamic tier sizing
    // In a real implementation, this would analyze usage patterns
    // and adjust tier configurations accordingly
    this.debug('Tier size adjustment completed')
  }

  /**
   * Start periodic maintenance
   */
  private startMaintenance(): void {
    const maintenanceInterval = 60000 // 1 minute

    const runMaintenance = (): void => {
      try {
        this.cleanupExpiredEntries()

        // Run optimization every 5 minutes
        if (Date.now() % (5 * 60000) < maintenanceInterval) {
          this.optimize()
        }
      } catch (error) {
        this.debugError('Maintenance error: %O', error)
      }

      setTimeout(runMaintenance, maintenanceInterval)
    }

    setTimeout(runMaintenance, maintenanceInterval)
  }
}
