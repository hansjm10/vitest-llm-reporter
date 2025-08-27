import type { TestResult, TestFailure } from '../types/schema.js'
import type { SerializedError } from 'vitest'
import type { TruncationConfig } from '../types/reporter.js'

/**
 * Output builder configuration
 */
export interface OutputBuilderConfig {
  /** Whether to include passed tests in output */
  includePassedTests?: boolean
  /** Whether to include skipped tests in output */
  includeSkippedTests?: boolean
  /** Whether to use verbose output (includes all categories) */
  verbose?: boolean
  /** Enable streaming mode for real-time output */
  enableStreaming?: boolean
  /** Filter out node_modules from stack frames */
  filterNodeModules?: boolean
  /** Truncation configuration */
  truncation?: TruncationConfig
  /** Whether to include raw stack strings in error output */
  includeStackString?: boolean
}

/**
 * Build options for output assembly
 */
export interface BuildOptions {
  /** Test results categorized by status */
  testResults: {
    passed: TestResult[]
    failed: TestFailure[]
    skipped: TestResult[]
  }
  /** Test run duration in milliseconds */
  duration: number
  /** Test run start time */
  startTime?: number
  /** Unhandled errors from the test run */
  unhandledErrors?: ReadonlyArray<SerializedError>
}

/**
 * Output writer configuration
 */
export interface OutputWriterConfig {
  /** Whether to create directories if they don't exist */
  createDirectories?: boolean
  /** JSON stringification spacing */
  jsonSpacing?: number
  /** Whether to handle circular references */
  handleCircularRefs?: boolean
  /** Whether to handle errors gracefully */
  gracefulErrorHandling?: boolean
}
