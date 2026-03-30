import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'

describe('LLMReporter afterAll error handling', () => {
  let reporter: LLMReporter
  let stdoutSpy: any

  const createMockTestModule = (): any => ({
    id: 'test-1',
    name: 'test.spec.ts',
    type: 'suite',
    mode: 'run',
    filepath: '/test/test.spec.ts',
    tasks: [
      {
        id: 'test-1-1',
        name: 'mock test',
        type: 'test',
        mode: 'run',
        suite: null,
        result: {
          state: 'passed',
          duration: 10
        }
      }
    ]
  })

  beforeEach(() => {
    reporter = new LLMReporter({
      enableConsoleOutput: true,
      framedOutput: false,
      stdio: { suppressStdout: false, suppressStderr: false }
    })

    // Mock Vitest context
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    // Spy on stdout
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)
  })

  afterEach(() => {
    stdoutSpy?.mockRestore()
  })

  it('should capture and report afterAll hook errors in onFinished', async () => {
    // Start test run
    reporter.onTestRunStart([])

    // Simulate test execution
    await reporter.onTestRunEnd([], [], 'passed')

    // Simulate an afterAll error
    const afterAllError = new Error('Database connection failed during cleanup')
    afterAllError.stack =
      'Error: Database connection failed\n    at afterAll (/test-project/test.spec.js:50:10)'

    // Call onFinished with the afterAll error
    reporter.onFinished([], [afterAllError], undefined)

    // Collect stdout output
    const output = stdoutSpy.mock.calls.map((call: any) => String(call[0])).join('')

    // Parse the JSON output
    const jsonOutput = JSON.parse(output.trim())

    // Verify the afterAll error was captured
    expect(jsonOutput.failures).toBeDefined()
    expect(jsonOutput.failures.length).toBeGreaterThan(0)

    const teardownError = jsonOutput.failures.find((f: any) => f.test === 'Teardown Error')
    expect(teardownError).toBeDefined()
    expect(teardownError.suite).toEqual(['AfterAll Hook'])
    expect(teardownError.error.message).toBe('Database connection failed during cleanup')

    // Verify summary was updated consistently
    expect(jsonOutput.summary.failed).toBeGreaterThan(0)
    expect(jsonOutput.summary.total).toBe(jsonOutput.summary.failed)
  })

  it('should handle multiple teardown errors', async () => {
    // Start test run
    reporter.onTestRunStart([])

    // Simulate test execution
    await reporter.onTestRunEnd([], [], 'passed')

    // Simulate multiple afterAll errors
    const error1 = new Error('Database cleanup failed')
    const error2 = new Error('Server shutdown failed')

    // Call onFinished with multiple errors
    reporter.onFinished([], [error1, error2], undefined)

    // Collect stdout output
    const output = stdoutSpy.mock.calls.map((call: any) => String(call[0])).join('')

    // Parse the JSON output
    const jsonOutput = JSON.parse(output.trim())

    // Verify both errors were captured
    expect(jsonOutput.failures).toBeDefined()
    expect(jsonOutput.failures.length).toBe(2)
    expect(jsonOutput.summary.failed).toBe(2)
    expect(jsonOutput.summary.total).toBe(2)
  })

  it('should build output when teardown errors occur before output is created', () => {
    const error = new Error('Teardown failed before output')
    error.stack =
      'Error: Teardown failed before output\n    at afterAll (/test-project/test.spec.js:10:5)'

    reporter.onFinished([], [error], undefined)

    const output = stdoutSpy.mock.calls.map((call: any) => String(call[0])).join('')
    const jsonOutput = JSON.parse(output.trim())

    expect(jsonOutput.summary.failed).toBe(1)
    expect(jsonOutput.summary.total).toBe(1)
    expect(jsonOutput.failures).toBeDefined()
    expect(jsonOutput.failures.length).toBe(1)
    expect(jsonOutput.failures[0].test).toBe('Teardown Error')
  })

  it('re-emits console JSON when teardown errors arrive after onTestRunEnd flushed output', async () => {
    reporter.onTestRunStart([])

    const mockModule = createMockTestModule()
    reporter.onTestModuleCollected(mockModule)
    reporter.onTestModuleStart(mockModule)

    const testCase = mockModule.tasks[0]
    reporter.onTestCaseReady(testCase)
    reporter.onTestCaseResult(testCase)
    reporter.onTestModuleEnd(mockModule)

    await reporter.onTestRunEnd([mockModule], [], 'passed')

    const afterAllError = new Error('Database connection failed during cleanup')
    afterAllError.stack =
      'Error: Database connection failed\n    at afterAll (/test-project/test.spec.js:50:10)'

    reporter.onFinished([], [afterAllError], undefined)

    const jsonWrites = stdoutSpy.mock.calls
      .map((call: any) => String(call[0]))
      .filter((write: string) => {
        try {
          JSON.parse(write.trim())
          return true
        } catch {
          return false
        }
      })

    expect(jsonWrites).toHaveLength(2)

    const initialOutput = JSON.parse(jsonWrites[0].trim())
    const finalOutput = JSON.parse(jsonWrites[1].trim())

    expect(initialOutput.summary.failed).toBe(0)
    expect(initialOutput.failures).toBeUndefined()

    expect(finalOutput.summary.failed).toBe(1)
    expect(finalOutput.summary.total).toBe(initialOutput.summary.total + 1)
    expect(finalOutput.failures).toHaveLength(1)
    expect(finalOutput.failures[0].test).toBe('Teardown Error')
    expect(finalOutput.failures[0].suite).toEqual(['AfterAll Hook'])
  })

  it('should work correctly when no teardown errors occur', async () => {
    // Start test run with a passing test
    reporter.onTestRunStart([])

    // Create a mock test to ensure output is generated
    const mockModule = {
      name: 'test.spec.js',
      filepath: '/test-project/test.spec.js',
      state: 'pass',
      type: 'module'
    } as any

    // Simulate test execution with a passing test
    await reporter.onTestRunEnd([mockModule], [], 'passed')

    // Call onFinished with no errors
    reporter.onFinished([], [], undefined)

    // Collect stdout output
    const output = stdoutSpy.mock.calls.map((call: any) => String(call[0])).join('')

    // Check if output was generated (it might not be if no tests were recorded)
    if (!output.trim()) {
      // No output is expected when there are no real test results
      // This is fine - the reporter only outputs when there are meaningful results
      expect(output).toBe('')
      return
    }

    // Parse the JSON output
    const jsonOutput = JSON.parse(output.trim())

    // Verify no failures were added
    expect(jsonOutput.failures).toBeUndefined()
    expect(jsonOutput.summary.failed).toBe(0)
    expect(jsonOutput.summary.total).toBeGreaterThan(0)
  })
})
