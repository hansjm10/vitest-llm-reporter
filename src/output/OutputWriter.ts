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
  /** Whether to handle errors gracefully */
  gracefulErrorHandling?: boolean
}

/**
 * Default writer configuration
 */
export const DEFAULT_WRITER_CONFIG: Required<OutputWriterConfig> = {
  createDirectories: true,
  jsonSpacing: 0, // No spacing for compact output
  handleCircularRefs: true,
  gracefulErrorHandling: true
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
 *   // Written to result.filepath
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
   * @returns The absolute path of the written file
   * @throws Error if write fails and gracefulErrorHandling is false
   */
  public write(outputFile: string, output: LLMReporterOutput): string {
    try {
      const absolutePath = this.prepareFilePath(outputFile)
      const json = this.serialize(output)

      fs.writeFileSync(absolutePath, json)

      return absolutePath
    } catch (error) {
      if (!this.config.gracefulErrorHandling) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to write output file: ${errorMessage}`)
    }
  }

  /**
   * Writes output asynchronously
   *
   * @param outputFile - Path to the output file
   * @param output - The reporter output to write
   * @returns Promise resolving to the absolute path of the written file
   * @throws Error if write fails and gracefulErrorHandling is false
   */
  public async writeAsync(outputFile: string, output: LLMReporterOutput): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const absolutePath = this.prepareFilePath(outputFile)
        const json = this.serialize(output)

        fs.writeFile(absolutePath, json, (error) => {
          if (error) {
            const writeError = error instanceof Error ? error : new Error(String(error))
            if (!this.config.gracefulErrorHandling) {
              reject(writeError)
            } else {
              reject(new Error(`Failed to write output file: ${writeError.message}`))
            }
          } else {
            resolve(absolutePath)
          }
        })
      } catch (error) {
        const catchError = error instanceof Error ? error : new Error(String(error))
        if (!this.config.gracefulErrorHandling) {
          reject(catchError)
        } else {
          reject(new Error(`Failed to write output file: ${catchError.message}`))
        }
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
   *
   * @param output - The output to serialize
   * @returns Serialized JSON string
   * @throws Error if serialization fails
   */
  public serialize(output: LLMReporterOutput): string {
    try {
      if (this.config.handleCircularRefs) {
        return this.serializeWithCircularRefHandling(output)
      } else {
        return JSON.stringify(output, null, this.config.jsonSpacing)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to serialize output: ${errorMessage}`)
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
   * Updates writer configuration
   */
  public updateConfig(config: OutputWriterConfig): void {
    this.config = { ...this.config, ...config }
  }
}
