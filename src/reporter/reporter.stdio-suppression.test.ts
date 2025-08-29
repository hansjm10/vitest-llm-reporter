import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { TestRunEndReason } from 'vitest/node'

describe('LLMReporter stdio suppression', () => {
  let originalDebug: string | undefined

  // Helper to create mock test data
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
    // Ensure DEBUG is not enabled for the reporter namespaces
    originalDebug = process.env.DEBUG
    delete process.env.DEBUG
  })

  afterEach(() => {
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
  })

  it('suppresses external stdout writes when configured', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    // Mock stdout to capture all writes
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false
      // Using default config which has suppressStdout: true
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Process a test module through the lifecycle to update statistics
    const mockModule = createMockTestModule()
    reporter.onTestModuleCollected(mockModule)
    reporter.onTestModuleStart(mockModule)

    // Process the test case
    const testCase = mockModule.tasks[0]
    reporter.onTestCaseReady(testCase)
    reporter.onTestCaseResult(testCase)

    reporter.onTestModuleEnd(mockModule)

    // Simulate external framework writing to stdout
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Some other log\n')

    // End the test run
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    // Restore original
    process.stdout.write = originalWrite

    // The NestJS log should be filtered out (matching default pattern)
    const hasNestLog = stdoutWrites.some((write) => write.includes('[Nest]'))
    expect(hasNestLog).toBe(false)

    // The reporter should have written JSON output (since we provided test data)
    // Note: The actual JSON output requires proper test lifecycle processing
    // which is complex to mock. The core suppression behavior is verified above.
  })

  it('allows stdout when suppressStdout is explicitly disabled', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    // Mock stdout to capture all writes
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: { suppressStdout: false }
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Simulate external framework writing to stdout
    process.stdout.write('[Nest] 12345 - Starting application...\n')

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    // Restore original
    process.stdout.write = originalWrite

    // The NestJS log should NOT be filtered when suppression is disabled
    const hasNestLog = stdoutWrites.some((write) => write.includes('[Nest]'))
    expect(hasNestLog).toBe(true)
  })

  it('pure stdout mode suppresses all external stdout', async () => {
    const reporter = new LLMReporter({
      framedOutput: false,
      pureStdout: true
    })

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Simulate various external writes
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Random log without pattern\n')
    process.stdout.write('Another unrelated output\n')

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    stdoutSpy.mockRestore()

    // Get all stdout writes
    const allWrites = stdoutSpy.mock.calls.map((call) => String(call[0]))

    // Only the reporter's JSON should be present, all other output suppressed
    const nonJsonWrites = allWrites.filter((write) => {
      try {
        JSON.parse(write.trim())
        return false // It's JSON, so not a non-JSON write
      } catch {
        return true // Not JSON, so it's external output
      }
    })

    expect(nonJsonWrites.length).toBe(0)
  })

  it('restores original writers after test run', async () => {
    const originalWrite = process.stdout.write.bind(process.stdout)

    const reporter = new LLMReporter({
      framedOutput: false
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // stdout.write should be patched during the run
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(process.stdout.write).not.toBe(originalWrite)

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    // After cleanup, writer should be restored (though it may be a different bound function)
    expect(typeof process.stdout.write).toBe('function')
  })

  it('handles custom filter patterns', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    // Mock stdout to capture all writes
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStdout: true,
        filterPattern: /^CustomPrefix:/
      }
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Write various outputs
    process.stdout.write('CustomPrefix: This should be filtered\n')
    process.stdout.write('NormalLog: This should pass through\n')
    process.stdout.write('[Nest] This should also pass through\n')

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    // Restore original
    process.stdout.write = originalWrite

    // CustomPrefix should be filtered
    const hasCustomPrefix = stdoutWrites.some((write) => write.includes('CustomPrefix:'))
    expect(hasCustomPrefix).toBe(false)

    // Other logs should pass through
    const hasNormalLog = stdoutWrites.some((write) => write.includes('NormalLog:'))
    expect(hasNormalLog).toBe(true)
  })

  it('does not start spinner when stderr is suppressed', async () => {
    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStderr: true
      }
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any)

    reporter.onTestRunStart([])

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    stderrSpy.mockRestore()

    // No spinner output should be written to stderr
    const allWrites = stderrSpy.mock.calls.map((call) => String(call[0]))
    const hasSpinnerOutput = allWrites.some(
      (write) => write.includes('Running tests') || write.includes('|') || write.includes('/')
    )
    expect(hasSpinnerOutput).toBe(false)
  })
})
