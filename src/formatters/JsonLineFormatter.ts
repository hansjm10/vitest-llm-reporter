/**
 * JSON Lines (JSONL) Streaming Formatter
 *
 * Formats test results as newline-delimited JSON (JSONL) for machine consumption.
 * Each line is a valid JSON object representing a single test event or result.
 * Ideal for log aggregation, monitoring systems, and API consumption.
 *
 * @module formatters/JsonLineFormatter
 */

import type { LLMReporterOutput } from '../types/schema'
import {
  BaseStreamingFormatter,
  type StreamingEvent,
  type FormatterConfig,
  StreamingEventType,
  type RunStartData,
  type SuiteCompleteData,
  isTestCompleteData,
  isTestFailureData,
  isRunCompleteData,
  isProgressData
} from './StreamingFormatter'

/**
 * JSONL-specific configuration options
 */
export interface JsonLineFormatterConfig extends FormatterConfig {
  /** Include raw event metadata in output */
  includeEventMetadata?: boolean
  /** Compact JSON output (no extra whitespace) */
  compact?: boolean
  /** Include schema version in output */
  includeSchemaVersion?: boolean
  /** Custom schema version */
  schemaVersion?: string
  /** Include event sequence numbers */
  includeSequence?: boolean
}

/**
 * Default JSONL formatter configuration
 */
export const DEFAULT_JSONL_CONFIG: Required<JsonLineFormatterConfig> = {
  includeTimestamps: true,
  includeProgress: true,
  useColors: false,
  includeFullErrors: true,
  maxLineLength: 10000, // Much larger for JSON
  indent: '',
  customOptions: {},
  includeEventMetadata: false,
  compact: true,
  includeSchemaVersion: true,
  schemaVersion: '1.0.0',
  includeSequence: true
}

/**
 * JSONL event envelope structure
 */
interface JsonLineEvent {
  /** Schema version for compatibility */
  version?: string
  /** Event sequence number */
  sequence?: number
  /** Event type */
  event: string
  /** Event timestamp */
  timestamp?: number
  /** Test result or event data */
  data: unknown
  /** Event metadata (optional) */
  meta?: {
    progress?: {
      completed: number
      total: number
      percentage: number
    }
    counters?: {
      passed: number
      failed: number
      skipped: number
    }
  }
}

/**
 * JSON Lines streaming formatter
 *
 * Outputs each test event as a single line of JSON, following the JSONL format.
 * Each line represents a complete test event that can be processed independently.
 *
 * @example
 * ```typescript
 * const formatter = new JsonLineFormatter({
 *   compact: true,
 *   includeProgress: true
 * });
 *
 * await formatter.initialize();
 *
 * // Output: {"event":"test-complete","timestamp":1234567890,"data":{"test":"should work","status":"passed"},"meta":{"progress":{"completed":1,"total":5,"percentage":20}}}
 * const output = await formatter.formatEvent(testCompleteEvent);
 * ```
 */
export class JsonLineFormatter extends BaseStreamingFormatter {
  private sequence = 0
  private jsonlConfig: Required<JsonLineFormatterConfig>

  constructor(config: JsonLineFormatterConfig = {}) {
    const mergedConfig = { ...DEFAULT_JSONL_CONFIG, ...config }
    super(mergedConfig)
    this.jsonlConfig = mergedConfig
  }

  protected doInitialize(): void {
    this.sequence = 0
    this.state.custom = {
      ...this.state.custom,
      totalLinesOutput: 0
    }
  }

  formatEvent(event: StreamingEvent): string {
    if (!this.state.initialized) {
      throw new Error('JsonLineFormatter must be initialized before use')
    }

    this.updateCounters(event)

    const jsonEvent = this.createJsonLineEvent(event)
    const jsonString = this.jsonlConfig.compact
      ? JSON.stringify(jsonEvent)
      : JSON.stringify(jsonEvent, null, 2)

    // Track lines output
    const custom = this.state.custom as { totalLinesOutput?: number }
    custom.totalLinesOutput = (custom.totalLinesOutput || 0) + 1

    return jsonString + '\n'
  }

  formatFinal(output: LLMReporterOutput): string {
    if (!this.state.initialized) {
      throw new Error('JsonLineFormatter must be initialized before use')
    }

    // Create a final summary event
    const finalEvent: JsonLineEvent = {
      event: 'run-summary',
      data: {
        summary: output.summary,
        failures: output.failures?.length || 0,
        passed: output.passed?.length || 0,
        skipped: output.skipped?.length || 0,
        complete: true
      }
    }

    if (this.jsonlConfig.includeSchemaVersion) {
      finalEvent.version = this.jsonlConfig.schemaVersion
    }

    if (this.jsonlConfig.includeTimestamps) {
      finalEvent.timestamp = Date.now()
    }

    if (this.jsonlConfig.includeSequence) {
      finalEvent.sequence = ++this.sequence
    }

    const jsonString = this.jsonlConfig.compact
      ? JSON.stringify(finalEvent)
      : JSON.stringify(finalEvent, null, 2)

    // Include the full output as a separate line for completeness
    const fullOutputEvent: JsonLineEvent = {
      event: 'full-output',
      data: output
    }

    if (this.jsonlConfig.includeSchemaVersion) {
      fullOutputEvent.version = this.jsonlConfig.schemaVersion
    }

    if (this.jsonlConfig.includeTimestamps) {
      fullOutputEvent.timestamp = Date.now()
    }

    if (this.jsonlConfig.includeSequence) {
      fullOutputEvent.sequence = ++this.sequence
    }

    const fullOutputString = this.jsonlConfig.compact
      ? JSON.stringify(fullOutputEvent)
      : JSON.stringify(fullOutputEvent, null, 2)

    return jsonString + '\n' + fullOutputString + '\n'
  }

  /**
   * Create JSONL event from streaming event
   */
  private createJsonLineEvent(event: StreamingEvent): JsonLineEvent {
    const jsonEvent: JsonLineEvent = {
      event: event.type,
      data: this.transformEventData(event)
    }

    // Add schema version
    if (this.jsonlConfig.includeSchemaVersion) {
      jsonEvent.version = this.jsonlConfig.schemaVersion
    }

    // Add timestamp
    if (this.jsonlConfig.includeTimestamps) {
      jsonEvent.timestamp = event.timestamp
    }

    // Add sequence number
    if (this.jsonlConfig.includeSequence) {
      jsonEvent.sequence = ++this.sequence
    }

    // Add metadata
    if (this.jsonlConfig.includeEventMetadata) {
      jsonEvent.meta = this.createMetadata(event)
    }

    return jsonEvent
  }

  /**
   * Transform event data for JSONL output
   */
  private transformEventData(event: StreamingEvent): unknown {
    switch (event.type) {
      case StreamingEventType.RUN_START: {
        const runStart = event.data as RunStartData
        return {
          totalTests: runStart.totalTests,
          startTime: runStart.startTime,
          status: 'started'
        }
      }

      case StreamingEventType.TEST_START:
        return {
          test: event.data,
          status: 'started'
        }

      case StreamingEventType.TEST_COMPLETE:
        if (isTestCompleteData(event.data)) {
          return {
            test: event.data.result.test,
            file: event.data.result.file,
            status: event.data.result.status,
            duration: event.data.result.duration,
            suite: event.data.result.suite,
            startLine: event.data.result.startLine,
            endLine: event.data.result.endLine
          }
        }
        return event.data

      case StreamingEventType.TEST_FAILURE:
        if (isTestFailureData(event.data)) {
          const failure = event.data.failure
          return {
            test: failure.test,
            file: failure.file,
            status: 'failed',
            error: {
              message: failure.error.message,
              type: failure.error.type,
              stack: this.jsonlConfig.includeFullErrors ? failure.error.stack : undefined,
              assertion: failure.error.assertion,
              context: failure.error.context
            },
            suite: failure.suite,
            startLine: failure.startLine,
            endLine: failure.endLine,
            console: failure.console
          }
        }
        return event.data

      case StreamingEventType.SUITE_COMPLETE: {
        const suiteData = event.data as SuiteCompleteData
        return {
          suite: suiteData.suiteName,
          file: suiteData.file,
          results: suiteData.results,
          status: 'completed'
        }
      }

      case StreamingEventType.RUN_COMPLETE:
        if (isRunCompleteData(event.data)) {
          return {
            summary: event.data.summary,
            status: 'completed',
            duration: event.data.summary.duration
          }
        }
        return event.data

      case StreamingEventType.PROGRESS:
        if (isProgressData(event.data)) {
          return {
            completed: event.data.completed,
            total: event.data.total,
            passed: event.data.passed,
            failed: event.data.failed,
            skipped: event.data.skipped,
            currentTest: event.data.currentTest,
            percentage:
              event.data.total > 0 ? Math.round((event.data.completed / event.data.total) * 100) : 0
          }
        }
        return event.data

      default:
        return event.data
    }
  }

  /**
   * Create metadata for JSONL event
   */
  private createMetadata(event: StreamingEvent): JsonLineEvent['meta'] {
    const meta: JsonLineEvent['meta'] = {}

    // Add progress information
    if (this.jsonlConfig.includeProgress) {
      if (isTestCompleteData(event.data) || isTestFailureData(event.data)) {
        const progressData = 'progress' in event.data ? event.data.progress : null
        if (progressData) {
          meta.progress = {
            completed: progressData.completed,
            total: progressData.total,
            percentage:
              progressData.total > 0
                ? Math.round((progressData.completed / progressData.total) * 100)
                : 0
          }
        }
      }

      // Always include current counters
      meta.counters = { ...this.state.counts }
    }

    return Object.keys(meta).length > 0 ? meta : undefined
  }

  /**
   * Get JSONL-specific statistics
   */
  getJsonlStats(): {
    totalLinesOutput: number
    currentSequence: number
    compact: boolean
    schemaVersion: string
  } {
    const custom = this.state.custom as { totalLinesOutput?: number }
    return {
      totalLinesOutput: custom.totalLinesOutput || 0,
      currentSequence: this.sequence,
      compact: this.jsonlConfig.compact,
      schemaVersion: this.jsonlConfig.schemaVersion
    }
  }

  /**
   * Validate JSON line
   */
  private validateJsonLine(jsonString: string): boolean {
    try {
      JSON.parse(jsonString)
      return true
    } catch {
      return false
    }
  }

  /**
   * Parse a JSONL string back into events (utility method)
   */
  static parseJsonLines(jsonlString: string): JsonLineEvent[] {
    return jsonlString
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as JsonLineEvent)
  }

  /**
   * Create a JSONL formatter with minimal configuration for high-performance scenarios
   */
  static createMinimal(): JsonLineFormatter {
    return new JsonLineFormatter({
      includeTimestamps: false,
      includeProgress: false,
      includeEventMetadata: false,
      includeSequence: false,
      compact: true,
      includeFullErrors: false
    })
  }

  /**
   * Create a JSONL formatter with full configuration for detailed analysis
   */
  static createVerbose(): JsonLineFormatter {
    return new JsonLineFormatter({
      includeTimestamps: true,
      includeProgress: true,
      includeEventMetadata: true,
      includeSequence: true,
      compact: false,
      includeFullErrors: true
    })
  }
}
