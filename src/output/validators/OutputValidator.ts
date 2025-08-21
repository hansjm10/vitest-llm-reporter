/**
 * Output Validation
 *
 * Provides validation utilities for output strategies to ensure proper
 * operation including file permissions, console capabilities, and environment checks.
 *
 * @module output-validators
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { detectEnvironment } from '../../utils/environment.js'
import { PathValidator } from '../../utils/path-validator.js'
import { createLogger } from '../../utils/logger.js'
import type { EnvironmentInfo } from '../../types/environment.js'

const logger = createLogger('output-validator')

/**
 * Validation result for output operations
 */
export interface ValidationResult {
  /** Whether the validation passed */
  isValid: boolean
  /** Error message if validation failed */
  error?: string
  /** Additional context about the validation */
  context?: Record<string, unknown>
}

/**
 * File permission validation result
 */
export interface FilePermissionResult extends ValidationResult {
  /** Whether the directory is writable */
  directoryWritable?: boolean
  /** Whether the file already exists */
  fileExists?: boolean
  /** Whether the existing file is writable */
  fileWritable?: boolean
  /** Resolved absolute path */
  resolvedPath?: string
}

/**
 * Console capability validation result
 */
export interface ConsoleCapabilityResult extends ValidationResult {
  /** Whether stdout is available */
  hasStdout?: boolean
  /** Whether stderr is available */
  hasStderr?: boolean
  /** Whether TTY is available */
  hasTTY?: boolean
  /** Detected environment info */
  environment?: EnvironmentInfo
}

/**
 * Output validator for pre-flight checks
 *
 * This class provides validation utilities for output strategies to ensure
 * they can operate correctly before attempting to write data.
 */
export class OutputValidator {
  private pathValidator: PathValidator
  private environment: EnvironmentInfo

  constructor(rootDir: string = process.cwd()) {
    this.pathValidator = new PathValidator(rootDir)
    this.environment = detectEnvironment()
    logger('OutputValidator initialized with root: %s', rootDir)
  }

  /**
   * Validates file write permissions and path accessibility
   *
   * @param filePath - Path to validate for writing
   * @returns Validation result with permission details
   */
  public validateFilePermissions(filePath: string): FilePermissionResult {
    logger('Validating file permissions for: %s', filePath)

    try {
      // Handle empty string
      if (!filePath || filePath.trim() === '') {
        return {
          isValid: false,
          error: 'File path cannot be empty'
        }
      }

      // Check for null bytes (security issue)
      if (filePath.includes('\0')) {
        return {
          isValid: false,
          error: 'File path contains null bytes'
        }
      }

      // Validate path structure and resolve
      const resolvedPath = path.resolve(filePath)
      const directory = path.dirname(resolvedPath)

      // Check if directory exists or can be created
      let directoryWritable = false
      try {
        if (!fs.existsSync(directory)) {
          // Try to create the directory
          fs.mkdirSync(directory, { recursive: true })
          directoryWritable = true
          logger('Created directory: %s', directory)
        } else {
          // Check if directory is writable
          fs.accessSync(directory, fs.constants.W_OK)
          directoryWritable = true
          logger('Directory is writable: %s', directory)
        }
      } catch (dirError) {
        logger('Directory validation failed: %s', dirError)
        return {
          isValid: false,
          error: `Directory is not writable: ${directory}`,
          directoryWritable: false,
          resolvedPath
        }
      }

      // Check file-specific permissions
      const fileExists = fs.existsSync(resolvedPath)
      let fileWritable = false

      if (fileExists) {
        try {
          fs.accessSync(resolvedPath, fs.constants.W_OK)
          fileWritable = true
          logger('Existing file is writable: %s', resolvedPath)
        } catch (fileError) {
          logger('File write validation failed: %s', fileError)
          return {
            isValid: false,
            error: `File is not writable: ${resolvedPath}`,
            directoryWritable,
            fileExists,
            fileWritable: false,
            resolvedPath
          }
        }
      } else {
        // For new files, writability depends on directory
        fileWritable = directoryWritable
      }

      logger('File validation successful: %s', resolvedPath)
      return {
        isValid: true,
        directoryWritable,
        fileExists,
        fileWritable,
        resolvedPath
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger('File validation error: %s', errorMessage)
      return {
        isValid: false,
        error: `File validation failed: ${errorMessage}`
      }
    }
  }

  /**
   * Validates console output capabilities
   *
   * @returns Validation result with console capability details
   */
  public validateConsoleCapabilities(): ConsoleCapabilityResult {
    logger('Validating console capabilities')

    try {
      // Check basic stream availability
      const hasStdout = Boolean(process.stdout)
      const hasStderr = Boolean(process.stderr)

      if (!hasStdout && !hasStderr) {
        logger('No console streams available')
        return {
          isValid: false,
          error: 'No console output streams available',
          hasStdout: false,
          hasStderr: false,
          hasTTY: false,
          environment: this.environment
        }
      }

      // Check TTY capabilities
      const hasTTY = this.environment.tty.hasAnyTTY

      // Validate stream writability
      let streamError: string | undefined

      try {
        // Test stdout writability (non-destructive)
        if (hasStdout && process.stdout.writable === false) {
          streamError = 'stdout is not writable'
        }

        // Test stderr writability (non-destructive)
        if (hasStderr && process.stderr.writable === false) {
          if (streamError) {
            streamError += ', stderr is not writable'
          } else {
            streamError = 'stderr is not writable'
          }
        }
      } catch (streamTestError) {
        const errorMessage =
          streamTestError instanceof Error ? streamTestError.message : String(streamTestError)
        streamError = `Stream test failed: ${errorMessage}`
      }

      if (streamError) {
        logger('Console stream validation failed: %s', streamError)
        return {
          isValid: false,
          error: streamError,
          hasStdout,
          hasStderr,
          hasTTY,
          environment: this.environment
        }
      }

      logger(
        'Console validation successful - stdout: %s, stderr: %s, TTY: %s',
        hasStdout,
        hasStderr,
        hasTTY
      )
      return {
        isValid: true,
        hasStdout,
        hasStderr,
        hasTTY,
        environment: this.environment
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger('Console validation error: %s', errorMessage)
      return {
        isValid: false,
        error: `Console validation failed: ${errorMessage}`,
        environment: this.environment
      }
    }
  }

  /**
   * Validates dual output capabilities (both file and console)
   *
   * @param filePath - Path to validate for file output
   * @returns Validation result for both output modes
   */
  public validateDualOutput(filePath: string): ValidationResult {
    logger('Validating dual output capabilities for: %s', filePath)

    const fileValidation = this.validateFilePermissions(filePath)
    const consoleValidation = this.validateConsoleCapabilities()

    if (!fileValidation.isValid && !consoleValidation.isValid) {
      return {
        isValid: false,
        error: `Both file and console validation failed - File: ${fileValidation.error}, Console: ${consoleValidation.error}`,
        context: {
          fileValidation,
          consoleValidation
        }
      }
    }

    if (!fileValidation.isValid) {
      logger('Dual validation: file failed, console available')
      return {
        isValid: true,
        context: {
          fileValidation,
          consoleValidation,
          fallbackMode: 'console'
        }
      }
    }

    if (!consoleValidation.isValid) {
      logger('Dual validation: console failed, file available')
      return {
        isValid: true,
        context: {
          fileValidation,
          consoleValidation,
          fallbackMode: 'file'
        }
      }
    }

    logger('Dual validation: both modes available')
    return {
      isValid: true,
      context: {
        fileValidation,
        consoleValidation,
        fallbackMode: 'none'
      }
    }
  }

  /**
   * Updates the environment information (useful for testing)
   *
   * @param environment - New environment information
   */
  public updateEnvironment(environment: EnvironmentInfo): void {
    this.environment = environment
    logger('Environment updated: %o', environment.capabilities)
  }

  /**
   * Gets current environment information
   *
   * @returns Current environment info
   */
  public getEnvironment(): EnvironmentInfo {
    return this.environment
  }

  /**
   * Clears internal caches
   */
  public clearCache(): void {
    this.pathValidator.clearCache()
    logger('Validator cache cleared')
  }
}
