import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { SerializedError, TestModule, TestCase } from 'vitest'

describe('LLMReporter stdout JSON purity', () => {
  let originalDebug: string | undefined

  // Helper to create mock test data
  const createMockTestModule = (): TestModule =>
    ({
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
          suite: null as any,
          result: {
            state: 'failed',
            duration: 10,
            error: {
              message: 'Test failed',
              stack: 'Error: Test failed\n    at test.spec.ts:1:1'
            }
          }
        } as TestCase
      ]
    }) as TestModule

  beforeEach(() => {
    // Ensure DEBUG is not enabled for the reporter namespaces
    originalDebug = process.env.DEBUG
    delete process.env.DEBUG
  })

  afterEach(() => {
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
  })

  it('writes pure JSON to stdout when DEBUG is off', async () => {
    const reporter = new LLMReporter({ framedOutput: false })

    // Mock Vitest context to enable console output
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)

    // Also trigger an unhandled error path to exercise debug formatting logic (which goes to stderr)
    const unhandled: SerializedError = {
      message: 'Unhandled rejection',
      stack: 'Error: Unhandled rejection\n    at /path/file.ts:10:5'
    }

    reporter.onTestRunStart([])

    // Provide mock test module with failure to ensure output
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [unhandled], 'failed')

    // Collect all chunks written to stdout in this test
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('')
    stdoutSpy.mockRestore()

    const trimmed = output.trim()
    expect(trimmed.length).toBeGreaterThan(0)
    // Must be valid JSON (no extra human-formatted lines)
    expect(() => JSON.parse(trimmed)).not.toThrow()

    const parsed = JSON.parse(trimmed) as { summary?: unknown }
    expect(parsed).toHaveProperty('summary')
  })
})
