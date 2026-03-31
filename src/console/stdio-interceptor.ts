/**
 * Stdio Interceptor
 *
 * Intercepts and filters process.stdout and process.stderr writes
 * to prevent external framework logs from polluting reporter output.
 *
 * @module console/stdio-interceptor
 */

import type { StdioConfig, StdioFilter } from '../types/reporter.js'
import type { BufferedTailPolicy, ResolvedStdioPlan } from './stdio-plan.js'
import {
  cloneResolvedStdioPlan,
  getDefaultBufferedTailPolicy,
  isResolvedStdioPlan,
  resolveStdioPlan
} from './stdio-plan.js'
import { StdioSuppressionPolicy } from './stdio-filter.js'

/**
 * Stdio write function type
 */
export type WriteFunction = typeof process.stdout.write

interface DisableOptions {
  bufferedOutput?: BufferedTailPolicy
  swallowStdoutWriteErrors?: boolean
}

const PASSTHROUGH_CONTROL_CHUNKS: readonly string[] = ['\u001b[?25h', '\u001b[0m', '\u001b[m']
const CONTROL_ONLY_CHUNK = new RegExp(String.raw`^(?:(?:\u001b\[[0-?]*[ -/]*[@-~])|\r)+$`, 'u')
const TRAILING_CARRIAGE_RETURNS = /\r+$/u

/**
 * Interceptor for process.stdout and process.stderr
 *
 * This class patches the write methods of stdout and stderr to filter
 * or suppress output based on configuration. It handles both string
 * and Buffer inputs, maintains line buffering for chunked writes,
 * and can optionally redirect filtered output.
 */
export class StdioInterceptor {
  private plan: ResolvedStdioPlan
  private policy: StdioSuppressionPolicy
  private originalStdoutWrite?: WriteFunction
  private originalStderrWrite?: WriteFunction
  private stdoutInterceptor?: WriteFunction
  private stderrInterceptor?: WriteFunction
  private patchedStdout = false
  private patchedStderr = false
  private stdoutLineBuffer = ''
  private stderrLineBuffer = ''
  private isEnabled = false
  private holdStdoutWrites = false

  constructor(config: StdioConfig | ResolvedStdioPlan = {}, policy?: StdioSuppressionPolicy) {
    this.plan = cloneResolvedStdioPlan(
      isResolvedStdioPlan(config) ? config : resolveStdioPlan({ stdio: config })
    )
    this.policy = policy ?? new StdioSuppressionPolicy(this.plan)
  }

  /**
   * Enable stdio interception
   */
  enable(): void {
    if (this.isEnabled) {
      return
    }

    this.holdStdoutWrites = false

    // Save original write functions bound to their streams
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout)
    this.originalStderrWrite = process.stderr.write.bind(process.stderr)
    this.stdoutInterceptor = undefined
    this.stderrInterceptor = undefined
    this.syncPatchedStreams()

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
    if (this.patchedStdout && this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite
    }
    if (this.patchedStderr && this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite
    }

    this.patchedStdout = false
    this.patchedStderr = false
    this.isEnabled = false
    this.holdStdoutWrites = false
    this.stdoutInterceptor = undefined
    this.stderrInterceptor = undefined
    this.originalStdoutWrite = undefined
    this.originalStderrWrite = undefined
  }

  /**
   * Flush buffered run output before the reporter writes JSON, then hold any
   * subsequent teardown stdout until the final output state is known.
   */
  prepareForReportHold(): void {
    if (!this.isEnabled) {
      return
    }

    this.flushBuffers({ bufferedOutput: 'filter', swallowStdoutWriteErrors: true })
    this.holdStdoutWrites = true
  }

  /**
   * Flush buffered run output without disabling interception so teardown writes
   * continue to flow through the active suppression policy.
   */
  flushBufferedOutput(): void {
    if (!this.isEnabled) {
      return
    }

    this.flushBuffers({ bufferedOutput: 'filter', swallowStdoutWriteErrors: true })
  }

  /**
   * Check whether interception is currently holding post-run stdout.
   */
  isHoldingReport(): boolean {
    return this.isEnabled && this.holdStdoutWrites
  }

  /**
   * Update the active suppression plan without tearing down interception.
   * Buffered partials are flushed first when a material suppression-policy
   * change would otherwise reclassify bytes that were written under the old plan.
   */
  updatePlan(
    plan: ResolvedStdioPlan,
    policy?: StdioSuppressionPolicy,
    options: { swallowStdoutWriteErrors?: boolean } = {}
  ): void {
    const nextPlan = cloneResolvedStdioPlan(plan)
    const nextPolicy = policy ?? new StdioSuppressionPolicy(nextPlan)

    if (this.isEnabled) {
      if (this.shouldFlushBufferedStreamBeforePlanUpdate('stdout', nextPlan)) {
        this.flushBufferedStream('stdout', 'filter', options)
      }

      if (this.shouldFlushBufferedStreamBeforePlanUpdate('stderr', nextPlan)) {
        this.flushBufferedStream('stderr', 'filter', options)
      }
    }

    this.plan = nextPlan
    this.policy = nextPolicy

    if (!this.isEnabled) {
      return
    }

    this.syncPatchedStreams()
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

      if (this.shouldHoldStream(stream)) {
        this[lineBuffer] += str

        if (callback) {
          process.nextTick(callback)
        }

        return true
      }

      if (
        this[lineBuffer].length === 0 &&
        this.shouldPassthroughChunk(str) &&
        !this.policy.shouldSuppress(str)
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
        ok =
          this.writeFilteredLine(stream, originalWrite, line, '\n', encoding, redirectTarget) && ok
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
   * Allow teardown terminal restoration sequences to bypass line buffering so
   * they reach the terminal when emitted as standalone chunks.
   */
  private shouldPassthroughChunk(chunk: string): boolean {
    return this.getPassthroughControlChunk(chunk) === chunk
  }

  /**
   * Treat pure terminal-control buffers as non-user-visible content during the
   * filtered shutdown flush so they do not trail machine-readable stdout.
   */
  private isControlOnlyChunk(chunk: string): boolean {
    return chunk.length > 0 && CONTROL_ONLY_CHUNK.test(chunk)
  }

  /**
   * Keep standalone terminal restoration chunks, but never peel them off a
   * mixed log line because that still pollutes machine-readable stdout.
   */
  private getPassthroughControlChunk(chunk: string): string {
    if (this.plan.filterPattern === null) {
      return ''
    }

    let remainder = chunk

    while (remainder.length > 0) {
      const trailingCarriageReturns = remainder.match(TRAILING_CARRIAGE_RETURNS)?.[0] ?? ''
      const controlCandidateRemainder = trailingCarriageReturns
        ? remainder.slice(0, -trailingCarriageReturns.length)
        : remainder
      const controlChunk = PASSTHROUGH_CONTROL_CHUNKS.find((candidate) =>
        controlCandidateRemainder.endsWith(candidate)
      )

      if (!controlChunk) {
        return ''
      }

      remainder = controlCandidateRemainder.slice(0, -controlChunk.length)
    }

    return chunk
  }

  private writePassthroughControlChunk(
    stream: 'stdout' | 'stderr',
    originalWrite: WriteFunction,
    chunk: string,
    encoding?: BufferEncoding,
    options: { swallowStdoutWriteErrors?: boolean } = {}
  ): boolean {
    const passthroughChunk = this.getPassthroughControlChunk(chunk)
    if (!passthroughChunk) {
      return true
    }

    try {
      return originalWrite.call(
        stream === 'stdout' ? process.stdout : process.stderr,
        passthroughChunk,
        encoding,
        undefined
      )
    } catch (error) {
      if (options.swallowStdoutWriteErrors && stream === 'stdout') {
        return false
      }

      throw error
    }
  }

  private writeFilteredLine(
    stream: 'stdout' | 'stderr',
    originalWrite: WriteFunction,
    line: string,
    suffix: string,
    encoding?: BufferEncoding,
    redirectTarget?: WriteFunction,
    options: { swallowStdoutWriteErrors?: boolean } = {}
  ): boolean {
    const chunk = line + suffix

    if (!this.policy.shouldSuppress(line)) {
      try {
        return originalWrite.call(
          stream === 'stdout' ? process.stdout : process.stderr,
          chunk,
          encoding,
          undefined
        )
      } catch (error) {
        if (options.swallowStdoutWriteErrors && stream === 'stdout') {
          return false
        }

        throw error
      }
    }

    if (this.plan.redirectToStderr && stream === 'stdout' && redirectTarget) {
      return redirectTarget.call(process.stderr, chunk, encoding, undefined)
    }

    return this.writePassthroughControlChunk(stream, originalWrite, line, encoding, options)
  }

  private flushBufferedChunkWithFiltering(
    stream: 'stdout' | 'stderr',
    chunk: string,
    originalWrite: WriteFunction,
    options: { swallowStdoutWriteErrors?: boolean } = {}
  ): void {
    const lines = chunk.split('\n')
    const incomplete = lines.pop() ?? ''

    for (const line of lines) {
      this.writeFilteredLine(
        stream,
        originalWrite,
        line,
        '\n',
        undefined,
        this.originalStderrWrite,
        options
      )
    }

    if (incomplete.length > 0) {
      this.writeFilteredLine(
        stream,
        originalWrite,
        incomplete,
        '',
        undefined,
        this.originalStderrWrite,
        options
      )
    }
  }

  /**
   * Flush any remaining buffered content
   */
  private flushBuffers(options: DisableOptions = {}): void {
    const bufferedOutput = options.bufferedOutput ?? getDefaultBufferedTailPolicy(this.plan)

    if (this.stdoutLineBuffer && this.originalStdoutWrite) {
      this.flushBufferedChunk(
        'stdout',
        this.stdoutLineBuffer,
        this.originalStdoutWrite,
        bufferedOutput,
        options
      )
      this.stdoutLineBuffer = ''
    }

    if (this.stderrLineBuffer && this.originalStderrWrite) {
      this.flushBufferedChunk(
        'stderr',
        this.stderrLineBuffer,
        this.originalStderrWrite,
        bufferedOutput,
        options
      )
      this.stderrLineBuffer = ''
    }
  }

  private flushBufferedChunk(
    stream: 'stdout' | 'stderr',
    chunk: string,
    originalWrite: WriteFunction,
    bufferedOutput: BufferedTailPolicy,
    options: { swallowStdoutWriteErrors?: boolean } = {}
  ): void {
    if (bufferedOutput === 'emit') {
      originalWrite.call(stream === 'stdout' ? process.stdout : process.stderr, chunk)
      return
    }

    if (bufferedOutput === 'discard') {
      // Discard abandons buffered output entirely, including standalone
      // terminal restore chunks, so held teardown bytes cannot pollute a later
      // machine-readable report or leak from an abandoned session.
      return
    }

    if (this.isControlOnlyChunk(chunk)) {
      this.writePassthroughControlChunk(stream, originalWrite, chunk, undefined, {
        swallowStdoutWriteErrors: options.swallowStdoutWriteErrors
      })
      return
    }

    this.flushBufferedChunkWithFiltering(stream, chunk, originalWrite, options)
  }

  private syncPatchedStreams(): void {
    this.syncPatchedStream('stdout')
    this.syncPatchedStream('stderr')
  }

  private shouldPatchStream(stream: 'stdout' | 'stderr', plan = this.plan): boolean {
    return stream === 'stdout'
      ? plan.suppressStdout || this.holdStdoutWrites
      : plan.suppressStderr
  }

  private shouldHoldStream(stream: 'stdout' | 'stderr'): boolean {
    return stream === 'stdout' && this.holdStdoutWrites
  }

  private shouldFlushBufferedStreamBeforePlanUpdate(
    stream: 'stdout' | 'stderr',
    nextPlan: ResolvedStdioPlan
  ): boolean {
    const isPatched = stream === 'stdout' ? this.patchedStdout : this.patchedStderr
    if (!isPatched) {
      return false
    }

    if (this.shouldHoldStream(stream)) {
      return false
    }

    if (!this.shouldPatchStream(stream, nextPlan)) {
      return true
    }

    return this.hasMaterialStreamPolicyChange(stream, nextPlan)
  }

  private hasMaterialStreamPolicyChange(
    stream: 'stdout' | 'stderr',
    nextPlan: ResolvedStdioPlan
  ): boolean {
    if (!this.sameFilterPattern(this.plan.filterPattern, nextPlan.filterPattern)) {
      return true
    }

    if (!this.sameFrameworkPresets(this.plan.frameworkPresets, nextPlan.frameworkPresets)) {
      return true
    }

    return stream === 'stdout' && this.plan.redirectToStderr !== nextPlan.redirectToStderr
  }

  private sameFrameworkPresets(
    current: readonly string[],
    next: readonly string[]
  ): boolean {
    if (current.length !== next.length) {
      return false
    }

    return current.every((preset, index) => preset === next[index])
  }

  private sameFilterPattern(
    current: StdioConfig['filterPattern'],
    next: StdioConfig['filterPattern']
  ): boolean {
    if (current === next) {
      return true
    }

    if (Array.isArray(current) || Array.isArray(next)) {
      return (
        Array.isArray(current) &&
        Array.isArray(next) &&
        current.length === next.length &&
        current.every((pattern, index) => this.sameSingleFilterPattern(pattern, next[index]))
      )
    }

    return this.sameSingleFilterPattern(current, next)
  }

  private sameSingleFilterPattern(
    current: StdioFilter | null | undefined,
    next: StdioFilter | null | undefined
  ): boolean {
    if (current === next) {
      return true
    }

    if (current instanceof RegExp && next instanceof RegExp) {
      return current.source === next.source && current.flags === next.flags
    }

    return false
  }

  private syncPatchedStream(stream: 'stdout' | 'stderr'): void {
    const shouldPatch = this.shouldPatchStream(stream)
    const originalWrite = stream === 'stdout' ? this.originalStdoutWrite : this.originalStderrWrite

    if (!originalWrite) {
      return
    }

    if (shouldPatch) {
      this.patchStream(stream, originalWrite)
      return
    }

    this.restorePatchedStream(stream, originalWrite, { flushBufferedOutput: true })
  }

  private patchStream(stream: 'stdout' | 'stderr', originalWrite: WriteFunction): void {
    if (stream === 'stdout') {
      if (this.patchedStdout) {
        return
      }

      this.stdoutInterceptor ??= this.createInterceptor(
        'stdout',
        originalWrite,
        this.originalStderrWrite
      )
      process.stdout.write = this.stdoutInterceptor
      this.patchedStdout = true
      return
    }

    if (this.patchedStderr) {
      return
    }

    this.stderrInterceptor ??= this.createInterceptor('stderr', originalWrite, originalWrite)
    process.stderr.write = this.stderrInterceptor
    this.patchedStderr = true
  }

  private restorePatchedStream(
    stream: 'stdout' | 'stderr',
    originalWrite: WriteFunction,
    options: { flushBufferedOutput?: boolean } = {}
  ): void {
    const shouldFlush = options.flushBufferedOutput ?? false

    if (stream === 'stdout') {
      if (!this.patchedStdout) {
        return
      }

      if (shouldFlush) {
        this.flushBufferedStream('stdout', 'emit')
      }

      process.stdout.write = originalWrite
      this.patchedStdout = false
      return
    }

    if (!this.patchedStderr) {
      return
    }

    if (shouldFlush) {
      this.flushBufferedStream('stderr', 'emit')
    }

    process.stderr.write = originalWrite
    this.patchedStderr = false
  }

  private flushBufferedStream(
    stream: 'stdout' | 'stderr',
    bufferedOutput: BufferedTailPolicy,
    options: { swallowStdoutWriteErrors?: boolean } = {}
  ): void {
    const bufferKey = stream === 'stdout' ? 'stdoutLineBuffer' : 'stderrLineBuffer'
    const originalWrite = stream === 'stdout' ? this.originalStdoutWrite : this.originalStderrWrite
    const chunk = this[bufferKey]

    if (!chunk || !originalWrite) {
      return
    }

    this.flushBufferedChunk(stream, chunk, originalWrite, bufferedOutput, options)
    this[bufferKey] = ''
  }

  /**
   * Check if interception is currently enabled
   */
  isActive(): boolean {
    return this.isEnabled
  }
}
