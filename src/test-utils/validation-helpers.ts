/**
 * Shared validation helper functions for tests
 *
 * These utilities provide consistent validation testing across
 * schema-related test files, eliminating duplication and ensuring
 * uniform testing patterns.
 */

import type { TestSummary, TestFailure, TestResult } from '../types/schema.js'
import { SchemaValidator } from '../validation/validator.js'
import { getRuntimeEnvironmentSummary } from '../utils/runtime-environment.js'

/**
 * Creates a new instance of SchemaValidator for testing
 * @returns A fresh SchemaValidator instance
 */
export const createTestValidator = (): SchemaValidator => new SchemaValidator()

/**
 * Type guard to validate if an unknown value is a valid TestSummary
 * @param summary - The value to validate
 * @returns True if the summary is valid according to schema rules
 */
export const isValidTestSummary = (summary: unknown): summary is TestSummary => {
  const validator = createTestValidator()
  const result = validator.validate({ summary, failures: [] })
  return result.valid
}

/**
 * Type guard to validate if an unknown value is a valid TestFailure
 * @param failure - The value to validate
 * @returns True if the failure is valid according to schema rules
 */
export const isValidTestFailure = (failure: unknown): failure is TestFailure => {
  const validator = createTestValidator()
  const summary: TestSummary = {
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0,
    duration: 100,
    timestamp: new Date().toISOString(),
    environment: getRuntimeEnvironmentSummary()
  }
  const result = validator.validate({ summary, failures: [failure] })
  return result.valid
}

/**
 * Type guard to validate if an unknown value is a valid TestResult
 * @param result - The value to validate
 * @returns True if the result is valid according to schema rules
 */
export const isValidTestResult = (result: unknown): result is TestResult => {
  const validator = createTestValidator()
  const summary: TestSummary = {
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    duration: 100,
    timestamp: new Date().toISOString(),
    environment: getRuntimeEnvironmentSummary()
  }
  const output = validator.validate({ summary, passed: [result] })
  return output.valid
}
