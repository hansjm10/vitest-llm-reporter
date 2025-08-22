/**
 * Dual Output Strategy
 *
 * Implements parallel output to both file and console with fallback chain,
 * performance optimization, and graceful degradation on failures.
 *
 * @module output-strategies
 */

import { FileOutputStrategy } from './FileOutputStrategy.js'
import { ConsoleOutputStrategy } from './ConsoleOutputStrategy.js'
import { OutputValidator } from '../validators/OutputValidator.js'
import { createLogger } from '../../utils/logger.js'
import type { OutputStrategy, FileOutputConfig } from './FileOutputStrategy.js'
import type { ConsoleOutputConfig } from './ConsoleOutputStrategy.js'
import type { LLMReporterOutput } from '../../types/schema.js'

const logger = createLogger('dual-output-strategy')

/**
 * Fallback behavior when one strategy fails
 */
export type FallbackMode = 'fail-fast' | 'continue-on-error' | 'require-both'

/**
 * Configuration for dual output strategy
 */
export interface DualOutputConfig {
  /** File output configuration */
  file: FileOutputConfig
  /** Console output configuration */
  console: ConsoleOutputConfig
  /** Behavior options */
  options?: {
    /** How to handle failures (default: 'continue-on-error') */
    fallbackMode?: FallbackMode
    /** Use parallel writes for performance (default: true) */
    enableParallelWrites?: boolean
    /** Timeout for individual operations in milliseconds (default: 5000) */
    operationTimeout?: number
    /** Retry failed operations (default: 1) */
    retryAttempts?: number
  }
}

/**
 * Default configuration for dual output
 */
const DEFAULT_DUAL_CONFIG = {
  fallbackMode: 'continue-on-error' as FallbackMode,
  enableParallelWrites: true,
  operationTimeout: 5000,
  retryAttempts: 1
}

/**
 * Result of a dual operation
 */
interface DualOperationResult {
  fileSuccess: boolean
  consoleSuccess: boolean
  fileError?: string
  consoleError?: string
  executionTime: number
}

/**
 * Dual output strategy combining file and console output
 *
 * This strategy manages both file and console output strategies,
 * providing fallback capabilities and parallel execution for performance.
 *
 * @example
 * ```typescript
 * const strategy = new DualOutputStrategy({
 *   file: { filePath: './output/results.json' },
 *   console: { stream: 'stdout', formatting: { spaces: 2 } },
 *   options: { fallbackMode: 'continue-on-error' }
 * });
 *
 * if (strategy.canExecute()) {
 *   await strategy.initialize();
 *   await strategy.write(reporterOutput);
 *   await strategy.close();
 * }
 * ```
 */
export class DualOutputStrategy implements OutputStrategy {
  private fileStrategy: FileOutputStrategy
  private consoleStrategy: ConsoleOutputStrategy
  private validator: OutputValidator
  private config: Required<NonNullable<DualOutputConfig['options']>>
  private initialized = false

  constructor(config: DualOutputConfig) {
    this.fileStrategy = new FileOutputStrategy(config.file)
    this.consoleStrategy = new ConsoleOutputStrategy(config.console)
    this.validator = new OutputValidator()
    this.config = { ...DEFAULT_DUAL_CONFIG, ...(config.options || {}) }

    logger('DualOutputStrategy created with fallback mode: %s', this.config.fallbackMode)
  }

  /**
   * Checks if dual output is possible in the current environment
   */
  public canExecute(): boolean {
    logger('Checking if dual output can execute')

    const fileCanExecute = this.fileStrategy.canExecute()
    const consoleCanExecute = this.consoleStrategy.canExecute()

    logger('File strategy can execute: %s', fileCanExecute)
    logger('Console strategy can execute: %s', consoleCanExecute)

    switch (this.config.fallbackMode) {
      case 'require-both':
        // Both strategies must be available
        return fileCanExecute && consoleCanExecute

      case 'fail-fast':
      case 'continue-on-error':
        // At least one strategy must be available
        return fileCanExecute || consoleCanExecute

      default:
        logger('Unknown fallback mode: %s', this.config.fallbackMode)
        return false
    }
  }

  /**
   * Initializes both output strategies
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger('DualOutputStrategy already initialized')
      return
    }

    logger('Initializing DualOutputStrategy')

    const fileCanExecute = this.fileStrategy.canExecute()
    const consoleCanExecute = this.consoleStrategy.canExecute()

    // Initialize strategies that can execute
    const initPromises: Promise<void>[] = []

    if (fileCanExecute) {
      initPromises.push(this.withTimeout(this.fileStrategy.initialize(), 'file initialization'))
    }

    if (consoleCanExecute) {
      initPromises.push(
        this.withTimeout(this.consoleStrategy.initialize(), 'console initialization')
      )
    }

    // Handle initialization based on fallback mode
    try {
      if (this.config.enableParallelWrites && initPromises.length > 1) {
        // Parallel initialization
        const results = await Promise.allSettled(initPromises)
        await this.handleInitializationResults(results, fileCanExecute, consoleCanExecute)
      } else {
        // Sequential initialization
        for (const promise of initPromises) {
          await promise
        }
      }

      this.initialized = true
      logger('DualOutputStrategy initialized successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger('Dual output initialization failed: %s', errorMessage)
      throw new Error(`Dual output initialization failed: ${errorMessage}`)
    }
  }

  /**
   * Handles initialization results from parallel execution
   */
  private async handleInitializationResults(
    results: PromiseSettledResult<void>[],
    fileCanExecute: boolean,
    _consoleCanExecute: boolean
  ): Promise<void> {
    const failures: string[] = []

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const strategyName = fileCanExecute && index === 0 ? 'file' : 'console'
        failures.push(`${strategyName}: ${result.reason}`)
      }
    })

    if (failures.length > 0) {
      const errorMessage = failures.join(', ')

      if (this.config.fallbackMode === 'require-both' || failures.length === results.length) {
        throw new Error(`Strategy initialization failed: ${errorMessage}`)
      }

      logger('Some strategies failed to initialize: %s', errorMessage)
    }

    return Promise.resolve()
  }

  /**
   * Writes data using both strategies
   */
  public async write(data: LLMReporterOutput): Promise<void> {
    if (!this.initialized) {
      throw new Error('DualOutputStrategy not initialized. Call initialize() first.')
    }

    logger('Writing data using dual output strategy')

    const startTime = Date.now()
    let result: DualOperationResult

    if (this.config.enableParallelWrites) {
      result = await this.writeParallel(data)
    } else {
      result = await this.writeSequential(data)
    }

    result.executionTime = Date.now() - startTime
    logger(
      'Dual write completed in %dms - file: %s, console: %s',
      result.executionTime,
      result.fileSuccess,
      result.consoleSuccess
    )

    // Handle results based on fallback mode
    this.handleWriteResult(result)
  }

  /**
   * Performs parallel writes to both strategies
   */
  private async writeParallel(data: LLMReporterOutput): Promise<DualOperationResult> {
    const writePromises: Array<
      Promise<{ type: 'file' | 'console'; success: boolean; error?: string }>
    > = []

    // Add file write promise if file strategy can execute
    if (this.fileStrategy.canExecute()) {
      writePromises.push(
        this.withRetry(() => this.fileStrategy.write(data), 'file')
          .then(() => ({ type: 'file' as const, success: true }))
          .catch((error: Error) => ({
            type: 'file' as const,
            success: false,
            error: error.message
          }))
      )
    }

    // Add console write promise if console strategy can execute
    if (this.consoleStrategy.canExecute()) {
      writePromises.push(
        this.withRetry(() => this.consoleStrategy.write(data), 'console')
          .then(() => ({ type: 'console' as const, success: true }))
          .catch((error: Error) => ({
            type: 'console' as const,
            success: false,
            error: error.message
          }))
      )
    }

    // Execute all writes in parallel
    const results = await Promise.allSettled(writePromises)

    return this.processParallelResults(results)
  }

  /**
   * Processes results from parallel write operations
   */
  private processParallelResults(
    results: PromiseSettledResult<{ type: 'file' | 'console'; success: boolean; error?: string }>[]
  ): DualOperationResult {
    const result: DualOperationResult = {
      fileSuccess: false,
      consoleSuccess: false,
      executionTime: 0
    }

    results.forEach((promiseResult) => {
      if (promiseResult.status === 'fulfilled') {
        const operationResult = promiseResult.value
        if (operationResult.type === 'file') {
          result.fileSuccess = operationResult.success
          result.fileError = operationResult.error
        } else {
          result.consoleSuccess = operationResult.success
          result.consoleError = operationResult.error
        }
      } else {
        // Promise itself was rejected
        const error =
          promiseResult.reason instanceof Error
            ? promiseResult.reason.message
            : String(promiseResult.reason)

        // We can't determine which strategy failed from here,
        // so we'll set both as potentially failed
        if (!result.fileError) result.fileError = error
        if (!result.consoleError) result.consoleError = error
      }
    })

    return result
  }

  /**
   * Performs sequential writes to both strategies
   */
  private async writeSequential(data: LLMReporterOutput): Promise<DualOperationResult> {
    const result: DualOperationResult = {
      fileSuccess: false,
      consoleSuccess: false,
      executionTime: 0
    }

    // Try file strategy first
    if (this.fileStrategy.canExecute()) {
      try {
        await this.withRetry(() => this.fileStrategy.write(data), 'file')
        result.fileSuccess = true
        logger('File write successful')
      } catch (error) {
        result.fileError = error instanceof Error ? error.message : String(error)
        logger('File write failed: %s', result.fileError)
      }
    }

    // Try console strategy second
    if (this.consoleStrategy.canExecute()) {
      try {
        await this.withRetry(() => this.consoleStrategy.write(data), 'console')
        result.consoleSuccess = true
        logger('Console write successful')
      } catch (error) {
        result.consoleError = error instanceof Error ? error.message : String(error)
        logger('Console write failed: %s', result.consoleError)
      }
    }

    return result
  }

  /**
   * Handles the result of write operations based on fallback mode
   */
  private handleWriteResult(result: DualOperationResult): void {
    const { fileSuccess, consoleSuccess, fileError, consoleError } = result

    switch (this.config.fallbackMode) {
      case 'require-both':
        if (!fileSuccess || !consoleSuccess) {
          const errors = [fileError, consoleError].filter(Boolean).join(', ')
          throw new Error(`Dual write failed - both strategies required: ${errors}`)
        }
        break

      case 'fail-fast':
        if (!fileSuccess && !consoleSuccess) {
          const errors = [fileError, consoleError].filter(Boolean).join(', ')
          throw new Error(`All write strategies failed: ${errors}`)
        }
        break

      case 'continue-on-error':
        if (!fileSuccess && !consoleSuccess) {
          const errors = [fileError, consoleError].filter(Boolean).join(', ')
          logger('All strategies failed but continuing: %s', errors)
        }
        break
    }
  }

  /**
   * Closes both strategies
   */
  public async close(): Promise<void> {
    if (!this.initialized) {
      logger('DualOutputStrategy not initialized, nothing to close')
      return
    }

    logger('Closing DualOutputStrategy')

    const closePromises: Promise<void>[] = []

    // Add close promises for active strategies
    if (this.fileStrategy.canExecute()) {
      closePromises.push(
        this.withTimeout(this.fileStrategy.close(), 'file close').catch((error) => {
          logger('File strategy close failed: %s', error)
        })
      )
    }

    if (this.consoleStrategy.canExecute()) {
      closePromises.push(
        this.withTimeout(this.consoleStrategy.close(), 'console close').catch((error) => {
          logger('Console strategy close failed: %s', error)
        })
      )
    }

    // Wait for all closes to complete
    if (closePromises.length > 0) {
      await Promise.allSettled(closePromises)
    }

    this.initialized = false
    logger('DualOutputStrategy closed')
  }

  /**
   * Wraps an operation with timeout
   */
  private async withTimeout<T>(operation: Promise<T>, operationName: string): Promise<T> {
    return Promise.race([
      operation,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${operationName} timed out`)),
          this.config.operationTimeout
        )
      )
    ])
  }

  /**
   * Wraps an operation with retry logic
   */
  private async withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error = new Error(`${operationName} failed with no attempts`)

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.withTimeout(operation(), `${operationName} attempt ${attempt + 1}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < this.config.retryAttempts) {
          const delay = Math.min(100 * Math.pow(2, attempt), 1000) // Exponential backoff, max 1s
          logger(
            'Retry %d for %s failed: %s (retrying in %dms)',
            attempt + 1,
            operationName,
            lastError.message,
            delay
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }

  /**
   * Gets the configuration for both strategies
   */
  public getConfig(): {
    file: ReturnType<FileOutputStrategy['getConfig']>
    console: ReturnType<ConsoleOutputStrategy['getConfig']>
    options: Required<NonNullable<DualOutputConfig['options']>>
  } {
    return {
      file: this.fileStrategy.getConfig(),
      console: this.consoleStrategy.getConfig(),
      options: { ...this.config }
    }
  }

  /**
   * Gets the individual strategies for advanced usage
   */
  public getStrategies(): {
    file: FileOutputStrategy
    console: ConsoleOutputStrategy
  } {
    return {
      file: this.fileStrategy,
      console: this.consoleStrategy
    }
  }
}
