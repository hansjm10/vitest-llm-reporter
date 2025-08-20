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

  constructor(config: SynchronizerConfig = {}) {
    this._config = {
      locks: config.locks ?? {},
      queue: config.queue ?? {},
      enableTestGrouping: config.enableTestGrouping ?? true,
      maxConcurrentTests: config.maxConcurrentTests ?? 10,
      deadlockCheckInterval: config.deadlockCheckInterval ?? 5000,
      enableMonitoring: config.enableMonitoring ?? true
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
    } finally {
      this._updatePerformanceStats(Date.now() - startTime)
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

    // Flush remaining operations
    await this.flush()

    // Clear remaining test registrations
    await this._testRegistryLock.withWriteLock(async () => {
      this._activeTests.clear()
      this._testOutputOrder.clear()
    })
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
}