import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { SerializedError } from 'vitest'

describe('LLMReporter stdout JSON purity', () => {
  let originalDebug: string | undefined

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

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)

    // Trigger an unhandled error path to exercise debug formatting logic (which goes to stderr)
    const unhandled: SerializedError = {
      message: 'Unhandled rejection',
      stack: 'Error: Unhandled rejection\n    at /path/file.ts:10:5'
    }

    reporter.onTestRunStart([])
    await reporter.onTestRunEnd([], [unhandled], 'failed')

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

