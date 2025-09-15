/**
 * Console types for the reporter
 *
 * @module types/console
 */

export type ConsoleMethod = 'log' | 'error' | 'warn' | 'debug' | 'info' | 'trace'

export interface ConsoleEntry {
  method: ConsoleMethod
  message: string
  timestamp?: number
}

export interface ConsoleBufferConfig {
  maxBytes?: number
  maxLines?: number
  includeTimestamp?: boolean
  stripAnsi?: boolean
}

export interface ConsoleCaptureConfig extends ConsoleBufferConfig {
  enabled?: boolean
  gracePeriodMs?: number // Time to wait for async console output
  /** Include debug/trace output when capturing */
  includeDebugOutput?: boolean
}

// Import types needed for CaptureResult
import type { ConsoleEvent } from './schema.js'
/**
 * Result returned by ConsoleCapture.stopCapture()
 */
export interface CaptureResult {
  /** Array of captured console events */
  entries: ConsoleEvent[]
}

// Re-export types that are used with CaptureResult
export type { ConsoleEvent } from './schema.js'
