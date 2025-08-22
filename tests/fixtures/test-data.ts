/**
 * Integration Test Fixtures
 *
 * Shared test data and utilities for integration tests
 */

import type {
  LLMReporterOutput,
  TestSummary,
  TestFailure,
  TestResult
} from '../../src/types/schema'
import type { StreamOperation, StreamPriority, ConsoleStreamData } from '../../src/streaming/types'
import type { ConsoleMethod } from '../../src/types/console'
import type { DeduplicationConfig } from '../../src/types/deduplication'
import type { PerformanceConfig } from '../../src/performance/types'

/**
 * Sample test data for integration tests
 */
export const SAMPLE_TEST_DATA = {
  // Basic test results
  simplePass: {
    test: 'simple passing test',
    file: '/tests/simple.test.ts',
    startLine: 10,
    endLine: 15,
    status: 'passed' as const,
    duration: 50
  },

  simpleFail: {
    test: 'simple failing test',
    file: '/tests/simple.test.ts',
    startLine: 20,
    endLine: 25,
    error: {
      message: 'Expected 2 but received 1',
      type: 'AssertionError',
      stack: 'AssertionError: Expected 2 but received 1\n    at /tests/simple.test.ts:22:5'
    }
  },

  // Console output data
  consoleLog: {
    method: 'log' as ConsoleMethod,
    testId: 'test-1',
    args: ['Debug message:', { value: 42 }],
    timestamp: Date.now(),
    elapsed: 100
  },

  consoleError: {
    method: 'error' as ConsoleMethod,
    testId: 'test-2',
    args: ['Error occurred:', new Error('Test error')],
    timestamp: Date.now(),
    elapsed: 200
  },

  // Similar failures for deduplication testing
  similarFailures: [
    {
      test: 'API endpoint /users returns 200',
      file: '/tests/api.test.ts',
      startLine: 10,
      endLine: 15,
      error: {
        message: 'Request failed with status 500',
        type: 'NetworkError',
        stack: 'NetworkError: Request failed with status 500\n    at /tests/api.test.ts:12:8'
      }
    },
    {
      test: 'API endpoint /posts returns 200',
      file: '/tests/api.test.ts',
      startLine: 25,
      endLine: 30,
      error: {
        message: 'Request failed with status 500',
        type: 'NetworkError',
        stack: 'NetworkError: Request failed with status 500\n    at /tests/api.test.ts:27:8'
      }
    },
    {
      test: 'API endpoint /comments returns 200',
      file: '/tests/api.test.ts',
      startLine: 40,
      endLine: 45,
      error: {
        message: 'Request failed with status 500',
        type: 'NetworkError',
        stack: 'NetworkError: Request failed with status 500\n    at /tests/api.test.ts:42:8'
      }
    }
  ]
}

/**
 * Configuration presets for testing
 */
export const CONFIG_PRESETS = {
  minimal: {
    deduplication: {
      enabled: false,
      strategy: 'conservative' as const,
      thresholds: { exact: 1.0, high: 0.9, medium: 0.7, low: 0.5 },
      patterns: { stackTrace: true, errorMessage: true, consoleOutput: false, assertion: true },
      compression: { enabled: false, minGroupSize: 2, maxTemplateVariables: 5, preserveExamples: 1 }
    } as DeduplicationConfig,

    performance: {
      enabled: false,
      mode: 'balanced' as const,
      enableCaching: false,
      enableMemoryOptimization: false,
      enableStreamOptimization: false
    } as PerformanceConfig
  },

  aggressive: {
    deduplication: {
      enabled: true,
      strategy: 'aggressive' as const,
      thresholds: { exact: 1.0, high: 0.8, medium: 0.6, low: 0.4 },
      patterns: { stackTrace: true, errorMessage: true, consoleOutput: true, assertion: true },
      compression: { enabled: true, minGroupSize: 2, maxTemplateVariables: 15, preserveExamples: 5 }
    } as DeduplicationConfig,

    performance: {
      enabled: true,
      mode: 'performance' as const,
      enableCaching: true,
      enableMemoryOptimization: true,
      enableStreamOptimization: true
    } as PerformanceConfig
  }
}

/**
 * Creates sample LLM reporter output with specified characteristics
 */
export function createSampleOutput(
  passed: number = 5,
  failed: number = 2,
  skipped: number = 1
): LLMReporterOutput {
  const summary: TestSummary = {
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
    duration: 1500,
    timestamp: new Date().toISOString()
  }

  const output: LLMReporterOutput = { summary }

  if (failed > 0) {
    output.failures = Array.from({ length: failed }, (_, i) => ({
      test: `failing test ${i + 1}`,
      file: `/tests/failing${i + 1}.test.ts`,
      startLine: 10 + i * 10,
      endLine: 15 + i * 10,
      error: {
        message: `Test failure ${i + 1}`,
        type: 'AssertionError',
        stack: `AssertionError: Test failure ${i + 1}\n    at /tests/failing${i + 1}.test.ts:${12 + i * 10}:5`
      }
    }))
  }

  if (passed > 0) {
    output.passed = Array.from({ length: passed }, (_, i) => ({
      test: `passing test ${i + 1}`,
      file: `/tests/passing${i + 1}.test.ts`,
      startLine: 10 + i * 10,
      endLine: 15 + i * 10,
      status: 'passed' as const,
      duration: 50 + i * 10
    }))
  }

  if (skipped > 0) {
    output.skipped = Array.from({ length: skipped }, (_, i) => ({
      test: `skipped test ${i + 1}`,
      file: `/tests/skipped${i + 1}.test.ts`,
      startLine: 10 + i * 10,
      endLine: 15 + i * 10,
      status: 'skipped' as const
    }))
  }

  return output
}

/**
 * Creates stream operations for testing
 */
export function createStreamOperations(count: number): StreamOperation[] {
  return Array.from({ length: count }, (_, i) => ({
    content: `Test output line ${i + 1}`,
    priority: (i % 4) as StreamPriority,
    stream: 'stdout' as const,
    testId: `test-${i + 1}`,
    timestamp: Date.now() + i * 100
  }))
}

/**
 * Creates console stream data for testing
 */
export function createConsoleStreamData(count: number): ConsoleStreamData[] {
  const methods: ConsoleMethod[] = ['log', 'error', 'warn', 'info']

  return Array.from({ length: count }, (_, i) => ({
    method: methods[i % methods.length],
    testId: `test-${i + 1}`,
    args: [`Console message ${i + 1}`, { data: i }],
    timestamp: Date.now() + i * 50,
    elapsed: i * 10
  }))
}

/**
 * Performance test data generators
 */
export const PERFORMANCE_TEST_DATA = {
  // Large dataset for performance testing
  largeTestSuite: (size: number) =>
    createSampleOutput(
      Math.floor(size * 0.8), // 80% pass
      Math.floor(size * 0.15), // 15% fail
      Math.floor(size * 0.05) // 5% skip
    ),

  // Memory intensive data
  memoryIntensiveOutput: () => createSampleOutput(100, 50, 25),

  // High frequency streaming data
  highFrequencyStreams: (count: number) => createStreamOperations(count),

  // Console heavy data
  consoleHeavyData: (count: number) => createConsoleStreamData(count)
}

/**
 * Deduplication test scenarios
 */
export const DEDUPLICATION_SCENARIOS = {
  // Identical failures
  identicalFailures: Array.from({ length: 5 }, () => ({ ...SAMPLE_TEST_DATA.similarFailures[0] })),

  // Similar stack traces
  similarStackTraces: SAMPLE_TEST_DATA.similarFailures,

  // Mixed failure types
  mixedFailures: [
    ...SAMPLE_TEST_DATA.similarFailures,
    {
      test: 'unique failure',
      file: '/tests/unique.test.ts',
      startLine: 5,
      endLine: 10,
      error: {
        message: 'Unique error message',
        type: 'TypeError',
        stack: 'TypeError: Unique error message\n    at /tests/unique.test.ts:7:3'
      }
    }
  ]
}
