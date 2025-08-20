/**
 * Streaming Infrastructure Types
 * 
 * Core types for streaming functionality including StreamManager and related interfaces
 * 
 * @module streaming/types
 */

import type { ConsoleMethod } from '../types/console'

/**
 * Streaming modes supported by the reporter
 */
export type StreamingMode = 'stdout' | 'stderr' | 'both' | 'none'

/**
 * Priority levels for streaming operations
 */
export enum StreamPriority {
  CRITICAL = 0,  // System errors, critical failures
  HIGH = 1,      // Test failures and errors
  NORMAL = 2,    // Test completions and results
  LOW = 3,       // Test progress and intermediate output
  DEBUG = 4      // Debug and verbose output
}

/**
 * Stream write operation data
 */
export interface StreamOperation {
  /** Content to write */
  content: string
  /** Priority level for ordering */
  priority: StreamPriority
  /** Target stream(s) */
  stream: StreamingMode
  /** Associated test ID (optional) */
  testId?: string
  /** Operation timestamp */
  timestamp: number
}

/**
 * Stream configuration options
 */
export interface StreamConfig {
  /** Enable/disable streaming */
  enabled: boolean
  /** Maximum buffer size for queue */
  maxBufferSize: number
  /** Flush interval in milliseconds */
  flushInterval: number
  /** Enable backpressure handling */
  enableBackpressure: boolean
}

/**
 * Console stream data for real-time output
 */
export interface ConsoleStreamData {
  /** Console method type */
  method: ConsoleMethod
  /** Test ID */
  testId: string
  /** Console arguments */
  args: unknown[]
  /** Timestamp when captured */
  timestamp: number
  /** Elapsed time since test start */
  elapsed?: number
}

/**
 * Stream event types
 */
export type StreamEventType = 
  | 'stream_start'
  | 'stream_data' 
  | 'stream_flush'
  | 'stream_error'
  | 'stream_end'
  | 'stream_backpressure'

/**
 * Stream event data
 */
export interface StreamEvent {
  type: StreamEventType
  timestamp: number
  data?: unknown
  error?: Error
  testId?: string
}

/**
 * Stream Manager interface
 * 
 * This defines the contract for the StreamManager that will be implemented
 * by Stream 1. For now, this provides the minimal interface needed for
 * console integration.
 */
export interface IStreamManager {
  /** Initialize streaming with configuration */
  initialize(config: StreamConfig): Promise<void>
  
  /** Write data to stream */
  write(operation: StreamOperation): Promise<void>
  
  /** Flush pending operations */
  flush(): Promise<void>
  
  /** Check if streaming is enabled and ready */
  isReady(): boolean
  
  /** Close streams and cleanup */
  close(): Promise<void>
  
  /** Register event listener */
  on(event: StreamEventType, listener: (event: StreamEvent) => void): void
  
  /** Unregister event listener */
  off(event: StreamEventType, listener: (event: StreamEvent) => void): void
}

/**
 * Stream adapter interface for console integration
 */
export interface IConsoleStreamAdapter {
  /** Initialize adapter with stream manager */
  initialize(streamManager: IStreamManager): void
  
  /** Stream console data in real-time */
  streamConsoleData(data: ConsoleStreamData): Promise<void>
  
  /** Check if adapter is ready for streaming */
  isReady(): boolean
  
  /** Cleanup adapter */
  destroy(): void
}