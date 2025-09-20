import { describe, it, expect } from 'vitest'
import { LLMReporter } from '../../src/reporter/reporter.js'
import type { BuildOptions } from '../../src/output/types.js'
import type { TestSuccessLog, ConsoleEvent } from '../../src/types/schema.js'

describe('Integration: outputView runtime updates', () => {
  it('should propagate outputView (console) changes to OutputBuilder at runtime', () => {
    const reporter = new LLMReporter({})

    // Prepare a minimal success log with console events containing fields gated by the view
    const consoleEvent: ConsoleEvent = {
      level: 'log',
      message: 'hello',
      testId: 'test-1',
      timestampMs: 123,
      timestamp: 123,
      args: ['a']
    }

    const successLog: TestSuccessLog = {
      test: 'sample test',
      fileRelative: 'sample.test.ts',
      startLine: 1,
      endLine: 1,
      status: 'passed',
      consoleEvents: [consoleEvent]
    }

    const buildOpts: BuildOptions = {
      testResults: {
        passed: [],
        failed: [],
        skipped: [],
        successLogs: [successLog]
      },
      duration: 10
    }

    // Access the builder for controlled build (testing propagation behavior)
    const builder = (reporter as any).outputBuilder as {
      build: (opts: BuildOptions) => { successLogs?: Array<{ consoleEvents?: ConsoleEvent[] }> }
    }

    // Initial build should NOT include testId/timestamp by default (projection false)
    const out1 = builder.build(buildOpts)
    const ev1 = out1.successLogs?.[0].consoleEvents?.[0]
    expect(ev1).toBeDefined()
    expect(ev1?.testId).toBeUndefined()
    expect(ev1?.timestampMs).toBeUndefined()
    expect(ev1?.timestamp).toBeUndefined()

    // Update reporter config to include these fields
    reporter.updateConfig({
      outputView: { console: { includeTestId: true, includeTimestampMs: true } }
    })

    const out2 = builder.build(buildOpts)
    const ev2 = out2.successLogs?.[0].consoleEvents?.[0]
    expect(ev2).toBeDefined()
    expect(ev2?.testId).toBe('test-1')
    expect(ev2?.timestampMs).toBe(123)
    expect(ev2?.timestamp).toBe(123)
  })
})
