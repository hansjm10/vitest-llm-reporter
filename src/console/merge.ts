import type { ConsoleEvent } from '../types/schema.js'
import { createLogger } from '../utils/logger.js'

/**
 * Console Merger
 *
 * Intelligently merges console events from multiple sources (AsyncLocalStorage and Vitest native)
 * preserving timestamps and source information.
 *
 * @module console/merge
 */

export class ConsoleMerger {
  private debug = createLogger('console-merger')
  private normalizationCache = new Map<string, string>()

  /**
   * Merge console events from multiple sources
   *
   * @param taskEvents - Console events from Vitest's native capture (onUserConsoleLog)
   * @param interceptedEvents - Console events from AsyncLocalStorage-based capture
   * @returns Merged console events array with stable ordering
   */
  public merge(
    taskEvents: ConsoleEvent[] | undefined,
    interceptedEvents: ConsoleEvent[] | undefined
  ): ConsoleEvent[] | undefined {
    // Handle edge cases
    if (!taskEvents && !interceptedEvents) {
      return undefined
    }
    if (!taskEvents) {
      return interceptedEvents
    }
    if (!interceptedEvents) {
      return taskEvents
    }

    this.debug(
      'Merging %d task and %d intercepted console events',
      taskEvents.length,
      interceptedEvents.length
    )

    // If both have timestamps, merge by timestamp
    const hasTaskTimestamps = taskEvents.some((e) => e.timestampMs !== undefined)
    const hasInterceptedTimestamps = interceptedEvents.some((e) => e.timestampMs !== undefined)

    if (hasTaskTimestamps && hasInterceptedTimestamps) {
      // Merge by timestamp, maintaining stable sort for equal timestamps
      const merged = [...interceptedEvents, ...taskEvents]
      merged.sort((a, b) => {
        // Both have timestamps
        if (a.timestampMs !== undefined && b.timestampMs !== undefined) {
          return a.timestampMs - b.timestampMs
        }
        // Only a has timestamp - it comes first
        if (a.timestampMs !== undefined) {
          return -1
        }
        // Only b has timestamp - it comes first
        if (b.timestampMs !== undefined) {
          return 1
        }
        // Neither has timestamp - maintain original order
        return 0
      })

      // Remove adjacent duplicates (same level and text)
      return this.deduplicateAdjacent(merged)
    }

    // Otherwise, preserve source order (intercepted first, then task)
    // This maintains the natural flow when timestamps aren't available
    const merged = [...interceptedEvents, ...taskEvents]

    // Remove adjacent duplicates
    return this.deduplicateAdjacent(merged)
  }

  /**
   * Remove adjacent duplicate events
   *
   * @param events - Console events array
   * @returns Deduplicated events array or undefined if empty
   */
  private deduplicateAdjacent(events: ConsoleEvent[]): ConsoleEvent[] | undefined {
    if (events.length === 0) return undefined

    const deduplicated: ConsoleEvent[] = []
    let previous: ConsoleEvent | null = null

    for (const event of events) {
      // Skip if it's an exact duplicate of the previous event
      if (previous && this.areEventsEqual(previous, event)) {
        this.debug('Skipping duplicate event: %s', event.message)
        continue
      }
      deduplicated.push(event)
      previous = event
    }

    return deduplicated.length > 0 ? deduplicated : undefined
  }

  /**
   * Check if two events are equal (same level and normalized text)
   *
   * @param a - First event
   * @param b - Second event
   * @returns True if events are considered equal
   */
  private areEventsEqual(a: ConsoleEvent, b: ConsoleEvent): boolean {
    // Different levels are never equal
    if (a.level !== b.level) {
      return false
    }

    // If both have timestamps and they differ significantly, not equal
    if (a.timestampMs !== undefined && b.timestampMs !== undefined) {
      // Allow small timestamp differences (within 5ms) for near-simultaneous logs
      if (Math.abs(a.timestampMs - b.timestampMs) > 5) {
        return false
      }
    }

    // Compare normalized text
    return this.normalizeText(a.message) === this.normalizeText(b.message)
  }

  /**
   * Normalize event message for comparison
   * Removes timestamps and excessive whitespace
   * Uses caching to avoid re-normalizing the same strings
   *
   * @param text - Event message to normalize
   * @returns Normalized text
   */
  private normalizeText(message: string): string {
    return (
      message
        // Remove timestamp prefixes like [123ms]
        .replace(/^\[\d+(?:ms)?\]\s*/, '')
        // Remove ISO timestamps
        .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/g, '')
        // Remove unix timestamps
        .replace(/\b\d{13}\b/g, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim()
    )
  }
}

/**
 * Singleton instance of ConsoleMerger for convenience
 *
 * @example
 * ```typescript
 * import { consoleMerger } from './console/merge.js'
 *
 * // Merge console events from different sources
 * const merged = consoleMerger.merge(taskEvents, interceptedEvents)
 * ```
 */
export const consoleMerger = new ConsoleMerger()
