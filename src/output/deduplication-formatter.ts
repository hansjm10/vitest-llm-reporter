/**
 * Stub implementation for deduplication formatter
 * This is a minimal implementation to allow TDD tests to load
 * TODO: Implement actual deduplication formatting logic
 */

import type { ConsoleOutputWithDeduplication } from '../types/deduplication.js'

/**
 * Format console output with deduplication metadata
 * @param output - The console output to format
 * @returns Formatted output with deduplication metadata
 */
export function formatConsoleOutputWithDeduplication(
  output: any
): ConsoleOutputWithDeduplication {
  // Stub implementation - returns minimal valid structure
  return {
    logs: [],
    warns: [],
    errors: [],
    deduplicationMetadata: {
      count: 0,
      firstSeen: new Date().toISOString(),
      deduplicated: false
    }
  }
}