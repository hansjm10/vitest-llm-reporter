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
}
