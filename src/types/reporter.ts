/**
 * Reporter Type Definitions
 *
 * This file contains public type definitions for the LLM Reporter.
 * For internal implementation types, see reporter-internal.ts
 *
 * @module reporter-types
 */

/**
 * Configuration options for the LLM Reporter
 */
export interface LLMReporterConfig {
  /** Enable verbose output including passed and skipped tests */
  verbose?: boolean
  /** Path to write the JSON output file */
  outputFile?: string
  /** Include passed tests in output (independent of verbose) */
  includePassedTests?: boolean
  /** Include skipped tests in output (independent of verbose) */
  includeSkippedTests?: boolean
  /** Capture console output for failing tests (default: true) */
  captureConsoleOnFailure?: boolean
  /** Maximum bytes of console output to capture per test (default: 50000) */
  maxConsoleBytes?: number
  /** Maximum lines of console output to capture per test (default: 100) */
  maxConsoleLines?: number
  /** Include debug and trace console output (default: false) */
  includeDebugOutput?: boolean
  /** Enable streaming mode for real-time output (default: false) */
  streamingMode?: boolean
  /** Enable token counting for test results (default: false) */
  tokenCountingEnabled?: boolean
  /** Output format for the reporter (default: 'json') */
  outputFormat?: 'json' | 'jsonl' | 'markdown'
  /** Maximum number of tokens to include in output (default: undefined) */
  maxTokens?: number
  /** Model to use for token counting (default: 'gpt-4') */
  tokenCountingModel?: string
  /** Enable streaming mode for real-time output (default: auto-detect based on TTY) */
  enableStreaming?: boolean
  /** Streaming-specific configuration options */
  streaming?: StreamingConfig
}

/**
 * Configuration for streaming mode
 */
export interface StreamingConfig {
  /** Maximum concurrent test outputs to synchronize */
  maxConcurrentTests?: number
  /** Enable test output grouping */
  enableTestGrouping?: boolean
  /** Deadlock detection interval in milliseconds */
  deadlockCheckInterval?: number
  /** Enable performance monitoring */
  enableMonitoring?: boolean
  /** Queue configuration */
  queue?: {
    /** Maximum queue size */
    maxSize?: number
    /** Default operation timeout in milliseconds */
    defaultTimeout?: number
    /** Enable operation batching */
    enableBatching?: boolean
    /** Maximum operations per batch */
    maxBatchSize?: number
  }
  /** Lock configuration */
  locks?: {
    /** Lock acquisition timeout in milliseconds */
    timeout?: number
    /** Enable deadlock detection */
    deadlockDetection?: boolean
  }
}
