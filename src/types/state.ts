/**
 * State Management Type Definitions
 *
 * This file contains type definitions for the StateManager
 * and related state tracking functionality.
 *
 * @module state-types
 */

import type { TestResult, TestFailure, TestSuccessLog } from './schema.js'

/**
 * Configuration for StateManager
 */
export interface StateConfig {
  /** Whether to track module execution timing */
  trackModuleTiming?: boolean
}

/**
 * Test results categorized by status
 */
export interface TestResults {
  /** Tests that passed */
  passed: TestResult[]
  /** Tests that failed with error details */
  failed: TestFailure[]
  /** Tests that were skipped */
  skipped: TestResult[]
  /** Console output from successful tests */
  successLogs: TestSuccessLog[]
}

/**
 * Module timing information
 */
export interface ModuleTiming {
  /** Start time in milliseconds */
  startTime: number
  /** End time in milliseconds (optional) */
  endTime?: number
  /** Duration in milliseconds (optional) */
  duration?: number
}

/**
 * Complete state snapshot
 */
export interface StateSnapshot {
  /** Test specifications */
  specifications: unknown[]
  /** Modules queued for execution */
  queuedModules: string[]
  /** Tests that have been collected */
  collectedTests: Array<{
    id?: string
    name?: string
    mode?: string
    file?: string
    suite?: string[]
  }>
  /** Currently running modules */
  runningModules: string[]
  /** Completed modules */
  completedModules: string[]
  /** Module execution timings */
  moduleTimings: Map<string, ModuleTiming>
  /** Tests ready for execution */
  readyTests: string[]
  /** Categorized test results */
  testResults: TestResults
  /** Run start time in milliseconds */
  startTime?: number
  /** Run end time in milliseconds */
  endTime?: number
}

/**
 * Test execution statistics
 */
export interface TestStatistics {
  /** Total number of tests */
  total: number
  /** Number of passed tests */
  passed: number
  /** Number of failed tests */
  failed: number
  /** Number of skipped tests */
  skipped: number
  /** Total duration in milliseconds */
  duration: number
}
