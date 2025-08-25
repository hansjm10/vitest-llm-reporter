/**
 * Streaming LLM Reporter
 *
 * Simple extension of LLMReporter that adds optional real-time console output
 * for test results as they complete.
 *
 * @module streaming/StreamingReporter
 */

import type { TestCase } from 'vitest/node'
import type { LLMReporterConfig } from '../types/reporter'
import { LLMReporter } from '../reporter/reporter'
import { coreLogger } from '../utils/logger'

/**
 * Streaming reporter configuration
 */
export interface StreamingReporterConfig extends LLMReporterConfig {
  /** Enable real-time console output */
  enableStreaming?: boolean
  /** Custom output handler for streaming results */
  onStreamOutput?: (message: string) => void
}

/**
 * Simple streaming reporter that extends base LLMReporter
 * with optional real-time test result output.
 */
export class StreamingReporter extends LLMReporter {
  private streamingEnabled: boolean
  private outputHandler: (message: string) => void
  private streamDebug = coreLogger()

  constructor(config: StreamingReporterConfig = {}) {
    super(config)

    this.streamingEnabled = config.enableStreaming ?? false
    this.outputHandler = config.onStreamOutput ?? ((msg) => process.stdout.write(msg))

    if (this.streamingEnabled) {
      this.streamDebug('Streaming output enabled')
    }
  }

  /**
   * Override to stream test results as they complete
   */
  onTestCaseResult(testCase: TestCase): void {
    // Call parent implementation
    super.onTestCaseResult(testCase)

    // Stream result if enabled
    if (this.streamingEnabled) {
      // Access the result property directly (it's not a function)
      const result = (testCase as any).result
      if (result) {
        // Normalize state values (Vitest uses 'pass'/'fail', we display 'passed'/'failed')
        const status =
          result.state === 'fail'
            ? '✗'
            : result.state === 'pass'
              ? '✓'
              : result.state === 'skip'
                ? '○'
                : '?'

        const duration = result.duration ?? 0
        const message = `  ${status} ${testCase.name} (${duration}ms)\n`

        this.outputHandler(message)
      }
    }
  }

  /**
   * Check if streaming is enabled
   */
  get isStreaming(): boolean {
    return this.streamingEnabled
  }

  /**
   * Enable or disable streaming at runtime
   */
  setStreamingEnabled(enabled: boolean): void {
    this.streamingEnabled = enabled
    this.streamDebug(`Streaming ${enabled ? 'enabled' : 'disabled'}`)
  }
}
