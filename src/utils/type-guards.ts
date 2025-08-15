/**
 * Type Guards and Safe Property Access
 *
 * Type-safe utilities for working with Vitest's untyped objects
 *
 * @module type-guards
 */

import type { File, Test } from '@vitest/runner'
import { ExtractedError, VitestErrorContext } from '../types/vitest-objects'
import type { AssertionValue } from '../types/schema'

export type { ExtractedError } from '../types/vitest-objects'

/**
 * Type guard to check if a value is an object with a specific property
 */
export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return obj !== null && typeof obj === 'object' && key in obj
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
