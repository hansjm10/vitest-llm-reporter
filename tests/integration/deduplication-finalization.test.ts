import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventOrchestrator } from '../../src/events/EventOrchestrator.js'
import { StateManager } from '../../src/state/StateManager.js'
import { TestCaseExtractor } from '../../src/extraction/TestCaseExtractor.js'
import { ErrorExtractor } from '../../src/extraction/ErrorExtractor.js'
import { TestResultBuilder } from '../../src/builders/TestResultBuilder.js'
import { ErrorContextBuilder } from '../../src/builders/ErrorContextBuilder.js'
import { consoleCapture } from '../../src/console/index.js'

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
    expect(finalizedFailure.consoleEvents?.[0].deduplication?.deduplicated).toBe(true)
    expect(finalizedFailure.consoleEvents?.[0].deduplication?.count).toBe(2)
    expect(finalizedFailure.consoleEvents?.[0].deduplication?.firstSeen).toBeTypeOf('string')
    expect(finalizedFailure.consoleEvents?.[0].deduplication?.lastSeen).toBeTypeOf('string')
  })
})
