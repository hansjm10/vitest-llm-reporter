/**
 * Console Stream Adapter
 *
 * Bridges the existing ConsoleCapture system with the new StreamManager
 * to enable real-time console output streaming while maintaining
 * backward compatibility with file-based output.
 *
 * @module streaming/ConsoleStreamAdapter
 */

import type {
  IConsoleStreamAdapter,
  IStreamManager,
  ConsoleStreamData,
  StreamOperation
} from './types'
import { StreamPriority } from './types'
import type { ConsoleMethod } from '../types/console'
import { createLogger } from '../utils/logger'

/**
 * Maps console methods to stream priorities
 */
const CONSOLE_PRIORITY_MAP: Record<ConsoleMethod, StreamPriority> = {
  error: StreamPriority.HIGH,
  warn: StreamPriority.NORMAL,
  info: StreamPriority.NORMAL,
  log: StreamPriority.LOW,
  debug: StreamPriority.DEBUG,
  trace: StreamPriority.DEBUG
}

/**
 * Maps console methods to output streams
 */
const CONSOLE_STREAM_MAP: Record<ConsoleMethod, 'stdout' | 'stderr'> = {
  error: 'stderr',
  warn: 'stderr',
  info: 'stdout',
  log: 'stdout',
  debug: 'stdout',
  trace: 'stdout'
}

/**
 * Adapter that bridges ConsoleCapture with StreamManager for real-time output
 */
export class ConsoleStreamAdapter implements IConsoleStreamAdapter {
  private streamManager?: IStreamManager
  private debug = createLogger('console-stream-adapter')
  private isInitialized = false

  initialize(streamManager: IStreamManager): void {
    this.streamManager = streamManager
    this.isInitialized = true

    // Listen for stream events
    this.streamManager.on('stream_error', (event) => {
      this.debug('Stream error occurred: %o', event.error)
    })

    this.streamManager.on('stream_backpressure', (event) => {
      this.debug('Stream backpressure detected: %o', event.data)
    })

    this.debug('ConsoleStreamAdapter initialized')
  }

  async streamConsoleData(data: ConsoleStreamData): Promise<void> {
    if (!this.isReady()) {
      this.debug('Adapter not ready, skipping console data: %s', data.testId)
      return
    }

    try {
      const content = this.formatConsoleOutput(data)
      const operation: StreamOperation = {
        content,
        priority: CONSOLE_PRIORITY_MAP[data.method],
        stream: CONSOLE_STREAM_MAP[data.method],
        testId: data.testId,
        timestamp: data.timestamp
      }

      await this.streamManager!.write(operation)
    } catch (error) {
      this.debug('Failed to stream console data: %o', error)
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.streamManager !== undefined && this.streamManager.isReady()
  }

  destroy(): void {
    this.streamManager = undefined
    this.isInitialized = false
    this.debug('ConsoleStreamAdapter destroyed')
  }

  /**
   * Format console output for streaming
   */
  private formatConsoleOutput(data: ConsoleStreamData): string {
    const { method, testId, args, elapsed } = data

    // Serialize arguments safely
    const message = this.serializeArgs(args)

    // Format with test context and timing information
    const timestamp = elapsed !== undefined ? `[${elapsed}ms]` : ''
    const testInfo = testId ? `[${testId}]` : ''
    const methodInfo = method.toUpperCase()

    return `${timestamp}${testInfo}[${methodInfo}] ${message}\n`
  }

  /**
   * Safely serialize console arguments
   */
  private serializeArgs(args: unknown[]): string {
    try {
      return args
        .map((arg) => {
          if (arg === undefined) return 'undefined'
          if (arg === null) return 'null'
          if (typeof arg === 'string') return arg
          if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 0)
            } catch {
              return '[Complex Object]'
            }
          }
          return String(arg as Record<string, unknown>)
        })
        .join(' ')
    } catch (_error) {
      return '[Failed to serialize console arguments]'
    }
  }
}

/**
 * Singleton instance of ConsoleStreamAdapter for use across the application
 */
export const consoleStreamAdapter = new ConsoleStreamAdapter()
