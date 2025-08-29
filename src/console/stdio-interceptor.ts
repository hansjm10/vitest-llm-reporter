/**
 * Stdio Interceptor
 *
 * Intercepts and filters process.stdout and process.stderr writes
 * to prevent external framework logs from polluting reporter output.
 *
 * @module console/stdio-interceptor
 */

import type { StdioConfig } from '../types/reporter.js'

/**
 * Default configuration for stdio suppression
 */
const DEFAULT_CONFIG: Required<StdioConfig> = {
  suppressStdout: false,
  suppressStderr: false,
  filterPattern: /^\[Nest\]\s/, // Default pattern for NestJS logs
  redirectToStderr: false
}

/**
 * Stdio write function type
 */
type WriteFunction = typeof process.stdout.write

/**
 * Interceptor for process.stdout and process.stderr
 *
 * This class patches the write methods of stdout and stderr to filter
 * or suppress output based on configuration. It handles both string
 * and Buffer inputs, maintains line buffering for chunked writes,
 * and can optionally redirect filtered output.
 */
export class StdioInterceptor {
  private config: Required<StdioConfig>
  private originalStdoutWrite?: WriteFunction
  private originalStderrWrite?: WriteFunction
  private stdoutLineBuffer = ''
  private stderrLineBuffer = ''
  private isEnabled = false

  constructor(config: StdioConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Enable stdio interception
   */
  enable(): void {
    if (this.isEnabled) {
      return
    }

    // Save original write functions (not bound, keep the actual reference)
    this.originalStdoutWrite = process.stdout.write
    this.originalStderrWrite = process.stderr.write

    // Patch stdout if configured
    if (this.config.suppressStdout) {
      process.stdout.write = this.createInterceptor(
        'stdout',
        this.originalStdoutWrite,
        this.originalStderrWrite
      ) as any
    }

    // Patch stderr if configured
    if (this.config.suppressStderr) {
      process.stderr.write = this.createInterceptor(
        'stderr',
        this.originalStderrWrite,
        this.originalStderrWrite
      ) as any
    }

    this.isEnabled = true
  }

  /**
   * Disable stdio interception and restore original writers
   */
  disable(): void {
    if (!this.isEnabled) {
      return
    }

    // Flush any remaining buffered content
    this.flushBuffers()

    // Restore original write functions
    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite as any
    }
    if (this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite as any
    }

    this.isEnabled = false
  }

  /**
   * Get the original write functions for direct access
   */
  getOriginalWriters(): {
    stdout: WriteFunction
    stderr: WriteFunction
  } {
    return {
      stdout: this.originalStdoutWrite ? this.originalStdoutWrite.bind(process.stdout) : process.stdout.write.bind(process.stdout),
      stderr: this.originalStderrWrite ? this.originalStderrWrite.bind(process.stderr) : process.stderr.write.bind(process.stderr)
    }
  }

  /**
   * Create an interceptor function for a stream
   */
  private createInterceptor(
    stream: 'stdout' | 'stderr',
    originalWrite: WriteFunction,
    redirectTarget?: WriteFunction
  ): WriteFunction {
    const lineBuffer = stream === 'stdout' ? 'stdoutLineBuffer' : 'stderrLineBuffer'

    return ((chunk: any, encoding?: any, callback?: any): boolean => {
      // Handle different argument patterns
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }

      // Convert chunk to string for filtering
      let str: string
      if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
        str = chunk.toString(encoding || 'utf8')
      } else {
        str = String(chunk)
      }

      // Add to line buffer
      this[lineBuffer] += str

      // Process complete lines
      const lines = this[lineBuffer].split('\n')
      const incomplete = lines.pop() || ''
      this[lineBuffer] = incomplete

      // Filter and write lines
      for (const line of lines) {
        const lineWithNewline = line + '\n'
        if (!this.shouldSuppress(lineWithNewline)) {
          // Pass through non-suppressed lines (bind to correct stream)
          originalWrite.call(stream === 'stdout' ? process.stdout : process.stderr, lineWithNewline, encoding, undefined)
        } else if (this.config.redirectToStderr && stream === 'stdout' && redirectTarget) {
          // Redirect suppressed stdout to stderr if configured
          redirectTarget.call(process.stderr, lineWithNewline, encoding, undefined)
        }
        // Otherwise, drop the line
      }

      // Handle callback
      if (callback) {
        process.nextTick(callback)
      }

      return true
    }) as WriteFunction
  }

  /**
   * Check if a line should be suppressed based on configuration
   */
  private shouldSuppress(line: string): boolean {
    // In pure mode (no pattern), suppress everything
    if (!this.config.filterPattern) {
      return true
    }

    // Otherwise, check against the pattern
    return this.config.filterPattern.test(line)
  }

  /**
   * Flush any remaining buffered content
   */
  private flushBuffers(): void {
    if (this.stdoutLineBuffer && this.originalStdoutWrite) {
      // Write remaining stdout buffer without filtering
      this.originalStdoutWrite.call(process.stdout, this.stdoutLineBuffer)
      this.stdoutLineBuffer = ''
    }

    if (this.stderrLineBuffer && this.originalStderrWrite) {
      // Write remaining stderr buffer without filtering
      this.originalStderrWrite.call(process.stderr, this.stderrLineBuffer)
      this.stderrLineBuffer = ''
    }
  }

  /**
   * Check if interception is currently enabled
   */
  isActive(): boolean {
    return this.isEnabled
  }
}