/**
 * Priority-based queue system for streaming output
 *
 * Provides ordered execution of output operations with test-aware prioritization.
 * Handles concurrent test output scheduling and prevents output interleaving.
 *
 * @module streaming/queue
 */

/**
 * Priority levels for output operations
 */
export enum OutputPriority {
  /** Critical system messages, errors */
  CRITICAL = 0,
  /** Test failures and errors */
  HIGH = 1,
  /** Test completions and results */
  NORMAL = 2,
  /** Test progress and intermediate output */
  LOW = 3,
  /** Debug and verbose output */
  DEBUG = 4
}

/**
 * Source of the output operation
 */
export enum OutputSource {
  /** System-level output */
  SYSTEM = 'system',
  /** Test suite level */
  SUITE = 'suite',
  /** Individual test case */
  TEST = 'test',
  /** Console output from tests */
  CONSOLE = 'console',
  /** Error output */
  ERROR = 'error'
}

/**
 * Represents a queued output operation
 */
export interface QueuedOperation {
  /** Unique identifier for the operation */
  id: string
  /** Priority level for scheduling */
  priority: OutputPriority
  /** Source of the output */
  source: OutputSource
  /** Test file path (if applicable) */
  testFile?: string
  /** Test name/title (if applicable) */
  testName?: string
  /** The actual output data */
  data: string | Buffer
  /** Timestamp when operation was queued */
  timestamp: number
  /** Maximum time to wait before forcing execution (ms) */
  timeout?: number
  /** Callback to execute the operation */
  executor: () => Promise<void> | void
  /** Promise resolver for completion */
  resolve: () => void
  /** Promise rejector for errors */
  reject: (error: Error) => void
}

/**
 * Configuration for the priority queue
 */
export interface QueueConfig {
  /** Maximum number of operations to queue */
  maxSize?: number
  /** Default timeout for operations (ms) */
  defaultTimeout?: number
  /** Maximum time to batch operations (ms) */
  batchTimeout?: number
  /** Enable operation batching */
  enableBatching?: boolean
  /** Maximum operations per batch */
  maxBatchSize?: number
}

/**
 * Queue statistics
 */
export interface QueueStats {
  enqueued: number
  processed: number
  dropped: number
  timeouts: number
  batches: number
  pending: number
  processing: boolean
  config: Required<QueueConfig>
}

/**
 * Priority queue for managing concurrent output operations
 *
 * Ensures proper ordering of test output while maintaining performance.
 */
export class PriorityOutputQueue {
  protected _operations: QueuedOperation[] = []
  private _processing = false
  private _config: Required<QueueConfig>
  private _stats = {
    enqueued: 0,
    processed: 0,
    dropped: 0,
    timeouts: 0,
    batches: 0
  }

  constructor(config: QueueConfig = {}) {
    this._config = {
      maxSize: config.maxSize ?? 1000,
      defaultTimeout: config.defaultTimeout ?? 5000,
      batchTimeout: config.batchTimeout ?? 50,
      enableBatching: config.enableBatching ?? true,
      maxBatchSize: config.maxBatchSize ?? 10
    }
  }

  /**
   * Enqueue an output operation
   * @param operation - The operation to queue
   * @returns Promise that resolves when operation completes
   */
  async enqueue(
    priority: OutputPriority,
    source: OutputSource,
    data: string | Buffer,
    executor: () => Promise<void> | void,
    options: {
      testFile?: string
      testName?: string
      timeout?: number
    } = {}
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Check queue size limit
      if (this._operations.length >= this._config.maxSize) {
        this._stats.dropped++
        reject(new Error(`Queue size limit exceeded (${this._config.maxSize})`))
        return
      }

      const operation: QueuedOperation = {
        id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        priority,
        source,
        data,
        executor,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: options.timeout ?? this._config.defaultTimeout,
        testFile: options.testFile,
        testName: options.testName
      }

      this._operations.push(operation)
      this._stats.enqueued++

      // Sort by priority and timestamp
      this._operations.sort(this._compareOperations.bind(this))

      // Start processing if not already running
      if (!this._processing) {
        // Use setImmediate to allow all enqueue operations to complete first
        setImmediate(() => {
          void this._processQueue()
        })
      }
    })
  }

  /**
   * Compare operations for priority sorting
   */
  private _compareOperations(a: QueuedOperation, b: QueuedOperation): number {
    // Primary sort: priority (lower number = higher priority)
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }

    // Secondary sort: same test file operations should be grouped
    if (a.testFile && b.testFile && a.testFile === b.testFile) {
      // Operations from same test file - use timestamp
      return a.timestamp - b.timestamp
    }

    // Tertiary sort: timestamp for operations of same priority
    return a.timestamp - b.timestamp
  }

  /**
   * Process the operation queue
   */
  private async _processQueue(): Promise<void> {
    if (this._processing || this._operations.length === 0) {
      return
    }

    this._processing = true

    try {
      while (this._operations.length > 0) {
        if (this._config.enableBatching) {
          await this._processBatch()
        } else {
          await this._processSingle()
        }
        // Allow other operations to run
        await new Promise((resolve) => setImmediate(resolve))
      }
    } finally {
      this._processing = false
    }
  }

  /**
   * Process a single operation
   */
  private async _processSingle(): Promise<void> {
    const operation = this._operations.shift()
    if (!operation) return

    await this._executeOperation(operation)
  }

  /**
   * Process a batch of operations
   */
  private async _processBatch(): Promise<void> {
    const batch: QueuedOperation[] = []
    const startTime = Date.now()

    // Collect operations for batching
    while (
      batch.length < this._config.maxBatchSize &&
      this._operations.length > 0 &&
      Date.now() - startTime < this._config.batchTimeout
    ) {
      const operation = this._operations.shift()!

      // Check if operation can be batched with current batch
      if (this._canBatch(operation, batch)) {
        batch.push(operation)
      } else {
        // Return operation to queue and break
        this._operations.unshift(operation)
        break
      }
    }

    if (batch.length === 0) {
      return
    }

    this._stats.batches++

    // Execute batch operations
    if (batch.length === 1) {
      await this._executeOperation(batch[0])
    } else {
      await this._executeBatch(batch)
    }
  }

  /**
   * Check if an operation can be batched
   */
  private _canBatch(operation: QueuedOperation, batch: QueuedOperation[]): boolean {
    if (batch.length === 0) {
      return true
    }

    const firstOp = batch[0]

    // Only batch operations with same priority
    if (operation.priority !== firstOp.priority) {
      return false
    }

    // Only batch operations from same test file
    if (operation.testFile !== firstOp.testFile) {
      return false
    }

    // Don't batch critical operations
    if (operation.priority === OutputPriority.CRITICAL) {
      return false
    }

    return true
  }

  /**
   * Execute a single operation
   */
  private async _executeOperation(operation: QueuedOperation): Promise<void> {
    const timeoutId = setTimeout(() => {
      this._stats.timeouts++
      operation.reject(new Error(`Operation timeout after ${operation.timeout}ms: ${operation.id}`))
    }, operation.timeout)

    try {
      await operation.executor()
      clearTimeout(timeoutId)
      operation.resolve()
      this._stats.processed++
    } catch (error) {
      clearTimeout(timeoutId)
      operation.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Execute a batch of operations
   */
  private async _executeBatch(batch: QueuedOperation[]): Promise<void> {
    const batchPromises = batch.map(async (operation) => {
      try {
        await operation.executor()
        operation.resolve()
        this._stats.processed++
      } catch (error) {
        operation.reject(error instanceof Error ? error : new Error(String(error)))
      }
    })

    await Promise.allSettled(batchPromises)
  }

  /**
   * Clear all pending operations
   */
  clear(): void {
    const operations = this._operations.splice(0)
    operations.forEach((op) => {
      op.reject(new Error('Queue cleared'))
    })
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      ...this._stats,
      pending: this._operations.length,
      processing: this._processing,
      config: this._config
    }
  }

  /**
   * Check if queue is empty
   */
  get isEmpty(): boolean {
    return this._operations.length === 0
  }

  /**
   * Get number of pending operations
   */
  get size(): number {
    return this._operations.length
  }

  /**
   * Wait for all operations to complete
   */
  async drain(): Promise<void> {
    while (this._operations.length > 0 || this._processing) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}

/**
 * Specialized queue for test output coordination
 *
 * Provides test-aware ordering and grouping of output operations.
 */
export class TestOutputQueue extends PriorityOutputQueue {
  private _testGroups = new Map<string, QueuedOperation[]>()
  private _activeTests = new Set<string>()

  /**
   * Enqueue output for a specific test
   */
  async enqueueTestOutput(
    testFile: string,
    testName: string,
    priority: OutputPriority,
    source: OutputSource,
    data: string | Buffer,
    executor: () => Promise<void> | void
  ): Promise<void> {
    const testKey = `${testFile}::${testName}`
    this._activeTests.add(testKey)

    try {
      await this.enqueue(priority, source, data, executor, {
        testFile,
        testName
      })
    } finally {
      this._activeTests.delete(testKey)
    }
  }

  /**
   * Mark a test as completed (flush any remaining output)
   */
  async completeTest(testFile: string, testName: string): Promise<void> {
    const testKey = `${testFile}::${testName}`
    this._activeTests.delete(testKey)

    // Wait for any pending operations for this test with timeout
    const maxWaitTime = 5000 // 5 seconds max wait
    const startTime = Date.now()
    
    while (this._operations.some((op) => op.testFile === testFile && op.testName === testName)) {
      if (Date.now() - startTime > maxWaitTime) {
        // Timeout - force clear any remaining operations for this test
        this._operations = this._operations.filter(
          (op) => !(op.testFile === testFile && op.testName === testName)
        )
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  /**
   * Get active test information
   */
  getActiveTests(): string[] {
    return Array.from(this._activeTests)
  }

  /**
   * Check if a test has pending output
   */
  hasTestOutput(testFile: string, testName: string): boolean {
    return this._operations.some((op) => op.testFile === testFile && op.testName === testName)
  }
}
