/**
 * Validation error messages module
 *
 * Centralized error message definitions for consistent validation feedback
 */

/**
 * Size constants for better readability
 */
export const BYTES_PER_KB = 1024
export const BYTES_PER_MB = BYTES_PER_KB * 1024

/**
 * Maximum allowed timestamp string length to prevent processing attacks
 * ISO 8601 max format: "2024-12-31T23:59:59.999+00:00" = 30 chars
 */
export const MAX_TIMESTAMP_LENGTH = 30

/**
 * Maximum size for individual arrays
 * 500KB limit prevents DoS while allowing reasonable test output
 */
export const MAX_ARRAY_SIZE = 500 * 1024 // 500KB in bytes

/**
 * Standardized error messages with consistent format
 * Format: ${path}: Expected ${type}, got ${actualType}
 */
export const ErrorMessages = {
  TYPE_STRING: (path: string, actual: string): string => `${path}: Expected string, got ${actual}`,
  TYPE_NUMBER: (path: string, actual: string): string => `${path}: Expected number, got ${actual}`,
  TYPE_OBJECT: (path: string, actual: string): string => `${path}: Expected object, got ${actual}`,
  TYPE_ARRAY: (path: string, actual: string): string => `${path}: Expected array, got ${actual}`,
  TYPE_BOOLEAN: (path: string, actual: string): string =>
    `${path}: Expected boolean, got ${actual}`,
  REQUIRED_FIELD: (path: string): string => `${path}: Expected required field, got undefined`,
  LIMIT_EXCEEDED: (path: string, limit: number, actual: number): string =>
    `${path}: Expected value <= ${limit}, got ${actual}`,
  MEMORY_LIMIT: (path: string, limit: number, actual: number): string =>
    `${path}: Expected memory usage <= ${limit}, got ${actual}`,
  MEMORY_LIMIT_DURING: (path: string): string =>
    `${path}: Expected memory within limits, got exceeded during processing`,
  INVALID_VALUE: (path: string, expected: string, actual: string): string =>
    `${path}: Expected ${expected}, got ${actual}`,
  MIN_VALUE: (path: string, min: number, actual: number): string =>
    `${path}: Expected value >= ${min}, got ${actual}`,
  MAX_STRING_LENGTH: (path: string, max: number, actual: number): string =>
    `${path}: Expected string length <= ${max}, got ${actual}`,
  MAX_CODE_LINES: (path: string, max: number, actual: number): string =>
    `${path}: Expected code lines <= ${max}, got ${actual}`,
  INVALID_FILE_PATH: (path: string, actual: string): string =>
    `${path}: Invalid file path detected: ${actual}`,
  INVALID_STATUS: (path: string, actual: string): string =>
    `${path}: Expected "passed" or "skipped", got "${actual}"`,
  INVALID_ISO8601: (path: string, actual: string): string =>
    `${path}: Expected valid ISO 8601 timestamp, got invalid format: ${actual}`,
  CIRCULAR_REFERENCE: (path: string): string =>
    `${path}: Expected acyclic structure, got circular reference`,
  OUTPUT_NOT_OBJECT: (actual: string): string => `Output: Expected object, got ${actual}`,
  MUST_BE_NUMBER: (path: string, actual: string): string =>
    `${path}: Expected number, got ${actual}`,
  MUST_BE_NON_NEGATIVE: (path: string, actual: number): string =>
    `${path}: Expected non-negative number, got ${actual}`
}
