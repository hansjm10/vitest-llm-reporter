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
 * Configuration for environment metadata included in the summary output
 */
export interface EnvironmentMetadataConfig {
  /** Disable environment metadata entirely */
  enabled?: boolean
  /** Include operating system version string (default: true) */
  includeOsVersion?: boolean
  /** Include Node.js runtime identifier (default: true) */
  includeNodeRuntime?: boolean
  /** Include detected vitest version (default: true) */
  includeVitest?: boolean
  /** Include CI detection flag (default: true) */
  includeCi?: boolean
  /** Include detected package manager identifier (default: true) */
  includePackageManager?: boolean
}

/**
 * Controls which console event fields are surfaced in reporter output
 */
export interface ConsoleOutputViewConfig {
  /** Include the originating testId for each console event (default: false) */
  includeTestId?: boolean
  /** Include the timestamp in milliseconds relative to test start (default: false) */
  includeTimestampMs?: boolean
}

/**
 * Output view configuration
 */
export interface OutputViewConfig {
  /** Console event visibility controls */
  console?: ConsoleOutputViewConfig
}

/**
 * Predicate type used for stdout/stderr filtering
 */
export type StdioFilter = RegExp | ((line: string) => boolean)

/**
 * Known framework presets for stdio suppression
 */
export type FrameworkPresetName =
  | 'nest'
  | 'next'
  | 'nuxt'
  | 'angular'
  | 'vite'
  | 'fastify'
  | 'express'
  | 'strapi'
  | 'remix'
  | 'sveltekit'

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
  /** Capture console output for successful tests (default: false) */
  captureConsoleOnSuccess?: boolean
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
  /** Include raw stack strings in error output (default: false, only stackFrames included) */
  includeStackString?: boolean
  /** JSON spacing for file output (default: 0 for compact) */
  fileJsonSpacing?: number
  /** JSON spacing for console output (default: 2 for readability) */
  consoleJsonSpacing?: number
  /** Enable pure stdout mode - suppress all external stdout during test run (default: false) */
  pureStdout?: boolean
  /** Fine-grained stdio suppression configuration */
  stdio?: StdioConfig
  /** Warn to stderr when console output appears blocked (default: true) */
  warnWhenConsoleBlocked?: boolean
  /** Fallback: also write JSON to stderr if stdout write fails (default: true) */
  fallbackToStderrOnBlocked?: boolean
  /** Configuration for log deduplication (default: undefined = disabled) */
  deduplicateLogs?:
    | boolean
    | {
        enabled?: boolean
        maxCacheEntries?: number
        normalizeWhitespace?: boolean
        includeSources?: boolean
        stripTimestamps?: boolean
        stripAnsiCodes?: boolean
        scope?: 'global' | 'per-test'
      }
  /** Configure which environment metadata fields are included in the summary */
  environmentMetadata?: EnvironmentMetadataConfig
  /** Configure how test results are projected into the final output */
  outputView?: OutputViewConfig
  /** Track and report test retry attempts (default: true) */
  trackRetries?: boolean
  /** Detect flaky tests that pass after retry (default: true) */
  detectFlakiness?: boolean
  /** Include all retry attempts in output (default: false, only final shown) */
  includeAllAttempts?: boolean
  /** Report flaky tests separately even if they eventually pass (default: false) */
  reportFlakyAsWarnings?: boolean
  /** Enable self-validation of output against schema (default: false) */
  validateOutput?: boolean
}

/**
 * Configuration for stdio suppression
 */
export interface StdioConfig {
  /** Suppress stdout writes (default: true for clean output) */
  suppressStdout?: boolean
  /** Suppress stderr writes (default: false) */
  suppressStderr?: boolean
  /**
   * Pattern(s) or predicate(s) used to filter lines. Accepts a single pattern, an array of patterns,
   * or predicate functions. Use null to suppress all output. When undefined, filtering is disabled
   * unless framework presets add their own matchers.
   */
  filterPattern?: StdioFilter | StdioFilter[] | null
  /** Named framework presets that expand to curated filter patterns */
  frameworkPresets?: FrameworkPresetName[]
  /** Auto-detect framework presets from package.json and environment (default: false) */
  autoDetectFrameworks?: boolean
  /** Redirect suppressed stdout to stderr (default: false) */
  redirectToStderr?: boolean
  /** Apply filtering when flushing buffered content (default: false) */
  flushWithFiltering?: boolean
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
