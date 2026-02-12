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

export interface FilePathValidationDiagnostics {
  input: string
  platform: NodeJS.Platform
  normalizedPath?: string
  decodedPath?: string
  isAbsolute?: boolean
  colonCount?: number
  parsedRoot?: string
  remainderAfterRoot?: string
  failureReason?: string
  notes: string[]
  valid: boolean
}

const MAX_WINDOWS_PATH_LENGTH = 260
const MAX_POSIX_PATH_LENGTH = 4096

function validateFilePathInternal(
  filePath: string,
  diagnostics?: FilePathValidationDiagnostics
): boolean {
  const record = <K extends keyof FilePathValidationDiagnostics>(
    key: K,
    value: FilePathValidationDiagnostics[K]
  ): void => {
    if (diagnostics) {
      diagnostics[key] = value
    }
  }

  const note = (message: string): void => {
    if (diagnostics) {
      diagnostics.notes.push(message)
    }
  }

  const fail = (reason: string): boolean => {
    if (diagnostics) {
      diagnostics.failureReason = reason
      diagnostics.valid = false
      diagnostics.notes.push(`FAIL: ${reason}`)
    }
    return false
  }

  if (diagnostics && !diagnostics.notes) {
    diagnostics.notes = []
  }

  if (typeof filePath !== 'string' || filePath.length === 0) {
    return fail('Path must be a non-empty string')
  }

  note(`Input length: ${filePath.length}`)

  if (filePath.includes('\0')) {
    return fail('Path contains null byte')
  }

  if (filePath.includes('..')) {
    return fail('Path contains traversal sequence before normalization')
  }

  const lowerPath = filePath.toLowerCase()
  if (
    lowerPath.includes('javascript:') ||
    lowerPath.includes('data:') ||
    lowerPath.includes('file://')
  ) {
    return fail('Path contains disallowed protocol')
  }

  let decodedPath = filePath
  try {
    decodedPath = decodeURIComponent(filePath)
  } catch {
    return fail('Path contains malformed percent-encoding')
  }

  if (decodedPath !== filePath) {
    record('decodedPath', decodedPath)
    if (decodedPath.includes('..') || decodedPath.includes('\0')) {
      return fail('Decoded path contains traversal sequence or null byte')
    }
  }

  const normalizedPath = path.normalize(filePath)
  record('normalizedPath', normalizedPath)

  if (normalizedPath.includes('..')) {
    return fail('Normalized path contains traversal sequence')
  }

  const isAbsolute = path.isAbsolute(normalizedPath)
  record('isAbsolute', isAbsolute)

  if (isAbsolute) {
    const normalizeForComparison = (p: string): string => {
      // Normalize separators and trim trailing ones so C:\path and C:\path\ compare equal
      const normalized = path.normalize(p)
      const { root } = path.parse(normalized)
      const withoutTrailing = normalized.replace(/[\\/]+$/, '')
      const comparable = withoutTrailing.length === 0 ? root || normalized : withoutTrailing
      return process.platform === 'win32' ? comparable.toLowerCase() : comparable
    }

    const resolved = path.resolve(normalizedPath)
    const resolvedComparable = normalizeForComparison(resolved)
    const normalizedComparable = normalizeForComparison(normalizedPath)

    note(`Resolved comparable: ${resolvedComparable}`)
    note(`Normalized comparable: ${normalizedComparable}`)

    if (process.platform === 'win32') {
      const firstColonIndex = normalizedPath.indexOf(':')
      const hasExplicitDrive = firstColonIndex === 1 && /^[a-z]$/i.test(normalizedPath[0])
      note(`Has explicit drive: ${hasExplicitDrive}`)

      if (hasExplicitDrive) {
        if (resolvedComparable !== normalizedComparable) {
          return fail('Resolved path differs from normalized path (explicit drive)')
        }
      } else {
        const stripRoot = (value: string): string => {
          const parsed = path.parse(value)
          const rootComparable = normalizeForComparison(parsed.root || '')
          return value.slice(rootComparable.length).replace(/^[\\/]+/, '')
        }

        if (stripRoot(resolvedComparable) !== stripRoot(normalizedComparable)) {
          return fail('Resolved path escapes root (implicit drive)')
        }
      }
    } else if (resolvedComparable !== normalizedComparable) {
      return fail('Resolved path differs from normalized path')
    }
  }

  if (process.platform === 'win32') {
    if (normalizedPath.length > MAX_WINDOWS_PATH_LENGTH) {
      return fail('Path exceeds Windows MAX_PATH limit')
    }

    const normalizedLower = normalizedPath.toLowerCase()
    if (
      normalizedLower.startsWith('\\\\?\\') ||
      normalizedLower.startsWith('//?/') ||
      normalizedLower.startsWith('\\\\.\\') ||
      normalizedLower.startsWith('//./')
    ) {
      return fail('Extended-length or device paths are not allowed')
    }

    const colonMatches = normalizedPath.match(/:/g)
    const colonCount = colonMatches ? colonMatches.length : 0
    record('colonCount', colonCount)

    if (colonCount > 0) {
      if (colonCount > 1) {
        return fail('Multiple colons detected (potential ADS)')
      }

      const firstColonIndex = normalizedPath.indexOf(':')
      const hasDriveLetterPrefix = firstColonIndex === 1 && /^[A-Z]$/i.test(normalizedPath[0])
      note(`Drive letter prefix detected: ${hasDriveLetterPrefix}`)

      if (!hasDriveLetterPrefix) {
        return fail('Colon present without drive letter prefix')
      }

      const remainder = normalizedPath.slice(firstColonIndex + 1)
      record('remainderAfterRoot', remainder)

      if (remainder.length === 0) {
        return fail('Drive path missing separator after colon')
      }

      const separator = remainder[0]
      const hasRequiredSeparator = separator === '\\' || separator === '/'

      if (!hasRequiredSeparator) {
        return fail('Drive letter must be followed by path separator')
      }

      if (remainder.includes(':')) {
        return fail('Colon detected outside of drive root (ADS)')
      }
    }

    record('parsedRoot', path.parse(normalizedPath).root)

    const pathParts = normalizedPath.split(path.sep)
    for (const part of pathParts) {
      if (part) {
        const nameWithoutExt = part.split('.')[0].toUpperCase()
        if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
          return fail(`Reserved device name detected: ${nameWithoutExt}`)
        }
      }
    }
  } else {
    if (normalizedPath.length > MAX_POSIX_PATH_LENGTH) {
      return fail('Path exceeds POSIX length limit')
    }
  }

  if (diagnostics) {
    diagnostics.valid = true
    diagnostics.notes.push('Validation passed')
  }

  // Allow both relative and absolute paths
  // Let the OS and test framework handle the rest
  return true
}

/**
 * Validates a file path for security issues
 * Uses strict whitelist-based validation to prevent traversal attacks
 *
 * @param filePath - The file path to validate
 * @returns true if the path is valid, false otherwise
 */
export function validateFilePath(filePath: string): boolean {
  return validateFilePathInternal(filePath)
}

/**
 * Provides detailed diagnostics for validateFilePath consumers.
 * Primarily intended for debugging and tests so failures can surface
 * rich context without altering the public return type.
 */
export function validateFilePathDiagnostics(filePath: string): FilePathValidationDiagnostics {
  const diagnostics: FilePathValidationDiagnostics = {
    input: filePath,
    platform: process.platform,
    notes: [],
    valid: false
  }

  validateFilePathInternal(filePath, diagnostics)
  return diagnostics
}

/**
 * Creates a safe deep clone without prototype pollution risk
 * Uses native structuredClone for performance and simplicity
 * Requires Node.js 18+ or modern browsers
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
