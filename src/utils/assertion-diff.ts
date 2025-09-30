/**
 * Assertion Diff Analyzer
 *
 * Provides structured analysis of differences between expected and actual values
 * in test assertions, optimized for LLM consumption.
 *
 * @module utils
 */

import type { AssertionValue, ComparisonInsights, DiffPath } from '../types/schema.js'

/**
 * Maximum depth to traverse when comparing nested structures
 */
const MAX_DEPTH = 10

/**
 * Maximum number of diff paths to report
 */
const MAX_DIFF_PATHS = 20

/**
 * Analyzes differences between expected and actual assertion values
 * Returns structured insights for LLM-friendly consumption
 *
 * @param expected - Expected value from assertion
 * @param actual - Actual value from assertion
 * @returns Comparison insights or undefined if analysis not applicable
 */
export function analyzeAssertionDiff(
  expected: AssertionValue,
  actual: AssertionValue
): ComparisonInsights | undefined {
  // Try to parse as JSON if they're strings (do this before primitive check)
  const expectedParsed = tryParseJSON(expected)
  const actualParsed = tryParseJSON(actual)

  // If both parsed successfully, do deep comparison
  if (expectedParsed !== null && actualParsed !== null) {
    return analyzeDeepDiff(expectedParsed, actualParsed)
  }

  // If we have actual objects/arrays (not stringified), compare them
  if (
    typeof expected === 'object' &&
    expected !== null &&
    typeof actual === 'object' &&
    actual !== null
  ) {
    return analyzeDeepDiff(expected, actual)
  }

  // Handle null/undefined vs object comparisons
  if (
    (expected === null || expected === undefined) &&
    typeof actual === 'object' &&
    actual !== null
  ) {
    return analyzeDeepDiff(expected, actual)
  }
  if (
    (actual === null || actual === undefined) &&
    typeof expected === 'object' &&
    expected !== null
  ) {
    return analyzeDeepDiff(expected, actual)
  }

  // Skip analysis for simple values - they're already clear in the assertion block
  if (isSimpleValue(expected) && isSimpleValue(actual)) {
    return undefined
  }

  // For complex strings or mixed types, use string analysis
  return analyzeStringDiff(expected, actual)
}

/**
 * Checks if a value is a primitive type (used internally)
 */
function isPrimitive(value: AssertionValue): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

/**
 * Checks if a value is simple enough that it doesn't need diff analysis
 * Simple values are already clear in the assertion block
 */
function isSimpleValue(value: AssertionValue): boolean {
  // Numbers, booleans, null, undefined are always simple
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }

  // Strings are simple if they're short and single-line
  if (typeof value === 'string') {
    // Multi-line strings or long strings benefit from analysis
    return value.length < 100 && !value.includes('\n')
  }

  // Objects and arrays are not simple
  return false
}

/**
 * Attempts to parse a value as JSON or Vitest-formatted object
 * Returns parsed object or null if parsing fails
 */
function tryParseJSON(value: AssertionValue): unknown {
  if (typeof value !== 'string') {
    return null
  }

  // Try standard JSON first
  try {
    return JSON.parse(value)
  } catch {
    // If that fails, try parsing Vitest's pretty-print format
    return tryParseVitestFormat(value)
  }
}

/**
 * Attempts to parse Vitest's pretty-print format back to a JSON object
 * Format: Object { "key": value, ... } or Array [ item1, item2 ]
 */
function tryParseVitestFormat(value: string): unknown {
  if (typeof value !== 'string') {
    return null
  }

  try {
    // Convert Vitest format to JSON:
    // 1. Replace "Object {" with "{"
    // 2. Replace "Array [" with "["
    // 3. Remove trailing commas before } and ]
    let jsonStr = value
      .replace(/Object\s*\{/g, '{')
      .replace(/Array\s*\[/g, '[')
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas

    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/**
 * Performs deep comparison of two values and extracts diff insights
 */
function analyzeDeepDiff(expected: unknown, actual: unknown): ComparisonInsights {
  const diffPaths: DiffPath[] = []
  const missingKeys: string[] = []
  const extraKeys: string[] = []
  let lengthMismatch: { expected: number; actual: number } | undefined
  const state = { truncated: false }

  // Recursive comparison
  compareValues(expected, actual, '', diffPaths, missingKeys, extraKeys, 0, state)

  // Check for array length mismatch
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      lengthMismatch = {
        expected: expected.length,
        actual: actual.length
      }
    }
  }

  // Limit the number of reported differences
  const limitedDiffPaths = diffPaths.slice(0, MAX_DIFF_PATHS)

  // Generate summary
  const summary = generateSummary({
    changedPaths: limitedDiffPaths,
    missingKeys,
    extraKeys,
    lengthMismatch,
    hasMore: state.truncated
  })

  return {
    summary,
    ...(limitedDiffPaths.length > 0 && { changedPaths: limitedDiffPaths }),
    ...(missingKeys.length > 0 && { missingKeys }),
    ...(extraKeys.length > 0 && { extraKeys }),
    ...(lengthMismatch && { lengthMismatch })
  }
}

/**
 * Recursively compares two values and collects differences
 */
function compareValues(
  expected: unknown,
  actual: unknown,
  path: string,
  diffPaths: DiffPath[],
  missingKeys: string[],
  extraKeys: string[],
  depth: number,
  state: { truncated: boolean }
): void {
  // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    return
  }

  // Stop collecting if we have too many diffs, but mark as truncated
  if (diffPaths.length >= MAX_DIFF_PATHS) {
    state.truncated = true
    return
  }

  // Handle primitive comparisons
  if (isPrimitive(expected as AssertionValue) || isPrimitive(actual as AssertionValue)) {
    if (expected !== actual) {
      diffPaths.push({
        path: path || '(root)',
        expected: normalizeForDiff(expected),
        actual: normalizeForDiff(actual)
      })
    }
    return
  }

  // Handle array comparisons
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLength = Math.max(expected.length, actual.length)
    for (let i = 0; i < maxLength; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`

      if (i >= expected.length) {
        extraKeys.push(itemPath)
      } else if (i >= actual.length) {
        missingKeys.push(itemPath)
      } else {
        compareValues(
          expected[i],
          actual[i],
          itemPath,
          diffPaths,
          missingKeys,
          extraKeys,
          depth + 1,
          state
        )
      }
    }
    return
  }

  // Handle object comparisons
  if (
    typeof expected === 'object' &&
    expected !== null &&
    typeof actual === 'object' &&
    actual !== null &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const expectedObj = expected as Record<string, unknown>
    const actualObj = actual as Record<string, unknown>

    const expectedKeys = Object.keys(expectedObj)
    const actualKeys = Object.keys(actualObj)
    const allKeys = new Set([...expectedKeys, ...actualKeys])

    for (const key of allKeys) {
      const propPath = path ? `${path}.${key}` : key

      if (!(key in actualObj)) {
        missingKeys.push(propPath)
      } else if (!(key in expectedObj)) {
        extraKeys.push(propPath)
      } else {
        compareValues(
          expectedObj[key],
          actualObj[key],
          propPath,
          diffPaths,
          missingKeys,
          extraKeys,
          depth + 1,
          state
        )
      }
    }
    return
  }

  // Type mismatch or other difference
  if (expected !== actual) {
    diffPaths.push({
      path: path || '(root)',
      expected: normalizeForDiff(expected),
      actual: normalizeForDiff(actual)
    })
  }
}

/**
 * Normalizes a value for inclusion in diff output
 */
function normalizeForDiff(value: unknown): AssertionValue {
  if (value === null || value === undefined) {
    return value as AssertionValue
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'function') {
    return '[Function]'
  }

  if (typeof value === 'symbol') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value as unknown[]
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>
  }

  // For any other type (bigint, etc), convert to string
  // At this point, value cannot be an object, so it's safe to stringify
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value)
}

/**
 * Analyzes string-based diffs (fallback for unparseable values)
 */
function analyzeStringDiff(expected: AssertionValue, actual: AssertionValue): ComparisonInsights {
  // Convert to string representation, handling objects/arrays
  const expectedStr =
    typeof expected === 'object' && expected !== null ? JSON.stringify(expected) : String(expected)
  const actualStr =
    typeof actual === 'object' && actual !== null ? JSON.stringify(actual) : String(actual)

  // Simple character diff
  let diffCount = 0
  const minLength = Math.min(expectedStr.length, actualStr.length)

  for (let i = 0; i < minLength; i++) {
    if (expectedStr[i] !== actualStr[i]) {
      diffCount++
    }
  }

  // Add length difference
  diffCount += Math.abs(expectedStr.length - actualStr.length)

  const summary = `Values differ (${diffCount} character${diffCount !== 1 ? 's' : ''} different)`

  return { summary }
}

/**
 * Generates a human-readable summary of the comparison insights
 */
function generateSummary(data: {
  changedPaths?: DiffPath[]
  missingKeys?: string[]
  extraKeys?: string[]
  lengthMismatch?: { expected: number; actual: number }
  hasMore?: boolean
}): string {
  const parts: string[] = []

  const totalDiffs =
    (data.changedPaths?.length || 0) +
    (data.missingKeys?.length || 0) +
    (data.extraKeys?.length || 0)

  if (totalDiffs === 0) {
    return 'Values are equal'
  }

  if (data.changedPaths && data.changedPaths.length > 0) {
    const pathCount = data.changedPaths.length
    const pathList = data.changedPaths.map((d) => d.path).join(', ')
    parts.push(`${pathCount} field${pathCount !== 1 ? 's' : ''} differ: ${pathList}`)
  }

  if (data.missingKeys && data.missingKeys.length > 0) {
    parts.push(`${data.missingKeys.length} missing: ${data.missingKeys.join(', ')}`)
  }

  if (data.extraKeys && data.extraKeys.length > 0) {
    parts.push(`${data.extraKeys.length} extra: ${data.extraKeys.join(', ')}`)
  }

  if (data.lengthMismatch) {
    parts.push(`array length ${data.lengthMismatch.expected} → ${data.lengthMismatch.actual}`)
  }

  let summary = parts.join('; ')

  if (data.hasMore) {
    summary += ' (truncated)'
  }

  return summary
}
