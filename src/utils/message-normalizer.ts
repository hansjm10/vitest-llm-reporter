/**
 * Message normalization utilities for log deduplication
 *
 * @module utils/message-normalizer
 */

import type { DeduplicationConfig } from '../types/deduplication.js'

/**
 * Normalize a message for comparison
 * @param message - The message to normalize
 * @param config - Configuration options for normalization
 * @returns Normalized message string
 */
export function normalizeMessage(
  message: string,
  config: Partial<DeduplicationConfig> = {}
): string {
  // Return early if no normalization needed
  if (!config.stripAnsiCodes && !config.stripTimestamps && !config.normalizeWhitespace) {
    return message.toLowerCase()
  }

  let normalized = message

  // Strip ANSI color codes
  if (config.stripAnsiCodes !== false && normalized.includes('\x1b')) {
    // eslint-disable-next-line no-control-regex
    normalized = normalized.replace(/\x1b\[[0-9;]*m/g, '')
  }

  // Strip timestamps (various formats)
  if (config.stripTimestamps !== false) {
    // Only apply regex if likely to contain timestamps
    // ISO timestamps
    if (normalized.includes('T') || normalized.includes(':')) {
      normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, '')
      // Common date formats
      normalized = normalized.replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, '')
    }
    // Unix timestamps (10 or 13 digits)
    if (/\b\d{10,13}\b/.test(normalized)) {
      normalized = normalized.replace(/\b\d{10}(\d{3})?\b/g, '')
    }
  }

  // Normalize whitespace
  if (config.normalizeWhitespace !== false && /\s{2,}/.test(normalized)) {
    normalized = normalized.replace(/\s+/g, ' ').trim()
  }

  return normalized.toLowerCase()
}

/**
 * Generate a hash for a normalized message
 * Uses DJB2 hash algorithm for performance
 * @param message - The message to hash
 * @returns Hash string in base36 format
 */
export function hashMessage(message: string): string {
  // DJB2 hash algorithm - much faster than SHA256 for our use case
  let hash = 5381
  for (let i = 0; i < message.length; i++) {
    hash = (hash << 5) + hash + message.charCodeAt(i)
    hash = hash & 0xffffffff // Convert to 32bit integer
  }
  return hash.toString(36) // Convert to base36 for shorter string
}

