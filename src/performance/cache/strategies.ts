/**
 * Cache Strategies - Eviction and Management Strategies
 *
 * Collection of cache eviction strategies and management algorithms
 * for optimizing cache performance under different conditions.
 *
 * @module CacheStrategies
 */

import type {
  CacheEvictionStrategy
} from '../types'

/**
 * Cache entry for strategy operations
 */
export interface StrategyCacheEntry {
  readonly key: string
  readonly value: unknown
  readonly timestamp: number
  readonly lastAccessed: number
  readonly accessCount: number
  readonly size: number
  readonly ttl?: number
}

/**
 * Eviction candidate with score
 */
export interface EvictionCandidate {
  readonly entry: StrategyCacheEntry
  readonly score: number
  readonly reason: string
}

/**
 * Strategy context for decision making
 */
export interface StrategyContext {
  readonly totalSize: number
  readonly maxSize: number
  readonly averageAccessTime: number
  readonly memoryPressure: 'low' | 'moderate' | 'high' | 'critical'
  readonly currentTime: number
}

/**
 * Base eviction strategy interface
 */
export interface IEvictionStrategy {
  readonly name: CacheEvictionStrategy
  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[]
}

/**
 * LRU (Least Recently Used) eviction strategy
 */
export class LRUEvictionStrategy implements IEvictionStrategy {
  readonly name: CacheEvictionStrategy = 'lru'

  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[] {
    return entries
      .map(entry => ({
        entry,
        score: context.currentTime - entry.lastAccessed,
        reason: 'Least recently used'
      }))
      .sort((a, b) => b.score - a.score) // Higher score = older = more likely to evict
      .slice(0, targetCount)
  }
}

/**
 * LFU (Least Frequently Used) eviction strategy
 */
export class LFUEvictionStrategy implements IEvictionStrategy {
  readonly name: CacheEvictionStrategy = 'lfu'

  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[] {
    return entries
      .map(entry => ({
        entry,
        score: 1 / (entry.accessCount + 1), // Lower frequency = higher score
        reason: 'Least frequently used'
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, targetCount)
  }
}

/**
 * TTL (Time To Live) eviction strategy
 */
export class TTLEvictionStrategy implements IEvictionStrategy {
  readonly name: CacheEvictionStrategy = 'ttl'

  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[] {
    const candidates: EvictionCandidate[] = []

    // First, find all expired entries
    const expiredEntries = entries
      .filter(entry => entry.ttl && (context.currentTime - entry.timestamp) > entry.ttl)
      .map(entry => ({
        entry,
        score: context.currentTime - entry.timestamp - (entry.ttl || 0),
        reason: 'Expired (TTL)'
      }))

    candidates.push(...expiredEntries)

    // If we need more candidates, select entries closest to expiration
    if (candidates.length < targetCount) {
      const nearExpirationEntries = entries
        .filter(entry => entry.ttl && !expiredEntries.some(e => e.entry.key === entry.key))
        .map(entry => {
          const timeToExpiration = (entry.ttl || 0) - (context.currentTime - entry.timestamp)
          return {
            entry,
            score: 1 / Math.max(1, timeToExpiration), // Closer to expiration = higher score
            reason: 'Near expiration'
          }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, targetCount - candidates.length)

      candidates.push(...nearExpirationEntries)
    }

    return candidates.slice(0, targetCount)
  }
}

/**
 * Adaptive eviction strategy that combines multiple factors
 */
export class AdaptiveEvictionStrategy implements IEvictionStrategy {
  readonly name: CacheEvictionStrategy = 'adaptive'

  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[] {
    return entries
      .map(entry => {
        const score = this.calculateAdaptiveScore(entry, context)
        const reason = this.generateReason(entry, context, score)
        
        return {
          entry,
          score,
          reason
        }
      })
      .sort((a, b) => b.score - a.score) // Higher score = more likely to evict
      .slice(0, targetCount)
  }

  /**
   * Calculate adaptive score combining multiple factors
   */
  private calculateAdaptiveScore(entry: StrategyCacheEntry, context: StrategyContext): number {
    const weights = this.getWeights(context)
    
    // Recency factor (0-1, higher = older)
    const recencyFactor = Math.min(1, (context.currentTime - entry.lastAccessed) / (24 * 60 * 60 * 1000))
    
    // Frequency factor (0-1, higher = less frequent)
    const maxAccess = Math.max(1, ...entries.map(e => e.accessCount))
    const frequencyFactor = 1 - (entry.accessCount / maxAccess)
    
    // Size factor (0-1, higher = larger)
    const maxSize = Math.max(1, ...entries.map(e => e.size))
    const sizeFactor = entry.size / maxSize
    
    // TTL factor (0-1, higher = more expired)
    let ttlFactor = 0
    if (entry.ttl) {
      const timeElapsed = context.currentTime - entry.timestamp
      ttlFactor = Math.min(1, timeElapsed / entry.ttl)
    }
    
    // Memory pressure factor (multiplier)
    const pressureFactor = this.getPressureFactor(context.memoryPressure)
    
    // Calculate weighted score
    const score = (
      recencyFactor * weights.recency +
      frequencyFactor * weights.frequency +
      sizeFactor * weights.size +
      ttlFactor * weights.ttl
    ) * pressureFactor
    
    return score
  }

  /**
   * Get weights based on context
   */
  private getWeights(context: StrategyContext): {
    recency: number
    frequency: number
    size: number
    ttl: number
  } {
    // Adjust weights based on memory pressure
    switch (context.memoryPressure) {
      case 'critical':
        return { recency: 0.2, frequency: 0.2, size: 0.5, ttl: 0.1 } // Prioritize size
      case 'high':
        return { recency: 0.3, frequency: 0.3, size: 0.3, ttl: 0.1 }
      case 'moderate':
        return { recency: 0.4, frequency: 0.4, size: 0.1, ttl: 0.1 }
      case 'low':
      default:
        return { recency: 0.5, frequency: 0.3, size: 0.1, ttl: 0.1 } // Balanced approach
    }
  }

  /**
   * Get pressure factor multiplier
   */
  private getPressureFactor(pressure: StrategyContext['memoryPressure']): number {
    switch (pressure) {
      case 'critical': return 2.0 // Aggressive eviction
      case 'high': return 1.5
      case 'moderate': return 1.2
      case 'low': 
      default: return 1.0
    }
  }

  /**
   * Generate human-readable reason for eviction
   */
  private generateReason(entry: StrategyCacheEntry, context: StrategyContext, score: number): string {
    const reasons: string[] = []
    
    const hoursSinceAccess = (context.currentTime - entry.lastAccessed) / (60 * 60 * 1000)
    if (hoursSinceAccess > 24) {
      reasons.push('old access')
    }
    
    if (entry.accessCount < 2) {
      reasons.push('low frequency')
    }
    
    if (entry.size > 100000) { // > 100KB
      reasons.push('large size')
    }
    
    if (entry.ttl && (context.currentTime - entry.timestamp) > entry.ttl * 0.8) {
      reasons.push('near expiration')
    }
    
    if (context.memoryPressure === 'critical' || context.memoryPressure === 'high') {
      reasons.push('memory pressure')
    }
    
    return reasons.length > 0 ? 
      `Adaptive: ${reasons.join(', ')} (score: ${score.toFixed(2)})` :
      `Adaptive eviction (score: ${score.toFixed(2)})`
  }
}

/**
 * Size-based eviction strategy
 */
export class SizeBasedEvictionStrategy implements IEvictionStrategy {
  readonly name: CacheEvictionStrategy = 'adaptive' // Use adaptive as base

  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[] {
    // Prioritize larger entries for eviction to free more space
    return entries
      .map(entry => ({
        entry,
        score: entry.size,
        reason: `Large entry (${entry.size} bytes)`
      }))
      .sort((a, b) => b.score - a.score) // Larger entries first
      .slice(0, targetCount)
  }
}

/**
 * Random eviction strategy (for comparison/testing)
 */
export class RandomEvictionStrategy implements IEvictionStrategy {
  readonly name: CacheEvictionStrategy = 'adaptive' // Use adaptive as base

  selectEvictionCandidates(
    entries: StrategyCacheEntry[],
    context: StrategyContext,
    targetCount: number
  ): EvictionCandidate[] {
    // Shuffle entries and take the first N
    const shuffled = [...entries].sort(() => Math.random() - 0.5)
    
    return shuffled
      .slice(0, targetCount)
      .map(entry => ({
        entry,
        score: Math.random(),
        reason: 'Random eviction'
      }))
  }
}

/**
 * Strategy factory
 */
export class EvictionStrategyFactory {
  private static strategies = new Map<CacheEvictionStrategy, IEvictionStrategy>([
    ['lru', new LRUEvictionStrategy()],
    ['lfu', new LFUEvictionStrategy()],
    ['ttl', new TTLEvictionStrategy()],
    ['adaptive', new AdaptiveEvictionStrategy()]
  ])

  /**
   * Get strategy instance by name
   */
  static getStrategy(name: CacheEvictionStrategy): IEvictionStrategy {
    const strategy = this.strategies.get(name)
    if (!strategy) {
      throw new Error(`Unknown eviction strategy: ${name}`)
    }
    return strategy
  }

  /**
   * Register custom strategy
   */
  static registerStrategy(name: CacheEvictionStrategy, strategy: IEvictionStrategy): void {
    this.strategies.set(name, strategy)
  }

  /**
   * Get all available strategy names
   */
  static getAvailableStrategies(): CacheEvictionStrategy[] {
    return Array.from(this.strategies.keys())
  }
}

/**
 * Cache warming strategies
 */
export interface ICacheWarmingStrategy {
  readonly name: string
  shouldWarm(key: string, metadata: WarmingMetadata): boolean
  getPriority(key: string, metadata: WarmingMetadata): number
}

/**
 * Metadata for warming decisions
 */
export interface WarmingMetadata {
  readonly frequency: number
  readonly lastAccessed: number
  readonly averageSize: number
  readonly timePattern: number[] // Access hours
  readonly keyPattern: string
}

/**
 * Frequency-based warming strategy
 */
export class FrequencyWarmingStrategy implements ICacheWarmingStrategy {
  readonly name = 'frequency'

  constructor(private minFrequency = 5) {}

  shouldWarm(key: string, metadata: WarmingMetadata): boolean {
    return metadata.frequency >= this.minFrequency
  }

  getPriority(key: string, metadata: WarmingMetadata): number {
    return metadata.frequency
  }
}

/**
 * Time-pattern warming strategy
 */
export class TimePatternWarmingStrategy implements ICacheWarmingStrategy {
  readonly name = 'time-pattern'

  shouldWarm(key: string, metadata: WarmingMetadata): boolean {
    const currentHour = new Date().getHours()
    return metadata.timePattern.includes(currentHour)
  }

  getPriority(key: string, metadata: WarmingMetadata): number {
    const currentHour = new Date().getHours()
    const hourMatches = metadata.timePattern.filter(h => Math.abs(h - currentHour) <= 1).length
    return hourMatches * metadata.frequency
  }
}

/**
 * Size-optimized warming strategy
 */
export class SizeOptimizedWarmingStrategy implements ICacheWarmingStrategy {
  readonly name = 'size-optimized'

  constructor(private maxSize = 10240) {} // 10KB default

  shouldWarm(key: string, metadata: WarmingMetadata): boolean {
    return metadata.averageSize <= this.maxSize && metadata.frequency >= 2
  }

  getPriority(key: string, metadata: WarmingMetadata): number {
    // Smaller size = higher priority
    const sizeFactor = Math.max(1, this.maxSize - metadata.averageSize) / this.maxSize
    return metadata.frequency * sizeFactor
  }
}

/**
 * Key pattern warming strategy
 */
export class KeyPatternWarmingStrategy implements ICacheWarmingStrategy {
  readonly name = 'key-pattern'

  constructor(private patterns: RegExp[]) {}

  shouldWarm(key: string, metadata: WarmingMetadata): boolean {
    return this.patterns.some(pattern => pattern.test(key)) && metadata.frequency >= 1
  }

  getPriority(key: string, metadata: WarmingMetadata): number {
    const patternMatches = this.patterns.filter(pattern => pattern.test(key)).length
    return patternMatches * metadata.frequency
  }
}

/**
 * Cache warming strategy factory
 */
export class WarmingStrategyFactory {
  private static strategies = new Map<string, ICacheWarmingStrategy>([
    ['frequency', new FrequencyWarmingStrategy()],
    ['time-pattern', new TimePatternWarmingStrategy()],
    ['size-optimized', new SizeOptimizedWarmingStrategy()],
    ['key-pattern', new KeyPatternWarmingStrategy([
      /^token:/, // Token counting cache
      /^result:/, // Result cache
      /^template:/ // Template cache
    ])]
  ])

  /**
   * Get warming strategy by name
   */
  static getStrategy(name: string): ICacheWarmingStrategy {
    const strategy = this.strategies.get(name)
    if (!strategy) {
      throw new Error(`Unknown warming strategy: ${name}`)
    }
    return strategy
  }

  /**
   * Register custom warming strategy
   */
  static registerStrategy(name: string, strategy: ICacheWarmingStrategy): void {
    this.strategies.set(name, strategy)
  }

  /**
   * Get all available warming strategies
   */
  static getAvailableWarmingStrategies(): string[] {
    return Array.from(this.strategies.keys())
  }
}

// Dummy entries array for compilation - this would be provided by the caller
const entries: StrategyCacheEntry[] = []