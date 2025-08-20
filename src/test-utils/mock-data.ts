/**
 * Mock data generators for Vitest reporter tests
 *
 * These utilities create consistent mock objects that simulate
 * Vitest's internal data structures, enabling reliable testing
 * of the reporter functionality.
 */

import type { SerializedError } from 'vitest'

/**
 * Creates a mock test case object simulating Vitest's test structure
 * @param options - Test case configuration
 * @returns A mock test case object
 */
export const createMockTestCase = (
  options: {
    name: string
    state?: 'pass' | 'fail' | 'skip'
    error?: Error
    filepath?: string
  } = { name: 'test' }
): any => {
  const { name, state = 'pass', error, filepath = '/test/file.ts' } = options
  const mappedState = state === 'pass' ? 'passed' : state === 'fail' ? 'failed' : 'skipped'

  return {
    id: `test-${name}`,
    name,
    mode: state === 'skip' ? 'skip' : 'run',
    type: 'test',
    file: { filepath, name: filepath.split('/').pop() } as any,
    result: {
      state: mappedState,
      startTime: Date.now(),
      duration: 100,
      error: error ? { message: error.message, stack: error.stack } : undefined
    } as any,
    location: {
      start: { line: 10, column: 1 },
      end: { line: 15, column: 1 }
    } as any
  }
}

/**
 * Creates a mock test module object simulating Vitest's file structure
 * @param filepath - The file path of the test module
 * @param tests - Array of test cases in this module
 * @returns A mock test module object
 */
export const createMockTestModule = (filepath: string, tests: any[] = []): any => ({
  id: filepath,
  filepath,
  type: 'module',
  state: () => 'completed' as any,
  children: () => tests as any,
  errors: () => [],
  diagnostics: () => []
})

/**
 * Creates a mock test specification object for test run initialization
 * @param filepath - The file path of the test specification
 * @returns A mock test specification object
 */
export const createMockTestSpecification = (filepath: string): any => ({
  moduleId: filepath,
  project: { config: {} }
})

/**
 * Creates a mock Vitest context object for testing
 * @param options - Optional configuration for the mock context
 * @returns A partial Vitest context object
 */
export const createMockVitestContext = (
  options: {
    state?: any
    logger?: any
    config?: any
  } = {}
): any => ({
  state: options.state || {
    getFiles: () => [],
    getTestModules: () => [],
    getUnhandledErrors: () => []
  },
  logger: options.logger || {
    log: () => {},
    error: () => {},
    warn: () => {}
  },
  config: options.config || {
    root: '/test'
  }
})

/**
 * Creates a mock error with stack trace for testing error handling
 * @param message - The error message
 * @param stack - Optional custom stack trace
 * @returns An error object with stack trace
 */
export const createMockError = (message: string, stack?: string): SerializedError => ({
  message,
  stack: stack || `Error: ${message}\n    at TestFile (/test/file.ts:10:5)\n    at Runner.run`,
  name: 'Error',
  cause: undefined,
  stacks: undefined
})

/**
 * Creates a mock assertion error for testing assertion failures
 * @param expected - The expected value
 * @param actual - The actual value
 * @param message - Optional custom message
 * @returns An assertion error object
 */
export const createMockAssertionError = (expected: any, actual: any, message?: string): any => ({
  message: message || `Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`,
  name: 'AssertionError',
  expected,
  actual,
  operator: 'toBe',
  stack: `AssertionError: ${message || 'Assertion failed'}\n    at /test/file.ts:15:10`
})
