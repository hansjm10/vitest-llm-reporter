/**
 * Output Writer
 *
 * Handles file I/O operations and JSON serialization for the LLM reporter.
 * Manages circular reference handling and file system operations.
 *
 * @module output
 */

import * as fs from 'fs'
import * as path from 'path'
import type { LLMReporterOutput } from '../types/schema'

/**
 * Output writer configuration
 */
export interface OutputWriterConfig {
  /** Whether to create directories if they don't exist */
  createDirectories?: boolean
  /** JSON stringification spacing */
  jsonSpacing?: number
  /** Whether to handle circular references */
  handleCircularRefs?: boolean
}

/**
 * Default writer configuration
 */
export const DEFAULT_WRITER_CONFIG: Required<OutputWriterConfig> = {
  createDirectories: true,
  jsonSpacing: 2,
  handleCircularRefs: true
}

/**
 * Write operation result
 */
export interface WriteResult {
  success: boolean
  filepath?: string
  error?: Error
}

/**
 * Serialization result
 */
export interface SerializationResult {
  success: boolean
  json?: string
  error?: Error
}

/**
 * Writes LLM reporter output to files
 *
 * This class handles file writing operations, including directory
 * creation, JSON serialization, and error handling.
 *
 * @example
 * ```typescript
 * const writer = new OutputWriter();
 * const result = await writer.write('output.json', reporterOutput);
 * if (result.success) {
 *   console.log(`Written to ${result.filepath}`);
 * }
 * ```
 */
export class OutputWriter {
  private config: Required<OutputWriterConfig>

  constructor(config: OutputWriterConfig = {}) {
    this.config = { ...DEFAULT_WRITER_CONFIG, ...config }
  }

  /**
   * Writes output to a file
   *
   * @param outputFile - Path to the output file
   * @param output - The reporter output to write
   * @returns Write operation result
   */
  public write(outputFile: string, output: LLMReporterOutput): WriteResult {
    try {
      const absolutePath = this.prepareFilePath(outputFile)
      const serialized = this.serialize(output)

      if (!serialized.success) {
        return {
          success: false,
          error: serialized.error
        }
      }

      fs.writeFileSync(absolutePath, serialized.json!)

      return {
        success: true,
        filepath: absolutePath
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  /**
   * Writes output asynchronously
   *
   * @param outputFile - Path to the output file
   * @param output - The reporter output to write
   * @returns Promise resolving to write operation result
   */
  public async writeAsync(outputFile: string, output: LLMReporterOutput): Promise<WriteResult> {
    return new Promise((resolve) => {
      try {
        const absolutePath = this.prepareFilePath(outputFile)
        const serialized = this.serialize(output)

        if (!serialized.success) {
          resolve({
            success: false,
            error: serialized.error
          })
          return
        }

        fs.writeFile(absolutePath, serialized.json!, (error) => {
          if (error) {
            resolve({
              success: false,
              error
            })
          } else {
            resolve({
              success: true,
              filepath: absolutePath
            })
          }
        })
      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error : new Error(String(error))
        })
      }
    })
  }

  /**
   * Prepares the file path, creating directories if needed
   */
  private prepareFilePath(outputFile: string): string {
    const absolutePath = path.resolve(outputFile)
    const outputDir = path.dirname(absolutePath)

    if (this.config.createDirectories && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    return absolutePath
  }

  /**
   * Serializes output to JSON
   */
  public serialize(output: LLMReporterOutput): SerializationResult {
    try {
      let json: string

      if (this.config.handleCircularRefs) {
        json = this.serializeWithCircularRefHandling(output)
      } else {
        json = JSON.stringify(output, null, this.config.jsonSpacing)
      }

      return {
        success: true,
        json
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  /**
   * Serializes with circular reference handling
   */
  private serializeWithCircularRefHandling(output: LLMReporterOutput): string {
    const seen = new WeakSet<object>()

    return JSON.stringify(
      output,
      (_key, value: unknown) => {
        // Handle circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return undefined // Remove circular reference
          }
          seen.add(value)
        }
        return value
      },
      this.config.jsonSpacing
    )
  }

  /**
   * Checks if a file exists
   */
  public exists(filepath: string): boolean {
    try {
      const absolutePath = path.resolve(filepath)
      return fs.existsSync(absolutePath)
    } catch {
      return false
    }
  }

  /**
   * Reads an existing output file
   */
  public read(filepath: string): LLMReporterOutput | null {
    try {
      const absolutePath = path.resolve(filepath)
      const content = fs.readFileSync(absolutePath, 'utf-8')
      return JSON.parse(content) as LLMReporterOutput
    } catch {
      return null
    }
  }

  /**
   * Deletes an output file
   */
  public delete(filepath: string): boolean {
    try {
      const absolutePath = path.resolve(filepath)
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Gets file stats
   */
  public getStats(filepath: string): fs.Stats | null {
    try {
      const absolutePath = path.resolve(filepath)
      return fs.statSync(absolutePath)
    } catch {
      return null
    }
  }

  /**
   * Updates writer configuration
   */
  public updateConfig(config: OutputWriterConfig): void {
    this.config = { ...this.config, ...config }
  }
}
