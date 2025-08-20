import { inspect } from 'node:util'
import type { ConsoleMethod, ConsoleBufferConfig } from '../types/console'
import { bufferStreamBridge } from '../streaming/BufferStreamBridge'

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
  private entries: Map<ConsoleMethod, string[]> = new Map()
  private totalBytes = 0
  private totalLines = 0
  private config: Required<ConsoleBufferConfig>
  private truncated = false

  constructor(config: ConsoleBufferConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Initialize empty arrays for each method
    const methods: ConsoleMethod[] = ['log', 'error', 'warn', 'debug', 'info', 'trace']
    methods.forEach((method) => this.entries.set(method, []))
  }

  /**
   * Add a console output entry
   */
  add(method: ConsoleMethod, args: unknown[], timestamp?: number): boolean {
    // Check if we've already hit limits
    if (this.truncated) {
      return false
    }

    // Serialize the arguments safely
    const message = this.serialize(args)

    // Strip ANSI codes if configured
    const cleaned = this.config.stripAnsi ? this.stripAnsiCodes(message) : message

    // Add timestamp if configured
    const final =
      this.config.includeTimestamp && timestamp !== undefined
        ? `[${timestamp}ms] ${cleaned}`
        : cleaned

    // Check byte limit
    const bytes = Buffer.byteLength(final, 'utf8')
    if (this.totalBytes + bytes > this.config.maxBytes) {
      this.addTruncationMessage(method)
      return false
    }

    // Check line limit
    if (this.totalLines >= this.config.maxLines) {
      this.addTruncationMessage(method)
      return false
    }

    // Add the entry
    const methodEntries = this.entries.get(method) || []
    methodEntries.push(final)
    this.entries.set(method, methodEntries)

    this.totalBytes += bytes
    this.totalLines++

    // Stream the buffer addition in real-time if bridge is ready
    this.streamBufferAddition(method, final)

    return true
  }

  /**
   * Serialize arguments safely, handling circular references and large objects
   */
  private serialize(args: unknown[]): string {
    try {
      return args
        .map((arg) => {
          if (arg === undefined) return 'undefined'
          if (arg === null) return 'null'

          if (typeof arg === 'string') {
            // Truncate very long strings
            return arg.length > 1000 ? arg.substring(0, 1000) + '... [truncated]' : arg
          }

          if (typeof arg === 'number' || typeof arg === 'boolean') {
            return String(arg)
          }

          if (typeof arg === 'bigint') {
            return `${arg}n`
          }

          if (typeof arg === 'symbol') {
            return arg.toString()
          }

          if (typeof arg === 'function') {
            return '[Function]'
          }

          if (typeof arg === 'object') {
            // Use util.inspect for safe object serialization
            return inspect(arg, {
              depth: 3,
              compact: true,
              maxArrayLength: 10,
              maxStringLength: 200,
              breakLength: 120,
              sorted: true
            })
          }

          // Fallback for any missed types
          return '[unknown]'
        })
        .join(' ')
    } catch (_error) {
      return '[Failed to serialize console output]'
    }
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
   * Add a truncation message
   */
  private addTruncationMessage(method: ConsoleMethod): void {
    if (!this.truncated) {
      const msg = '[Console output truncated - limit reached]'
      const methodEntries = this.entries.get(method) || []
      methodEntries.push(msg)
      this.entries.set(method, methodEntries)
      this.truncated = true
    }
  }

  /**
   * Get the buffer contents organized by method
   */
  getOutput(): Record<ConsoleMethod, string[]> {
    const output: Partial<Record<ConsoleMethod, string[]>> = {}

    for (const [method, lines] of this.entries) {
      if (lines.length > 0) {
        output[method] = [...lines] // Return a copy
      }
    }

    return output as Record<ConsoleMethod, string[]>
  }

  /**
   * Get a simplified output format for JSON serialization
   */
  getSimplifiedOutput(): {
    logs?: string[]
    errors?: string[]
    warns?: string[]
    info?: string[]
    debug?: string[]
  } {
    const output: {
      logs?: string[]
      errors?: string[]
      warns?: string[]
      info?: string[]
      debug?: string[]
    } = {}

    const mapping: Record<ConsoleMethod, string> = {
      log: 'logs',
      error: 'errors',
      warn: 'warns',
      info: 'info',
      debug: 'debug',
      trace: 'debug' // Map trace to debug
    }

    for (const [method, lines] of this.entries) {
      if (lines.length > 0) {
        const key = mapping[method] as keyof typeof output
        if (!output[key]) {
          output[key] = []
        }
        // TypeScript now knows output[key] is defined and is string[]
        output[key].push(...lines)
      }
    }

    return output
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.entries.clear()
    this.totalBytes = 0
    this.totalLines = 0
    this.truncated = false
  }

  /**
   * Get current buffer statistics
   */
  getStats(): { bytes: number; lines: number; truncated: boolean } {
    return {
      bytes: this.totalBytes,
      lines: this.totalLines,
      truncated: this.truncated
    }
  }

  /**
   * Stream buffer addition in real-time (private method)
   */
  private streamBufferAddition(method: ConsoleMethod, content: string): void {
    // Fire and forget - don't block buffer operations for streaming
    bufferStreamBridge.streamBufferAddition(method, content).catch(() => {
      // Silently ignore streaming errors to prevent affecting buffer operations
    })
  }

  /**
   * Stream entire buffer flush to streaming infrastructure
   */
  async streamFlush(testId?: string): Promise<void> {
    if (bufferStreamBridge.isReady()) {
      try {
        await bufferStreamBridge.streamBufferFlush(this, testId)
      } catch (error) {
        // Silently handle streaming errors - don't affect buffer operations
      }
    }
  }

  /**
   * Flush buffer contents and optionally stream them
   */
  async flush(testId?: string, enableStreaming = true): Promise<ReturnType<typeof this.getSimplifiedOutput>> {
    const output = this.getSimplifiedOutput()
    
    // Stream the flush operation if enabled
    if (enableStreaming) {
      await this.streamFlush(testId)
    }

    return output
  }
}
