/**
 * File Output Strategy
 *
 * Implements file-based output with permission validation, directory creation,
 * and graceful error handling. Supports both synchronous and asynchronous writes.
 *
 * @module output-strategies
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { OutputValidator } from '../validators/OutputValidator.js'
import { createLogger } from '../../utils/logger.js'
import type { LLMReporterOutput } from '../../types/schema.js'

const logger = createLogger('file-output-strategy')

/**
 * Output strategy interface that all strategies must implement
 */
export interface OutputStrategy {
  /** Check if the strategy can execute in the current environment */
  canExecute(): boolean
  /** Initialize the strategy (async setup) */
  initialize(): Promise<void>
  /** Write data using this strategy */
  write(data: LLMReporterOutput): Promise<void>
  /** Clean up and close the strategy */
  close(): Promise<void>
}

/**
 * Configuration for file output strategy
 */
export interface FileOutputConfig {
  /** Target file path */
  filePath: string
  /** JSON formatting options */
  formatting?: {
    /** JSON spacing for pretty printing (default: 0 for compact) */
    spaces?: number
    /** Handle circular references (default: true) */
    handleCircularRefs?: boolean
  }
  /** File operation options */
  options?: {
    /** Create directories if they don't exist (default: true) */
    createDirectories?: boolean
    /** Backup existing files (default: false) */
    backupExisting?: boolean
    /** File encoding (default: 'utf8') */
    encoding?: BufferEncoding
  }
}

/**
 * Default configuration for file output
 */
const DEFAULT_FILE_CONFIG: Required<FileOutputConfig> = {
  filePath: '',
  formatting: {
    spaces: 0,
    handleCircularRefs: true
  },
  options: {
    createDirectories: true,
    backupExisting: false,
    encoding: 'utf8'
  }
}

/**
 * File-based output strategy
 *
 * This strategy writes output to a file with comprehensive validation,
 * directory creation, and error handling capabilities.
 *
 * @example
 * ```typescript
 * const strategy = new FileOutputStrategy({
 *   filePath: './output/test-results.json',
 *   formatting: { spaces: 2 }
 * });
 *
 * if (strategy.canExecute()) {
 *   await strategy.initialize();
 *   await strategy.write(reporterOutput);
 *   await strategy.close();
 * }
 * ```
 */
export class FileOutputStrategy implements OutputStrategy {
  private config: Required<FileOutputConfig>
  private validator: OutputValidator
  private initialized = false
  private resolvedPath?: string

  constructor(config: FileOutputConfig) {
    if (!config.filePath) {
      throw new Error('FilePath is required for FileOutputStrategy')
    }

    this.config = this.mergeConfig(config)
    this.validator = new OutputValidator()

    logger('FileOutputStrategy created for path: %s', this.config.filePath)
  }

  /**
   * Merges user config with defaults
   */
  private mergeConfig(config: FileOutputConfig): Required<FileOutputConfig> {
    return {
      filePath: config.filePath,
      formatting: { ...DEFAULT_FILE_CONFIG.formatting, ...config.formatting },
      options: { ...DEFAULT_FILE_CONFIG.options, ...config.options }
    }
  }

  /**
   * Checks if file output is possible in the current environment
   */
  public canExecute(): boolean {
    logger('Checking if file output can execute for: %s', this.config.filePath)

    const validation = this.validator.validateFilePermissions(this.config.filePath)

    if (!validation.isValid) {
      logger('File output validation failed: %s', validation.error)
      return false
    }

    logger('File output validation passed')
    return true
  }

  /**
   * Initializes the file output strategy
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger('FileOutputStrategy already initialized')
      return
    }

    logger('Initializing FileOutputStrategy')

    // Re-validate permissions
    const validation = this.validator.validateFilePermissions(this.config.filePath)
    if (!validation.isValid) {
      throw new Error(`File initialization failed: ${validation.error}`)
    }

    // Store resolved path for consistent use
    this.resolvedPath = validation.resolvedPath || path.resolve(this.config.filePath)

    // Create backup if requested and file exists
    if (this.config.options.backupExisting && validation.fileExists) {
      await this.createBackup()
    }

    // Ensure directory exists
    if (this.config.options.createDirectories) {
      const directory = path.dirname(this.resolvedPath)
      await fs.promises.mkdir(directory, { recursive: true })
      logger('Ensured directory exists: %s', directory)
    }

    this.initialized = true
    logger('FileOutputStrategy initialized successfully')
  }

  /**
   * Writes data to the file
   */
  public async write(data: LLMReporterOutput): Promise<void> {
    if (!this.initialized) {
      throw new Error('FileOutputStrategy not initialized. Call initialize() first.')
    }

    if (!this.resolvedPath) {
      throw new Error('Resolved path not available')
    }

    logger('Writing data to file: %s', this.resolvedPath)

    try {
      // Serialize data with appropriate formatting
      const jsonContent = this.serializeData(data)

      // Write to file atomically (write to temp file, then rename)
      const tempPath = `${this.resolvedPath}.tmp`
      await fs.promises.writeFile(tempPath, jsonContent, {
        encoding: this.config.options.encoding
      })

      await fs.promises.rename(tempPath, this.resolvedPath)

      logger('Successfully wrote %d bytes to %s', jsonContent.length, this.resolvedPath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger('Write operation failed: %s', errorMessage)
      throw new Error(`Failed to write file: ${errorMessage}`)
    }
  }

  /**
   * Closes the strategy and performs cleanup
   */
  public close(): Promise<void> {
    if (!this.initialized) {
      logger('FileOutputStrategy not initialized, nothing to close')
      return Promise.resolve()
    }

    logger('Closing FileOutputStrategy')

    // Clear validator cache
    this.validator.clearCache()

    this.initialized = false
    this.resolvedPath = undefined

    logger('FileOutputStrategy closed')
    return Promise.resolve()
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
   * Creates a backup of the existing file
   */
  private async createBackup(): Promise<void> {
    if (!this.resolvedPath) {
      return
    }

    const backupPath = `${this.resolvedPath}.backup.${Date.now()}`

    try {
      await fs.promises.copyFile(this.resolvedPath, backupPath)
      logger('Created backup: %s', backupPath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger('Backup creation failed: %s', errorMessage)
      // Don't fail initialization for backup errors
    }
  }

  /**
   * Gets the resolved file path
   */
  public getResolvedPath(): string | undefined {
    return this.resolvedPath
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): Required<FileOutputConfig> {
    return { ...this.config }
  }
}
