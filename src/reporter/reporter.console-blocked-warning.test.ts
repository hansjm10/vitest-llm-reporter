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

  it('writes a warning to stderr and falls back with JSON when stdout write throws', async () => {
    const reporter = new LLMReporter({ framedOutput: false })

    // Initialize context to allow console output
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    // Make the writer that will be captured as "original" throw
    // Note: we replace before onTestRunStart so interceptor captures this as original
    process.stdout.write = ((..._args: unknown[]) => {
      throw new Error('stdout blocked')
    }) as unknown as typeof process.stdout.write

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any)

    reporter.onTestRunStart([])

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'failed' as TestRunEndReason)

    // Collect stderr writes
    const writes = stderrSpy.mock.calls.map((c) => String(c[0]))
    stderrSpy.mockRestore()

    // Expect a clear warning line
    const hasWarning = writes.some((w) =>
      w.includes('vitest-llm-reporter: Console output appears blocked')
    )
    expect(hasWarning).toBe(true)

    // And the fallback JSON payload
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
  })
})
