/**
 * Tests for Streaming Formatters
 *
 * Comprehensive test suite for all streaming formatters including base interface,
 * JsonLineFormatter, and MarkdownStreamFormatter. Tests include functionality,
 * configuration, error handling, and integration scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TestResult, TestFailure, LLMReporterOutput } from '../types/schema'
import {
  BaseStreamingFormatter,
  StreamingEventType,
  createStreamingEvent,
  isTestCompleteData,
  isTestFailureData,
  isRunCompleteData,
  type StreamingEvent,
  // type FormatterConfig,
  type TestCompleteData,
  type TestFailureData,
  type RunCompleteData
} from './StreamingFormatter'
import { JsonLineFormatter } from './JsonLineFormatter'
import { MarkdownStreamFormatter } from './MarkdownStreamFormatter'

// Mock implementations for testing
class MockFormatter extends BaseStreamingFormatter {
  private outputs: string[] = []

  formatEvent(event: StreamingEvent): Promise<string> {
    this.updateCounters(event)
    const output = `Mock: ${event.type} - ${JSON.stringify(event.data)}`
    this.outputs.push(output)
    return Promise.resolve(output)
  }

  formatFinal(output: LLMReporterOutput): Promise<string> {
    return Promise.resolve(`Final: ${JSON.stringify(output.summary)}`)
  }

  getOutputs(): string[] {
    return [...this.outputs]
  }

  clearOutputs(): void {
    this.outputs = []
  }
}

// Test data factories
const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
  test: 'should work',
  file: '/path/to/test.js',
  startLine: 10,
  endLine: 15,
  status: 'passed' as const,
  duration: 100,
  suite: ['MyComponent'],
  ...overrides
})

const createTestFailure = (overrides: Partial<TestFailure> = {}): TestFailure => ({
  test: 'should not fail',
  file: '/path/to/test.js',
  startLine: 20,
  endLine: 25,
  suite: ['MyComponent'],
  error: {
    message: 'Assertion failed',
    type: 'AssertionError',
    stack: 'Error: Assertion failed\n    at test.js:22:5',
    assertion: {
      expected: true,
      actual: false,
      operator: 'toBe'
    },
    context: {
      code: ['expect(result).toBe(true)', 'but got false'],
      expected: true,
      actual: false,
      lineNumber: 22
    }
  },
  console: {
    logs: ['Debug message'],
    errors: ['Error message']
  },
  ...overrides
})

const createLLMOutput = (overrides: Partial<LLMReporterOutput> = {}): LLMReporterOutput => ({
  summary: {
    total: 10,
    passed: 8,
    failed: 1,
    skipped: 1,
    duration: 5000,
    timestamp: '2024-01-01T00:00:00.000Z'
  },
  failures: [createTestFailure()],
  passed: [createTestResult(), createTestResult({ test: 'another test' })],
  skipped: [createTestResult({ test: 'skipped test', status: 'skipped' })],
  ...overrides
})

describe('StreamingFormatter Base Classes', () => {
  describe('BaseStreamingFormatter', () => {
    let formatter: MockFormatter

    beforeEach(() => {
      formatter = new MockFormatter()
    })

    it('should initialize properly', async () => {
      expect(formatter.getState().initialized).toBe(false)

      await formatter.initialize()

      expect(formatter.getState().initialized).toBe(true)
    })

    it('should prevent double initialization', async () => {
      await formatter.initialize()
      const state1 = formatter.getState()

      await formatter.initialize() // Should not reinitialize
      const state2 = formatter.getState()

      expect(state1).toEqual(state2)
    })

    it('should track event counters properly', async () => {
      await formatter.initialize()

      const testCompleteEvent = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
        result: createTestResult(),
        progress: { completed: 1, total: 5 }
      } as TestCompleteData)

      const testFailureEvent = createStreamingEvent(StreamingEventType.TEST_FAILURE, {
        failure: createTestFailure(),
        progress: { completed: 2, total: 5 }
      } as TestFailureData)

      void formatter.formatEvent(testCompleteEvent)
      void formatter.formatEvent(testFailureEvent)

      const state = formatter.getState()
      expect(state.eventsProcessed).toBe(2)
      expect(state.testsProcessed).toBe(2)
      expect(state.counts.passed).toBe(1)
      expect(state.counts.failed).toBe(1)
      expect(state.counts.skipped).toBe(0)
    })

    it('should reset state properly', async () => {
      await formatter.initialize()

      const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
        result: createTestResult(),
        progress: { completed: 1, total: 5 }
      } as TestCompleteData)

      void formatter.formatEvent(event)
      expect(formatter.getState().eventsProcessed).toBe(1)

      formatter.reset()

      const state = formatter.getState()
      expect(state.eventsProcessed).toBe(0)
      expect(state.testsProcessed).toBe(0)
      expect(state.counts).toEqual({ passed: 0, failed: 0, skipped: 0 })
      expect(state.initialized).toBe(true) // Should remain initialized
    })

    it('should handle configuration updates', () => {
      const initialConfig = formatter.getConfig()
      expect(initialConfig.includeTimestamps).toBe(true)

      formatter.updateConfig({ includeTimestamps: false })

      const updatedConfig = formatter.getConfig()
      expect(updatedConfig.includeTimestamps).toBe(false)
    })

    it('should cleanup properly', async () => {
      await formatter.initialize()
      expect(formatter.getState().initialized).toBe(true)

      await formatter.cleanup()

      expect(formatter.getState().initialized).toBe(false)
    })
  })

  describe('Streaming Event Utilities', () => {
    it('should create streaming events correctly', () => {
      const data = {
        result: createTestResult(),
        progress: { completed: 1, total: 5 }
      } as TestCompleteData
      const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, data)

      expect(event.type).toBe(StreamingEventType.TEST_COMPLETE)
      expect(event.data).toEqual(data)
      expect(event.timestamp).toBeTypeOf('number')
      expect(event.timestamp).toBeLessThanOrEqual(Date.now())
    })

    it('should identify test complete data', () => {
      const testCompleteData = {
        result: createTestResult(),
        progress: { completed: 1, total: 5 }
      } as TestCompleteData
      const testFailureData = {
        failure: createTestFailure(),
        progress: { completed: 1, total: 5 }
      } as TestFailureData
      const runCompleteData = {
        summary: createLLMOutput().summary,
        finalOutput: createLLMOutput()
      } as RunCompleteData

      expect(isTestCompleteData(testCompleteData)).toBe(true)
      expect(isTestCompleteData(testFailureData)).toBe(false)
      expect(isTestCompleteData(runCompleteData)).toBe(false)
    })

    it('should identify test failure data', () => {
      const testCompleteData = {
        result: createTestResult(),
        progress: { completed: 1, total: 5 }
      } as TestCompleteData
      const testFailureData = {
        failure: createTestFailure(),
        progress: { completed: 1, total: 5 }
      } as TestFailureData
      const runCompleteData = {
        summary: createLLMOutput().summary,
        finalOutput: createLLMOutput()
      } as RunCompleteData

      expect(isTestFailureData(testFailureData)).toBe(true)
      expect(isTestFailureData(testCompleteData)).toBe(false)
      expect(isTestFailureData(runCompleteData)).toBe(false)
    })

    it('should identify run complete data', () => {
      const testCompleteData = {
        result: createTestResult(),
        progress: { completed: 1, total: 5 }
      } as TestCompleteData
      const testFailureData = {
        failure: createTestFailure(),
        progress: { completed: 1, total: 5 }
      } as TestFailureData
      const runCompleteData = {
        summary: createLLMOutput().summary,
        finalOutput: createLLMOutput()
      } as RunCompleteData

      expect(isRunCompleteData(runCompleteData)).toBe(true)
      expect(isRunCompleteData(testCompleteData)).toBe(false)
      expect(isRunCompleteData(testFailureData)).toBe(false)
    })
  })
})

describe('JsonLineFormatter', () => {
  let formatter: JsonLineFormatter

  beforeEach(() => {
    formatter = new JsonLineFormatter()
  })

  it('should initialize correctly', async () => {
    await formatter.initialize()

    expect(formatter.getState().initialized).toBe(true)
    expect(formatter.getJsonlStats().currentSequence).toBe(0)
    expect(formatter.getJsonlStats().totalLinesOutput).toBe(0)
  })

  it('should format test complete events as JSONL', async () => {
    await formatter.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    const output = formatter.formatEvent(event)

    expect(output).toMatch(/^\{.*\}\n$/)

    const parsed = JSON.parse(output.trim())
    expect(parsed.event).toBe('test-complete')
    expect(parsed.version).toBe('1.0.0')
    expect(parsed.sequence).toBe(1)
    expect(parsed.data.test).toBe('should work')
    expect(parsed.data.status).toBe('passed')
    expect(parsed.data.duration).toBe(100)
  })

  it('should format test failure events as JSONL', async () => {
    await formatter.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_FAILURE, {
      failure: createTestFailure(),
      progress: { completed: 1, total: 5 }
    } as TestFailureData)

    const output = formatter.formatEvent(event)

    const parsed = JSON.parse(output.trim())
    expect(parsed.event).toBe('test-failure')
    expect(parsed.data.test).toBe('should not fail')
    expect(parsed.data.status).toBe('failed')
    expect(parsed.data.error.message).toBe('Assertion failed')
    expect(parsed.data.error.type).toBe('AssertionError')
    expect(parsed.data.error.assertion).toEqual({
      expected: true,
      actual: false,
      operator: 'toBe'
    })
  })

  it('should format final output correctly', async () => {
    await formatter.initialize()

    const llmOutput = createLLMOutput()
    const output = formatter.formatFinal(llmOutput)

    const lines = output.trim().split('\n')
    expect(lines.length).toBe(2) // Summary + full output

    const summaryLine = JSON.parse(lines[0])
    expect(summaryLine.event).toBe('run-summary')
    expect(summaryLine.data.summary).toEqual(llmOutput.summary)
    expect(summaryLine.data.complete).toBe(true)

    const fullOutputLine = JSON.parse(lines[1])
    expect(fullOutputLine.event).toBe('full-output')
    expect(fullOutputLine.data).toEqual(llmOutput)
  })

  it('should handle compact vs non-compact output', async () => {
    const compactFormatter = new JsonLineFormatter({ compact: true })
    const verboseFormatter = new JsonLineFormatter({ compact: false })

    await compactFormatter.initialize()
    await verboseFormatter.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    const compactOutput = compactFormatter.formatEvent(event)
    const verboseOutput = verboseFormatter.formatEvent(event)

    expect(compactOutput.split('\n').length).toBe(2) // Single line + newline
    expect(verboseOutput.split('\n').length).toBeGreaterThan(2) // Multi-line JSON
  })

  it('should create minimal and verbose formatters', async () => {
    const minimal = JsonLineFormatter.createMinimal()
    const verbose = JsonLineFormatter.createVerbose()

    await minimal.initialize()
    await verbose.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    const minimalOutput = minimal.formatEvent(event)
    const verboseOutput = verbose.formatEvent(event)

    const minimalParsed = JSON.parse(minimalOutput.trim())
    const verboseParsed = JSON.parse(verboseOutput.trim())

    // Minimal should not include optional fields
    expect(minimalParsed.timestamp).toBeUndefined()
    expect(minimalParsed.sequence).toBeUndefined()
    expect(minimalParsed.meta).toBeUndefined()

    // Verbose should include all fields
    expect(verboseParsed.timestamp).toBeDefined()
    expect(verboseParsed.sequence).toBeDefined()
    expect(verboseParsed.meta).toBeDefined()
  })

  it('should parse JSONL strings correctly', () => {
    const jsonl = `{"event":"test-complete","data":{"test":"test1"}}\n{"event":"test-failure","data":{"test":"test2"}}\n`

    const events = JsonLineFormatter.parseJsonLines(jsonl)

    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('test-complete')
    expect(events[1].event).toBe('test-failure')
  })

  it('should throw error when not initialized', () => {
    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    expect(() => formatter.formatEvent(event)).toThrow('must be initialized')
    expect(() => formatter.formatFinal(createLLMOutput())).toThrow('must be initialized')
  })
})

describe('MarkdownStreamFormatter', () => {
  let formatter: MarkdownStreamFormatter

  beforeEach(() => {
    formatter = new MarkdownStreamFormatter()
  })

  it('should initialize correctly', async () => {
    await formatter.initialize()

    expect(formatter.getState().initialized).toBe(true)
    expect(formatter.getMarkdownStats().sectionsCreated).toBe(0)
  })

  it('should format test complete events as Markdown', async () => {
    await formatter.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    const output = formatter.formatEvent(event)

    expect(output).toContain('### ✅ Test Passed: `should work`')
    expect(output).toContain('**File:** `/path/to/test.js:10-15`')
    expect(output).toContain('**Duration:** 100ms')
    expect(output).toContain('**Suite:** MyComponent')
    expect(output).toContain('**Progress:**')
  })

  it('should format test failure events as Markdown', async () => {
    await formatter.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_FAILURE, {
      failure: createTestFailure(),
      progress: { completed: 1, total: 5 }
    } as TestFailureData)

    const output = formatter.formatEvent(event)

    expect(output).toContain('### ❌ Test Failed: `should not fail`')
    expect(output).toContain('**Error Type:** AssertionError')
    expect(output).toContain('**Error Message:**')
    expect(output).toContain('```\nAssertion failed\n```')
    expect(output).toContain('**Assertion Details:**')
    expect(output).toContain('**Expected:** `true`')
    expect(output).toContain('**Actual:** `false`')
    expect(output).toContain('**Stack Trace:**')
    expect(output).toContain('**Console Output:**')
  })

  it('should format final output as comprehensive Markdown report', async () => {
    await formatter.initialize()

    const llmOutput = createLLMOutput()
    const output = formatter.formatFinal(llmOutput)

    expect(output).toContain('# Test Results Summary')
    expect(output).toContain('## 📋 Overview')
    expect(output).toContain('| Metric | Value |')
    expect(output).toContain('| **Total Tests** | 10 |')
    expect(output).toContain('| **Success Rate** | 80% |')
    expect(output).toContain('## 📊 Progress')
    expect(output).toContain('## ❌ Failed Tests (1)')
    expect(output).toContain('## ✅ Passed Tests (2)')
    expect(output).toContain('## ⏭️ Skipped Tests (1)')
  })

  it('should handle run start events', async () => {
    await formatter.initialize()

    const event = createStreamingEvent(StreamingEventType.RUN_START, {
      totalTests: 10,
      startTime: Date.now()
    })

    const output = formatter.formatEvent(event)

    expect(output).toContain('# 🚀 Test Run Started')
    expect(output).toContain('**Total Tests:** 10')
  })

  it('should handle emoji configuration', async () => {
    const noEmojiFormatter = new MarkdownStreamFormatter({ useEmoji: false })
    await noEmojiFormatter.initialize()

    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    const output = noEmojiFormatter.formatEvent(event)

    expect(output).not.toContain('✅')
    expect(output).toContain('### Test Passed: `should work`')
  })

  it('should handle progress bar configuration', async () => {
    const noProgressFormatter = new MarkdownStreamFormatter({ showProgressBars: false })
    await noProgressFormatter.initialize()

    const llmOutput = createLLMOutput()
    const output = noProgressFormatter.formatFinal(llmOutput)

    expect(output).not.toContain('█')
    expect(output).not.toContain('░')
  })

  it('should handle collapsible sections', async () => {
    const collapsibleFormatter = new MarkdownStreamFormatter({ useCollapsible: true })
    await collapsibleFormatter.initialize()

    const llmOutput = createLLMOutput({
      failures: Array(5)
        .fill(0)
        .map((_, i) => createTestFailure({ test: `test ${i}` }))
    })

    const output = collapsibleFormatter.formatFinal(llmOutput)

    expect(output).toContain('<details>')
    expect(output).toContain('<summary>Click to expand failed tests</summary>')
    expect(output).toContain('</details>')
  })

  it('should create GitHub and minimal formatters', () => {
    const github = MarkdownStreamFormatter.createGitHub()
    const minimal = MarkdownStreamFormatter.createMinimal()

    expect(github.getMarkdownStats().useEmoji).toBe(true)
    expect(github.getMarkdownStats().showProgressBars).toBe(false) // GitHub optimized

    expect(minimal.getMarkdownStats().useEmoji).toBe(false)
    expect(minimal.getMarkdownStats().showProgressBars).toBe(false)
  })

  it('should limit error output lines', async () => {
    const shortFormatter = new MarkdownStreamFormatter({ maxErrorLines: 2 })
    await shortFormatter.initialize()

    const failure = createTestFailure({
      error: {
        ...createTestFailure().error,
        stack: Array(10)
          .fill(0)
          .map((_, i) => `Line ${i}`)
          .join('\n')
      }
    })

    const event = createStreamingEvent(StreamingEventType.TEST_FAILURE, {
      failure,
      progress: { completed: 1, total: 5 }
    } as TestFailureData)

    const output = shortFormatter.formatEvent(event)

    expect(output).toContain('... (8 more lines)')
  })

  it('should throttle progress updates', async () => {
    await formatter.initialize()

    // Mock Date.now to control timing
    const _originalNow = Date.now
    let currentTime = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime)

    try {
      const progressEvent1 = createStreamingEvent(StreamingEventType.PROGRESS, {
        completed: 1,
        total: 10,
        passed: 1,
        failed: 0,
        skipped: 0
      })

      const progressEvent2 = createStreamingEvent(StreamingEventType.PROGRESS, {
        completed: 2,
        total: 10,
        passed: 2,
        failed: 0,
        skipped: 0
      })

      const output1 = formatter.formatEvent(progressEvent1)
      expect(output1).toContain('Progress Update')

      // Second event immediately (within 1 second) should be throttled
      currentTime += 500
      const output2 = formatter.formatEvent(progressEvent2)
      expect(output2).toBe('')

      // Third event after delay should not be throttled
      currentTime += 600
      const output3 = formatter.formatEvent(progressEvent2)
      expect(output3).toContain('Progress Update')
    } finally {
      vi.mocked(Date.now).mockRestore()
    }
  })

  it('should throw error when not initialized', () => {
    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    expect(() => formatter.formatEvent(event)).toThrow('must be initialized')
    expect(() => formatter.formatFinal(createLLMOutput())).toThrow('must be initialized')
  })
})

describe('Integration Tests', () => {
  it('should work with both formatters handling the same events', async () => {
    const jsonFormatter = new JsonLineFormatter()
    const markdownFormatter = new MarkdownStreamFormatter()

    await jsonFormatter.initialize()
    await markdownFormatter.initialize()

    const events = [
      createStreamingEvent(StreamingEventType.RUN_START, {
        totalTests: 3,
        startTime: Date.now()
      }),
      createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
        result: createTestResult(),
        progress: { completed: 1, total: 3 }
      } as TestCompleteData),
      createStreamingEvent(StreamingEventType.TEST_FAILURE, {
        failure: createTestFailure(),
        progress: { completed: 2, total: 3 }
      } as TestFailureData),
      createStreamingEvent(StreamingEventType.RUN_COMPLETE, {
        summary: createLLMOutput().summary,
        finalOutput: createLLMOutput()
      } as RunCompleteData)
    ]

    const jsonOutputs: string[] = []
    const markdownOutputs: string[] = []

    for (const event of events) {
      jsonOutputs.push(jsonFormatter.formatEvent(event))
      markdownOutputs.push(markdownFormatter.formatEvent(event))
    }

    // Verify both formatters processed all events
    expect(jsonFormatter.getState().eventsProcessed).toBe(4)
    expect(markdownFormatter.getState().eventsProcessed).toBe(4)

    // Verify JSON outputs are valid
    jsonOutputs.forEach((output) => {
      if (output.trim()) {
        expect(() => JSON.parse(output.trim())).not.toThrow()
      }
    })

    // Verify Markdown outputs contain expected patterns
    const allMarkdown = markdownOutputs.join('')
    expect(allMarkdown).toContain('Test Run Started')
    expect(allMarkdown).toContain('Test Passed:')
    expect(allMarkdown).toContain('Test Failed:')
    expect(allMarkdown).toContain('Test Run Complete')

    // Test final formatting
    const llmOutput = createLLMOutput()
    const jsonFinal = jsonFormatter.formatFinal(llmOutput)
    const markdownFinal = markdownFormatter.formatFinal(llmOutput)

    expect(jsonFinal).toContain('"event":"run-summary"')
    expect(markdownFinal).toContain('# Test Results Summary')
  })

  it('should maintain consistent state across different formatters', async () => {
    const formatters = [new JsonLineFormatter(), new MarkdownStreamFormatter(), new MockFormatter()]

    for (const formatter of formatters) {
      await formatter.initialize()
    }

    const event = createStreamingEvent(StreamingEventType.TEST_COMPLETE, {
      result: createTestResult(),
      progress: { completed: 1, total: 5 }
    } as TestCompleteData)

    for (const formatter of formatters) {
      void formatter.formatEvent(event)
    }

    // All formatters should have consistent state
    formatters.forEach((formatter) => {
      const state = formatter.getState()
      expect(state.eventsProcessed).toBe(1)
      expect(state.testsProcessed).toBe(1)
      expect(state.counts.passed).toBe(1)
      expect(state.counts.failed).toBe(0)
      expect(state.counts.skipped).toBe(0)
    })
  })
})
