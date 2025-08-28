/**
 * Internal Reporter Type Definitions
 *
 * This file contains internal type definitions used by the LLM Reporter
 * implementation. These types are not exported as part of the public API.
 *
 * @module reporter-internal-types
 */

import type { TestResult, TestFailure, ErrorContext } from './schema.js'

/**
 * Test information collected during test discovery
 */
export interface CollectedTest {
  id?: string
  name?: string
  mode?: string
  suite?: string[]
  file?: string
}

/**
 * Internal state maintained by the reporter
 */
export interface InternalState {
  startTime?: number
  specifications: unknown[]
  queuedModules: string[]
  collectedTests: CollectedTest[]
  runningModules: string[]
  completedModules: string[]
  moduleStartTimes: Record<string, number>
  moduleDurations: Record<string, number>
  readyTests: string[]
  testResults: {
    passed: TestResult[]
    failed: TestFailure[]
    skipped: TestResult[]
  }
}

/**
 * Base test information for internal processing
 */
export interface TestBase {
  test: string
  file: string
  startLine: number
  endLine: number
  suite?: string[]
}

/**
 * Vitest suite object structure
 */
export interface VitestSuite {
  name?: string
  suite?: VitestSuite
  [key: string]: unknown // Allow other properties we don't use
}

/**
 * Raw test case data received from Vitest
 */
export interface TestCaseData {
  id?: string
  name?: string
  file?: { filepath?: string }
  filepath?: string
  location?: {
    // Vitest v3 can provide location in two formats:
    // 1. Nested format (mock data compatibility)
    start?: {
      line?: number
      column?: number
    }
    end?: {
      line?: number
      column?: number
    }
    // 2. Direct format (real test execution)
    line?: number
    column?: number
  }
  suite?: string[] | VitestSuite
  mode?: string
  result?: {
    state?: string
    duration?: number
    error?: {
      message?: string
      name?: string
      type?: string
      stack?: string
      expected?: unknown
      actual?: unknown
      lineNumber?: number
      context?: ErrorContext
      constructor?: { name?: string }
    }
    errors?: Array<{
      message?: string
      name?: string
      type?: string
      stack?: string
      expected?: unknown
      actual?: unknown
      lineNumber?: number
      context?: ErrorContext
      constructor?: { name?: string }
    }>
  }
}
