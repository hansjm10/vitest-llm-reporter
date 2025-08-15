/**
 * Test factory functions for creating LLMReporter test objects
 *
 * These factories provide convenient ways to create valid and invalid
 * test data for testing the reporter's schema validation and processing.
 */

import type { LLMReporterOutput, TestSummary, TestFailure, TestResult } from '../types/schema'

/**
 * Creates a valid TestSummary with sensible defaults
 * @param overrides - Optional property overrides
 * @returns A valid TestSummary object
 */
export const createTestSummary = (overrides?: Partial<TestSummary>): TestSummary => ({
  total: 10,
  passed: 8,
  failed: 2,
  skipped: 0,
  duration: 1234,
  timestamp: '2024-01-15T10:30:00Z',
  ...overrides
})

/**
 * Creates a valid LLMReporterOutput with minimal data
 * @param overrides - Optional property overrides
 * @returns A valid LLMReporterOutput object
 */
export const createValidOutput = (overrides?: Partial<LLMReporterOutput>): LLMReporterOutput => ({
  summary: createTestSummary(overrides?.summary),
  ...overrides
})

/**
 * Creates an LLMReporterOutput with failures
 * @param failureCount - Number of failures to generate
 * @param summaryOverrides - Optional summary overrides
 * @returns An LLMReporterOutput with the specified number of failures
 */
export const createOutputWithFailures = (
  failureCount: number,
  summaryOverrides?: Partial<TestSummary>
): LLMReporterOutput => {
  const failures: TestFailure[] = Array.from({ length: failureCount }, (_, i) => ({
    test: `Test ${i + 1}`,
    file: `/test/file${i + 1}.ts`,
    startLine: (i + 1) * 10,
    endLine: (i + 1) * 10 + 5,
    error: {
      message: `Error in test ${i + 1}`,
      type: 'AssertionError',
      stack: `Error: Test ${i + 1} failed\n    at /test/file${i + 1}.ts:${(i + 1) * 10}:5`
    }
  }))

  return {
    summary: createTestSummary({
      total: failureCount,
      passed: 0,
      failed: failureCount,
      skipped: 0,
      ...summaryOverrides
    }),
    failures
  }
}

/**
 * Creates an LLMReporterOutput with passed tests (verbose mode)
 * @param passCount - Number of passed tests to generate
 * @returns An LLMReporterOutput with passed test details
 */
export const createOutputWithPassed = (passCount: number): LLMReporterOutput => {
  const passed: TestResult[] = Array.from({ length: passCount }, (_, i) => ({
    test: `Test ${i + 1}`,
    file: `/test/file${i + 1}.ts`,
    startLine: (i + 1) * 10,
    endLine: (i + 1) * 10 + 5,
    status: 'passed' as const,
    duration: 50 + i * 10
  }))

  return {
    summary: createTestSummary({
      total: passCount,
      passed: passCount,
      failed: 0,
      skipped: 0
    }),
    passed
  }
}

/**
 * Creates a TestFailure with error context including code
 * @param testName - Name of the test
 * @param codeLines - Lines of code to include in context
 * @returns A TestFailure with complete error context
 */
export const createFailureWithContext = (testName: string, codeLines: string[]): TestFailure => ({
  test: testName,
  file: '/test/context.test.ts',
  startLine: 15,
  endLine: 20,
  error: {
    message: `${testName} failed`,
    type: 'AssertionError',
    stack: `AssertionError: ${testName} failed\n    at /test/context.test.ts:15:10`,
    context: {
      code: codeLines,
      expected: 'expected value',
      actual: 'actual value',
      lineNumber: 15,
      columnNumber: 10
    }
  }
})

/**
 * Creates an invalid output for testing validation errors
 * @param invalidField - Which field to make invalid
 * @returns An invalid LLMReporterOutput object
 */
export const createInvalidOutput = (
  invalidField: 'summary' | 'failures' | 'timestamp' | 'negative'
): any => {
  switch (invalidField) {
    case 'summary':
      return {
        summary: {
          total: 'not a number', // Invalid type
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        }
      }
    case 'failures':
      return {
        summary: createTestSummary(),
        failures: 'not an array' // Invalid type
      }
    case 'timestamp':
      return {
        summary: {
          ...createTestSummary(),
          timestamp: 'invalid-date' // Invalid format
        }
      }
    case 'negative':
      return {
        summary: {
          ...createTestSummary(),
          total: -1 // Invalid negative value
        }
      }
    default:
      throw new Error(`Unknown invalid field: ${String(invalidField)}`)
  }
}

/**
 * Creates an output with specific code lines in the error context
 * @param testName - Name of the test
 * @param codeLines - Array of code lines
 * @returns An LLMReporterOutput with code context
 */
export const createOutputWithCode = (testName: string, codeLines: string[]): LLMReporterOutput => ({
  summary: createTestSummary({
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0
  }),
  failures: [createFailureWithContext(testName, codeLines)]
})

/**
 * Creates test output with XSS test strings
 * @returns An LLMReporterOutput with XSS test data
 */
export const createXSSTestOutput = (): LLMReporterOutput => ({
  summary: createTestSummary({
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0
  }),
  failures: [
    {
      test: '<script>alert("XSS")</script>',
      file: '/test/file.ts',
      startLine: 1,
      endLine: 1,
      error: {
        message: '<img src=x onerror=alert("XSS")>',
        type: 'Error',
        context: {
          code: ['<script>alert("xss")</script>']
        }
      }
    }
  ]
})

/**
 * Creates output with a specific file path
 * @param filePath - The file path to use
 * @param passed - Whether the test passed (default: true)
 * @returns An LLMReporterOutput with the specified file path
 */
export const createOutputWithFilePath = (filePath: string, passed = true): LLMReporterOutput => {
  if (passed) {
    return {
      summary: createTestSummary({
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0
      }),
      passed: [
        {
          test: 'test',
          file: filePath,
          startLine: 1,
          endLine: 1,
          status: 'passed'
        }
      ]
    }
  } else {
    return {
      summary: createTestSummary({
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0
      }),
      failures: [
        {
          test: 'test',
          file: filePath,
          startLine: 1,
          endLine: 1,
          error: {
            message: 'error',
            type: 'Error'
          }
        }
      ]
    }
  }
}

/**
 * Creates test output with nested suites
 * @param suitePath - Array of suite names forming the hierarchy
 * @param testName - Name of the test
 * @returns A TestFailure with suite hierarchy
 */
export const createNestedSuiteFailure = (suitePath: string[], testName: string): TestFailure => ({
  test: [...suitePath, testName].join(' > '),
  file: '/test/nested.test.ts',
  startLine: 25,
  endLine: 30,
  suite: suitePath,
  error: {
    message: 'Nested test failed',
    type: 'AssertionError'
  }
})

/**
 * Creates output with mixed test results
 * @param passed - Number of passed tests
 * @param failed - Number of failed tests
 * @param skipped - Number of skipped tests
 * @returns A complete LLMReporterOutput with all result types
 */
export const createMixedOutput = (
  passed: number,
  failed: number,
  skipped: number
): LLMReporterOutput => {
  const output: LLMReporterOutput = {
    summary: createTestSummary({
      total: passed + failed + skipped,
      passed,
      failed,
      skipped
    })
  }

  if (failed > 0) {
    output.failures = Array.from({ length: failed }, (_, i) =>
      createFailureWithContext(`Failed test ${i + 1}`, ['const x = 1', 'expect(x).toBe(2)'])
    )
  }

  if (passed > 0) {
    output.passed = Array.from({ length: passed }, (_, i) => ({
      test: `Passed test ${i + 1}`,
      file: '/test/mixed.test.ts',
      startLine: i * 10,
      endLine: i * 10 + 5,
      status: 'passed' as const
    }))
  }

  if (skipped > 0) {
    output.skipped = Array.from({ length: skipped }, (_, i) => ({
      test: `Skipped test ${i + 1}`,
      file: '/test/mixed.test.ts',
      startLine: i * 10,
      endLine: i * 10 + 5,
      status: 'skipped' as const
    }))
  }

  return output
}
