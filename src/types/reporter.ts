/**
 * Reporter Type Definitions
 *
 * This file contains public type definitions for the LLM Reporter.
 * For internal implementation types, see reporter-internal.ts
 *
 * @module reporter-types
 */

import type { DeduplicationConfig } from './deduplication.js'
import type { PerformanceConfig } from '../monitoring/types.js'

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
  /** Model to use for token counting (default: 'gpt-4') */
  tokenCountingModel?: string
  /** Enable streaming mode for real-time output (default: auto-detect based on TTY) */
  enableStreaming?: boolean
  /** Truncation configuration options */
  truncation?: TruncationConfig
  /** Deduplication configuration options */
  deduplication?: DeduplicationConfig
  /** Performance optimization configuration */
  performance?: PerformanceConfig
  /** Add separator frames around console output (default: false) */
  framedOutput?: boolean
}

/**
 * Configuration for output truncation
 */
export interface TruncationConfig {
  /** Enable truncation (default: false for backward compatibility) */
  enabled?: boolean
  /** Maximum tokens to allow in output (default: undefined = no limit) */
  maxTokens?: number
  /** Model to use for token counting (default: 'gpt-4') */
  model?: string
  /** Truncation strategy (default: 'smart') */
  strategy?: 'simple' | 'smart' | 'priority'
  /** Feature flag for gradual rollout (default: false) */
  featureFlag?: boolean
  /** Enable truncation at early stage (EventOrchestrator) */
  enableEarlyTruncation?: boolean
  /** Enable truncation at late stage (OutputBuilder) */
  enableLateTruncation?: boolean
  /** Enable truncation metrics tracking */
  enableMetrics?: boolean
}
