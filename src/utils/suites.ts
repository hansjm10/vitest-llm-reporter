/**
 * Suite Utilities
 *
 * Shared utilities for working with Vitest suite hierarchies
 *
 * @module utils/suites
 */

import { isStringArray } from './type-guards.js'
import type { VitestSuite } from '../types/reporter-internal.js'

/**
 * Extracts suite names from a Vitest suite object or array
 * 
 * Handles two formats:
 * 1. String array (already processed)
 * 2. Vitest suite object hierarchy (needs traversal)
 * 
 * @param suite - The suite data (array or object)
 * @returns Array of suite names from parent to child, or undefined
 */
export function extractSuiteNames(suite: unknown): string[] | undefined {
  // Handle case where suite is already a string array
  if (isStringArray(suite)) {
    return suite
  }

  // Handle Vitest suite object structure
  if (suite && typeof suite === 'object') {
    const names: string[] = []
    let current = suite as VitestSuite

    // Traverse up the suite hierarchy collecting names
    while (current && typeof current === 'object') {
      if (current.name && typeof current.name === 'string') {
        // Add to beginning since we're traversing from child to parent
        names.unshift(current.name)
      }
      current = current.suite as VitestSuite
    }

    return names.length > 0 ? names : undefined
  }

  return undefined
}