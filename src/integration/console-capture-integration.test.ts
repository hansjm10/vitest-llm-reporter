import { describe, it, expect, beforeEach } from 'vitest'
import { LLMReporter } from '../reporter/reporter'
import { consoleCapture } from '../utils/console-capture'
import type { TestCase, TestRunEndReason } from 'vitest/node'

describe('Console Capture Integration', () => {
  let reporter: LLMReporter

  beforeEach(() => {
    reporter = new LLMReporter({
      captureConsoleOnFailure: true,
      maxConsoleBytes: 1000,
      maxConsoleLines: 10
    })
  })

  it('should capture console output for failing tests', async () => {
    // Simulate test lifecycle
    const testCase = {
      id: 'test-1',
      name: 'failing test',
      file: { filepath: '/test.ts' },
      location: {
        start: { line: 1 },
        end: { line: 5 }
      },
      result: {
        state: 'failed',
        duration: 100,
        error: {
          message: 'Expected 4 to be 5',
          name: 'AssertionError'
        }
      }
    } as unknown as TestCase

    // Start test
    reporter.onTestCaseReady(testCase)

    // Simulate console output during test execution context
    await consoleCapture.runWithCapture('test-1', () => {
      console.log('Starting test')
      console.error('Something went wrong')
      console.warn('Warning message')
    })

    // End test with failure
    reporter.onTestCaseResult(testCase)

    // End test run
    reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    // Get output
    const output = reporter.getOutput()

    // Verify console output was captured
    expect(output?.failures).toBeDefined()
    expect(output?.failures?.length).toBe(1)
    
    const failure = output?.failures?.[0]
    expect(failure?.console).toBeDefined()
    expect(failure?.console?.logs).toContain('Starting test')
    expect(failure?.console?.errors).toContain('Something went wrong')
    expect(failure?.console?.warns).toContain('Warning message')
  })

  it('should not capture console output for passing tests', () => {
    const testCase = {
      id: 'test-2',
      name: 'passing test',
      file: { filepath: '/test.ts' },
      location: {
        start: { line: 1 },
        end: { line: 5 }
      },
      result: {
        state: 'passed',
        duration: 50
      }
    } as unknown as TestCase

    // Start test
    reporter.onTestCaseReady(testCase)

    // Simulate console output during test
    console.log('This should not be captured')

    // End test with success
    reporter.onTestCaseResult(testCase)

    // End test run
    reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    // Get output
    const output = reporter.getOutput()

    // Verify no failures and no console output
    expect(output?.failures).toBeUndefined()
  })

  it('should respect configuration to disable console capture', () => {
    reporter = new LLMReporter({
      captureConsoleOnFailure: false
    })

    const testCase = {
      id: 'test-3',
      name: 'failing test without capture',
      file: { filepath: '/test.ts' },
      location: {
        start: { line: 1 },
        end: { line: 5 }
      },
      result: {
        state: 'failed',
        duration: 100,
        error: {
          message: 'Test failed',
          name: 'Error'
        }
      }
    } as unknown as TestCase

    // Start test
    reporter.onTestCaseReady(testCase)

    // Simulate console output during test
    console.log('This should not be captured')

    // End test with failure
    reporter.onTestCaseResult(testCase)

    // End test run
    reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    // Get output
    const output = reporter.getOutput()

    // Verify failure exists but no console output
    expect(output?.failures).toBeDefined()
    expect(output?.failures?.length).toBe(1)
    
    const failure = output?.failures?.[0]
    expect(failure?.console).toBeUndefined()
  })
})