import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { TestRunEndReason } from 'vitest/node'

describe('LLMReporter blocked console warning and fallback', () => {
  let origStdoutWrite: typeof process.stdout.write
  let origStderrWrite: typeof process.stderr.write

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
          state: 'failed',
          duration: 10,
          error: {
            message: 'Test failed',
            stack: 'Error: Test failed\n    at test.spec.ts:1:1'
          }
        }
      }
    ]
  })

  beforeEach(() => {
    // Bind to preserve correct `this` and avoid unbound-method lint issues
    origStdoutWrite = process.stdout.write.bind(process.stdout)
    origStderrWrite = process.stderr.write.bind(process.stderr)
  })

  afterEach(() => {
    // Restore writers in case of failures
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
  })

  const expectBlockedFallback = (writes: string[]): void => {
    const hasWarning = writes.some((w) =>
      w.includes('vitest-llm-reporter: Console output appears blocked')
    )
    expect(hasWarning).toBe(true)

    const hasJson = writes.some((w) => {
      const trimmed = w.trim()
      if (!trimmed) return false
      try {
        const parsed = JSON.parse(trimmed)
        return typeof parsed === 'object' && parsed !== null && 'summary' in parsed
      } catch {
        return false
      }
    })
    expect(hasJson).toBe(true)
  }

  it('writes a warning to stderr and falls back with JSON when stdout write throws', async () => {
    // Make the writer throw BEFORE creating the reporter so it gets captured as original
    process.stdout.write = ((..._args: unknown[]) => {
      throw new Error('stdout blocked')
    }) as unknown as typeof process.stdout.write

    const reporter = new LLMReporter({ framedOutput: false })

    // Initialize context to allow console output
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any)

    reporter.onTestRunStart([])

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'failed' as TestRunEndReason)

    // Call onFinished to trigger output
    reporter.onFinished?.([mockModule], [])

    // Collect stderr writes
    const writes = stderrSpy.mock.calls.map((c) => String(c[0]))
    stderrSpy.mockRestore()

    expectBlockedFallback(writes)
  })

  it('does not throw when buffered stdout flush before onTestRunEnd hits blocked stdout', async () => {
    process.stdout.write = ((..._args: unknown[]) => {
      throw new Error('stdout blocked')
    }) as unknown as typeof process.stdout.write

    const reporter = new LLMReporter({
      framedOutput: false,
      warnWhenConsoleBlocked: false,
      stdio: {
        suppressStdout: true,
        frameworkPresets: []
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    reporter.onTestRunStart([])
    process.stdout.write('Compiling...')

    const mockModule = createMockTestModule()
    await expect(
      reporter.onTestRunEnd([mockModule], [], 'failed' as TestRunEndReason)
    ).resolves.toBeUndefined()

    reporter.onFinished?.([mockModule], [])
  })

  it('does not throw when held teardown stdout flush during onFinished hits blocked stdout', async () => {
    process.stdout.write = ((..._args: unknown[]) => {
      throw new Error('stdout blocked')
    }) as unknown as typeof process.stdout.write

    const reporter = new LLMReporter({
      framedOutput: false,
      warnWhenConsoleBlocked: false,
      stdio: {
        suppressStdout: true,
        frameworkPresets: []
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    reporter.onTestRunStart([])

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'failed' as TestRunEndReason)

    process.stdout.write('teardown visible')

    expect(() => reporter.onFinished([], [], undefined)).not.toThrow()
  })

  it('does not throw when updateConfig disables stdout suppression with buffered stdout', () => {
    process.stdout.write = ((..._args: unknown[]) => {
      throw new Error('stdout blocked')
    }) as unknown as typeof process.stdout.write

    const reporter = new LLMReporter({
      framedOutput: false,
      warnWhenConsoleBlocked: false,
      stdio: {
        suppressStdout: true,
        frameworkPresets: [],
        filterPattern: /^Bar$/
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    process.stdout.write('visible partial')

    expect(() => reporter.updateConfig({ stdio: { suppressStdout: false } })).not.toThrow()
    expect(() => reporter.onFinished([], [], undefined)).not.toThrow()
  })

  it('does not throw when updateConfig flushes buffered stdout during a live policy change', () => {
    process.stdout.write = ((..._args: unknown[]) => {
      throw new Error('stdout blocked')
    }) as unknown as typeof process.stdout.write

    const reporter = new LLMReporter({
      framedOutput: false,
      warnWhenConsoleBlocked: false,
      stdio: {
        suppressStdout: true,
        frameworkPresets: [],
        filterPattern: /^Bar$/
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    process.stdout.write('visible partial')

    expect(() => reporter.updateConfig({ pureStdout: true })).not.toThrow()
    expect(() => reporter.onFinished([], [], undefined)).not.toThrow()
  })
})
