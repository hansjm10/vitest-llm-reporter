import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { TestCase } from 'vitest/node'

describe('LLMReporter Console Capture - Direct Test', () => {
  let reporter: LLMReporter

  beforeEach(() => {
    reporter = new LLMReporter({
      verbose: false,
      captureConsoleOnFailure: true
    })
    reporter.onTestRunStart([])
  })

  afterEach(() => {
    void reporter.onTestRunEnd([], [], 'passed')
  })

  it('should capture console output when test fails', () => {
    // Create a mock test case
    const testId = 'test-console-capture'
    const mockTestCase = {
      id: testId,
      type: 'test',
      name: 'test with console output',
      result: {
        state: 'fail',
        error: new Error('Test failed')
      },
      file: '/test/file.ts',
      location: { start: { line: 10 }, end: { line: 20 } }
    } as unknown as TestCase

    // Important: onUserConsoleLog must be called BEFORE onTestCaseResult
    // to ensure the console is captured for the test

    // Simulate console logs being sent via onUserConsoleLog
    reporter.onUserConsoleLog({
      content: 'Test log message',
      type: 'stdout',
      taskId: testId,
      time: Date.now(),
      size: 16 // Add required size property
    })

    reporter.onUserConsoleLog({
      content: 'Test error message',
      type: 'stderr',
      taskId: testId,
      time: Date.now(),
      size: 18 // Add required size property
    })

    // Process the test case - this will stop capture and include console
    reporter.onTestCaseResult(mockTestCase)

    // Get the output
    void reporter.onTestRunEnd([], [], 'failed')
    const output = reporter.getOutput()

    // Verify console was captured
    expect(output).toBeDefined()
    expect(output?.failures).toBeDefined()
    expect(output?.failures).toHaveLength(1)

    const failure = output?.failures?.[0]
    expect(failure).toBeDefined()

    expect(failure?.console).toBeDefined()

    // Check console content
    expect(failure?.console?.logs).toBeInstanceOf(Array)
    expect(failure?.console?.logs).toContainEqual('Test log message')

    expect(failure?.console?.errors).toBeInstanceOf(Array)
    expect(failure?.console?.errors).toContainEqual('Test error message')
  })

  it('should not capture console for passing tests', () => {
    const mockTestCase = {
      id: 'test-passing',
      type: 'test',
      name: 'passing test',
      result: {
        state: 'pass'
      },
      file: '/test/file.ts',
      location: { start: { line: 10 }, end: { line: 20 } }
    } as unknown as TestCase

    // Send console logs
    reporter.onUserConsoleLog({
      content: 'Should not be captured',
      type: 'stdout',
      taskId: 'test-passing',
      time: Date.now(),
      size: 23 // Add required size property
    })

    // Process the test case
    reporter.onTestCaseResult(mockTestCase)

    // Get the output
    void reporter.onTestRunEnd([], [], 'passed')
    const output = reporter.getOutput()

    // Since test passed and verbose is false, it shouldn't be in output
    expect(output?.passed).toBeUndefined()
  })
})
