/**
 * Streaming Formatter Base Interface
 *
 * Defines the contract for streaming formatters that transform test results
 * into different output formats in real-time. Supports incremental/progressive
 * output with proper error handling and state management.
 *
 * @module formatters/StreamingFormatter
 */

import type { TestResult, TestFailure, TestSummary, LLMReporterOutput } from '../types/schema'

/**
 * Streaming event types that formatters can handle
 */
export enum StreamingEventType {
  /** Test run started */
  RUN_START = 'run-start',
  /** Individual test started */
  TEST_START = 'test-start',
  /** Individual test completed (passed/failed/skipped) */
  TEST_COMPLETE = 'test-complete',
  /** Test failed with error */
  TEST_FAILURE = 'test-failure',
  /** Test suite/module completed */
  SUITE_COMPLETE = 'suite-complete',
  /** Test run completed */
  RUN_COMPLETE = 'run-complete',
  /** Progress update */
  PROGRESS = 'progress'
}

/**
 * Streaming event data structure
 */
export interface StreamingEvent {
  type: StreamingEventType
  timestamp: number
  data: StreamingEventData
}

/**
 * Union type for different event data structures
 */
export type StreamingEventData =
  | TestStartData
  | TestCompleteData
  | TestFailureData
  | SuiteCompleteData
  | RunCompleteData
  | ProgressData
  | RunStartData

/**
 * Test run start event data
 */
export interface RunStartData {
  totalTests: number
  startTime: number
}

/**
 * Test start event data
 */
export interface TestStartData {
  test: string
  file: string
  suite?: string[]
}

/**
 * Test complete event data
 */
export interface TestCompleteData {
  result: TestResult
  progress: {
    completed: number
    total: number
  }
}

/**
 * Test failure event data
 */
export interface TestFailureData {
  failure: TestFailure
  progress: {
    completed: number
    total: number
  }
}

/**
 * Suite complete event data
 */
export interface SuiteCompleteData {
  suiteName: string
  file: string
  results: {
    passed: number
    failed: number
    skipped: number
  }
}

/**
 * Run complete event data
 */
export interface RunCompleteData {
  summary: TestSummary
  finalOutput: LLMReporterOutput
}

/**
 * Progress event data
 */
export interface ProgressData {
  completed: number
  total: number
  passed: number
  failed: number
  skipped: number
  currentTest?: string
}

/**
 * Formatter configuration options
 */
export interface FormatterConfig {
  /** Include timestamps in output */
  includeTimestamps?: boolean
  /** Include progress indicators */
  includeProgress?: boolean
  /** Use colored output (if supported) */
  useColors?: boolean
  /** Include detailed error information */
  includeFullErrors?: boolean
  /** Maximum line length for wrapping */
  maxLineLength?: number
  /** Indentation style */
  indent?: string
  /** Custom formatting options */
  customOptions?: Record<string, unknown>
}

/**
 * Default formatter configuration
 */
export const DEFAULT_FORMATTER_CONFIG: Required<FormatterConfig> = {
  includeTimestamps: true,
  includeProgress: true,
  useColors: false,
  includeFullErrors: true,
  maxLineLength: 120,
  indent: '  ',
  customOptions: {}
}

/**
 * Base interface for streaming formatters
 *
 * Formatters transform streaming test events into formatted output strings.
 * They support incremental output for real-time display and final summary formatting.
 *
 * @example
 * ```typescript
 * const formatter = new JsonLineFormatter({
 *   includeTimestamps: true,
 *   includeProgress: false
 * });
 *
 * await formatter.initialize();
 * const output = await formatter.formatEvent({
 *   type: StreamingEventType.TEST_COMPLETE,
 *   timestamp: Date.now(),
 *   data: { result: testResult, progress: { completed: 1, total: 10 } }
 * });
 * console.log(output);
 * ```
 */
export interface StreamingFormatter {
  /**
   * Initialize the formatter
   * Called once before any formatting operations
   */
  initialize(): Promise<void>

  /**
   * Format a streaming event into output string
   *
   * @param event - The streaming event to format
   * @returns Promise resolving to formatted output string
   */
  formatEvent(event: StreamingEvent): Promise<string>

  /**
   * Format the final summary output
   * Called at the end of test run with complete results
   *
   * @param output - Complete LLM reporter output
   * @returns Promise resolving to final formatted summary
   */
  formatFinal(output: LLMReporterOutput): Promise<string>

  /**
   * Get the current formatter state/statistics
   * Useful for debugging and monitoring
   */
  getState(): FormatterState

  /**
   * Reset the formatter state
   * Called when starting a new test run
   */
  reset(): void

  /**
   * Clean up formatter resources
   * Called when formatter is no longer needed
   */
  cleanup(): Promise<void>

  /**
   * Get formatter configuration
   */
  getConfig(): Required<FormatterConfig>

  /**
   * Update formatter configuration
   */
  updateConfig(config: Partial<FormatterConfig>): void
}

/**
 * Formatter internal state
 */
export interface FormatterState {
  /** Whether formatter is initialized */
  initialized: boolean
  /** Number of events processed */
  eventsProcessed: number
  /** Number of tests processed */
  testsProcessed: number
  /** Current test counts */
  counts: {
    passed: number
    failed: number
    skipped: number
  }
  /** Start time of current run */
  runStartTime?: number
  /** Any formatter-specific state */
  custom?: Record<string, unknown>
}

/**
 * Base formatter class providing common functionality
 *
 * Concrete formatters should extend this class and implement the abstract methods.
 */
export abstract class BaseStreamingFormatter implements StreamingFormatter {
  protected config: Required<FormatterConfig>
  protected state: FormatterState

  constructor(config: FormatterConfig = {}) {
    this.config = { ...DEFAULT_FORMATTER_CONFIG, ...config }
    this.state = {
      initialized: false,
      eventsProcessed: 0,
      testsProcessed: 0,
      counts: { passed: 0, failed: 0, skipped: 0 },
      custom: {}
    }
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) {
      return
    }

    await this.doInitialize()
    this.state.initialized = true
  }

  abstract formatEvent(event: StreamingEvent): Promise<string>
  abstract formatFinal(output: LLMReporterOutput): Promise<string>

  /**
   * Subclass-specific initialization logic
   */
  protected async doInitialize(): Promise<void> {
    // Default implementation does nothing
  }

  getState(): FormatterState {
    return { ...this.state }
  }

  reset(): void {
    this.state = {
      initialized: this.state.initialized,
      eventsProcessed: 0,
      testsProcessed: 0,
      counts: { passed: 0, failed: 0, skipped: 0 },
      custom: {}
    }
  }

  async cleanup(): Promise<void> {
    await this.doCleanup()
    this.state.initialized = false
  }

  /**
   * Subclass-specific cleanup logic
   */
  protected async doCleanup(): Promise<void> {
    // Default implementation does nothing
  }

  getConfig(): Required<FormatterConfig> {
    return { ...this.config }
  }

  updateConfig(config: Partial<FormatterConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Update internal counters based on event type
   */
  protected updateCounters(event: StreamingEvent): void {
    this.state.eventsProcessed++

    switch (event.type) {
      case StreamingEventType.RUN_START:
        this.state.runStartTime = event.timestamp
        break

      case StreamingEventType.TEST_COMPLETE:
        this.state.testsProcessed++
        const completeData = event.data as TestCompleteData
        if (completeData.result.status === 'passed') {
          this.state.counts.passed++
        } else if (completeData.result.status === 'skipped') {
          this.state.counts.skipped++
        }
        break

      case StreamingEventType.TEST_FAILURE:
        this.state.testsProcessed++
        this.state.counts.failed++
        break
    }
  }

  /**
   * Generate timestamp string if enabled
   */
  protected formatTimestamp(timestamp: number): string {
    if (!this.config.includeTimestamps) {
      return ''
    }
    return `[${new Date(timestamp).toISOString()}] `
  }

  /**
   * Generate progress indicator if enabled
   */
  protected formatProgress(completed: number, total: number): string {
    if (!this.config.includeProgress || total === 0) {
      return ''
    }
    const percentage = Math.round((completed / total) * 100)
    return `(${completed}/${total} ${percentage}%) `
  }

  /**
   * Truncate text to max line length
   */
  protected truncateText(text: string): string {
    if (text.length <= this.config.maxLineLength) {
      return text
    }
    return text.substring(0, this.config.maxLineLength - 3) + '...'
  }
}

/**
 * Utility function to create streaming events
 */
export function createStreamingEvent(
  type: StreamingEventType,
  data: StreamingEventData
): StreamingEvent {
  return {
    type,
    timestamp: Date.now(),
    data
  }
}

/**
 * Type guard functions for event data
 */
export function isTestCompleteData(data: StreamingEventData): data is TestCompleteData {
  return 'result' in data && 'progress' in data
}

export function isTestFailureData(data: StreamingEventData): data is TestFailureData {
  return 'failure' in data && 'progress' in data
}

export function isRunCompleteData(data: StreamingEventData): data is RunCompleteData {
  return 'summary' in data && 'finalOutput' in data
}

export function isProgressData(data: StreamingEventData): data is ProgressData {
  return 'completed' in data && 'total' in data && 'passed' in data
}
