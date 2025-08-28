/**
 * Reporter Type Definitions
 *
 * This file contains public type definitions for the LLM Reporter.
 * For internal implementation types, see reporter-internal.ts
 *
 * @module reporter-types
 */

import type { PerformanceConfig } from './monitoring.js'

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
  /** Enable token counting for test results (default: false) */
  tokenCountingEnabled?: boolean
  /** Maximum number of tokens to include in output (default: undefined) */
  maxTokens?: number
  /**
   * @deprecated Use enableConsoleOutput instead
   */
  enableStreaming?: boolean
  /** Enable console output at end of test run (default: true when no outputFile or when enableStreaming is true) */
  enableConsoleOutput?: boolean
  /** Include absolute paths in output (default: false) */
  includeAbsolutePaths?: boolean
  /** Filter out node_modules from stack frames (default: true) */
  filterNodeModules?: boolean
  /** Truncation configuration options */
  truncation?: TruncationConfig
  /** Performance optimization configuration */
  performance?: PerformanceConfig
  /** Add separator frames around console output (default: false) */
  framedOutput?: boolean
  /**
   * Force console output even when the reporter is used standalone in tests
   * without a Vitest context. Useful for unit tests that spy on stdout.
   * Default: false
   */
  forceConsoleOutput?: boolean
  /** Include raw stack strings in error output (default: false, only stackFrames included) */
  includeStackString?: boolean
  /** JSON spacing for file output (default: 0 for compact) */
  fileJsonSpacing?: number
  /** JSON spacing for console output (default: 2 for readability) */
  consoleJsonSpacing?: number
}

/**
 * Configuration for output truncation
 */
export interface TruncationConfig {
  /** Enable truncation (default: false for backward compatibility) */
  enabled?: boolean
  /** Maximum tokens to allow in output (default: undefined = no limit) */
  maxTokens?: number
  /** Enable truncation at early stage (EventOrchestrator) */
  enableEarlyTruncation?: boolean
  /** Enable truncation at late stage (OutputBuilder) */
  enableLateTruncation?: boolean
  /** Enable truncation metrics tracking */
  enableMetrics?: boolean
}
