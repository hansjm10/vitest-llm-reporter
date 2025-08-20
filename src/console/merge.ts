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
    for (const [key, values] of Object.entries(vitestOutput) as Array<[keyof ConsoleOutput, string[]]>) {
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
        
        if (!this.isDuplicate(value, merged[key]!)) {
          merged[key]!.push(value)
        }
      }
    }

    // Clean up empty arrays
    const cleaned = this.cleanupEmpty(merged)
    
    this.debug('Merged %d custom and %d Vitest console entries', 
      this.countEntries(customOutput), 
      this.countEntries(vitestOutput)
    )

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
    
    return existingEntries.some(existing => {
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
   * 
   * @param log - The log entry to normalize
   * @returns Normalized log entry
   */
  private normalizeLog(log: string): string {
    return log
      // Remove timestamp prefixes like [123ms] or timestamps in general
      .replace(/^\[\d+(?:ms)?\]\s*/, '')
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/g, '')
      .replace(/\b\d{13}\b/g, '') // Remove unix timestamps
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Check if two normalized log entries are similar enough to be considered duplicates
   * 
   * @param log1 - First normalized log
   * @param log2 - Second normalized log
   * @returns True if logs are similar enough to be duplicates
   */
  private areSimilar(log1: string, log2: string): boolean {
    // Exact match after normalization
    if (log1 === log2) {
      return true
    }

    // Check if one is a substring of the other (handles partial captures)
    if (log1.includes(log2) || log2.includes(log1)) {
      return true
    }

    // Could add more sophisticated similarity checks here (e.g., Levenshtein distance)
    // but for now, keep it simple
    return false
  }

  /**
   * Deep clone a console output object
   * 
   * @param output - Console output to clone
   * @returns Cloned console output
   */
  private deepClone(output: ConsoleOutput): ConsoleOutput {
    const cloned: ConsoleOutput = {}
    
    for (const [key, values] of Object.entries(output) as Array<[keyof ConsoleOutput, string[] | undefined]>) {
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

    for (const [key, values] of Object.entries(output) as Array<[keyof ConsoleOutput, string[] | undefined]>) {
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
    testStartTime?: number
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