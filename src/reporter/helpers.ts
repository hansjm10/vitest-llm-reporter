/**
 * Reporter Helper Functions
 *
 * Utility functions used by the LLM Reporter implementation.
 *
 * @module reporter-helpers
 */

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
