/**
 * Stream Manager - Minimal Implementation for Console Integration
 *
 * This is a basic implementation to support Console Integration (Stream 3).
 * The full implementation will be provided by Stream 1.
 *
 * @module streaming/StreamManager
 */

import { EventEmitter } from 'node:events'
import type {
  IStreamManager,
  StreamOperation,
  StreamConfig,
  StreamEvent,
  StreamEventType
} from './types'
import { createLogger } from '../utils/logger'

const DEFAULT_CONFIG: StreamConfig = {
  enabled: false,
  maxBufferSize: 1000,
  flushInterval: 100,
  enableBackpressure: true
}

/**
 * Basic StreamManager implementation for console integration
 *
 * This provides the minimal functionality needed for Stream 3 to integrate
 * console capture with streaming. The full implementation will replace this.
 */
export class StreamManager extends EventEmitter implements IStreamManager {
  private config: StreamConfig = DEFAULT_CONFIG
  private initialized = false
  private debug = createLogger('stream-manager')
  private operationQueue: StreamOperation[] = []
  private flushTimer?: NodeJS.Timeout

  async initialize(config: StreamConfig): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initialized = this.config.enabled

    if (this.initialized) {
      this.startFlushTimer()
      this.debug('StreamManager initialized with config: %o', this.config)
      this.emitEvent('stream_start', {})
    } else {
      this.debug('StreamManager disabled by configuration')
    }
  }

  async write(operation: StreamOperation): Promise<void> {
    if (!this.isReady()) {
      this.debug('StreamManager not ready, skipping write operation')
      return
    }

    // Add to queue
    if (this.operationQueue.length >= this.config.maxBufferSize) {
      if (this.config.enableBackpressure) {
        this.emitEvent('stream_backpressure', { operation })
        // Drop oldest operation to make room
        this.operationQueue.shift()
      } else {
        this.debug('Queue full, dropping operation')
        return
      }
    }

    this.operationQueue.push(operation)
    this.emitEvent('stream_data', operation)
  }

  async flush(): Promise<void> {
    if (!this.isReady()) {
      return
    }

    const operations = this.operationQueue.splice(0) // Clear queue

    // Sort by priority (lower number = higher priority)
    operations.sort((a, b) => a.priority - b.priority)

    // Write operations to appropriate streams
    for (const operation of operations) {
      try {
        this.writeToStream(operation)
      } catch (error) {
        this.emitEvent('stream_error', { error: error as Error, operation })
      }
    }

    this.emitEvent('stream_flush', { operationCount: operations.length })
  }

  private writeToStream(operation: StreamOperation): void {
    const { content, stream } = operation

    switch (stream) {
      case 'stdout':
        process.stdout.write(content)
        break
      case 'stderr':
        process.stderr.write(content)
        break
      case 'both':
        process.stdout.write(content)
        process.stderr.write(content)
        break
      case 'none':
        // No-op for disabled streaming
        break
    }
  }

  isReady(): boolean {
    return this.initialized && this.config.enabled
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }

    // Flush any remaining operations
    await this.flush()

    this.initialized = false
    this.emitEvent('stream_end', {})
    this.debug('StreamManager closed')
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      if (this.operationQueue.length > 0) {
        void this.flush()
      }
    }, this.config.flushInterval)
  }

  private emitEvent(type: StreamEventType, data: unknown): void {
    const event: StreamEvent = {
      type,
      timestamp: Date.now(),
      data
    }

    this.emit(type, event)
  }

  // EventEmitter interface compatibility
  on(event: StreamEventType, listener: (event: StreamEvent) => void): this {
    return super.on(event, listener)
  }

  off(event: StreamEventType, listener: (event: StreamEvent) => void): this {
    return super.off(event, listener)
  }
}

// Export singleton instance for use across the application
export const streamManager = new StreamManager()
