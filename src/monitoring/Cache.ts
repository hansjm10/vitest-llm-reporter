/**
 * Cache Implementation
 *
 * A cache implementation with LRU eviction and TTL support.
 */

import { CACHE_TTL_MS, DEFAULT_CACHE_SIZE } from './constants.js'
import type { CacheStats } from '../types/monitoring.js'

export class Cache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>()
  private maxSize: number
  private hitCount = 0
  private missCount = 0

  constructor(maxSize = DEFAULT_CACHE_SIZE) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) {
      this.missCount++
      return undefined
    }

    // TTL check
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key)
      this.missCount++
      return undefined
    }

    // LRU: Move accessed entry to end (most recent) by deleting and re-adding
    this.cache.delete(key)
    this.cache.set(key, entry)

    this.hitCount++
    return entry.value
  }

  set(key: string, value: T): void {
    // LRU: delete oldest when full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  clear(): void {
    this.cache.clear()
    this.hitCount = 0
    this.missCount = 0
  }

  get size(): number {
    return this.cache.size
  }

  getHitRate(): number {
    const total = this.hitCount + this.missCount
    return total === 0 ? 0 : this.hitCount / total
  }

  getStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate()
    }
  }
}
