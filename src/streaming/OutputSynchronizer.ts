/**
 * Output Synchronizer for Concurrent Tests
 * 
 * Coordinates output from multiple concurrent test executions to prevent
 * interleaved output and ensure proper test result ordering.
 * 
 * @module streaming/OutputSynchronizer
 */

import { Mutex, ReadWriteLock, LockConfig } from './locks.js'
import { 
  PriorityOutputQueue, 
  TestOutputQueue,
  OutputPriority, 
  OutputSource,
  QueueConfig 
} from './queue.js'
import { StreamErrorHandler, type StreamErrorContext, RecoveryStrategy } from './ErrorHandler'
import { StreamingDiagnostics, DiagnosticEvent, DiagnosticLevel } from './diagnostics'

/**
 * Configuration for the OutputSynchronizer
 */
export interface SynchronizerConfig {
  /** Lock configuration */
  locks?: LockConfig
  /** Queue configuration */
  queue?: QueueConfig
  /** Enable test grouping */
  enableTestGrouping?: boolean
  /** Maximum concurrent test outputs */
  maxConcurrentTests?: number
  /** Deadlock detection interval (ms) */
  deadlockCheckInterval?: number
  /** Enable performance monitoring */
  enableMonitoring?: boolean
  /** Enable error handling and recovery */
  enableErrorHandling?: boolean
  /** Enable diagnostic logging */
  enableDiagnostics?: boolean
  /** Error handler configuration */
  errorHandling?: {
    /** Maximum retry attempts for different operations */
    maxRetries?: number
    /** Base retry delay in milliseconds */
    baseRetryDelay?: number
    /** Enable fallback to console output */
    enableFallbackConsole?: boolean
    /** Enable graceful degradation */
    enableGracefulDegradation?: boolean
  }
}

/**
 * Test execution context for output synchronization
 */
export interface TestContext {
  /** Test file path */
  file: string
  /** Test name/title */
  name: string
  /** Unique test execution ID */
  id: string
  /** Test start timestamp */
  startTime: number
  /** Test priority level */
  priority: OutputPriority
}

/**
 * Output operation metadata
 */
export interface OutputOperation {
  /** Context of the test generating output */
  context?: TestContext
  /** Priority of the output */
  priority: OutputPriority
  /** Source type of the output */
  source: OutputSource
  /** The actual output data */
  data: string | Buffer
  /** Stream destination (stdout/stderr) */
  stream: 'stdout' | 'stderr'
  /** Optional timeout override */
  timeout?: number
}

/**
 * Synchronization statistics
 */
export interface SynchronizerStats {
  /** Number of active test contexts */
  activeTests: number
  /** Queue statistics */
  queue: ReturnType<PriorityOutputQueue['getStats']>
  /** Lock statistics */
  locks: {
    output: ReturnType<Mutex['getStats']>
    testRegistry: ReturnType<ReadWriteLock['getStats']>
  }
  /** Deadlock detection stats */
  deadlocks: {
    detected: number
    resolved: number
    lastCheck: number
  }
  /** Performance metrics */
  performance: {
    avgProcessingTime: number
    maxProcessingTime: number
    totalOperations: number
  }
}

/**
 * Output Synchronizer for managing concurrent test output
 * 
 * Provides thread-safe coordination of test output streams with proper
 * ordering, deadlock detection, and performance optimization.
 */
export class OutputSynchronizer {
  private _config: Required<SynchronizerConfig>
  private _outputMutex: Mutex
  private _testRegistryLock: ReadWriteLock
  private _outputQueue: TestOutputQueue
  private _activeTests = new Map<string, TestContext>()
  private _testOutputOrder = new Map<string, number>()
  private _deadlockStats = { detected: 0, resolved: 0, lastCheck: 0 }
  private _performanceStats = { 
    avgProcessingTime: 0, 
    maxProcessingTime: 0, 
    totalOperations: 0,
    totalProcessingTime: 0
  }
  private _deadlockTimer?: NodeJS.Timeout
  private _shutdown = false
  private _errorHandler?: StreamErrorHandler
  private _diagnostics?: StreamingDiagnostics

  constructor(config: SynchronizerConfig = {}) {
    this._config = {
      locks: config.locks ?? {},
      queue: config.queue ?? {},
      enableTestGrouping: config.enableTestGrouping ?? true,
      maxConcurrentTests: config.maxConcurrentTests ?? 10,
      deadlockCheckInterval: config.deadlockCheckInterval ?? 5000,
      enableMonitoring: config.enableMonitoring ?? true,
      enableErrorHandling: config.enableErrorHandling ?? true,
      enableDiagnostics: config.enableDiagnostics ?? true,
      errorHandling: {
        maxRetries: 3,
        baseRetryDelay: 100,
        enableFallbackConsole: true,
        enableGracefulDegradation: true,
        ...config.errorHandling
      }
    }

    this._outputMutex = new Mutex({
      ...this._config.locks,
      name: 'OutputSynchronizer-Output'
    })

    this._testRegistryLock = new ReadWriteLock({
      ...this._config.locks,
      name: 'OutputSynchronizer-TestRegistry'
    })

    this._outputQueue = new TestOutputQueue(this._config.queue)

    // Initialize error handling
    if (this._config.enableErrorHandling) {
      this._errorHandler = new StreamErrorHandler({
        maxRetries: {
          queue: this._config.errorHandling.maxRetries,
          synchronization: this._config.errorHandling.maxRetries,
          output: this._config.errorHandling.maxRetries
        },
        baseRetryDelay: this._config.errorHandling.baseRetryDelay,
        enableFallbackConsole: this._config.errorHandling.enableFallbackConsole,
        enableErrorReporting: true
      })
    }

    // Initialize diagnostics
    if (this._config.enableDiagnostics) {
      this._diagnostics = new StreamingDiagnostics({
        enabled: true,
        enableOperationTracking: true,
        enablePerformanceWarnings: true,
        enableResourceMonitoring: true
      })
      this._diagnostics.start()
    }

    if (this._config.enableMonitoring) {
      this._startDeadlockDetection()
    }
  }

  /**
   * Register a new test context
   */
  async registerTest(context: TestContext): Promise<void> {
    const testKey = this._getTestKey(context)
    
    await this._testRegistryLock.withWriteLock(async () => {
      if (this._activeTests.has(testKey)) {
        throw new Error(`Test already registered: ${testKey}`)
      }

      if (this._activeTests.size >= this._config.maxConcurrentTests) {
        throw new Error(
          `Maximum concurrent tests exceeded (${this._config.maxConcurrentTests})`
        )
      }

      this._activeTests.set(testKey, context)
      this._testOutputOrder.set(testKey, Date.now())
    }, `register-${context.id}`)
  }

  /**
   * Unregister a test context
   */
  async unregisterTest(context: TestContext): Promise<void> {
    const testKey = this._getTestKey(context)
    
    // Wait for any pending output for this test
    await this._outputQueue.completeTest(context.file, context.name)

    await this._testRegistryLock.withWriteLock(async () => {
      this._activeTests.delete(testKey)
      this._testOutputOrder.delete(testKey)
    }, `unregister-${context.id}`)
  }

  /**
   * Write output for a test with synchronization
   */
  async writeOutput(operation: OutputOperation): Promise<void> {
    const startTime = Date.now()
    const operationId = this._diagnostics?.trackOperationStart(
      'writeOutput',
      operation.priority,
      operation.source,
      { 
        testFile: operation.context?.file,
        testName: operation.context?.name,
        dataSize: typeof operation.data === 'string' ? operation.data.length : operation.data.length
      }
    )
    
    try {
      await this._writeOutputWithRetry(operation, 1)
      this._diagnostics?.trackOperationComplete(operationId || '', true)
    } catch (error) {
      this._diagnostics?.trackOperationError(operationId || '', {
        type: 'output' as any,
        severity: 'normal' as any,
        source: {
          operation: 'writeOutput',
          priority: operation.priority,
          source: operation.source,
          testFile: operation.context?.file,
          testName: operation.context?.name
        },
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
        attempt: 1
      })
      throw error
    } finally {
      this._updatePerformanceStats(Date.now() - startTime)
    }
  }

  /**
   * Write output with retry logic and error handling
   */
  private async _writeOutputWithRetry(operation: OutputOperation, attempt: number = 1): Promise<void> {
    try {
      if (operation.context) {
        const testKey = this._getTestKey(operation.context)
        
        // Ensure test is registered
        const isRegistered = await this._testRegistryLock.withReadLock(async () => {
          return this._activeTests.has(testKey)
        }, `check-${operation.context.id}`)

        if (!isRegistered) {
          throw new Error(`Test not registered: ${testKey}`)
        }

        // Use test-aware queue
        await this._outputQueue.enqueueTestOutput(
          operation.context.file,
          operation.context.name,
          operation.priority,
          operation.source,
          operation.data,
          () => this._executeWrite(operation)
        )
      } else {
        // System-level output - use regular queue
        await this._outputQueue.enqueue(
          operation.priority,
          operation.source,
          operation.data,
          () => this._executeWrite(operation),
          { timeout: operation.timeout }
        )
      }
    } catch (error) {
      if (this._errorHandler) {
        const recoveryResult = await this._errorHandler.handleError(
          error instanceof Error ? error : new Error(String(error)),
          {
            operation: 'writeOutput',
            priority: operation.priority,
            source: operation.source,
            testFile: operation.context?.file,
            testName: operation.context?.name,
            attempt,
            metadata: { originalData: operation.data }
          }
        )

        if (recoveryResult.success) {
          if (recoveryResult.strategy === RecoveryStrategy.RETRY && recoveryResult.output?.nextAttempt) {
            // Retry the operation
            return this._writeOutputWithRetry(operation, recoveryResult.output.nextAttempt)
          } else if (recoveryResult.strategy === RecoveryStrategy.FALLBACK_CONSOLE) {
            // Already handled by error handler, operation completed via fallback
            return
          } else if (recoveryResult.strategy === RecoveryStrategy.SKIP) {
            // Skip this operation
            return
          } else if (recoveryResult.strategy === RecoveryStrategy.DEGRADE) {
            // Continue with degraded functionality
            return this._executeWriteDegraded(operation)
          }
        }
      }
      
      // If error handling is disabled or failed, rethrow
      throw error
    }
  }

  /**
   * Execute the actual write operation
   */
  private async _executeWrite(operation: OutputOperation): Promise<void> {
    await this._outputMutex.withLock(async () => {
      // Write to appropriate stream
      if (operation.stream === 'stdout') {
        process.stdout.write(operation.data)
      } else {
        process.stderr.write(operation.data)
      }
    }, operation.context?.id)
  }

  /**
   * Execute write operation in degraded mode (without locking)
   */
  private async _executeWriteDegraded(operation: OutputOperation): Promise<void> {
    try {
      // Direct write without synchronization
      if (operation.stream === 'stdout') {
        process.stdout.write(operation.data)
      } else {
        process.stderr.write(operation.data)
      }
    } catch (error) {
      // Even degraded mode failed, try console fallback
      const message = typeof operation.data === 'string' ? operation.data : operation.data.toString()
      console.log(`[DEGRADED-OUTPUT] ${message}`)
    }
  }

  /**
   * Flush all pending output
   */
  async flush(): Promise<void> {
    await this._outputQueue.drain()
  }

  /**
   * Get test key for mapping
   */
  private _getTestKey(context: TestContext): string {
    return `${context.file}::${context.name}::${context.id}`
  }

  /**
   * Start deadlock detection monitoring
   */
  private _startDeadlockDetection(): void {
    this._deadlockTimer = setInterval(() => {
      this._checkForDeadlocks()
    }, this._config.deadlockCheckInterval)
  }

  /**
   * Check for potential deadlocks
   */
  private _checkForDeadlocks(): void {
    if (this._shutdown) return

    this._deadlockStats.lastCheck = Date.now()

    const outputStats = this._outputMutex.getStats()
    const registryStats = this._testRegistryLock.getStats()
    const queueStats = this._outputQueue.getStats()

    // Detect potential deadlock conditions
    const hasDeadlock = this._detectDeadlockConditions(
      outputStats, 
      registryStats, 
      queueStats
    )

    if (hasDeadlock) {
      this._deadlockStats.detected++
      this._resolveDeadlock()
    }
  }

  /**
   * Detect deadlock conditions
   */
  private _detectDeadlockConditions(
    outputStats: any,
    registryStats: any,
    queueStats: any
  ): boolean {
    // Check for long-running locks
    const lockTimeout = this._config.locks.timeout ?? 5000
    const now = Date.now()

    // Output mutex held too long
    if (outputStats.locked && outputStats.waiters > 0) {
      return true
    }

    // Registry lock with many waiters
    if (registryStats.writeWaiters > 3 && registryStats.readWaiters > 5) {
      return true
    }

    // Queue backed up significantly
    if (queueStats.pending > 100) {
      return true
    }

    return false
  }

  /**
   * Attempt to resolve deadlock
   */
  private _resolveDeadlock(): void {
    try {
      // Clear stale operations from queue
      const queueStats = this._outputQueue.getStats()
      if (queueStats.pending > 50) {
        // Emergency clear of low priority operations
        this._outputQueue.clear()
      }

      this._deadlockStats.resolved++
    } catch (error) {
      // Log error but don't throw to prevent further issues
      console.error('Error resolving deadlock:', error)
    }
  }

  /**
   * Update performance statistics
   */
  private _updatePerformanceStats(processingTime: number): void {
    this._performanceStats.totalOperations++
    this._performanceStats.totalProcessingTime += processingTime
    this._performanceStats.avgProcessingTime = 
      this._performanceStats.totalProcessingTime / this._performanceStats.totalOperations
    this._performanceStats.maxProcessingTime = 
      Math.max(this._performanceStats.maxProcessingTime, processingTime)
  }

  /**
   * Get comprehensive synchronizer statistics
   */
  getStats(): SynchronizerStats {
    return {
      activeTests: this._activeTests.size,
      queue: this._outputQueue.getStats(),
      locks: {
        output: this._outputMutex.getStats(),
        testRegistry: this._testRegistryLock.getStats()
      },
      deadlocks: { ...this._deadlockStats },
      performance: { ...this._performanceStats }
    }
  }

  /**
   * Get list of active tests
   */
  getActiveTests(): TestContext[] {
    return Array.from(this._activeTests.values())
  }

  /**
   * Check if synchronizer is idle (no active operations)
   */
  get isIdle(): boolean {
    return this._activeTests.size === 0 && 
           this._outputQueue.isEmpty && 
           !this._outputMutex.isLocked
  }

  /**
   * Shutdown the synchronizer
   */
  async shutdown(): Promise<void> {
    this._shutdown = true
    
    if (this._deadlockTimer) {
      clearInterval(this._deadlockTimer)
    }

    try {
      // Flush remaining operations
      await this.flush()

      // Clear remaining test registrations
      await this._testRegistryLock.withWriteLock(async () => {
        this._activeTests.clear()
        this._testOutputOrder.clear()
      })
    } catch (error) {
      // Handle shutdown errors gracefully
      if (this._errorHandler) {
        await this._errorHandler.handleError(
          error instanceof Error ? error : new Error(String(error)),
          {
            operation: 'shutdown',
            priority: OutputPriority.CRITICAL,
            source: OutputSource.SYSTEM
          }
        )
      }
    } finally {
      // Stop diagnostics
      this._diagnostics?.stop()
    }
  }

  /**
   * Create a test context helper
   */
  static createTestContext(
    file: string, 
    name: string, 
    priority: OutputPriority = OutputPriority.NORMAL
  ): TestContext {
    return {
      file,
      name,
      id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      startTime: Date.now(),
      priority
    }
  }

  /**
   * Create an output operation helper
   */
  static createOutputOperation(
    data: string | Buffer,
    stream: 'stdout' | 'stderr' = 'stdout',
    priority: OutputPriority = OutputPriority.NORMAL,
    source: OutputSource = OutputSource.TEST,
    context?: TestContext
  ): OutputOperation {
    return {
      data,
      stream,
      priority,
      source,
      context
    }
  }

  /**
   * Get error handler statistics
   */
  getErrorStats() {
    return this._errorHandler?.getStats() || null
  }

  /**
   * Get diagnostics report
   */
  getDiagnosticsReport() {
    return this._diagnostics?.generateReport() || null
  }

  /**
   * Check if error handling is enabled
   */
  get hasErrorHandling(): boolean {
    return Boolean(this._errorHandler)
  }

  /**
   * Check if diagnostics are enabled
   */
  get hasDiagnostics(): boolean {
    return Boolean(this._diagnostics)
  }
}