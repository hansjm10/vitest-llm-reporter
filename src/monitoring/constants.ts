/**
 * Monitoring Module Constants
 *
 * Centralized constants for the monitoring system to avoid magic numbers
 * and ensure consistent configuration across components.
 */

// Time constants (in milliseconds)
export const CACHE_TTL_MS = 3600000 // 1 hour TTL for cache entries

// Size constants
export const DEFAULT_CACHE_SIZE = 1000 // Default maximum cache size
export const DEFAULT_MEMORY_WARNING_THRESHOLD = 500 * 1024 * 1024 // 500MB memory warning threshold
export const MAX_TRACKED_OPERATIONS = 1000 // Maximum number of operations to track in metrics
