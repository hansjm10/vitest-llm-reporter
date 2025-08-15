/**
 * Reporter Helper Functions
 *
 * Utility functions used by the LLM Reporter implementation.
 *
 * @module reporter-helpers
 */

/**
 * Safely access a property from an unknown object
 * @param obj - The object to access
 * @param key - The property key to access
 * @returns The property value if it exists, undefined otherwise
 */
export function getProperty<T>(obj: unknown, key: string): T | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key] as T
  }
  return undefined
}

/**
 * Extract line number from a stack trace
 * @param stack - The stack trace string
 * @returns The extracted line number, or undefined if not found
 */
export function extractLineNumber(stack?: string): number | undefined {
  if (!stack) return undefined
  const match = stack.match(/:(\d+):/)
  return match ? parseInt(match[1], 10) : undefined
}