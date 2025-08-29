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
  redirectToStderr: false,
  flushWithFiltering: false
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

      // Track backpressure from writes
      let ok = true

      // Filter and write lines
      for (const line of lines) {
        // Remove trailing carriage return for consistent pattern matching on Windows
        const lineToTest = line.replace(/\r$/, '')
        const lineWithNewline = line + '\n'
        
        if (!this.shouldSuppress(lineToTest)) {
          // Pass through non-suppressed lines (bind to correct stream)
          const result = originalWrite.call(
            stream === 'stdout' ? process.stdout : process.stderr, 
            lineWithNewline, 
            encoding, 
            undefined
          )
          ok = ok && result
        } else if (this.config.redirectToStderr && stream === 'stdout' && redirectTarget) {
          // Redirect suppressed stdout to stderr if configured
          const result = redirectTarget.call(process.stderr, lineWithNewline, encoding, undefined)
          ok = ok && result
        }
        // Otherwise, drop the line
      }

      // Pass callback to the last write operation or call immediately if no writes occurred
      // Note: For simplicity with line buffering, we use nextTick to ensure callback is async
      // This deviates slightly from exact stream semantics but is acceptable for TTY output
      if (callback) {
        process.nextTick(callback)
      }

      return ok
    }) as WriteFunction
  }

  /**
   * Check if a line should be suppressed based on configuration
   */
  private shouldSuppress(line: string): boolean {
    // In pure mode (null pattern), suppress everything
    if (this.config.filterPattern === null) {
      return true
    }

    // If no pattern is set (undefined), don't suppress anything
    if (!this.config.filterPattern) {
      return false
    }

    // Otherwise, check against the pattern
    return this.config.filterPattern.test(line)
  }

  /**
   * Flush any remaining buffered content
   */
  private flushBuffers(): void {
    if (this.stdoutLineBuffer && this.originalStdoutWrite) {
      if (this.config.flushWithFiltering) {
        // Apply filtering to the final partial line
        const lineToTest = this.stdoutLineBuffer.replace(/\r$/, '')
        if (!this.shouldSuppress(lineToTest)) {
          this.originalStdoutWrite.call(process.stdout, this.stdoutLineBuffer)
        } else if (this.config.redirectToStderr && this.originalStderrWrite) {
          this.originalStderrWrite.call(process.stderr, this.stdoutLineBuffer)
        }
      } else {
        // Write remaining stdout buffer without filtering (default behavior)
        this.originalStdoutWrite.call(process.stdout, this.stdoutLineBuffer)
      }
      this.stdoutLineBuffer = ''
    }

    if (this.stderrLineBuffer && this.originalStderrWrite) {
      if (this.config.flushWithFiltering && this.config.suppressStderr) {
        // Apply filtering to the final partial line
        const lineToTest = this.stderrLineBuffer.replace(/\r$/, '')
        if (!this.shouldSuppress(lineToTest)) {
          this.originalStderrWrite.call(process.stderr, this.stderrLineBuffer)
        }
      } else {
        // Write remaining stderr buffer without filtering (default behavior)
        this.originalStderrWrite.call(process.stderr, this.stderrLineBuffer)
      }
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