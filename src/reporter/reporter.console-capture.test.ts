import { describe, it, expect, beforeEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import { consoleCapture } from '../console/index.js'
import type { TestCase, TestRunEndReason } from 'vitest/node'

describe('LLMReporter Console Capture Integration', () => {
  let reporter: LLMReporter

  beforeEach(() => {
    reporter = new LLMReporter({
      captureConsoleOnFailure: true,
      maxConsoleBytes: 1000,
      maxConsoleLines: 10
    })
  })

  it('should capture console output for failing tests', async () => {
    const testCase = {
      id: 'test-1',
      name: 'failing test',
      fileRelative: { filepath: '/test.ts' },
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
    void reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    // Get output
    const output = reporter.getOutput()

    // Verify console output was captured
    expect(output?.failures).toBeDefined()
    expect(output?.failures?.length).toBe(1)

    const failure = output?.failures?.[0]
    expect(failure?.consoleEvents).toBeDefined()
    expect(failure?.consoleEvents?.length).toBe(3)

    // Check individual events
    const events = failure?.consoleEvents || []
    expect(events[0]).toMatchObject({
      level: 'log',
      message: 'Starting test',
      origin: 'intercepted'
    })
    expect(events[1]).toMatchObject({
      level: 'error',
      message: 'Something went wrong',
      origin: 'intercepted'
    })
    expect(events[2]).toMatchObject({
      level: 'warn',
      message: 'Warning message',
      origin: 'intercepted'
    })
  })

  it('should not capture console output for passing tests by default', async () => {
    const testCase = {
      id: 'test-2',
      name: 'passing test',
      fileRelative: { filepath: '/test.ts' },
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
    await consoleCapture.runWithCapture('test-2', () => {
      console.log('This should not be captured')
    })

    // End test with success
    reporter.onTestCaseResult(testCase)

    // End test run
    void reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    // Get output
    const output = reporter.getOutput()

    // Verify no failures and no success logs
    expect(output?.failures).toBeUndefined()
    expect(output?.successLogs).toBeUndefined()
  })

  it('should capture console output for passing tests when enabled', async () => {
    reporter = new LLMReporter({
      captureConsoleOnFailure: false,
      captureConsoleOnSuccess: true,
      maxConsoleLines: 10,
      maxConsoleBytes: 1000
    })

    const testCase = {
      id: 'test-2-success',
      name: 'passing test with logs',
      fileRelative: { filepath: '/test.ts' },
      location: {
        start: { line: 10 },
        end: { line: 20 }
      },
      result: {
        state: 'passed',
        duration: 75
      }
    } as unknown as TestCase

    reporter.onTestCaseReady(testCase)

    await consoleCapture.runWithCapture('test-2-success', () => {
      console.log('First log message')
      console.info('Informational message')
    })

    reporter.onTestCaseResult(testCase)
    void reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    const output = reporter.getOutput()

    expect(output?.successLogs).toBeDefined()
    expect(output?.successLogs?.length).toBe(1)

    const successLog = output?.successLogs?.[0]
    expect(successLog).toMatchObject({
      test: 'passing test with logs',
      status: 'passed'
    })
    expect(successLog?.consoleEvents).toBeDefined()
    expect(successLog?.consoleEvents?.length).toBe(2)
    expect(successLog?.consoleEvents?.[0]).toMatchObject({
      level: 'log',
      message: 'First log message'
    })
    expect(successLog?.consoleEvents?.[1]).toMatchObject({
      level: 'info',
      message: 'Informational message'
    })
    expect(successLog?.suppressed).toMatchObject({ totalLines: 2, suppressedLines: 0 })
  })

  it('should record suppression metadata when filters drop success logs', async () => {
    reporter = new LLMReporter({
      captureConsoleOnSuccess: true,
      captureConsoleOnFailure: false,
      stdio: {
        suppressStdout: true,
        filterPattern: [/^Secret/]
      }
    })

    const testCase = {
      id: 'filtered-success',
      name: 'passing test with filtered logs',
      fileRelative: { filepath: '/test.ts' },
      location: {
        start: { line: 30 },
        end: { line: 40 }
      },
      result: {
        state: 'passed',
        duration: 42
      }
    } as unknown as TestCase

    reporter.onTestCaseReady(testCase)

    await consoleCapture.runWithCapture('filtered-success', () => {
      console.log('Secret: hidden detail')
      console.log('Visible message')
    })

    reporter.onTestCaseResult(testCase)
    void reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    const output = reporter.getOutput()
    expect(output?.successLogs).toBeDefined()
    const successLog = output?.successLogs?.[0]
    expect(successLog?.consoleEvents).toHaveLength(1)
    expect(successLog?.consoleEvents?.[0]?.message).toBe('Visible message')
    expect(successLog?.suppressed).toMatchObject({ totalLines: 2, suppressedLines: 1 })
  })

  it('should surface suppression metadata even when all success logs are filtered', async () => {
    reporter = new LLMReporter({
      captureConsoleOnSuccess: true,
      captureConsoleOnFailure: false,
      stdio: {
        suppressStdout: true,
        filterPattern: [/^Nope/]
      }
    })

    const testCase = {
      id: 'fully-filtered-success',
      name: 'passing test fully filtered',
      fileRelative: { filepath: '/test.ts' },
      location: {
        start: { line: 50 },
        end: { line: 60 }
      },
      result: {
        state: 'passed',
        duration: 21
      }
    } as unknown as TestCase

    reporter.onTestCaseReady(testCase)

    await consoleCapture.runWithCapture('fully-filtered-success', () => {
      console.log('Nope: hidden 1')
      console.log('Nope: hidden 2')
    })

    reporter.onTestCaseResult(testCase)
    void reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    const output = reporter.getOutput()
    expect(output?.successLogs).toBeDefined()
    const successLog = output?.successLogs?.[0]
    expect(successLog?.consoleEvents).toBeUndefined()
    expect(successLog?.suppressed).toMatchObject({ totalLines: 2, suppressedLines: 2 })
  })

  it('should respect configuration to disable console capture', async () => {
    reporter = new LLMReporter({
      captureConsoleOnFailure: false
    })

    const testCase = {
      id: 'test-3',
      name: 'failing test without capture',
      fileRelative: { filepath: '/test.ts' },
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
    await consoleCapture.runWithCapture('test-3', () => {
      console.log('This should not be captured')
    })

    // End test with failure
    reporter.onTestCaseResult(testCase)

    // End test run
    void reporter.onTestRunEnd([], [], 'completed' as TestRunEndReason)

    // Get output
    const output = reporter.getOutput()

    // Verify failure exists but no console output
    expect(output?.failures).toBeDefined()
    expect(output?.failures?.length).toBe(1)

    const failure = output?.failures?.[0]
    expect(failure?.consoleEvents).toBeUndefined()
    expect(output?.successLogs).toBeUndefined()
  })
})
