import type { ConsoleOutput } from '../types/schema'
import { createLogger } from '../utils/logger'

/**
 * Console Merger
 *
 * Intelligently merges console output from multiple sources (AsyncLocalStorage and Vitest native)
 * with deduplication and timestamp correlation.
 *
 * @module console/merge
 */

export class ConsoleMerger {
  private debug = createLogger('console-merger')
  private normalizationCache = new Map<string, string>()

  /**
   * Merge console outputs from multiple sources
   *
   * @param vitestOutput - Console output from Vitest's native capture (onUserConsoleLog)
   * @param customOutput - Console output from AsyncLocalStorage-based capture
   * @returns Merged console output with deduplication
   */
  public merge(
    vitestOutput: ConsoleOutput | undefined,
    customOutput: ConsoleOutput | undefined
  ): ConsoleOutput | undefined {
    // Handle edge cases
    if (!vitestOutput && !customOutput) {
      return undefined
    }
    if (!vitestOutput) {
      return customOutput
    }
    if (!customOutput) {
      return vitestOutput
    }

    this.debug('Merging console outputs from Vitest and custom capture')

    // Start with custom output (has better method granularity)
    const merged: ConsoleOutput = this.deepClone(customOutput)

    // Add unique entries from Vitest output
    for (const [key, values] of Object.entries(vitestOutput) as Array<
      [keyof ConsoleOutput, string[]]
    >) {
      if (!values || !Array.isArray(values)) continue

      // Initialize array if not present
      if (!merged[key]) {
        merged[key] = []
      }

      // Add each value if it's not a duplicate
      for (const value of values) {
        // Skip invalid values (null, undefined, non-strings)
        if (!value || typeof value !== 'string') {
          continue
        }

        if (!this.isDuplicate(value, merged[key])) {
          merged[key].push(value)
        }
      }
    }

    // Clean up empty arrays
    const cleaned = this.cleanupEmpty(merged)

    this.debug(
      'Merged %d custom and %d Vitest console entries',
      this.countEntries(customOutput),
      this.countEntries(vitestOutput)
    )

    // Clear normalization cache after merge to prevent memory buildup
    this.normalizationCache.clear()

    return cleaned
  }

  /**
   * Check if a log entry is a duplicate of existing entries
   *
   * @param newEntry - The log entry to check
   * @param existingEntries - Existing log entries to compare against
   * @returns True if the entry is a duplicate
   */
  private isDuplicate(newEntry: string, existingEntries: string[]): boolean {
    // Handle null/undefined entries
    if (!newEntry || typeof newEntry !== 'string') {
      return true // Consider invalid entries as duplicates to skip them
    }

    const normalizedNew = this.normalizeLog(newEntry)

    return existingEntries.some((existing) => {
      // Skip invalid existing entries
      if (!existing || typeof existing !== 'string') {
        return false
      }
      const normalizedExisting = this.normalizeLog(existing)
      return this.areSimilar(normalizedNew, normalizedExisting)
    })
  }

  /**
   * Normalize a log entry for comparison
   * Removes timestamps and excessive whitespace
   * Uses caching to avoid re-normalizing the same strings
   *
   * @param log - The log entry to normalize
   * @returns Normalized log entry
   */
  private normalizeLog(log: string): string {
    // Check cache first
    const cached = this.normalizationCache.get(log)
    if (cached !== undefined) {
      return cached
    }

    // Limit cache size to prevent memory issues (LRU-style)
    if (this.normalizationCache.size > 100) {
      // Remove oldest entries (first 20)
      const keysToDelete = Array.from(this.normalizationCache.keys()).slice(0, 20)
      keysToDelete.forEach((key) => this.normalizationCache.delete(key))
    }

    const normalized = log
      // Remove timestamp prefixes like [123ms] or timestamps in general
      .replace(/^\[\d+(?:ms)?\]\s*/, '')
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/g, '')
      .replace(/\b\d{13}\b/g, '') // Remove unix timestamps
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()

    // Store in cache
    this.normalizationCache.set(log, normalized)
    return normalized
  }

  /**
   * Check if two normalized log entries are similar enough to be considered duplicates
   *
   * @param log1 - First normalized log
   * @param log2 - Second normalized log
   * @returns True if logs are similar enough to be duplicates
   */
  private areSimilar(log1: string, log2: string): boolean {
    // Exact match after normalization (fast path)
    if (log1 === log2) {
      return true
    }

    // Check if one is a substring of the other (handles partial captures)
    if (log1.includes(log2) || log2.includes(log1)) {
      return true
    }

    // Fuzzy matching using Levenshtein distance
    // Use 85% similarity threshold (0.85)
    const maxLen = Math.max(log1.length, log2.length)
    if (maxLen === 0) {
      return true // Both empty strings
    }

    const distance = this.levenshteinDistance(log1, log2)
    const similarity = 1 - distance / maxLen

    // Consider strings similar if they have 85% or higher similarity
    return similarity >= 0.85
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Uses optimized two-row dynamic programming approach
   *
   * @param str1 - First string
   * @param str2 - Second string
   * @returns Edit distance between the strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    // Handle edge cases
    if (str1 === str2) return 0
    if (str1.length === 0) return str2.length
    if (str2.length === 0) return str1.length

    // Ensure str1 is the shorter string for memory optimization
    if (str1.length > str2.length) {
      ;[str1, str2] = [str2, str1]
    }

    const len1 = str1.length
    const len2 = str2.length

    // Use two rows instead of full matrix to save memory
    let prevRow = Array.from({ length: len1 + 1 }, (_, i) => i)
    let currRow = new Array<number>(len1 + 1)

    for (let j = 1; j <= len2; j++) {
      currRow[0] = j
      for (let i = 1; i <= len1; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
        currRow[i] = Math.min(
          currRow[i - 1] + 1, // Insertion
          prevRow[i] + 1, // Deletion
          prevRow[i - 1] + cost // Substitution
        )
      }
      // Swap rows
      const temp = prevRow
      prevRow = currRow
      currRow = temp
    }

    return prevRow[len1]
  }

  /**
   * Deep clone a console output object
   *
   * @param output - Console output to clone
   * @returns Cloned console output
   */
  private deepClone(output: ConsoleOutput): ConsoleOutput {
    const cloned: ConsoleOutput = {}

    for (const [key, values] of Object.entries(output) as Array<
      [keyof ConsoleOutput, string[] | undefined]
    >) {
      if (values && Array.isArray(values)) {
        cloned[key] = [...values]
      }
    }

    return cloned
  }

  /**
   * Remove empty arrays from console output
   *
   * @param output - Console output to clean
   * @returns Cleaned console output
   */
  private cleanupEmpty(output: ConsoleOutput): ConsoleOutput | undefined {
    const cleaned: ConsoleOutput = {}
    let hasContent = false

    for (const [key, values] of Object.entries(output) as Array<
      [keyof ConsoleOutput, string[] | undefined]
    >) {
      if (values && Array.isArray(values) && values.length > 0) {
        cleaned[key] = values
        hasContent = true
      }
    }

    return hasContent ? cleaned : undefined
  }

  /**
   * Count total entries in console output
   *
   * @param output - Console output to count
   * @returns Total number of log entries
   */
  private countEntries(output: ConsoleOutput | undefined): number {
    if (!output) return 0

    let count = 0
    for (const values of Object.values(output)) {
      if (Array.isArray(values)) {
        count += values.length
      }
    }
    return count
  }

  /**
   * Merge console outputs with timestamp correlation
   * This is a more advanced merge that tries to correlate logs by timestamp
   *
   * @param vitestOutput - Console output with timestamps from Vitest
   * @param customOutput - Console output with elapsed times from custom capture
   * @param testStartTime - Test start timestamp for correlation
   * @returns Merged console output
   */
  public mergeWithTimestamps(
    vitestOutput: ConsoleOutput | undefined,
    customOutput: ConsoleOutput | undefined,
    _testStartTime?: number
  ): ConsoleOutput | undefined {
    // For now, just use the simple merge
    // This method is here for future enhancement when we have timestamp data
    // from both sources and can do more intelligent correlation
    return this.merge(vitestOutput, customOutput)
  }
}

/**
 * Singleton instance of ConsoleMerger for convenience
 *
 * @example
 * ```typescript
 * import { consoleMerger } from './console/merge'
 *
 * // Merge console outputs from different sources
 * const merged = consoleMerger.merge(vitestOutput, customOutput)
 * ```
 */
export const consoleMerger = new ConsoleMerger()
