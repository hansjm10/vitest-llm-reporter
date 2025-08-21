/**
 * Error Handler for Streaming Operations
 *
 * Provides comprehensive error boundaries and recovery mechanisms for all streaming operations.
 * Handles stream failures, provides fallback mechanisms, and ensures graceful degradation.
 *
 * @module streaming/ErrorHandler
 */

import { coreLogger, errorLogger, perfLogger } from '../utils/logger'
import { OutputPriority, OutputSource } from './queue'

/**
 * Error types that can occur in streaming operations
 */
export enum StreamErrorType {
  /** Network/connection errors */
  CONNECTION = 'connection',
  /** Queue operation errors */
  QUEUE = 'queue',
  /** Lock/synchronization errors */
  SYNCHRONIZATION = 'synchronization',
  /** Output/file write errors */
  OUTPUT = 'output',
  /** Configuration/setup errors */
  CONFIGURATION = 'configuration',
  /** Test execution errors */
  EXECUTION = 'execution',
  /** Resource/memory errors */
  RESOURCE = 'resource',
  /** Timeout errors */
  TIMEOUT = 'timeout',
  /** Unknown/unexpected errors */
  UNKNOWN = 'unknown'
}

/**
 * Severity levels for streaming errors
 */
export enum StreamErrorSeverity {
  /** Critical errors that must stop operation */
  CRITICAL = 'critical',
  /** High priority errors that need immediate attention */
  HIGH = 'high',
  /** Normal errors that can be recovered from */
  NORMAL = 'normal',
  /** Low priority warnings */
  LOW = 'low'
}

/**
 * Recovery strategy options
 */
export enum RecoveryStrategy {
  /** Retry the operation with backoff */
  RETRY = 'retry',
  /** Fall back to file output */
  FALLBACK_FILE = 'fallback_file',
  /** Fall back to console output */
  FALLBACK_CONSOLE = 'fallback_console',
  /** Skip the operation */
  SKIP = 'skip',
  /** Abort the entire streaming session */
  ABORT = 'abort',
  /** Continue with degraded functionality */
  DEGRADE = 'degrade'
}

/**
 * Error context information
 */
export interface StreamErrorContext {
  /** Error type classification */
  type: StreamErrorType
  /** Error severity level */
  severity: StreamErrorSeverity
  /** Source operation that failed */
  source: {
    operation: string
    priority: OutputPriority
    source: OutputSource
    testFile?: string
    testName?: string
  }
  /** Original error details */
  error: Error
  /** Timestamp when error occurred */
  timestamp: number
  /** Additional context data */
  metadata?: Record<string, any>
  /** Attempt number (for retries) */
  attempt: number
  /** Stack trace of the error */
  stackTrace?: string
}

/**
 * Recovery action result
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean
  /** Strategy that was used */
  strategy: RecoveryStrategy
  /** Time taken for recovery attempt */
  duration: number
  /** Any output from recovery attempt */
  output?: any
  /** Error if recovery failed */
  error?: Error
}

/**
 * Configuration for error handling
 */
export interface ErrorHandlerConfig {
  /** Maximum retry attempts for different error types */
  maxRetries?: {
    [key in StreamErrorType]?: number
  }
  /** Base delay for exponential backoff (ms) */
  baseRetryDelay?: number
  /** Maximum retry delay (ms) */
  maxRetryDelay?: number
  /** Timeout for recovery operations (ms) */
  recoveryTimeout?: number
  /** Enable automatic fallback to file output */
  enableFallbackFile?: boolean
  /** Enable automatic fallback to console output */
  enableFallbackConsole?: boolean
  /** Path for fallback file output */
  fallbackFilePath?: string
  /** Enable error reporting/logging */
  enableErrorReporting?: boolean
  /** Function to call for custom error handling */
  customErrorHandler?: (context: StreamErrorContext) => Promise<RecoveryResult | null>
}

/**
 * Error statistics tracking
 */
interface ErrorStats {
  totalErrors: number
  errorsByType: Map<StreamErrorType, number>
  errorsBySeverity: Map<StreamErrorSeverity, number>
  recoveriesByStrategy: Map<RecoveryStrategy, number>
  successfulRecoveries: number
  failedRecoveries: number
  averageRecoveryTime: number
  lastError?: StreamErrorContext
}

/**
 * Comprehensive error handler for streaming operations
 */
export class StreamErrorHandler {
  private config: Required<Omit<ErrorHandlerConfig, 'customErrorHandler'>> & {
    customErrorHandler?: (context: StreamErrorContext) => Promise<RecoveryResult | null>
  }
  private debug = coreLogger()
  private debugError = errorLogger()
  private debugPerf = perfLogger()
  private stats: ErrorStats
  private errorHistory: StreamErrorContext[] = []
  private maxHistorySize = 100

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      maxRetries: {
        [StreamErrorType.CONNECTION]: 3,
        [StreamErrorType.QUEUE]: 2,
        [StreamErrorType.SYNCHRONIZATION]: 2,
        [StreamErrorType.OUTPUT]: 3,
        [StreamErrorType.CONFIGURATION]: 1,
        [StreamErrorType.EXECUTION]: 1,
        [StreamErrorType.RESOURCE]: 2,
        [StreamErrorType.TIMEOUT]: 2,
        [StreamErrorType.UNKNOWN]: 1,
        ...config.maxRetries
      },
      baseRetryDelay: config.baseRetryDelay ?? 100,
      maxRetryDelay: config.maxRetryDelay ?? 5000,
      recoveryTimeout: config.recoveryTimeout ?? 10000,
      enableFallbackFile: config.enableFallbackFile ?? true,
      enableFallbackConsole: config.enableFallbackConsole ?? true,
      fallbackFilePath: config.fallbackFilePath ?? 'vitest-llm-fallback.json',
      enableErrorReporting: config.enableErrorReporting ?? true,
      customErrorHandler: config.customErrorHandler
    }

    this.stats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoveriesByStrategy: new Map(),
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0
    }

    this.debug('Stream error handler initialized with config: %O', this.config)
  }

  /**
   * Handle an error with automatic recovery
   */
  async handleError(
    error: Error,
    operationContext: {
      operation: string
      priority: OutputPriority
      source: OutputSource
      testFile?: string
      testName?: string
      metadata?: Record<string, any>
      attempt?: number
    }
  ): Promise<RecoveryResult> {
    const startTime = Date.now()

    // Classify the error
    const errorContext = this.classifyError(error, operationContext)

    // Record the error
    this.recordError(errorContext)

    this.debugError(
      'Handling streaming error: %s (%s) - %s',
      errorContext.type,
      errorContext.severity,
      error.message
    )

    try {
      // Try custom error handler first
      if (this.config.customErrorHandler) {
        const customResult = await this.config.customErrorHandler(errorContext)
        if (customResult) {
          this.recordRecovery(customResult)
          return customResult
        }
      }

      // Determine recovery strategy
      const strategy = this.determineRecoveryStrategy(errorContext)

      // Execute recovery
      const result = await this.executeRecovery(errorContext, strategy)

      // Record recovery stats
      this.recordRecovery(result)

      const duration = Date.now() - startTime
      this.debugPerf(
        'Error recovery completed in %dms with strategy: %s (success: %s)',
        duration,
        strategy,
        result.success
      )

      return result
    } catch (recoveryError) {
      const duration = Date.now() - startTime
      const result: RecoveryResult = {
        success: false,
        strategy: RecoveryStrategy.ABORT,
        duration,
        error: recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError))
      }

      this.recordRecovery(result)
      this.debugError('Error recovery failed: %O', recoveryError)

      return result
    }
  }

  /**
   * Classify an error into type and severity
   */
  private classifyError(
    error: Error,
    operationContext: {
      operation: string
      priority: OutputPriority
      source: OutputSource
      testFile?: string
      testName?: string
      metadata?: Record<string, any>
      attempt?: number
    }
  ): StreamErrorContext {
    let type = StreamErrorType.UNKNOWN
    let severity = StreamErrorSeverity.NORMAL

    // Classify by error message/type
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()

    if (message.includes('timeout') || name.includes('timeout')) {
      type = StreamErrorType.TIMEOUT
      severity = StreamErrorSeverity.HIGH
    } else if (
      message.includes('connection') ||
      message.includes('network') ||
      name.includes('network')
    ) {
      type = StreamErrorType.CONNECTION
      severity = StreamErrorSeverity.HIGH
    } else if (message.includes('queue') || message.includes('limit exceeded')) {
      type = StreamErrorType.QUEUE
      severity = StreamErrorSeverity.NORMAL
    } else if (
      message.includes('lock') ||
      message.includes('deadlock') ||
      message.includes('synchroniz')
    ) {
      type = StreamErrorType.SYNCHRONIZATION
      severity = StreamErrorSeverity.HIGH
    } else if (
      message.includes('write') ||
      message.includes('file') ||
      message.includes('output') ||
      name.includes('enoent')
    ) {
      type = StreamErrorType.OUTPUT
      severity = StreamErrorSeverity.NORMAL
    } else if (message.includes('config') || message.includes('invalid')) {
      type = StreamErrorType.CONFIGURATION
      severity = StreamErrorSeverity.CRITICAL
    } else if (
      message.includes('memory') ||
      message.includes('resource') ||
      name.includes('rangeerror')
    ) {
      type = StreamErrorType.RESOURCE
      severity = StreamErrorSeverity.HIGH
    } else if (operationContext.operation.includes('test')) {
      type = StreamErrorType.EXECUTION
      severity = StreamErrorSeverity.NORMAL
    }

    // Adjust severity based on context
    if (operationContext.priority === OutputPriority.CRITICAL) {
      severity = StreamErrorSeverity.CRITICAL
    } else if (operationContext.attempt && operationContext.attempt > 1) {
      // Escalate severity for repeated failures
      if (severity === StreamErrorSeverity.NORMAL) severity = StreamErrorSeverity.HIGH
    }

    return {
      type,
      severity,
      source: {
        operation: operationContext.operation,
        priority: operationContext.priority,
        source: operationContext.source,
        testFile: operationContext.testFile,
        testName: operationContext.testName
      },
      error,
      timestamp: Date.now(),
      metadata: operationContext.metadata,
      attempt: operationContext.attempt ?? 1,
      stackTrace: error.stack
    }
  }

  /**
   * Determine the best recovery strategy for an error
   */
  private determineRecoveryStrategy(errorContext: StreamErrorContext): RecoveryStrategy {
    const { type, severity, attempt } = errorContext
    const maxRetries = this.config.maxRetries[type] ?? 1

    // Critical errors should abort
    if (severity === StreamErrorSeverity.CRITICAL) {
      return RecoveryStrategy.ABORT
    }

    // Check if we should retry
    if (attempt <= maxRetries) {
      switch (type) {
        case StreamErrorType.CONNECTION:
        case StreamErrorType.TIMEOUT:
        case StreamErrorType.RESOURCE:
          return RecoveryStrategy.RETRY

        case StreamErrorType.QUEUE:
        case StreamErrorType.SYNCHRONIZATION:
          // For queue/sync issues, try retry but also consider degradation
          return attempt === 1 ? RecoveryStrategy.RETRY : RecoveryStrategy.DEGRADE

        case StreamErrorType.OUTPUT:
          // For output errors, fallback to file
          return this.config.enableFallbackFile
            ? RecoveryStrategy.FALLBACK_FILE
            : RecoveryStrategy.RETRY

        case StreamErrorType.EXECUTION:
          // For execution errors, usually skip the operation
          return RecoveryStrategy.SKIP

        default:
          return RecoveryStrategy.RETRY
      }
    }

    // If retries exhausted, try fallback strategies
    if (this.config.enableFallbackFile && type !== StreamErrorType.OUTPUT) {
      return RecoveryStrategy.FALLBACK_FILE
    }

    if (this.config.enableFallbackConsole) {
      return RecoveryStrategy.FALLBACK_CONSOLE
    }

    // Last resort: degrade or skip
    return severity === StreamErrorSeverity.HIGH ? RecoveryStrategy.ABORT : RecoveryStrategy.SKIP
  }

  /**
   * Execute the recovery strategy
   */
  private async executeRecovery(
    errorContext: StreamErrorContext,
    strategy: RecoveryStrategy
  ): Promise<RecoveryResult> {
    const startTime = Date.now()

    switch (strategy) {
      case RecoveryStrategy.RETRY:
        return this.executeRetry(errorContext, startTime)

      case RecoveryStrategy.FALLBACK_FILE:
        return this.executeFallbackFile(errorContext, startTime)

      case RecoveryStrategy.FALLBACK_CONSOLE:
        return this.executeFallbackConsole(errorContext, startTime)

      case RecoveryStrategy.SKIP:
        return this.executeSkip(errorContext, startTime)

      case RecoveryStrategy.DEGRADE:
        return this.executeDegrade(errorContext, startTime)

      case RecoveryStrategy.ABORT:
        return this.executeAbort(errorContext, startTime)

      default:
        throw new Error(`Unknown recovery strategy: ${strategy}`)
    }
  }

  /**
   * Execute retry with exponential backoff
   */
  private async executeRetry(
    errorContext: StreamErrorContext,
    startTime: number
  ): Promise<RecoveryResult> {
    const delay = Math.min(
      this.config.baseRetryDelay * Math.pow(2, errorContext.attempt - 1),
      this.config.maxRetryDelay
    )

    this.debug('Retrying operation after %dms delay (attempt %d)', delay, errorContext.attempt + 1)

    // Wait with exponential backoff
    await new Promise((resolve) => setTimeout(resolve, delay))

    return {
      success: true, // Recovery strategy executed (actual retry will be handled by caller)
      strategy: RecoveryStrategy.RETRY,
      duration: Date.now() - startTime,
      output: { delay, nextAttempt: errorContext.attempt + 1 }
    }
  }

  /**
   * Execute fallback to file output
   */
  private async executeFallbackFile(
    errorContext: StreamErrorContext,
    startTime: number
  ): Promise<RecoveryResult> {
    try {
      const fallbackData = {
        timestamp: Date.now(),
        source: errorContext.source,
        error: {
          message: errorContext.error.message,
          type: errorContext.type,
          severity: errorContext.severity
        },
        fallbackReason: 'Streaming operation failed',
        originalData: errorContext.metadata?.originalData
      }

      // Write to fallback file using Node.js fs
      const fs = await import('fs/promises')
      const path = await import('path')

      const fallbackPath = path.resolve(this.config.fallbackFilePath)

      // Read existing fallback data or create new
      let existingData: any[] = []
      try {
        const existingContent = await fs.readFile(fallbackPath, 'utf-8')
        existingData = JSON.parse(existingContent)
      } catch {
        // File doesn't exist or is invalid, start fresh
      }

      existingData.push(fallbackData)

      await fs.writeFile(fallbackPath, JSON.stringify(existingData, null, 2))

      this.debug('Fallback data written to: %s', fallbackPath)

      return {
        success: true,
        strategy: RecoveryStrategy.FALLBACK_FILE,
        duration: Date.now() - startTime,
        output: { fallbackPath, dataCount: existingData.length }
      }
    } catch (fallbackError) {
      return {
        success: false,
        strategy: RecoveryStrategy.FALLBACK_FILE,
        duration: Date.now() - startTime,
        error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError))
      }
    }
  }

  /**
   * Execute fallback to console output
   */
  private async executeFallbackConsole(
    errorContext: StreamErrorContext,
    startTime: number
  ): Promise<RecoveryResult> {
    try {
      const message = `[STREAM-FALLBACK] ${errorContext.source.operation}: ${errorContext.error.message}`

      // Use console output as fallback
      if (
        errorContext.severity === StreamErrorSeverity.CRITICAL ||
        errorContext.severity === StreamErrorSeverity.HIGH
      ) {
        console.error(message)
      } else {
        console.log(message)
      }

      return {
        success: true,
        strategy: RecoveryStrategy.FALLBACK_CONSOLE,
        duration: Date.now() - startTime,
        output: { message }
      }
    } catch (fallbackError) {
      return {
        success: false,
        strategy: RecoveryStrategy.FALLBACK_CONSOLE,
        duration: Date.now() - startTime,
        error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError))
      }
    }
  }

  /**
   * Execute skip strategy
   */
  private async executeSkip(
    errorContext: StreamErrorContext,
    startTime: number
  ): Promise<RecoveryResult> {
    this.debug('Skipping operation due to error: %s', errorContext.source.operation)

    return {
      success: true,
      strategy: RecoveryStrategy.SKIP,
      duration: Date.now() - startTime,
      output: { skipped: true, reason: errorContext.error.message }
    }
  }

  /**
   * Execute degrade strategy
   */
  private async executeDegrade(
    errorContext: StreamErrorContext,
    startTime: number
  ): Promise<RecoveryResult> {
    this.debug('Degrading operation due to error: %s', errorContext.source.operation)

    // Signal that the operation should continue with reduced functionality
    return {
      success: true,
      strategy: RecoveryStrategy.DEGRADE,
      duration: Date.now() - startTime,
      output: { degraded: true, reason: errorContext.error.message }
    }
  }

  /**
   * Execute abort strategy
   */
  private async executeAbort(
    errorContext: StreamErrorContext,
    startTime: number
  ): Promise<RecoveryResult> {
    this.debugError('Aborting due to critical error: %s', errorContext.error.message)

    return {
      success: false,
      strategy: RecoveryStrategy.ABORT,
      duration: Date.now() - startTime,
      error: new Error(`Critical error requires abort: ${errorContext.error.message}`)
    }
  }

  /**
   * Record error in statistics
   */
  private recordError(errorContext: StreamErrorContext): void {
    this.stats.totalErrors++

    const typeCount = this.stats.errorsByType.get(errorContext.type) ?? 0
    this.stats.errorsByType.set(errorContext.type, typeCount + 1)

    const severityCount = this.stats.errorsBySeverity.get(errorContext.severity) ?? 0
    this.stats.errorsBySeverity.set(errorContext.severity, severityCount + 1)

    this.stats.lastError = errorContext

    // Add to history
    this.errorHistory.push(errorContext)
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift()
    }
  }

  /**
   * Record recovery attempt in statistics
   */
  private recordRecovery(result: RecoveryResult): void {
    const strategyCount = this.stats.recoveriesByStrategy.get(result.strategy) ?? 0
    this.stats.recoveriesByStrategy.set(result.strategy, strategyCount + 1)

    if (result.success) {
      this.stats.successfulRecoveries++
    } else {
      this.stats.failedRecoveries++
    }

    // Update average recovery time
    const totalRecoveries = this.stats.successfulRecoveries + this.stats.failedRecoveries
    this.stats.averageRecoveryTime =
      (this.stats.averageRecoveryTime * (totalRecoveries - 1) + result.duration) / totalRecoveries
  }

  /**
   * Get error and recovery statistics
   */
  getStats() {
    return {
      ...this.stats,
      errorsByType: Object.fromEntries(this.stats.errorsByType),
      errorsBySeverity: Object.fromEntries(this.stats.errorsBySeverity),
      recoveriesByStrategy: Object.fromEntries(this.stats.recoveriesByStrategy),
      recentErrors: this.errorHistory.slice(-10) // Last 10 errors
    }
  }

  /**
   * Clear error history and reset statistics
   */
  reset(): void {
    this.stats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoveriesByStrategy: new Map(),
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0
    }
    this.errorHistory = []
    this.debug('Error handler statistics reset')
  }

  /**
   * Get recent error history
   */
  getErrorHistory(): StreamErrorContext[] {
    return [...this.errorHistory]
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...config }
    this.debug('Error handler configuration updated: %O', config)
  }
}
