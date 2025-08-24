/**
 * Stream Buffer for Experimental Streaming
 * 
 * A lightweight buffer implementation for experimental streaming support.
 * Collects events during test execution and flushes them at the end.
 * 
 * @module streaming/StreamBuffer
 */

import type { TestResult } from '../types/schema'
import { coreLogger } from '../utils/logger'

export interface BufferEvent {
  type: 'test-start' | 'test-complete' | 'test-error' | 'suite-start' | 'suite-complete'
  timestamp: number
  data: any
}

export interface StreamBufferConfig {
  enabled?: boolean
  maxBufferSize?: number
  flushOnError?: boolean
}

/**
 * Lightweight stream buffer for experimental streaming mode
 */
export class StreamBuffer {
  private events: BufferEvent[] = []
  private config: Required<StreamBufferConfig>
  private debug = coreLogger()
  private startTime?: number

  constructor(config: StreamBufferConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      maxBufferSize: config.maxBufferSize ?? 10000,
      flushOnError: config.flushOnError ?? true
    }
    
    if (this.config.enabled) {
      this.debug('Experimental streaming buffer initialized')
    }
  }

  /**
   * Start tracking timing
   */
  start(): void {
    if (!this.config.enabled) return
    this.startTime = Date.now()
    this.debug('Stream buffer started')
  }

  /**
   * Add an event to the buffer
   */
  addEvent(type: BufferEvent['type'], data: any): void {
    if (!this.config.enabled) return
    
    // Prevent buffer overflow
    if (this.events.length >= this.config.maxBufferSize) {
      this.debug(`Buffer at max size (${this.config.maxBufferSize}), dropping oldest event`)
      this.events.shift()
    }

    this.events.push({
      type,
      timestamp: Date.now(),
      data
    })
  }

  /**
   * Get buffered events without clearing
   */
  getEvents(): BufferEvent[] {
    return [...this.events]
  }

  /**
   * Flush all events and return them
   */
  flush(): BufferEvent[] {
    const events = [...this.events]
    this.events = []
    
    if (this.config.enabled && this.startTime) {
      const duration = Date.now() - this.startTime
      this.debug(`Flushed ${events.length} events after ${duration}ms`)
    }
    
    return events
  }

  /**
   * Clear the buffer without returning events
   */
  clear(): void {
    const count = this.events.length
    this.events = []
    if (this.config.enabled) {
      this.debug(`Cleared ${count} events from buffer`)
    }
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      eventCount: this.events.length,
      bufferSize: this.config.maxBufferSize,
      enabled: this.config.enabled,
      runtime: this.startTime ? Date.now() - this.startTime : 0
    }
  }
}

/**
 * Create a stream buffer instance
 */
export function createStreamBuffer(config?: StreamBufferConfig): StreamBuffer {
  return new StreamBuffer(config)
}