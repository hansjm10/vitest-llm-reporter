import type { ConsoleMethod, ConsoleBufferConfig } from '../types/console.js'
import type { ConsoleEvent, ConsoleLevel } from '../types/schema.js'
import { formatConsoleArgs } from '../utils/console-formatter.js'

/**
 * Console Buffer
 *
 * Manages console output for a single test with byte-based size limits
 * and safe serialization of complex objects.
 *
 * @module utils/console-buffer
 */

const DEFAULT_CONFIG: Required<ConsoleBufferConfig> = {
  maxBytes: 50_000, // 50KB
  maxLines: 100,
  includeTimestamp: false,
  stripAnsi: true
}

/**
 * Manages console output buffer for a single test
 */
export class ConsoleBuffer {
  private events: ConsoleEvent[] = []
  private totalBytes = 0
  private config: Required<ConsoleBufferConfig>
  private truncated = false
  private deduplicationKeys = new Set<string>()

  constructor(config: ConsoleBufferConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Add a console output entry
   */
  add(
    method: ConsoleMethod,
    args: unknown[],
    timestamp?: number,
    origin: 'intercepted' | 'task' = 'intercepted',
    isDuplicate?: boolean,
    deduplicationKey?: string,
    testId?: string
  ): boolean {
    // Check if we've already hit limits
    if (this.truncated) {
      return false
    }

    if (deduplicationKey) {
      const hasKey = this.deduplicationKeys.has(deduplicationKey)

      if (hasKey) {
        // We've already recorded this message for this buffer. Skip duplicates.
        return false
      }

      // Record key so future duplicates are ignored
      this.deduplicationKeys.add(deduplicationKey)

      // If the deduplicator classified this call as a duplicate, drop it now that we've
      // recorded the key to keep future checks consistent.
      if (isDuplicate) {
        return false
      }
    }

    const { serializedArgs, message } = formatConsoleArgs(args)

    // Strip ANSI codes if configured
    const text = this.config.stripAnsi ? this.stripAnsiCodes(message) : message

    // Check byte limit (based on text content)
    const bytes = Buffer.byteLength(text, 'utf8')
    if (this.totalBytes + bytes > this.config.maxBytes) {
      this.addTruncationEvent()
      return false
    }

    // Check line/event limit
    if (this.events.length >= this.config.maxLines) {
      this.addTruncationEvent()
      return false
    }

    // Map console method to level (trace becomes debug)
    const level: ConsoleLevel = method

    // Create the event
    const event: ConsoleEvent = {
      level,
      text,
      origin
    }

    // Add timestamp if available
    if (timestamp !== undefined) {
      event.timestampMs = timestamp
    }

    if (testId) {
      event.testId = testId
    }

    // Add args if they provide value beyond text
    if (args.length > 1 || (args.length === 1 && typeof args[0] === 'object')) {
      event.args = serializedArgs
    }

    // Add the event
    this.events.push(event)
    this.totalBytes += bytes

    return true
  }

  /**
   * Strip ANSI escape codes from a string
   */
  private stripAnsiCodes(str: string): string {
    // Regex to match ANSI escape codes
    // eslint-disable-next-line no-control-regex -- ANSI escape codes require control characters
    const ansiRegex = /\u001B\[[0-9;]*m/g
    return str.replace(ansiRegex, '')
  }

  /**
   * Add a truncation event
   */
  private addTruncationEvent(): void {
    if (!this.truncated) {
      const event: ConsoleEvent = {
        level: 'warn',
        text: '[Console output truncated - limit reached]'
      }
      this.events.push(event)
      this.truncated = true
    }
  }

  /**
   * Get the console events
   */
  getEvents(): ConsoleEvent[] {
    return [...this.events] // Return a copy
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.events = []
    this.totalBytes = 0
    this.truncated = false
    this.deduplicationKeys.clear()
  }

  /**
   * Get current buffer statistics
   */
  getStats(): { bytes: number; events: number; truncated: boolean } {
    return {
      bytes: this.totalBytes,
      events: this.events.length,
      truncated: this.truncated
    }
  }

  /**
   * Flush buffer contents
   */
  flush(): ConsoleEvent[] {
    return this.getEvents()
  }
}
