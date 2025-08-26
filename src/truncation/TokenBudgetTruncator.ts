/**
 * Token Budget Truncator
 *
 * Simple character-based truncation with head/tail preservation
 *
 * @module truncation
 */

/**
 * Options for truncation
 */
export interface TruncateOptions {
  /** Number of characters to preserve from the start (defaults to 60% of max) */
  head?: number
  /** Number of characters to preserve from the end (defaults to remaining after head and marker) */
  tail?: number
  /** Marker to insert between head and tail (defaults to " … ") */
  marker?: string
}

/**
 * Token Budget Truncator
 *
 * Provides simple, efficient truncation that preserves
 * the beginning and end of text for context.
 */
export class TokenBudgetTruncator {
  /**
   * Truncate text to a maximum character limit
   *
   * @param text - The text to truncate
   * @param max - Maximum number of characters
   * @param options - Truncation options
   * @returns Truncated text
   */
  public truncate(text: string, max: number, options?: TruncateOptions): string {
    // Return as-is if under limit
    if (text.length <= max) {
      return text
    }

    // Ensure max is reasonable
    if (max < 10) {
      return text.substring(0, max)
    }

    // Configure options with defaults
    const marker = options?.marker ?? ' … '
    const markerLength = marker.length

    // Ensure we have room for marker
    if (max <= markerLength) {
      return text.substring(0, max)
    }

    // Calculate head and tail sizes
    const availableForContent = max - markerLength
    const head = options?.head ?? Math.floor(availableForContent * 0.6)
    const tail = options?.tail ?? availableForContent - head

    // Validate head/tail don't exceed available space
    const actualHead = Math.min(head, availableForContent)
    const actualTail = Math.min(tail, availableForContent - actualHead)

    // Extract head and tail portions
    const headText = text.substring(0, actualHead)
    const tailText = actualTail > 0 ? text.substring(text.length - actualTail) : ''

    return headText + marker + tailText
  }

  /**
   * Check if text needs truncation
   *
   * @param text - The text to check
   * @param max - Maximum number of characters
   * @returns True if text exceeds max
   */
  public needsTruncation(text: string, max: number): boolean {
    return text.length > max
  }
}
