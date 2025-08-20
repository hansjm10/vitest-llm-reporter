/**
 * Buffer Stream Bridge
 * 
 * Provides streaming integration for ConsoleBuffer, allowing buffer contents
 * to be streamed in real-time while maintaining existing buffer functionality
 * for file-based output.
 * 
 * @module streaming/BufferStreamBridge
 */

import type { ConsoleBuffer } from '../console/buffer'
import type { IStreamManager, StreamOperation } from './types'
import { StreamPriority } from './types'
import type { ConsoleMethod } from '../types/console'
import { createLogger } from '../utils/logger'

/**
 * Configuration for buffer streaming
 */
export interface BufferStreamConfig {
  /** Enable real-time streaming of buffer additions */
  enableRealTimeStreaming: boolean
  /** Batch multiple additions before streaming */
  batchSize: number
  /** Maximum time to wait before flushing batch (ms) */
  batchTimeout: number
  /** Enable streaming of buffer flushes */
  streamFlushes: boolean
}

const DEFAULT_BUFFER_STREAM_CONFIG: BufferStreamConfig = {
  enableRealTimeStreaming: true,
  batchSize: 5,
  batchTimeout: 250,
  streamFlushes: true
}

/**
 * Priority mapping for console methods in streaming
 */
const METHOD_PRIORITY_MAP: Record<ConsoleMethod, StreamPriority> = {
  error: StreamPriority.HIGH,
  warn: StreamPriority.NORMAL,
  info: StreamPriority.NORMAL,
  log: StreamPriority.LOW,
  debug: StreamPriority.DEBUG,
  trace: StreamPriority.DEBUG
}

/**
 * Stream mapping for console methods
 */
const METHOD_STREAM_MAP: Record<ConsoleMethod, 'stdout' | 'stderr'> = {
  error: 'stderr',
  warn: 'stderr',
  info: 'stdout',
  log: 'stdout',
  debug: 'stdout',
  trace: 'stdout'
}

/**
 * Queued buffer operation for batching
 */
interface QueuedBufferOperation {
  method: ConsoleMethod
  content: string
  testId?: string
  timestamp: number
}

/**
 * Bridge that connects ConsoleBuffer with StreamManager for real-time output
 */
export class BufferStreamBridge {
  private streamManager?: IStreamManager
  private config: BufferStreamConfig = DEFAULT_BUFFER_STREAM_CONFIG
  private debug = createLogger('buffer-stream-bridge')
  private queuedOperations: QueuedBufferOperation[] = []
  private batchTimer?: NodeJS.Timeout
  private isInitialized = false

  /**
   * Initialize the bridge with a stream manager
   */
  initialize(streamManager: IStreamManager, config?: Partial<BufferStreamConfig>): void {
    this.streamManager = streamManager
    this.config = { ...DEFAULT_BUFFER_STREAM_CONFIG, ...config }
    this.isInitialized = true

    this.debug('BufferStreamBridge initialized with config: %o', this.config)
  }

  /**
   * Stream a buffer addition in real-time
   */
  async streamBufferAddition(
    method: ConsoleMethod, 
    content: string, 
    testId?: string
  ): Promise<void> {
    if (!this.isReady() || !this.config.enableRealTimeStreaming) {
      return
    }

    const operation: QueuedBufferOperation = {
      method,
      content,
      testId,
      timestamp: Date.now()
    }

    if (this.config.batchSize <= 1) {
      // Stream immediately without batching
      await this.streamOperation(operation)
    } else {
      // Add to batch queue
      this.queuedOperations.push(operation)
      this.scheduleBatchFlush()

      // If batch is full, flush immediately
      if (this.queuedOperations.length >= this.config.batchSize) {
        await this.flushBatch()
      }
    }
  }

  /**
   * Stream entire buffer contents (for buffer flush operations)
   */
  async streamBufferFlush(
    buffer: ConsoleBuffer, 
    testId?: string
  ): Promise<void> {
    if (!this.isReady() || !this.config.streamFlushes) {
      return
    }

    try {
      // Get simplified output for streaming
      const output = buffer.getSimplifiedOutput()
      
      // Stream each method's output
      for (const [methodKey, lines] of Object.entries(output)) {
        if (!lines || lines.length === 0) continue

        // Map simplified output keys back to console methods
        const method = this.mapOutputKeyToMethod(methodKey)
        if (!method) continue

        // Create a summary of the flushed content
        const content = this.formatBufferFlushOutput(method, lines, testId)
        
        const operation: StreamOperation = {
          content,
          priority: METHOD_PRIORITY_MAP[method],
          stream: METHOD_STREAM_MAP[method],
          testId,
          timestamp: Date.now()
        }

        await this.streamManager!.write(operation)
      }
    } catch (error) {
      this.debug('Failed to stream buffer flush: %o', error)
    }
  }

  /**
   * Check if bridge is ready for streaming
   */
  isReady(): boolean {
    return this.isInitialized && 
           this.streamManager !== undefined && 
           this.streamManager.isReady()
  }

  /**
   * Cleanup bridge resources
   */
  destroy(): void {
    this.clearBatchTimer()
    this.queuedOperations = []
    this.streamManager = undefined
    this.isInitialized = false
    this.debug('BufferStreamBridge destroyed')
  }

  /**
   * Manually flush any queued batch operations
   */
  async flushBatch(): Promise<void> {
    if (this.queuedOperations.length === 0) {
      return
    }

    const operations = this.queuedOperations.splice(0) // Clear queue
    this.clearBatchTimer()

    // Group operations by method for more efficient streaming
    const groupedOps = this.groupOperationsByMethod(operations)

    for (const [method, ops] of groupedOps.entries()) {
      const content = this.formatBatchedOutput(method, ops)
      const streamOperation: StreamOperation = {
        content,
        priority: METHOD_PRIORITY_MAP[method],
        stream: METHOD_STREAM_MAP[method],
        testId: ops[0].testId, // Use first operation's testId
        timestamp: Date.now()
      }

      try {
        await this.streamManager!.write(streamOperation)
      } catch (error) {
        this.debug('Failed to stream batched operation: %o', error)
      }
    }
  }

  /**
   * Stream a single operation immediately
   */
  private async streamOperation(operation: QueuedBufferOperation): Promise<void> {
    const streamOp: StreamOperation = {
      content: this.formatSingleOutput(operation),
      priority: METHOD_PRIORITY_MAP[operation.method],
      stream: METHOD_STREAM_MAP[operation.method],
      testId: operation.testId,
      timestamp: operation.timestamp
    }

    try {
      await this.streamManager!.write(streamOp)
    } catch (error) {
      this.debug('Failed to stream single operation: %o', error)
    }
  }

  /**
   * Schedule batch flush timer
   */
  private scheduleBatchFlush(): void {
    if (this.batchTimer) {
      return // Timer already scheduled
    }

    this.batchTimer = setTimeout(async () => {
      await this.flushBatch()
    }, this.config.batchTimeout)
  }

  /**
   * Clear batch flush timer
   */
  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = undefined
    }
  }

  /**
   * Group operations by console method for batching
   */
  private groupOperationsByMethod(
    operations: QueuedBufferOperation[]
  ): Map<ConsoleMethod, QueuedBufferOperation[]> {
    const grouped = new Map<ConsoleMethod, QueuedBufferOperation[]>()

    for (const op of operations) {
      const existing = grouped.get(op.method) || []
      existing.push(op)
      grouped.set(op.method, existing)
    }

    return grouped
  }

  /**
   * Format single operation for streaming
   */
  private formatSingleOutput(operation: QueuedBufferOperation): string {
    const testInfo = operation.testId ? `[${operation.testId}]` : ''
    const methodInfo = operation.method.toUpperCase()
    return `${testInfo}[${methodInfo}] ${operation.content}\n`
  }

  /**
   * Format batched operations for streaming
   */
  private formatBatchedOutput(
    method: ConsoleMethod, 
    operations: QueuedBufferOperation[]
  ): string {
    const methodInfo = method.toUpperCase()
    const testInfo = operations[0].testId ? `[${operations[0].testId}]` : ''
    
    if (operations.length === 1) {
      return this.formatSingleOutput(operations[0])
    }

    const contents = operations.map(op => op.content).join('\n  ')
    return `${testInfo}[${methodInfo}] Batch (${operations.length} entries):\n  ${contents}\n`
  }

  /**
   * Format buffer flush output for streaming
   */
  private formatBufferFlushOutput(
    method: ConsoleMethod, 
    lines: string[], 
    testId?: string
  ): string {
    const testInfo = testId ? `[${testId}]` : ''
    const methodInfo = method.toUpperCase()
    
    if (lines.length === 1) {
      return `${testInfo}[${methodInfo}] ${lines[0]}\n`
    }

    return `${testInfo}[${methodInfo}] Buffer Flush (${lines.length} lines):\n` +
           lines.map(line => `  ${line}`).join('\n') + '\n'
  }

  /**
   * Map simplified output keys back to console methods
   */
  private mapOutputKeyToMethod(key: string): ConsoleMethod | null {
    const mapping: Record<string, ConsoleMethod> = {
      'logs': 'log',
      'errors': 'error',
      'warns': 'warn',
      'info': 'info',
      'debug': 'debug'
    }

    return mapping[key] || null
  }
}

/**
 * Singleton instance of BufferStreamBridge for use across the application
 */
export const bufferStreamBridge = new BufferStreamBridge()