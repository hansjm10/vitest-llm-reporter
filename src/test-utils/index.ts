/**
 * Test utilities index
 *
 * Central export point for all test helper functions, mock data generators,
 * and factory functions used across the test suite.
 */

// Validation helpers for schema testing
export {
  createTestValidator,
  isValidTestSummary,
  isValidTestFailure,
  isValidTestResult
} from './validation-helpers.js'

// Mock data generators for Vitest objects
export {
  createMockTestCase,
  createMockTestModule,
  createMockTestSpecification,
  createMockVitestContext,
  createMockError,
  createMockAssertionError
} from './mock-data.js'

// Factory functions for test objects
export {
  createTestSummary,
  createValidOutput,
  createOutputWithFailures,
  createOutputWithPassed,
  createFailureWithContext,
  createInvalidOutput,
  createNestedSuiteFailure,
  createMixedOutput,
  createOutputWithCode,
  createXSSTestOutput,
  createOutputWithFilePath
} from './test-factories.js'
