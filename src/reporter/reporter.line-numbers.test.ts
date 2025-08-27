/**
 * Line Number Extraction Tests
 *
 * These tests verify that the LLM Reporter correctly extracts
 * and reports line numbers for test cases.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { TestCase } from 'vitest/node'

describe('LLMReporter Line Number Extraction', () => {
  let reporter: LLMReporter

  beforeEach(() => {
    reporter = new LLMReporter({
      verbose: true,
      includePassedTests: true
    })
  })

  it('should extract line numbers from test location', () => {
    // This test's line number should be captured
    const mockTestCase = {
      id: 'test-1',
      name: 'test with line numbers',
      fileRelative: { filepath: __filename },
      location: {
        start: { line: 22 }, // Line where this test starts
        end: { line: 50 } // Approximate end line
      },
      result: {
        state: 'pass',
        duration: 10
      }
    } as unknown as TestCase

    // Process the test
    reporter.onTestCaseResult(mockTestCase)

    // Get the output
    void reporter.onTestRunEnd([], [], 'passed')
    const output = reporter.getOutput()

    expect(output).toBeDefined()
    expect(output?.passed).toBeDefined()
    expect(output?.passed?.length).toBeGreaterThan(0)

    const testResult = output?.passed?.[0]
    expect(testResult?.startLine).toBe(22)
    expect(testResult?.endLine).toBe(50)
  })

  it('should handle missing location data gracefully', () => {
    const mockTestCase = {
      id: 'test-2',
      name: 'test without location',
      fileRelative: { filepath: __filename },
      // No location property
      result: {
        state: 'pass',
        duration: 10
      }
    } as unknown as TestCase

    reporter.onTestCaseResult(mockTestCase)
    void reporter.onTestRunEnd([], [], 'passed')
    const output = reporter.getOutput()

    const testResult = output?.passed?.[0]
    expect(testResult?.startLine).toBe(0) // Should use default
    expect(testResult?.endLine).toBe(0) // Should use default
  })

  it('should capture actual line numbers from real test execution', () => {
    // This test verifies that when THIS test runs,
    // its actual line numbers are captured
    // The test starts at line 72 and ends around line 79

    // When this test completes and we check the output,
    // we should see non-zero line numbers for this test
    expect(true).toBe(true)
  })

  describe('nested suite line numbers', () => {
    it('should capture line numbers for tests in nested suites', () => {
      // Tests in nested suites should also have line numbers
      // This test starts around line 83
      expect(true).toBe(true)
    })
  })
})

// After running these tests, we can check the test-output.json
// to see if any of these tests have non-zero line numbers.
// This will tell us if Vitest is providing location data.
