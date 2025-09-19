import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventOrchestrator } from '../../src/events/EventOrchestrator.js'
import { StateManager } from '../../src/state/StateManager.js'
import { TestCaseExtractor } from '../../src/extraction/TestCaseExtractor.js'
import { ErrorExtractor } from '../../src/extraction/ErrorExtractor.js'
import { TestResultBuilder } from '../../src/builders/TestResultBuilder.js'
import { ErrorContextBuilder } from '../../src/builders/ErrorContextBuilder.js'
import { consoleCapture, consoleMerger } from '../../src/console/index.js'

function createFailedTestCase(id: string) {
  return {
    id,
    name: `failing test ${id}`,
    file: { filepath: `tests/${id}.ts` },
    result: {
      state: 'fail',
      duration: 1,
      errors: [
        {
          message: 'boom',
          stack: 'Error: boom'
        }
      ]
    }
  }
}

describe('Integration: Deduplication finalization', () => {
  let orchestrator: EventOrchestrator
  let stateManager: StateManager

  beforeEach(() => {
    stateManager = new StateManager()
    orchestrator = new EventOrchestrator(
      stateManager,
      new TestCaseExtractor(),
      new ErrorExtractor({ includeSourceCode: false }),
      new TestResultBuilder(),
      new ErrorContextBuilder({ includeLineNumbers: false }),
      {
        deduplicationConfig: {
          enabled: true,
          includeSources: true,
          normalizeWhitespace: true,
          stripAnsiCodes: true,
          stripTimestamps: true,
          maxCacheEntries: 1000
        },
        captureConsoleOnFailure: true
      }
    )
  })

  afterEach(() => {
    consoleCapture.reset()
  })

  it('aggregates deduplication counts across test boundaries before reset', () => {
    const first = createFailedTestCase('test-1')
    orchestrator.handleTestCaseReady(first)
    consoleCapture.ingest('test-1', 'log', ['Repeated message'])
    orchestrator.handleTestCaseResult(first)

    const initialFailure = stateManager.getTestResults().failed[0]
    expect(initialFailure.consoleEvents?.[0].deduplication).toBeUndefined()

    const second = createFailedTestCase('test-2')
    orchestrator.handleTestCaseReady(second)
    consoleCapture.ingest('test-2', 'log', ['Repeated message'])
    orchestrator.handleTestCaseResult(second)

    orchestrator.handleTestRunEnd([], [], 'completed' as import('vitest/node').TestRunEndReason)

    const finalizedFailure = stateManager.getTestResults().failed[0]
    const metadata = finalizedFailure.consoleEvents?.[0].deduplication
    expect(metadata).toBeDefined()
    expect(metadata?.count).toBe(2)
    expect(metadata?.sources).toEqual(expect.arrayContaining(['test-1', 'test-2']))
    expect(finalizedFailure.consoleEvents?.[0]?.testId).toBeUndefined()
    expect(finalizedFailure.consoleEvents?.[0]?.timestampMs).toBeUndefined()
  })

  it('forwards Vitest log timestamps to console capture', () => {
    const testId = 'timestamp-test'
    const timestamp = 1_700_000_000_000
    const startTime = timestamp - 25

    consoleCapture.startCapture(testId, false, startTime)

    const ingestSpy = vi.spyOn(consoleCapture, 'ingest')

    orchestrator.handleUserConsoleLog({
      taskId: testId,
      type: 'stdout',
      content: 'hello from vitest',
      time: timestamp
    } as any)

    expect(ingestSpy).toHaveBeenCalledWith(
      testId,
      'log',
      ['hello from vitest'],
      expect.objectContaining({ timestamp })
    )

    ingestSpy.mockRestore()

    const result = consoleCapture.stopCapture(testId)
    expect(result.entries[0]?.timestampMs).toBe(timestamp)
  })
  it('deduplicates mixed console sources with normalized timestamps', () => {
    const testId = 'mixed-sources'
    const message = 'same message'
    const startTime = 1_700_000_100_000

    consoleCapture.startCapture(testId, false, startTime)

    // Simulate AsyncLocalStorage-captured console log
    consoleCapture.ingest(testId, 'log', [message], { elapsed: 50 })

    // Simulate Vitest forwarding the same log with absolute timestamp
    consoleCapture.ingest(testId, 'log', [message], { timestamp: startTime + 50 })

    const captureResult = consoleCapture.stopCapture(testId)

    const taskEvents = [
      {
        level: 'log' as const,
        message,
        origin: 'task' as const,
        timestampMs: startTime + 50
      }
    ]

    const merged = consoleMerger.merge(taskEvents, captureResult.entries)

    expect(captureResult.entries).toHaveLength(1)
    expect(merged).toBeDefined()
    expect(merged).toHaveLength(1)
    expect(merged![0].timestampMs).toBe(startTime + 50)
  })
})
