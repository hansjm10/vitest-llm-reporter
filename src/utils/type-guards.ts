/**
 * Type Guards and Safe Property Access
 *
 * Type-safe utilities for working with Vitest's untyped objects
 *
 * @module type-guards
 */

import type { File, Test } from '@vitest/runner'
import type { ConsoleMethod } from '../types/console.js'
import { ExtractedError, VitestErrorContext } from '../types/vitest-objects.js'
import type { AssertionValue } from '../types/schema.js'

export type { ExtractedError } from '../types/vitest-objects'

// ============================================================================
// Safe Property Access Helpers (Internal)
// ============================================================================

/**
 * Check if value is a plain object (not null, not array)
 * Used internally for safe property operations
 */
function isPlainObject(value: unknown): value is object {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Safely check if an object has a property using Object.prototype.hasOwnProperty
 * Protects against null prototype objects and Proxy traps
 * Only checks own properties, not prototype chain
 */
function safeHasProperty(obj: object, key: string): boolean {
  try {
    // Only check own properties, not prototype chain
    return Object.prototype.hasOwnProperty.call(obj, key)
  } catch {
    // Proxy trap or other error - treat as not having property
    return false
  }
}

/**
 * Safely get a property value from an object
 * Protects against throwing getters and Proxy traps
 */
function safeGetProperty(obj: object, key: string): unknown {
  try {
    // Only access if property exists
    if (safeHasProperty(obj, key)) {
      return (obj as Record<string, unknown>)[key]
    }
    return undefined
  } catch {
    // Property getter threw
    return undefined
  }
}

// ============================================================================
// Public Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if a value is an object with a specific property
 */
export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  if (!isPlainObject(obj)) {
    return false
  }
  return safeHasProperty(obj, key)
}

/**
 * Type guard to check if a value is an array of strings
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Type guard to check if a value has an id property
 */
export function hasId(obj: unknown): obj is { id: string } {
  return hasProperty(obj, 'id') && typeof obj.id === 'string'
}

/**
 * Type guard for Vitest File objects
 *
 * While Vitest exports the File type, we receive these as `unknown`
 * in reporter hooks and must validate their shape at runtime.
 */
export function isTestModule(obj: unknown): obj is Pick<File, 'id'> {
  return hasId(obj)
}

/**
 * Type guard for Vitest Test objects
 *
 * While Vitest exports the Test type, we receive these as `unknown`
 * in reporter hooks and must validate their shape at runtime.
 */
export function isTestCase(obj: unknown): obj is Pick<Test, 'id'> {
  return hasId(obj)
}

/**
 * Type guard for console method strings
 */
export function isConsoleMethod(value: unknown): value is ConsoleMethod {
  if (typeof value !== 'string') return false
  switch (value) {
    case 'log':
    case 'error':
    case 'warn':
    case 'info':
    case 'debug':
    case 'trace':
      return true
    default:
      return false
  }
}

/**
 * Safely extract error properties with proper validation
 */
export function extractErrorProperties(error: unknown): ExtractedError {
  if (!error || typeof error !== 'object') {
    return {}
  }

  const result: ExtractedError = {}

  // Extract string properties
  const stringProps = ['message', 'name', 'type', 'stack'] as const
  for (const prop of stringProps) {
    if (prop in error) {
      const errorWithProp = error as Record<typeof prop, unknown>
      const value = errorWithProp[prop]
      if (typeof value === 'string') {
        result[prop] = value
      }
    }
  }

  // Extract comparison values (can be any type)
  if ('expected' in error) {
    result.expected = (error as Record<'expected', unknown>).expected
  }
  if ('actual' in error) {
    result.actual = (error as Record<'actual', unknown>).actual
  }

  // Extract line number
  if ('lineNumber' in error) {
    const lineNumber = (error as Record<'lineNumber', unknown>).lineNumber
    if (typeof lineNumber === 'number') {
      result.lineNumber = lineNumber
    }
  }

  // Extract constructor name
  if ('constructor' in error) {
    const constructor = (error as Record<'constructor', unknown>).constructor
    if (constructor && typeof constructor === 'object' && 'name' in constructor) {
      const name = (constructor as Record<'name', unknown>).name
      if (typeof name === 'string') {
        result.constructorName = name
      }
    }
  }

  // Extract context if it exists
  if ('context' in error) {
    const context = (error as Record<'context', unknown>).context
    if (context && typeof context === 'object') {
      const extractedContext: VitestErrorContext = {}
      const contextObj = context as Record<string, unknown>

      if ('code' in contextObj && typeof contextObj.code === 'string') {
        extractedContext.code = contextObj.code
      }
      if ('line' in contextObj && typeof contextObj.line === 'number') {
        extractedContext.line = contextObj.line
      }
      if ('column' in contextObj && typeof contextObj.column === 'number') {
        extractedContext.column = contextObj.column
      }

      // Only add context if it has at least one property
      if (Object.keys(extractedContext).length > 0) {
        result.context = extractedContext
      }
    }
  }

  return result
}

/**
 * Type guard to check if an error is an assertion error
 * (has expected or actual values for comparison)
 */
export function isAssertionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const errorObj = error as Record<string, unknown>
  return 'expected' in errorObj || 'actual' in errorObj
}

/**
 * Normalizes assertion values to schema-compatible types
 * Handles various JavaScript types and converts them to a format
 * that can be safely serialized and stored in the test results
 */
export function normalizeAssertionValue(value: unknown): AssertionValue {
  // Handle primitive types directly
  if (value === null || value === undefined) {
    return value as AssertionValue
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value as unknown[]
  }

  // Handle objects
  if (typeof value === 'object') {
    return value as Record<string, unknown>
  }

  // Fallback: convert to string representation
  try {
    return JSON.stringify(value)
  } catch {
    return '[object]'
  }
}

/**
 * Assert that an object has a required property
 * Throws a descriptive error if the property is missing
 */
export function assertHasProperty<K extends string>(
  obj: unknown,
  key: K,
  context: string
): asserts obj is Record<K, unknown> {
  if (!hasProperty(obj, key)) {
    throw new Error(`Missing required property "${key}" in ${context}`)
  }
}

/**
 * Safely extract a string property from an object by checking multiple candidate keys
 * Returns the first valid string value found, or undefined if none match
 */
export function extractStringProperty(
  obj: unknown,
  candidates: readonly string[]
): string | undefined {
  if (!isPlainObject(obj)) {
    return undefined
  }

  for (const key of candidates) {
    const value = safeGetProperty(obj, key)
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return undefined
}

/**
 * Safely extract a number property from an object by checking multiple candidate keys
 * Handles both number and string number values
 *
 * @param obj - Object to extract from
 * @param candidates - Property names to check
 * @param validator - Optional validation function for the number
 */
export function extractNumberProperty(
  obj: unknown,
  candidates: readonly string[],
  validator?: (n: number) => boolean
): number | undefined {
  if (!isPlainObject(obj)) {
    return undefined
  }

  for (const key of candidates) {
    const value = safeGetProperty(obj, key)

    // Handle direct number values
    if (typeof value === 'number') {
      if (!validator || validator(value)) {
        return value
      }
    }

    // Handle string numbers (some error objects store numbers as strings)
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      if (!isNaN(parsed) && (!validator || validator(parsed))) {
        return parsed
      }
    }
  }

  return undefined
}
