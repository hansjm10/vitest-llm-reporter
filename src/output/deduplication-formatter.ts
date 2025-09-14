/**
 * Deduplication output formatter
 * Formats console output with deduplication metadata
 *
 * @module output/deduplication-formatter
 */

import type {
  ConsoleOutputWithDeduplication,
  DeduplicationEntry,
  DeduplicationConfig,
} from '../types/deduplication.js'

/**
 * Format console output with deduplication metadata
 *
 * @param input - Raw console entry
 * @param isDuplicate - Whether this is a duplicate entry
 * @param deduplicationInfo - Deduplication metadata if duplicate
 * @param config - Configuration options
 * @returns Formatted console output with optional deduplication metadata
 */
export function formatConsoleOutputWithDeduplication(
  input: {
    message: string
    level: string
    timestamp: Date
  },
  isDuplicate: boolean,
  deduplicationInfo?: Pick<DeduplicationEntry, 'count' | 'firstSeen' | 'lastSeen' | 'sources'>,
  config?: Partial<Pick<DeduplicationConfig, 'includeSources'>>
): ConsoleOutputWithDeduplication {
  const output: ConsoleOutputWithDeduplication = {
    message: input.message,
    level: input.level,
    timestamp: input.timestamp.toISOString(),
  }

  if (isDuplicate && deduplicationInfo) {
    output.deduplication = {
      count: deduplicationInfo.count,
      firstSeen: deduplicationInfo.firstSeen.toISOString(),
      lastSeen: deduplicationInfo.lastSeen?.toISOString(),
      deduplicated: true,
    }

    // Include sources if configured
    if (config?.includeSources && deduplicationInfo.sources) {
      output.deduplication.sources = Array.from(deduplicationInfo.sources)
    }
  }

  return output
}