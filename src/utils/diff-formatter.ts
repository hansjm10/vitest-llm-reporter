/**
 * Diff Formatter for Test Assertions
 *
 * Generates human-readable diff output for test assertion failures,
 * highlighting differences between expected and actual values.
 *
 * @module utils
 */

import type { AssertionValue } from '../types/schema.js'

/**
 * Diff format types
 */
export type DiffFormat = 'json' | 'string' | 'object'

/**
 * Diff output structure
 */
export interface DiffOutput {
  /** Formatted diff string with visual indicators */
  formatted: string
  /** Format type used for the diff */
  format: DiffFormat
}

/**
 * Options for diff formatting
 */
export interface DiffOptions {
  /** Number of spaces for indentation (default: 2) */
  indent?: number
  /** Maximum depth to traverse nested objects (default: 10) */
  maxDepth?: number
  /** Include type information in diff (default: false) */
  showTypes?: boolean
}

const DEFAULT_DIFF_OPTIONS: Required<DiffOptions> = {
  indent: 2,
  maxDepth: 10,
  showTypes: false
}

/**
 * Formats a diff between expected and actual values
 *
 * @param expected - Expected value from test assertion
 * @param actual - Actual value from test execution
 * @param options - Formatting options
 * @returns Formatted diff output
 *
 * @example
 * ```typescript
 * const diff = formatJsonDiff({ name: 'John' }, { name: 'Jane' })
 * console.log(diff.formatted)
 * // - expected
 * // + actual
 * //
 * //   {
 * // -   "name": "John"
 * // +   "name": "Jane"
 * //   }
 * ```
 */
export function formatJsonDiff(
  expected: AssertionValue,
  actual: AssertionValue,
  options: DiffOptions = {}
): DiffOutput {
  const opts = { ...DEFAULT_DIFF_OPTIONS, ...options }

  // Determine format based on value types
  const format = determineFormat(expected, actual)

  // Handle primitive values
  if (format === 'string') {
    return {
      formatted: formatPrimitiveDiff(expected, actual, opts),
      format: 'string'
    }
  }

  // Handle complex objects/arrays
  try {
    const formatted = formatComplexDiff(expected, actual, opts)
    return {
      formatted,
      format
    }
  } catch (_error) {
    // Fallback to string comparison if complex diff fails
    return {
      formatted: formatPrimitiveDiff(expected, actual, opts),
      format: 'string'
    }
  }
}

/**
 * Determines the appropriate format for the diff
 */
function determineFormat(expected: AssertionValue, actual: AssertionValue): DiffFormat {
  const expectedType = getValueType(expected)
  const actualType = getValueType(actual)

  // If types differ, use string format
  if (expectedType !== actualType) {
    return 'string'
  }

  // If both are objects or arrays, use object/json format
  if (expectedType === 'object' || expectedType === 'array') {
    return 'json'
  }

  // Otherwise use string format
  return 'string'
}

/**
 * Gets the type of a value
 */
function getValueType(value: AssertionValue): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Formats a diff for primitive values
 */
function formatPrimitiveDiff(
  expected: AssertionValue,
  actual: AssertionValue,
  options: Required<DiffOptions>
): string {
  const lines: string[] = []

  lines.push('- expected')
  lines.push('+ actual')
  lines.push('')

  const expectedStr = serializeValue(expected, options)
  const actualStr = serializeValue(actual, options)

  if (expectedStr === actualStr) {
    lines.push(`  ${expectedStr}`)
  } else {
    lines.push(`- ${expectedStr}`)
    lines.push(`+ ${actualStr}`)
  }

  if (options.showTypes) {
    lines.push('')
    lines.push(`Expected type: ${getValueType(expected)}`)
    lines.push(`Actual type: ${getValueType(actual)}`)
  }

  return lines.join('\n')
}

/**
 * Formats a diff for complex objects and arrays
 */
function formatComplexDiff(
  expected: AssertionValue,
  actual: AssertionValue,
  options: Required<DiffOptions>
): string {
  const lines: string[] = []

  lines.push('- expected')
  lines.push('+ actual')
  lines.push('')

  // Serialize both values to JSON
  const expectedJson = serializeToJson(expected, options)
  const actualJson = serializeToJson(actual, options)

  // Split into lines for comparison
  const expectedLines = expectedJson.split('\n')
  const actualLines = actualJson.split('\n')

  // Generate line-by-line diff
  const diff = generateLineDiff(expectedLines, actualLines)

  lines.push(...diff)

  return lines.join('\n')
}

/**
 * Generates a line-by-line diff
 */
function generateLineDiff(expectedLines: string[], actualLines: string[]): string[] {
  const result: string[] = []

  // Simple line-by-line comparison
  const maxLines = Math.max(expectedLines.length, actualLines.length)

  for (let i = 0; i < maxLines; i++) {
    const expectedLine = expectedLines[i]
    const actualLine = actualLines[i]

    if (expectedLine === actualLine) {
      // Lines match
      result.push(`  ${expectedLine || ''}`)
    } else if (expectedLine === undefined) {
      // Line only in actual
      result.push(`+ ${actualLine}`)
    } else if (actualLine === undefined) {
      // Line only in expected
      result.push(`- ${expectedLine}`)
    } else {
      // Lines differ
      result.push(`- ${expectedLine}`)
      result.push(`+ ${actualLine}`)
    }
  }

  return result
}

/**
 * Serializes a value to a string representation
 */
function serializeValue(value: AssertionValue, options: Required<DiffOptions>): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  if (typeof value === 'string') {
    // Use JSON.stringify for strings to show quotes and escape sequences
    return JSON.stringify(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  // For objects and arrays, use JSON serialization
  return serializeToJson(value, options)
}

/**
 * Serializes a value to JSON with proper formatting
 */
function serializeToJson(value: AssertionValue, options: Required<DiffOptions>): string {
  try {
    // Handle circular references
    const seen = new WeakSet()

    const replacer = (key: string, val: unknown): unknown => {
      // Handle primitive values
      if (val === null || val === undefined) return val
      if (typeof val !== 'object') return val

      // Check for circular reference
      if (seen.has(val)) {
        return '[Circular]'
      }

      seen.add(val)
      return val
    }

    return JSON.stringify(value, replacer, options.indent)
  } catch (_error) {
    // Fallback to String() if JSON.stringify fails
    // Use type guard to safely stringify
    if (typeof value === 'object' && value !== null) {
      return '[Complex Object]'
    }
    return String(value)
  }
}

/**
 * Compares two values and returns true if they are deeply equal
 */
export function deepEqual(a: AssertionValue, b: AssertionValue): boolean {
  return deepEqualInternal(a, b, new WeakMap())
}

type SeenPairs = WeakMap<object, WeakSet<object>>

function hasSeenPair(a: object, b: object, seen: SeenPairs): boolean {
  const seenForA = seen.get(a)
  const seenForB = seen.get(b)

  if (seenForA?.has(b) || seenForB?.has(a)) {
    return true
  }

  const updatedA = seenForA ?? new WeakSet<object>()
  updatedA.add(b)
  if (!seenForA) {
    seen.set(a, updatedA)
  }

  const updatedB = seenForB ?? new WeakSet<object>()
  updatedB.add(a)
  if (!seenForB) {
    seen.set(b, updatedB)
  }

  return false
}

function deepEqualInternal(a: AssertionValue, b: AssertionValue, seen: SeenPairs): boolean {
  // Handle primitives and null
  if (a === b) return true
  if (a === null || b === null) return false
  if (a === undefined || b === undefined) return a === b

  // Handle different types
  const typeA = getValueType(a)
  const typeB = getValueType(b)
  if (typeA !== typeB) return false

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (hasSeenPair(a, b, seen)) {
      return true
    }

    if (a.length !== b.length) return false

    return a.every((val, idx) =>
      deepEqualInternal(val as AssertionValue, b[idx] as AssertionValue, seen),
    )
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    if (hasSeenPair(a as object, b as object, seen)) {
      return true
    }

    const objA = a as Record<string, unknown>
    const objB = b as Record<string, unknown>
    const keysA = Object.keys(objA)
    const keysB = Object.keys(objB)

    if (keysA.length !== keysB.length) return false

    return keysA.every((key) =>
      deepEqualInternal(objA[key] as AssertionValue, objB[key] as AssertionValue, seen),
    )
  }

  return false
}

/**
 * Checks if a diff should be generated for the given values
 */
export function shouldGenerateDiff(expected: AssertionValue, actual: AssertionValue): boolean {
  // Don't generate diff if values are equal
  if (deepEqual(expected, actual)) {
    return false
  }

  // Don't generate diff for undefined values
  if (expected === undefined && actual === undefined) {
    return false
  }

  return true
}
