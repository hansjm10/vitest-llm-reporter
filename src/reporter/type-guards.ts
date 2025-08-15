/**
 * Type Guards and Safe Property Access
 * 
 * Type-safe utilities for working with Vitest's untyped objects
 * 
 * @module type-guards
 */

import type { File, Test } from '@vitest/runner'
import { 
  ExtractedError,
  VitestErrorContext 
} from '../types/vitest-objects'

export type { ExtractedError } from '../types/vitest-objects'

/**
 * Type guard to check if a value is an object with a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return obj !== null && 
         typeof obj === 'object' && 
         key in obj
}

/**
 * Type guard to check if a value has an id property
 */
export function hasId(obj: unknown): obj is { id: string } {
  return hasProperty(obj, 'id') && 
         typeof (obj as any).id === 'string'
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
      const value = (error as any)[prop]
      if (typeof value === 'string') {
        result[prop] = value
      }
    }
  }
  
  // Extract comparison values (can be any type)
  if ('expected' in error) {
    result.expected = (error as any).expected
  }
  if ('actual' in error) {
    result.actual = (error as any).actual
  }
  
  // Extract line number
  if ('lineNumber' in error) {
    const lineNumber = (error as any).lineNumber
    if (typeof lineNumber === 'number') {
      result.lineNumber = lineNumber
    }
  }
  
  // Extract constructor name
  if ('constructor' in error) {
    const constructor = (error as any).constructor
    if (constructor && typeof constructor === 'object' && 'name' in constructor) {
      const name = constructor.name
      if (typeof name === 'string') {
        result.constructorName = name
      }
    }
  }
  
  // Extract context if it exists
  if ('context' in error) {
    const context = (error as any).context
    if (context && typeof context === 'object') {
      const extractedContext: VitestErrorContext = {}
      
      if ('code' in context && typeof context.code === 'string') {
        extractedContext.code = context.code
      }
      if ('line' in context && typeof context.line === 'number') {
        extractedContext.line = context.line
      }
      if ('column' in context && typeof context.column === 'number') {
        extractedContext.column = context.column
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