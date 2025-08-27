/**
 * Shared truncation utilities
 *
 * Common functions used by truncation strategies for text manipulation,
 * boundary detection, and content analysis.
 */

import type { SafeTrimOptions } from './types.js'

/**
 * Safely trim text to target character count
 *
 * @param text - Text to trim
 * @param targetChars - Target character count
 * @param opts - Trimming options
 * @returns Trimmed text
 */
export function safeTrimToChars(
  text: string,
  targetChars: number,
  opts: SafeTrimOptions = {}
): string {
  const { preferBoundaries = true, safety = 0.1 } = opts

  if (text.length <= targetChars) {
    return text
  }

  // Apply safety margin
  const safeTarget = Math.floor(targetChars * (1 - safety))
  let trimmed = text.substring(0, safeTarget)

  if (preferBoundaries && safeTarget > 100) {
    // Try to find a natural boundary
    const lastSpace = trimmed.lastIndexOf(' ')
    const lastNewline = trimmed.lastIndexOf('\n')
    const lastSentence = trimmed.lastIndexOf('.')
    const lastComma = trimmed.lastIndexOf(',')

    const boundary = Math.max(lastSpace, lastNewline, lastSentence, lastComma)

    // Only use boundary if it's not too far back (at least 80% of target)
    if (boundary > safeTarget * 0.8) {
      trimmed = text.substring(0, boundary + 1)
    }
  }

  return trimmed
}

/**
 * Join text chunks with ellipsis
 *
 * @param chunks - Text chunks to join
 * @param ellipsis - Ellipsis separator
 * @returns Joined text
 */
export function joinWithEllipsis(chunks: string[], ellipsis = '...'): string {
  return chunks.filter((chunk) => chunk && chunk.trim()).join(ellipsis)
}

/**
 * Check if a line appears to be a stack frame
 *
 * @param line - Line to check
 * @returns True if line looks like a stack frame
 */
export function isStackFrameLine(line: string): boolean {
  // Common stack frame patterns
  return (
    /^\s*at\s+/.test(line) || // Node.js/V8 style
    /^\s*↳\s+/.test(line) || // Some test frameworks
    /^\s*[├└│]\s*/.test(line) || // Tree-style frames
    /^\s*\d+\)\s+/.test(line) || // Numbered frames
    /^\s*#\d+\s+/.test(line) || // Hash-numbered frames
    /^[\s\S]*:\d+:\d+/.test(line) // File:line:column pattern
  )
}

/**
 * Check if a line appears to be an error message
 *
 * @param line - Line to check
 * @returns True if line looks like an error message
 */
export function isErrorMessageLine(line: string): boolean {
  return (
    /^(Error|TypeError|ReferenceError|SyntaxError|RangeError|AssertionError):/.test(line) ||
    /^[A-Z]\w*Error:/.test(line) || // Any error type
    /^\s*(Expected|Received|Actual|Assert)/.test(line) || // Assertion patterns
    /^(FAIL|FAILED|✖|✗|×)/.test(line) // Test failure markers
  )
}

/**
 * Check if a path is user code (not node_modules or internals)
 *
 * @param path - File path to check
 * @returns True if path appears to be user code
 */
export function isUserCodePath(path: string): boolean {
  return (
    !path.includes('node_modules') &&
    !path.includes('internal/') &&
    !path.includes('<anonymous>') &&
    !path.includes('[native code]') &&
    !path.startsWith('node:') &&
    !path.startsWith('async ') &&
    !path.startsWith('timers.')
  )
}

/**
 * Check if a line contains priority keywords
 *
 * @param line - Line to check
 * @returns True if line contains priority keywords
 */
export function hasPriorityKeyword(line: string): boolean {
  const keywords = [
    // Error keywords
    'error',
    'fail',
    'failure',
    'exception',
    'throw',
    'crash',
    'fatal',
    // Assertion keywords
    'assert',
    'expect',
    'should',
    'must',
    'require',
    // Testing keywords
    'test',
    'describe',
    'it(',
    'spec',
    'scenario',
    // Important markers
    'warning',
    'critical',
    'important',
    'bug',
    'issue',
    'problem'
  ]

  const lowerLine = line.toLowerCase()
  return keywords.some((keyword) => lowerLine.includes(keyword))
}

/**
 * Handle tiny token limits with minimal deterministic output
 *
 * @param maxTokens - Maximum token limit
 * @param content - Original content
 * @returns Minimal truncated content
 */
export function handleTinyLimit(maxTokens: number, content: string): string {
  if (maxTokens < 5) {
    return '...'
  }

  if (maxTokens < 10) {
    // Try to include first error message or key info
    const lines = content.split('\n')
    const errorLine = lines.find((line) => isErrorMessageLine(line))
    if (errorLine) {
      return safeTrimToChars(errorLine, maxTokens * 3, { preferBoundaries: false }) + '...'
    }
    return safeTrimToChars(content, maxTokens * 3, { preferBoundaries: false }) + '...'
  }

  // For slightly larger limits, include a bit more context
  const targetChars = maxTokens * 3 // Rough approximation
  const trimmed = safeTrimToChars(content, targetChars - 10, { safety: 0.2 })
  return trimmed + '\n...[cut]'
}

/**
 * Extract lines around matches with context
 *
 * @param lines - All lines
 * @param matchIndices - Indices of matching lines
 * @param contextLines - Number of context lines before/after
 * @returns Selected line indices with context
 */
export function extractLinesWithContext(
  lines: string[],
  matchIndices: number[],
  contextLines = 1
): number[] {
  const selected = new Set<number>()

  for (const idx of matchIndices) {
    // Add the matching line
    selected.add(idx)

    // Add context before
    for (let i = Math.max(0, idx - contextLines); i < idx; i++) {
      selected.add(i)
    }

    // Add context after
    for (let i = idx + 1; i <= Math.min(lines.length - 1, idx + contextLines); i++) {
      selected.add(i)
    }
  }

  return Array.from(selected).sort((a, b) => a - b)
}

/**
 * Split content into head and tail portions
 *
 * @param content - Content to split
 * @param headRatio - Ratio for head portion (0-1)
 * @param tailRatio - Ratio for tail portion (0-1)
 * @returns Object with head and tail portions
 */
export function splitHeadTail(
  content: string,
  headRatio = 0.4,
  tailRatio = 0.4
): { head: string; tail: string } {
  const lines = content.split('\n')
  const totalLines = lines.length

  if (totalLines <= 2) {
    return { head: content, tail: '' }
  }

  const headLines = Math.max(1, Math.floor(totalLines * headRatio))
  const tailLines = Math.max(1, Math.floor(totalLines * tailRatio))

  const head = lines.slice(0, headLines).join('\n')
  const tail = lines.slice(-tailLines).join('\n')

  return { head, tail }
}

/**
 * Estimate character count for target tokens
 *
 * @param targetTokens - Target token count
 * @param avgCharsPerToken - Average characters per token (default: 3.5)
 * @returns Estimated character count
 */
export function estimateCharsForTokens(targetTokens: number, avgCharsPerToken = 3.5): number {
  return Math.floor(targetTokens * avgCharsPerToken)
}

/**
 * Truncate a stack trace preserving important frames
 *
 * @param stack - Stack trace string
 * @param maxFrames - Maximum number of frames to keep
 * @param prioritizeUserCode - Whether to prioritize user code frames
 * @returns Truncated stack trace
 */
export function truncateStackTrace(
  stack: string,
  maxFrames: number,
  prioritizeUserCode = true
): string {
  const lines = stack.split('\n')
  const headerLines: string[] = []
  const userFrames: string[] = []
  const nodeModulesFrames: string[] = []
  const otherFrames: string[] = []

  for (const line of lines) {
    if (isErrorMessageLine(line)) {
      headerLines.push(line)
    } else if (isStackFrameLine(line)) {
      if (isUserCodePath(line)) {
        userFrames.push(line)
      } else if (line.includes('node_modules')) {
        nodeModulesFrames.push(line)
      } else {
        otherFrames.push(line)
      }
    }
  }

  const result: string[] = [...headerLines]
  let frameCount = 0

  // Add user frames first if prioritizing
  if (prioritizeUserCode) {
    const userFramesToAdd = Math.min(userFrames.length, maxFrames)
    result.push(...userFrames.slice(0, userFramesToAdd))
    frameCount += userFramesToAdd
  }

  // Add other frames if we have room
  if (frameCount < maxFrames) {
    const otherFramesToAdd = Math.min(otherFrames.length, maxFrames - frameCount)
    result.push(...otherFrames.slice(0, otherFramesToAdd))
    frameCount += otherFramesToAdd
  }

  // Add node_modules frames if still room
  if (frameCount < maxFrames && nodeModulesFrames.length > 0) {
    const nodeFramesToAdd = Math.min(nodeModulesFrames.length, maxFrames - frameCount)
    result.push(...nodeModulesFrames.slice(0, nodeFramesToAdd))
    frameCount += nodeFramesToAdd
  }

  // Add indicator if frames were omitted
  const totalFrames = userFrames.length + nodeModulesFrames.length + otherFrames.length
  if (totalFrames > frameCount) {
    result.push(`    ... ${totalFrames - frameCount} frames omitted`)
  }

  return result.join('\n')
}

/**
 * Truncate code context around a specific line
 *
 * @param code - Code lines array
 * @param lineNumber - Target line number (0-based)
 * @param contextLines - Number of lines before/after to include
 * @returns Truncated code context
 */
export function truncateCodeContext(
  code: string[],
  lineNumber?: number,
  contextLines = 2
): string[] {
  if (!code || code.length === 0) {
    return []
  }

  // If no line number, just return first few lines
  if (lineNumber === undefined || lineNumber < 0) {
    return code.slice(0, Math.min(contextLines * 2 + 1, code.length))
  }

  const startLine = Math.max(0, lineNumber - contextLines)
  const endLine = Math.min(code.length, lineNumber + contextLines + 1)

  const result = code.slice(startLine, endLine)

  // Add indicators if truncated
  if (startLine > 0) {
    result.unshift('...')
  }
  if (endLine < code.length) {
    result.push('...')
  }

  return result
}

/**
 * Truncate assertion details (expected/actual values)
 *
 * @param value - Value to truncate
 * @param maxChars - Maximum characters
 * @returns Truncated value preserving type when possible
 */
export function truncateAssertionValue(value: unknown, maxChars = 200): unknown {
  // Preserve primitive types unchanged
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value // Never truncate primitives
  }

  if (typeof value === 'string') {
    if (value.length <= maxChars) {
      return value
    }
    return safeTrimToChars(value, maxChars - 3) + '...'
  }

  // For arrays and objects, we need to truncate
  if (Array.isArray(value) || typeof value === 'object') {
    try {
      const str = JSON.stringify(value, null, 2)

      if (str.length <= maxChars) {
        return value // Return original if within limits
      }

      // For truncated complex values, return a truncated string representation
      // This is a compromise - we lose type but show structure
      if (str.startsWith('{') || str.startsWith('[')) {
        const truncated = str.substring(0, maxChars - 10)
        const lastNewline = truncated.lastIndexOf('\n')
        if (lastNewline > maxChars * 0.5) {
          return (
            truncated.substring(0, lastNewline) + '\n  ...\n' + (str.startsWith('{') ? '}' : ']')
          )
        }
      }

      return safeTrimToChars(str, maxChars - 3) + '...'
    } catch {
      // For objects without proper toString, provide a fallback
      return '[object]'
    }
  }

  // For functions, symbols, etc.
  return String(value)
}

/**
 * Apply fair caps across multiple items
 *
 * @param items - Items to cap
 * @param totalBudget - Total character budget
 * @param minPerItem - Minimum characters per item
 * @returns Capped items
 */
export function applyFairCaps(items: string[], totalBudget: number, minPerItem = 100): string[] {
  if (items.length === 0) return []

  const fairShare = Math.max(minPerItem, Math.floor(totalBudget / items.length))
  const result: string[] = []
  let remainingBudget = totalBudget

  for (const item of items) {
    if (remainingBudget <= 0) break

    const itemBudget = Math.min(fairShare, remainingBudget)
    if (item.length <= itemBudget) {
      result.push(item)
      remainingBudget -= item.length
    } else {
      const truncated = safeTrimToChars(item, itemBudget - 10) + '\n...[cut]'
      result.push(truncated)
      remainingBudget -= truncated.length
    }
  }

  return result
}

/**
 * Truncate console output by category
 *
 * @param console - Console output object
 * @param limits - Character limits per category
 * @returns Truncated console output
 */
export function truncateConsoleOutput(
  console: Record<string, string[]>,
  limits: Record<string, number>
): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  for (const [category, logs] of Object.entries(console)) {
    if (!Array.isArray(logs) || logs.length === 0) continue

    const limit = limits[category] || 1000
    const combined = logs.join('\n')

    if (combined.length <= limit) {
      result[category] = logs
    } else {
      // Truncate and preserve some structure
      const truncated = safeTrimToChars(combined, limit - 20, { preferBoundaries: true })
      result[category] = [truncated + '\n...[truncated]']
    }
  }

  return result
}
