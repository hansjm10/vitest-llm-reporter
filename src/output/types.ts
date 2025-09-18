import type { TestResult, TestFailure, TestSuccessLog } from '../types/schema.js'
import type { SerializedError } from 'vitest'
import type { TruncationConfig, EnvironmentMetadataConfig } from '../types/reporter.js'

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
  /** Filter out node_modules from stack frames */
  filterNodeModules?: boolean
  /** Truncation configuration */
  truncation?: TruncationConfig
  /** Whether to include raw stack strings in error output */
  includeStackString?: boolean
  /** Whether to include absolute paths in error output */
  includeAbsolutePaths?: boolean
  /** Root directory used for repo-relative path conversion */
  rootDir?: string
  /** Options controlling environment metadata included in the summary */
  environmentMetadata?: EnvironmentMetadataConfig
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
    successLogs: TestSuccessLog[]
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
