/**
 * Synchronization primitives for streaming output
 *
 * Provides mutex, semaphore, and reader-writer lock implementations
 * for coordinating concurrent test output streams.
 *
 * @module streaming/locks
 */

/**
 * Represents a waiter in a lock queue
 */
interface Waiter {
  resolve: () => void
  reject: (error: Error) => void
  timestamp: number
  id: string
}

/**
 * Configuration for lock timeout and deadlock detection
 */
export interface LockConfig {
  /** Maximum time to wait for lock acquisition (ms) */
  timeout?: number
  /** Enable deadlock detection */
  deadlockDetection?: boolean
  /** Name for debugging purposes */
  name?: string
}

/**
 * Mutual exclusion lock for critical sections
 *
 * Ensures only one operation can proceed at a time.
 * Provides deadlock detection and timeout mechanisms.
 */
export class Mutex {
  private _locked = false
  private _waiters: Waiter[] = []
  private _holder: string | null = null
  private _config: Required<LockConfig>
  private _lockCount = 0

  constructor(config: LockConfig = {}) {
    this._config = {
      timeout: config.timeout ?? 5000,
      deadlockDetection: config.deadlockDetection ?? true,
      name: config.name ?? `Mutex-${Math.random().toString(36).substr(2, 9)}`
    }
  }

  /**
   * Acquire the mutex lock
   * @param requesterId - Unique identifier for the requester
   * @returns Promise that resolves when lock is acquired
   */
  async acquire(requesterId?: string): Promise<void> {
    const id = requesterId ?? `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

    if (!this._locked) {
      this._locked = true
      this._holder = id
      this._lockCount++
      return
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => {
          this._holder = id
          this._lockCount++
          resolve()
        },
        reject,
        timestamp: Date.now(),
        id
      }

      this._waiters.push(waiter)

      // Set timeout for deadlock detection
      const timeoutId = setTimeout(() => {
        const index = this._waiters.indexOf(waiter)
        if (index >= 0) {
          this._waiters.splice(index, 1)
          reject(
            new Error(
              `Lock acquisition timeout for ${this._config.name} after ${this._config.timeout}ms. ` +
                `Current holder: ${this._holder}, Waiters: ${this._waiters.length}`
            )
          )
        }
      }, this._config.timeout)

      // Clear timeout when resolved
      const originalResolve = waiter.resolve
      waiter.resolve = () => {
        clearTimeout(timeoutId)
        originalResolve()
      }
    })
  }

  /**
   * Release the mutex lock
   * @param holderId - Identifier of the lock holder
   */
  release(holderId?: string): void {
    if (!this._locked) {
      throw new Error(`Cannot release unlocked mutex ${this._config.name}`)
    }

    if (holderId && this._holder !== holderId) {
      throw new Error(
        `Lock holder mismatch in ${this._config.name}. ` +
          `Expected: ${this._holder}, Got: ${holderId}`
      )
    }

    this._locked = false
    this._holder = null

    // Wake up next waiter
    const nextWaiter = this._waiters.shift()
    if (nextWaiter) {
      this._locked = true
      process.nextTick(() => nextWaiter.resolve())
    }
  }

  /**
   * Execute a function with the lock held
   * @param fn - Function to execute
   * @param requesterId - Identifier for the requester
   */
  async withLock<T>(fn: () => Promise<T> | T, requesterId?: string): Promise<T> {
    await this.acquire(requesterId)
    try {
      return await fn()
    } finally {
      this.release(requesterId)
    }
  }

  /**
   * Check if the mutex is currently locked
   */
  get isLocked(): boolean {
    return this._locked
  }

  /**
   * Get lock statistics for monitoring
   */
  getStats() {
    return {
      locked: this._locked,
      holder: this._holder,
      waiters: this._waiters.length,
      lockCount: this._lockCount,
      name: this._config.name
    }
  }
}

/**
 * Semaphore for controlling access to a limited resource pool
 *
 * Allows up to N concurrent operations to proceed.
 */
export class Semaphore {
  private _permits: number
  private _waiters: Waiter[] = []
  private _config: Required<LockConfig>
  private _acquisitions = 0

  constructor(permits: number, config: LockConfig = {}) {
    if (permits <= 0) {
      throw new Error('Semaphore permits must be positive')
    }

    this._permits = permits
    this._config = {
      timeout: config.timeout ?? 5000,
      deadlockDetection: config.deadlockDetection ?? true,
      name: config.name ?? `Semaphore-${permits}-${Math.random().toString(36).substr(2, 9)}`
    }
  }

  /**
   * Acquire a permit from the semaphore
   * @param requesterId - Unique identifier for the requester
   */
  async acquire(requesterId?: string): Promise<void> {
    const id = requesterId ?? `sem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

    if (this._permits > 0) {
      this._permits--
      this._acquisitions++
      return
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => {
          this._permits--
          this._acquisitions++
          resolve()
        },
        reject,
        timestamp: Date.now(),
        id
      }

      this._waiters.push(waiter)

      const timeoutId = setTimeout(() => {
        const index = this._waiters.indexOf(waiter)
        if (index >= 0) {
          this._waiters.splice(index, 1)
          reject(
            new Error(
              `Semaphore acquisition timeout for ${this._config.name} after ${this._config.timeout}ms. ` +
                `Available permits: ${this._permits}, Waiters: ${this._waiters.length}`
            )
          )
        }
      }, this._config.timeout)

      const originalResolve = waiter.resolve
      waiter.resolve = () => {
        clearTimeout(timeoutId)
        originalResolve()
      }
    })
  }

  /**
   * Release a permit back to the semaphore
   */
  release(): void {
    this._permits++

    const nextWaiter = this._waiters.shift()
    if (nextWaiter) {
      process.nextTick(() => nextWaiter.resolve())
    }
  }

  /**
   * Execute a function with a permit held
   * @param fn - Function to execute
   * @param requesterId - Identifier for the requester
   */
  async withPermit<T>(fn: () => Promise<T> | T, requesterId?: string): Promise<T> {
    await this.acquire(requesterId)
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Get available permits
   */
  get availablePermits(): number {
    return this._permits
  }

  /**
   * Get semaphore statistics
   */
  getStats() {
    return {
      permits: this._permits,
      waiters: this._waiters.length,
      acquisitions: this._acquisitions,
      name: this._config.name
    }
  }
}

/**
 * Reader-Writer lock for allowing multiple readers but exclusive writers
 *
 * Optimizes for scenarios where reads are more frequent than writes.
 */
export class ReadWriteLock {
  private _readers = 0
  private _writing = false
  private _readWaiters: Waiter[] = []
  private _writeWaiters: Waiter[] = []
  private _config: Required<LockConfig>
  private _readCount = 0
  private _writeCount = 0

  constructor(config: LockConfig = {}) {
    this._config = {
      timeout: config.timeout ?? 5000,
      deadlockDetection: config.deadlockDetection ?? true,
      name: config.name ?? `RWLock-${Math.random().toString(36).substr(2, 9)}`
    }
  }

  /**
   * Acquire a read lock
   * @param requesterId - Unique identifier for the requester
   */
  async acquireRead(requesterId?: string): Promise<void> {
    const id = requesterId ?? `read-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

    if (!this._writing && this._writeWaiters.length === 0) {
      this._readers++
      this._readCount++
      return
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => {
          this._readers++
          this._readCount++
          resolve()
        },
        reject,
        timestamp: Date.now(),
        id
      }

      this._readWaiters.push(waiter)

      const timeoutId = setTimeout(() => {
        const index = this._readWaiters.indexOf(waiter)
        if (index >= 0) {
          this._readWaiters.splice(index, 1)
          reject(
            new Error(
              `Read lock acquisition timeout for ${this._config.name} after ${this._config.timeout}ms. ` +
                `Readers: ${this._readers}, Writing: ${this._writing}, Write waiters: ${this._writeWaiters.length}`
            )
          )
        }
      }, this._config.timeout)

      const originalResolve = waiter.resolve
      waiter.resolve = () => {
        clearTimeout(timeoutId)
        originalResolve()
      }
    })
  }

  /**
   * Acquire a write lock
   * @param requesterId - Unique identifier for the requester
   */
  async acquireWrite(requesterId?: string): Promise<void> {
    const id = requesterId ?? `write-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

    if (!this._writing && this._readers === 0) {
      this._writing = true
      this._writeCount++
      return
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => {
          this._writing = true
          this._writeCount++
          resolve()
        },
        reject,
        timestamp: Date.now(),
        id
      }

      this._writeWaiters.push(waiter)

      const timeoutId = setTimeout(() => {
        const index = this._writeWaiters.indexOf(waiter)
        if (index >= 0) {
          this._writeWaiters.splice(index, 1)
          reject(
            new Error(
              `Write lock acquisition timeout for ${this._config.name} after ${this._config.timeout}ms. ` +
                `Readers: ${this._readers}, Writing: ${this._writing}`
            )
          )
        }
      }, this._config.timeout)

      const originalResolve = waiter.resolve
      waiter.resolve = () => {
        clearTimeout(timeoutId)
        originalResolve()
      }
    })
  }

  /**
   * Release a read lock
   */
  releaseRead(): void {
    if (this._readers <= 0) {
      throw new Error(`Cannot release read lock - no active readers in ${this._config.name}`)
    }

    this._readers--

    // If no more readers and there are waiting writers, wake up the first writer
    if (this._readers === 0 && this._writeWaiters.length > 0) {
      const nextWriter = this._writeWaiters.shift()!
      process.nextTick(() => nextWriter.resolve())
    }
  }

  /**
   * Release a write lock
   */
  releaseWrite(): void {
    if (!this._writing) {
      throw new Error(`Cannot release write lock - not currently writing in ${this._config.name}`)
    }

    this._writing = false

    // Prioritize waiting writers, then readers
    if (this._writeWaiters.length > 0) {
      const nextWriter = this._writeWaiters.shift()!
      process.nextTick(() => nextWriter.resolve())
    } else if (this._readWaiters.length > 0) {
      // Wake up all waiting readers
      const readers = this._readWaiters.splice(0)
      process.nextTick(() => {
        readers.forEach((reader) => reader.resolve())
      })
    }
  }

  /**
   * Execute a function with a read lock
   * @param fn - Function to execute
   * @param requesterId - Identifier for the requester
   */
  async withReadLock<T>(fn: () => Promise<T> | T, requesterId?: string): Promise<T> {
    await this.acquireRead(requesterId)
    try {
      return await fn()
    } finally {
      this.releaseRead()
    }
  }

  /**
   * Execute a function with a write lock
   * @param fn - Function to execute
   * @param requesterId - Identifier for the requester
   */
  async withWriteLock<T>(fn: () => Promise<T> | T, requesterId?: string): Promise<T> {
    await this.acquireWrite(requesterId)
    try {
      return await fn()
    } finally {
      this.releaseWrite()
    }
  }

  /**
   * Get lock statistics
   */
  getStats() {
    return {
      readers: this._readers,
      writing: this._writing,
      readWaiters: this._readWaiters.length,
      writeWaiters: this._writeWaiters.length,
      readCount: this._readCount,
      writeCount: this._writeCount,
      name: this._config.name
    }
  }
}
