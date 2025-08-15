/**
 * Sanitization utilities for JSON output and security validation
 */

import * as path from 'path'

/**
 * Escapes a string for safe inclusion in JSON
 * Handles quotes, backslashes, and control characters
 * @param str - The string to escape
 * @returns The escaped string safe for JSON
 */
export function escapeJsonString(str: string): string {
  if (typeof str !== 'string') {
    return ''
  }

  // Escape backslashes first, then other special characters
  // Note: We handle control characters first to avoid double-escaping
  return (
    str
      .replace(/\\/g, '\\\\') // Backslash (must be first)
      .replace(/"/g, '\\"') // Double quote
      .replace(/\n/g, '\\n') // Newline
      .replace(/\r/g, '\\r') // Carriage return
      .replace(/\t/g, '\\t') // Tab
      .replace(/\f/g, '\\f') // Form feed
      .replace(/[\b]/g, '\\b') // Backspace (using character class to avoid regex word boundary)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x07\x0B\x0E-\x1F]/g, (char) => {
        // Escape remaining control characters as Unicode escapes
        // (excluding already handled: \b \t \n \v \f \r)
        return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4)
      })
  )
}

/**
 * Escapes an array of strings for JSON
 * @param lines - Array of strings to escape
 * @returns Array of escaped strings
 */
export function escapeJsonArray(lines: string[]): string[] {
  return lines.map(escapeJsonString)
}

/**
 * Windows reserved device names that cannot be used as filenames
 */
const WINDOWS_RESERVED_NAMES = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
]

/**
 * Validates a file path for security issues
 * Uses strict whitelist-based validation to prevent traversal attacks
 *
 * @param filePath - The file path to validate
 * @returns true if the path is valid, false otherwise
 */
export function validateFilePath(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return false
  }

  // Reject null bytes - critical security issue
  if (filePath.includes('\0')) {
    return false
  }

  // Check for directory traversal attempts BEFORE normalization
  // because path.normalize can resolve .. in absolute paths
  if (filePath.includes('..')) {
    return false
  }

  // Check for dangerous protocols BEFORE normalization
  // because normalization may strip them
  const lowerPath = filePath.toLowerCase()
  if (
    lowerPath.includes('javascript:') ||
    lowerPath.includes('data:') ||
    lowerPath.includes('file://')
  ) {
    return false
  }

  // Also check for URL-encoded traversal patterns
  const decodedPath = decodeURIComponent(filePath)
  if (decodedPath !== filePath && (decodedPath.includes('..') || decodedPath.includes('\0'))) {
    return false
  }

  // Normalize the path to clean it up
  const normalizedPath = path.normalize(filePath)

  // CRITICAL: Re-check for traversal after normalization
  // This catches cases where normalization introduces .. sequences
  if (normalizedPath.includes('..')) {
    return false
  }

  // For absolute paths, ensure resolution doesn't change the path
  // This prevents escaping through complex resolution patterns
  if (path.isAbsolute(normalizedPath)) {
    const resolved = path.resolve(normalizedPath)
    // If resolution changes the path, it's trying to escape
    if (resolved !== normalizedPath) {
      return false
    }
  }

  // Platform-specific validation
  if (process.platform === 'win32') {
    // Check for Windows path length limit
    if (normalizedPath.length > 260) {
      return false
    }

    // Check for alternative data streams (ADS)
    if (normalizedPath.includes(':')) {
      // Check if it's ONLY a drive letter at the start
      const driveLetterOnly = /^[A-Z]:\\/i.test(normalizedPath)
      const colonCount = (normalizedPath.match(/:/g) || []).length

      if (!driveLetterOnly || colonCount > 1) {
        return false // Multiple colons = ADS attempt
      }
    }

    // Check for Windows reserved device names
    const pathParts = normalizedPath.split(path.sep)
    for (const part of pathParts) {
      if (part) {
        const nameWithoutExt = part.split('.')[0].toUpperCase()
        if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
          return false
        }
      }
    }
  } else {
    // Unix-like systems: check for very long paths
    if (normalizedPath.length > 4096) {
      return false
    }
  }

  // Allow both relative and absolute paths
  // Let the OS and test framework handle the rest
  return true
}

/**
 * Sanitizes sensitive information from a file path
 * @param filePath - The file path to sanitize
 * @returns The sanitized path
 */
export function sanitizeFilePath(filePath: string): string {
  // Optionally sanitize sensitive information (e.g., username in path)
  return filePath.replace(/\/(?:Users|home)\/[^/]+/, '/Users/***')
}

/**
 * Creates a safe deep clone without prototype pollution risk
 * Uses native structuredClone for performance and simplicity
 * Requires Node.js 17+ or modern browsers
 * @param source - The source object to clone
 * @returns A safe deep clone with prohibited keys filtered
 */
export function createSafeObject<T extends Record<string, unknown>>(source: T): T {
  // Set of dangerous keys that could lead to prototype pollution
  const prohibited = new Set(['__proto__', 'constructor', 'prototype'])

  // Maximum nesting depth to prevent DoS attacks
  const MAX_DEPTH = 50 // Reasonable limit for test data structures

  /**
   * Recursively filters out prohibited keys from objects
   * @param obj - Object to filter
   * @param visited - WeakSet to track visited objects (prevent infinite recursion)
   * @param depth - Current nesting depth
   * @returns Filtered object safe from prototype pollution
   */
  function filterObject(obj: unknown, visited = new WeakSet(), depth = 0): unknown {
    // Check depth limit before processing
    if (depth >= MAX_DEPTH) {
      throw new Error('Maximum object nesting depth exceeded')
    }

    // Return primitives as-is
    if (!obj || typeof obj !== 'object') return obj

    // Check for circular references
    if (visited.has(obj)) {
      return {} // Return empty object to break circular reference
    }
    visited.add(obj)

    // Handle arrays by filtering each element
    if (Array.isArray(obj)) {
      return obj.map((item) => filterObject(item, visited, depth + 1))
    }

    // Filter object keys
    const filtered: Record<string, unknown> = {}
    const source = obj as Record<string, unknown>
    for (const key in source) {
      if (!prohibited.has(key) && Object.prototype.hasOwnProperty.call(source, key)) {
        filtered[key] = filterObject(source[key], visited, depth + 1)
      }
    }
    return filtered
  }

  // First filter dangerous keys, then use structuredClone for deep copy
  // structuredClone handles circular references, typed arrays, dates, etc.
  const filtered = filterObject(source)

  try {
    return globalThis.structuredClone(filtered) as T
  } catch {
    // If structuredClone fails (e.g., with functions), return the filtered object
    return filtered as T
  }
}

/**
 * Checks if a property exists safely without prototype pollution
 * @param obj - The object to check
 * @param prop - The property name to check
 * @returns True if the property exists on the object itself
 */
export function hasOwnProperty(obj: unknown, prop: string): boolean {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return false
  }
  return Object.prototype.hasOwnProperty.call(obj, prop)
}
