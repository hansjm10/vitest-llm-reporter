/**
 * Stdio Interceptor
 *
 * Intercepts and filters process.stdout and process.stderr writes
 * to prevent external framework logs from polluting reporter output.
 *
 * @module console/stdio-interceptor
 */

import type { FrameworkPresetName, StdioConfig } from '../types/reporter.js'
import { StdioFilterEvaluator } from './stdio-filter.js'

/** Internal representation of normalized stdio configuration */
interface NormalizedStdioConfig {
  suppressStdout: boolean
  suppressStderr: boolean
  filterPattern?: StdioConfig['filterPattern']
  frameworkPresets: FrameworkPresetName[]
  redirectToStderr: boolean
  flushWithFiltering: boolean
}

/**
 * Default configuration for stdio suppression
 */
const DEFAULT_CONFIG: NormalizedStdioConfig = {
  suppressStdout: false,
  suppressStderr: false,
  filterPattern: undefined,
  frameworkPresets: ['nest'],
  redirectToStderr: false,
  flushWithFiltering: false
}

/**
 * Stdio write function type
 */
type WriteFunction = typeof process.stdout.write

interface DisableOptions {
  flushWithFiltering?: boolean
}

const PASSTHROUGH_CONTROL_CHUNKS: readonly string[] = ['\u001b[?25h']
const PASSTHROUGH_CONTROL_CHUNK_SET = new Set<string>(PASSTHROUGH_CONTROL_CHUNKS)
const LEADING_FILTER_CONTROL_PREFIX = new RegExp(
  String.raw`^(?:(?:\u001b\[[0-?]*[ -/]*[@-~])|\r)+`,
  'u'
)
const CONTROL_ONLY_CHUNK = new RegExp(
  String.raw`^(?:(?:\u001b\[[0-?]*[ -/]*[@-~])|\r)+$`,
  'u'
)

/**
 * Interceptor for process.stdout and process.stderr
 *
 * This class patches the write methods of stdout and stderr to filter
 * or suppress output based on configuration. It handles both string
 * and Buffer inputs, maintains line buffering for chunked writes,
 * and can optionally redirect filtered output.
 */
export class StdioInterceptor {
  private config: NormalizedStdioConfig
  private readonly filter: StdioFilterEvaluator
  private originalStdoutWrite?: WriteFunction
  private originalStderrWrite?: WriteFunction
  private stdoutLineBuffer = ''
  private stderrLineBuffer = ''
  private isEnabled = false

  constructor(config: StdioConfig = {}) {
    const hasFilterPatternProperty = Object.hasOwn(config, 'filterPattern')
    const hasFrameworkPresets = Object.hasOwn(config, 'frameworkPresets')

    const filterPatternValue = hasFilterPatternProperty
      ? config.filterPattern
      : DEFAULT_CONFIG.filterPattern
    const filterPatternProvided = hasFilterPatternProperty && filterPatternValue !== undefined

    const frameworkPresets = hasFrameworkPresets
      ? [...(config.frameworkPresets ?? [])]
      : filterPatternProvided
        ? []
        : [...DEFAULT_CONFIG.frameworkPresets]

    this.config = {
      suppressStdout: config.suppressStdout ?? DEFAULT_CONFIG.suppressStdout,
      suppressStderr: config.suppressStderr ?? DEFAULT_CONFIG.suppressStderr,
      filterPattern: filterPatternProvided ? filterPatternValue : DEFAULT_CONFIG.filterPattern,
      frameworkPresets,
      redirectToStderr: config.redirectToStderr ?? DEFAULT_CONFIG.redirectToStderr,
      flushWithFiltering: config.flushWithFiltering ?? DEFAULT_CONFIG.flushWithFiltering
    }

    this.filter = new StdioFilterEvaluator(this.config.filterPattern, this.config.frameworkPresets)
  }

  /**
   * Enable stdio interception
   */
  enable(): void {
    if (this.isEnabled) {
      return
    }

    // Save original write functions bound to their streams
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout)
    this.originalStderrWrite = process.stderr.write.bind(process.stderr)

    // Patch stdout if configured
    if (this.config.suppressStdout) {
      process.stdout.write = this.createInterceptor(
        'stdout',
        this.originalStdoutWrite,
        this.originalStderrWrite
      )
    }

    // Patch stderr if configured
    if (this.config.suppressStderr) {
      process.stderr.write = this.createInterceptor(
        'stderr',
        this.originalStderrWrite,
        this.originalStderrWrite
      )
    }

    this.isEnabled = true
  }

  /**
   * Disable stdio interception and restore original writers
   */
  disable(options: DisableOptions = {}): void {
    if (!this.isEnabled) {
      return
    }

    // Flush any remaining buffered content
    this.flushBuffers(options)

    // Restore original write functions
    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite
    }
    if (this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite
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
      stdout: this.originalStdoutWrite
        ? this.originalStdoutWrite.bind(process.stdout)
        : process.stdout.write.bind(process.stdout),
      stderr: this.originalStderrWrite
        ? this.originalStderrWrite.bind(process.stderr)
        : process.stderr.write.bind(process.stderr)
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

    return ((
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((err?: Error | null) => void),
      callback?: (err?: Error | null) => void
    ): boolean => {
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

      if (
        this[lineBuffer].length === 0 &&
        this.shouldPassthroughChunk(str) &&
        !this.filter.shouldSuppress(str)
      ) {
        const target = stream === 'stdout' ? process.stdout : process.stderr
        return originalWrite.call(target, chunk, encoding, callback)
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
        const lineWithNewline = line + '\n'
        const frameworkLine = this.normalizeLineForFrameworkPresets(line)

        if (!this.filter.shouldSuppress(line, frameworkLine)) {
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
        } else {
          const result = this.writeTrailingPassthroughSuffix(stream, originalWrite, line, encoding)
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
   * Allow the teardown cursor-show sequence to bypass line buffering so it
   * reaches the terminal even when emitted as a standalone chunk.
   */
  private shouldPassthroughChunk(chunk: string): boolean {
    return PASSTHROUGH_CONTROL_CHUNK_SET.has(chunk)
  }

  /**
   * Remove cursor-control prefixes and trailing carriage returns before
   * matching framework preset rules against buffered output.
   */
  private normalizeLineForFrameworkPresets(line: string): string {
    return line.replace(/\r+$/, '').replace(LEADING_FILTER_CONTROL_PREFIX, '')
  }

  /**
   * Treat pure terminal-control buffers as non-user-visible content during the
   * filtered shutdown flush so they do not trail machine-readable stdout.
   */
  private isControlOnlyChunk(chunk: string): boolean {
    return chunk.length > 0 && CONTROL_ONLY_CHUNK.test(chunk)
  }

  /**
   * Preserve terminal restoration sequences when a filtered chunk is dropped.
   * Pure suppression mode still drops every byte.
   */
  private getTrailingPassthroughSuffix(chunk: string): string {
    if (this.config.filterPattern === null) {
      return ''
    }

    let suffix = ''
    let remainder = chunk

    while (true) {
      const controlChunk = PASSTHROUGH_CONTROL_CHUNKS.find((candidate) =>
        remainder.endsWith(candidate)
      )

      if (!controlChunk) {
        return suffix
      }

      suffix = controlChunk + suffix
      remainder = remainder.slice(0, -controlChunk.length)
    }
  }

  private writeTrailingPassthroughSuffix(
    stream: 'stdout' | 'stderr',
    originalWrite: WriteFunction,
    chunk: string,
    encoding?: BufferEncoding
  ): boolean {
    const suffix = this.getTrailingPassthroughSuffix(chunk)
    if (!suffix) {
      return true
    }

    return originalWrite.call(
      stream === 'stdout' ? process.stdout : process.stderr,
      suffix,
      encoding,
      undefined
    )
  }

  /**
   * Flush any remaining buffered content
   */
  private flushBuffers(options: DisableOptions = {}): void {
    const flushWithFiltering = options.flushWithFiltering ?? this.config.flushWithFiltering

    if (this.stdoutLineBuffer && this.originalStdoutWrite) {
      if (flushWithFiltering || this.config.filterPattern === null) {
        // Apply filtering to the final partial line
        const frameworkLine = this.normalizeLineForFrameworkPresets(this.stdoutLineBuffer)
        if (this.isControlOnlyChunk(this.stdoutLineBuffer)) {
          this.writeTrailingPassthroughSuffix(
            'stdout',
            this.originalStdoutWrite,
            this.stdoutLineBuffer
          )
        } else if (!this.filter.shouldSuppress(this.stdoutLineBuffer, frameworkLine)) {
          this.originalStdoutWrite.call(process.stdout, this.stdoutLineBuffer)
        } else if (this.config.redirectToStderr && this.originalStderrWrite) {
          this.originalStderrWrite.call(process.stderr, this.stdoutLineBuffer)
        } else {
          this.writeTrailingPassthroughSuffix(
            'stdout',
            this.originalStdoutWrite,
            this.stdoutLineBuffer
          )
        }
      } else {
        // Write remaining stdout buffer without filtering (default behavior)
        this.originalStdoutWrite.call(process.stdout, this.stdoutLineBuffer)
      }
      this.stdoutLineBuffer = ''
    }

    if (this.stderrLineBuffer && this.originalStderrWrite) {
      if (
        (flushWithFiltering || this.config.filterPattern === null) &&
        this.config.suppressStderr
      ) {
        // Apply filtering to the final partial line
        const frameworkLine = this.normalizeLineForFrameworkPresets(this.stderrLineBuffer)
        if (this.isControlOnlyChunk(this.stderrLineBuffer)) {
          this.writeTrailingPassthroughSuffix(
            'stderr',
            this.originalStderrWrite,
            this.stderrLineBuffer
          )
        } else if (!this.filter.shouldSuppress(this.stderrLineBuffer, frameworkLine)) {
          this.originalStderrWrite.call(process.stderr, this.stderrLineBuffer)
        } else {
          this.writeTrailingPassthroughSuffix(
            'stderr',
            this.originalStderrWrite,
            this.stderrLineBuffer
          )
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
