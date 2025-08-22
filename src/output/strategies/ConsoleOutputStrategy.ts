/**
 * Console Output Strategy
 *
 * Implements console-based output with stream detection, TTY capabilities,
 * and environment-aware formatting. Supports both stdout and stderr output.
 *
 * @module output-strategies
 */

import { OutputValidator } from '../validators/OutputValidator.js'
import { createLogger } from '../../utils/logger.js'
import type { LLMReporterOutput } from '../../types/schema.js'
import type { OutputStrategy } from './FileOutputStrategy.js'

const logger = createLogger('console-output-strategy')

/**
 * Console output target streams
 */
export type ConsoleStream = 'stdout' | 'stderr'

/**
 * Configuration for console output strategy
 */
export interface ConsoleOutputConfig {
  /** Target stream for output (default: 'stdout') */
  stream?: ConsoleStream
  /** JSON formatting options */
  formatting?: {
    /** JSON spacing for pretty printing (default: 2 for readability) */
    spaces?: number
    /** Handle circular references (default: true) */
    handleCircularRefs?: boolean
    /** Use colors in output if TTY supports it (default: true) */
    useColors?: boolean
  }
  /** Output behavior options */
  options?: {
    /** Add timestamp to output (default: false) */
    includeTimestamp?: boolean
    /** Add separator lines around output (default: false) */
    addSeparators?: boolean
    /** Silent mode - suppress all output (default: false) */
    silent?: boolean
  }
}

/**
 * Default configuration for console output
 */
const DEFAULT_CONSOLE_CONFIG: Required<ConsoleOutputConfig> = {
  stream: 'stdout',
  formatting: {
    spaces: 2,
    handleCircularRefs: true,
    useColors: true
  },
  options: {
    includeTimestamp: false,
    addSeparators: false,
    silent: false
  }
}

/**
 * Console-based output strategy
 *
 * This strategy writes output to console streams (stdout/stderr) with
 * environment-aware formatting and TTY capability detection.
 *
 * @example
 * ```typescript
 * const strategy = new ConsoleOutputStrategy({
 *   stream: 'stdout',
 *   formatting: { spaces: 2, useColors: true }
 * });
 *
 * if (strategy.canExecute()) {
 *   await strategy.initialize();
 *   await strategy.write(reporterOutput);
 *   await strategy.close();
 * }
 * ```
 */
export class ConsoleOutputStrategy implements OutputStrategy {
  private config: Required<ConsoleOutputConfig>
  private validator: OutputValidator
  private initialized = false
  private targetStream: NodeJS.WriteStream

  constructor(config: ConsoleOutputConfig = {}) {
    this.config = this.mergeConfig(config)
    this.validator = new OutputValidator()
    this.targetStream = this.getTargetStream()

    logger('ConsoleOutputStrategy created for stream: %s', this.config.stream)
  }

  /**
   * Merges user config with defaults
   */
  private mergeConfig(config: ConsoleOutputConfig): Required<ConsoleOutputConfig> {
    return {
      stream: config.stream || DEFAULT_CONSOLE_CONFIG.stream,
      formatting: { ...DEFAULT_CONSOLE_CONFIG.formatting, ...config.formatting },
      options: { ...DEFAULT_CONSOLE_CONFIG.options, ...config.options }
    }
  }

  /**
   * Gets the target stream based on configuration
   */
  private getTargetStream(): NodeJS.WriteStream {
    return this.config.stream === 'stderr' ? process.stderr : process.stdout
  }

  /**
   * Checks if console output is possible in the current environment
   */
  public canExecute(): boolean {
    logger('Checking if console output can execute for stream: %s', this.config.stream)

    // Silent mode always can execute (it just doesn't output)
    if (this.config.options.silent) {
      logger('Silent mode enabled - console output can execute')
      return true
    }

    const validation = this.validator.validateConsoleCapabilities()

    if (!validation.isValid) {
      logger('Console output validation failed: %s', validation.error)
      return false
    }

    // Check specific stream availability
    const streamAvailable =
      this.config.stream === 'stderr' ? validation.hasStderr : validation.hasStdout

    if (!streamAvailable) {
      logger('Target stream %s not available', this.config.stream)
      return false
    }

    logger('Console output validation passed')
    return true
  }

  /**
   * Initializes the console output strategy
   */
  public initialize(): Promise<void> {
    if (this.initialized) {
      logger('ConsoleOutputStrategy already initialized')
      return Promise.resolve()
    }

    logger('Initializing ConsoleOutputStrategy')

    // Re-validate console capabilities
    if (!this.config.options.silent && !this.canExecute()) {
      throw new Error('Console output initialization failed: stream not available')
    }

    // Update stream reference in case it changed
    this.targetStream = this.getTargetStream()

    // Update color support based on current environment
    if (this.config.formatting.useColors) {
      const environment = this.validator.getEnvironment()
      this.config.formatting.useColors = environment.capabilities.supportsColor
      logger('Color support detected: %s', this.config.formatting.useColors)
    }

    this.initialized = true
    logger('ConsoleOutputStrategy initialized successfully')
    return Promise.resolve()
  }

  /**
   * Writes data to the console
   */
  public async write(data: LLMReporterOutput): Promise<void> {
    if (!this.initialized) {
      throw new Error('ConsoleOutputStrategy not initialized. Call initialize() first.')
    }

    // Skip output in silent mode
    if (this.config.options.silent) {
      logger('Silent mode - skipping console output')
      return
    }

    logger('Writing data to console stream: %s', this.config.stream)

    try {
      const output = this.formatOutput(data)

      // Write to stream
      await this.writeToStream(output)

      logger('Successfully wrote to console stream')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger('Console write operation failed: %s', errorMessage)
      throw new Error(`Failed to write to console: ${errorMessage}`)
    }
  }

  /**
   * Closes the strategy and performs cleanup
   */
  public async close(): Promise<void> {
    if (!this.initialized) {
      logger('ConsoleOutputStrategy not initialized, nothing to close')
      return
    }

    logger('Closing ConsoleOutputStrategy')

    // Console streams don't need explicit closing, but we can flush
    try {
      if (this.targetStream && typeof this.targetStream.write === 'function') {
        // Ensure any pending writes are flushed
        await this.flushStream()
      }
    } catch (error) {
      logger('Error during stream flush: %s', error)
      // Don't throw on close errors
    }

    this.initialized = false
    logger('ConsoleOutputStrategy closed')
  }

  /**
   * Formats output for console display
   */
  private formatOutput(data: LLMReporterOutput): string {
    const parts: string[] = []

    // Add timestamp if requested
    if (this.config.options.includeTimestamp) {
      parts.push(`[${new Date().toISOString()}]`)
    }

    // Add separator if requested
    if (this.config.options.addSeparators) {
      parts.push('='.repeat(60))
    }

    // Add the JSON content
    const jsonContent = this.serializeData(data)
    parts.push(jsonContent)

    // Add closing separator if requested
    if (this.config.options.addSeparators) {
      parts.push('='.repeat(60))
    }

    return parts.join('\n') + '\n'
  }

  /**
   * Serializes data to JSON string with circular reference handling
   */
  private serializeData(data: LLMReporterOutput): string {
    try {
      if (this.config.formatting.handleCircularRefs) {
        return this.serializeWithCircularRefHandling(data)
      } else {
        return JSON.stringify(data, null, this.config.formatting.spaces)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Serialization failed: ${errorMessage}`)
    }
  }

  /**
   * Serializes with circular reference handling
   */
  private serializeWithCircularRefHandling(data: LLMReporterOutput): string {
    const seen = new WeakSet<object>()

    return JSON.stringify(
      data,
      (_key, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]'
          }
          seen.add(value)
        }
        return value
      },
      this.config.formatting.spaces
    )
  }

  /**
   * Writes content to the target stream
   */
  private async writeToStream(content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.targetStream || typeof this.targetStream.write !== 'function') {
        reject(new Error('Target stream is not writable'))
        return
      }

      // Handle backpressure properly
      const success = this.targetStream.write(content, 'utf8', (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })

      // If write returned false, wait for drain event
      if (!success) {
        this.targetStream.once('drain', () => {
          resolve()
        })
      }
    })
  }

  /**
   * Flushes the target stream
   */
  private async flushStream(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.targetStream && typeof this.targetStream.end === 'function') {
        // For console streams, we don't actually want to end them,
        // just ensure they're flushed
        resolve()
      } else {
        resolve()
      }
    })
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): Required<ConsoleOutputConfig> {
    return { ...this.config }
  }

  /**
   * Gets the target stream name
   */
  public getStreamName(): ConsoleStream {
    return this.config.stream
  }

  /**
   * Checks if the strategy is in silent mode
   */
  public isSilent(): boolean {
    return this.config.options.silent ?? false
  }

  /**
   * Updates silent mode setting
   */
  public setSilent(silent: boolean): void {
    this.config.options.silent = silent
    logger('Silent mode %s', silent ? 'enabled' : 'disabled')
  }
}
