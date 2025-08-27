import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Vitest, SerializedError } from 'vitest'

// Import the non-existent LLMReporter class (will fail initially - TDD)
import { LLMReporter } from './reporter.js'
import {
  createMockTestCase,
  createMockTestModule,
  createMockTestSpecification
} from '../test-utils/mock-data.js'

describe('LLMReporter', () => {
  let reporter: LLMReporter
  let mockVitest: Partial<Vitest>

  beforeEach(() => {
    reporter = new LLMReporter()
    mockVitest = {
      config: {
        root: '/test-project'
      } as any,
      state: {
        getFiles: vi.fn(() => [])
      } as any
    }
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(reporter).toBeDefined()
      expect(reporter.getConfig()).toMatchObject({
        verbose: false,
        outputFile: undefined,
        includePassedTests: false,
        includeSkippedTests: false,
        captureConsoleOnFailure: true,
        maxConsoleBytes: 50_000,
        maxConsoleLines: 100,
        includeDebugOutput: false,
        tokenCountingEnabled: false,
        maxTokens: undefined,
        enableStreaming: false
      })
    })

    it('should accept custom configuration', () => {
      const customReporter = new LLMReporter({
        verbose: true,
        outputFile: 'test-results.json'
      })
      expect(customReporter.getConfig()).toMatchObject({
        verbose: true,
        outputFile: 'test-results.json'
      })
    })

    it('should accept new configuration properties with proper defaults', () => {
      const customReporter = new LLMReporter({
        tokenCountingEnabled: true,
        maxTokens: 4000
      })
      expect(customReporter.getConfig()).toMatchObject({
        tokenCountingEnabled: true,
        maxTokens: 4000
      })
    })

    it('should call onInit with Vitest context', () => {
      reporter.onInit(mockVitest as Vitest)
      expect(reporter.getContext()).toBe(mockVitest)
    })
  })

  describe('Reporter Lifecycle Hooks', () => {
    describe('onTestRunStart', () => {
      it('should initialize test run with specifications', () => {
        const specifications = [
          createMockTestSpecification('/test/file1.ts'),
          createMockTestSpecification('/test/file2.ts')
        ]

        reporter.onTestRunStart(specifications)

        const state = reporter.getState()
        expect(state.startTime).toBeDefined()
        expect(state.specifications).toHaveLength(2)
      })

      it('should handle empty specifications', () => {
        reporter.onTestRunStart([])

        const state = reporter.getState()
        expect(state.specifications).toHaveLength(0)
      })
    })

    describe('onTestModuleQueued', () => {
      it('should track queued modules', () => {
        const module1 = createMockTestModule('/test/file1.ts')
        const module2 = createMockTestModule('/test/file2.ts')

        reporter.onTestModuleQueued(module1)
        reporter.onTestModuleQueued(module2)

        const state = reporter.getState()
        expect(state.queuedModules).toHaveLength(2)
        expect(state.queuedModules).toContain('/test/file1.ts')
      })
    })

    describe('onTestModuleCollected', () => {
      it('should collect test information from modules', () => {
        const tests = [
          createMockTestCase({ name: 'test1' }),
          createMockTestCase({ name: 'test2', state: 'skip' }),
          createMockTestCase({ name: 'test3' })
        ]
        const module = createMockTestModule('/test/file.ts', tests)

        reporter.onTestModuleCollected(module)

        const state = reporter.getState()
        expect(state.collectedTests).toHaveLength(3)
        expect(state.collectedTests.filter((t: any) => t.mode === 'skip')).toHaveLength(1)
      })

      it('should handle nested test suites', () => {
        const nestedTests = [
          {
            ...createMockTestCase({ name: 'suite1.test1' }),
            suite: ['suite1']
          },
          {
            ...createMockTestCase({ name: 'suite1.suite2.test1' }),
            suite: ['suite1', 'suite2']
          }
        ]
        const module = createMockTestModule('/test/nested.ts', nestedTests)

        reporter.onTestModuleCollected(module)

        const state = reporter.getState()
        expect(state.collectedTests).toHaveLength(2)
        expect(state.collectedTests[0].suite).toEqual(['suite1'])
        expect(state.collectedTests[1].suite).toEqual(['suite1', 'suite2'])
      })
    })

    describe('onTestModuleStart', () => {
      it('should track module execution start', () => {
        const module = createMockTestModule('/test/file.ts')

        reporter.onTestModuleStart(module)

        const state = reporter.getState()
        expect(state.runningModules).toContain('/test/file.ts')
        expect(state.moduleTimings.get('/test/file.ts')).toBeDefined()
      })
    })

    describe('onTestModuleEnd', () => {
      it('should track module execution completion', () => {
        const module = createMockTestModule('/test/file.ts')

        reporter.onTestModuleStart(module)
        reporter.onTestModuleEnd(module)

        const state = reporter.getState()
        expect(state.runningModules).not.toContain('/test/file.ts')
        expect(state.completedModules).toContain('/test/file.ts')
      })

      it('should calculate module duration', async () => {
        const module = createMockTestModule('/test/file.ts')

        reporter.onTestModuleStart(module)
        await new Promise((resolve) => setTimeout(resolve, 10))
        reporter.onTestModuleEnd(module)

        const state = reporter.getState()
        const timing = state.moduleTimings.get('/test/file.ts')
        expect(timing?.duration).toBeGreaterThan(0)
      })
    })

    describe('onTestCaseReady', () => {
      it('should track test case preparation', () => {
        const testCase = createMockTestCase({ name: 'test1' })

        reporter.onTestCaseReady(testCase)

        const state = reporter.getState()
        expect(state.readyTests).toContain('test-test1')
      })
    })

    describe('onTestCaseResult', () => {
      it('should track passed test results', () => {
        const testCase = createMockTestCase({ name: 'test1', state: 'pass' })

        reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.passed).toHaveLength(1)
        expect(state.testResults.passed[0].test).toBe('test1')
      })

      it('should track failed test results with error context', () => {
        const error = new Error('Assertion failed')
        error.stack = 'Error: Assertion failed\n    at /test/file.ts:12:5'
        const testCase = createMockTestCase({ name: 'test1', state: 'fail', error })

        reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.failed).toHaveLength(1)
        expect(state.testResults.failed[0].test).toBe('test1')
        expect(state.testResults.failed[0].error.message).toBe('Assertion failed')
      })

      it('should track skipped test results', () => {
        const testCase = createMockTestCase({ name: 'test1', state: 'skip' })

        reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.skipped).toHaveLength(1)
        expect(state.testResults.skipped[0].test).toBe('test1')
      })

      it('should extract error context with code lines', () => {
        const error = new Error('expect(received).toBe(expected)')
        error.stack = `
          AssertionError: expect(received).toBe(expected)
          Expected: 5
          Received: 3
              at /test/file.ts:12:5
        `
        const testCase = {
          ...createMockTestCase({ name: 'test1', state: 'fail', error }),
          result: {
            state: 'failed',
            error: {
              message: error.message,
              stack: error.stack,
              expected: 5,
              actual: 3
            }
          }
        }

        reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        const failure = state.testResults.failed[0]
        expect(failure.error.context?.expected).toBe(5)
        expect(failure.error.context?.actual).toBe(3)
        expect(failure.error.context?.lineNumber).toBe(12)
      })
    })

    describe('onTestRunEnd', () => {
      it('should generate final JSON output', async () => {
        // Setup test run
        reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])

        // Add test results
        reporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'pass' }))
        reporter.onTestCaseResult(
          createMockTestCase({ name: 'test2', state: 'fail', error: new Error('Failed') })
        )
        reporter.onTestCaseResult(createMockTestCase({ name: 'test3', state: 'skip' }))

        // End test run
        const modules = [createMockTestModule('/test/file.ts')]
        await reporter.onTestRunEnd(modules, [], 'passed')

        const output = reporter.getOutput()
        expect(output).toBeDefined()
        expect(output!.summary.total).toBe(3)
        expect(output!.summary.passed).toBe(1)
        expect(output!.summary.failed).toBe(1)
        expect(output!.summary.skipped).toBe(1)
      })

      it('should handle unhandled errors', async () => {
        const unhandledError: SerializedError = {
          message: 'Unhandled rejection',
          stack: 'Error: Unhandled rejection\n    at process'
        }

        reporter.onTestRunStart([])
        await reporter.onTestRunEnd([], [unhandledError], 'failed')

        const output = reporter.getOutput()
        expect(output!.failures).toHaveLength(1)
        expect(output!.failures?.[0].error.message).toContain('Unhandled rejection')
      })

      it('should include timestamp in output', async () => {
        reporter.onTestRunStart([])
        await reporter.onTestRunEnd([], [], 'passed')

        const output = reporter.getOutput()
        expect(output!.summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })
    })
  })

  describe('Output Structure Tests', () => {
    beforeEach(() => {
      reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])
    })

    it('should generate valid JSON output matching LLMReporterOutput schema', async () => {
      reporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'pass' }))
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()

      // Validate output structure
      expect(output).toHaveProperty('summary')
      expect(output!.summary).toHaveProperty('total')
      expect(output!.summary).toHaveProperty('passed')
      expect(output!.summary).toHaveProperty('failed')
      expect(output!.summary).toHaveProperty('skipped')
      expect(output!.summary).toHaveProperty('duration')
      expect(output!.summary).toHaveProperty('timestamp')
    })

    it('should calculate accurate summary statistics', async () => {
      // Add various test results
      for (let i = 0; i < 5; i++) {
        reporter.onTestCaseResult(createMockTestCase({ name: `pass${i}`, state: 'pass' }))
      }
      for (let i = 0; i < 3; i++) {
        reporter.onTestCaseResult(
          createMockTestCase({ name: `fail${i}`, state: 'fail', error: new Error('Failed') })
        )
      }
      for (let i = 0; i < 2; i++) {
        reporter.onTestCaseResult(createMockTestCase({ name: `skip${i}`, state: 'skip' }))
      }

      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(10)
      expect(output!.summary.passed).toBe(5)
      expect(output!.summary.failed).toBe(3)
      expect(output!.summary.skipped).toBe(2)
    })

    it('should include failure context for failed tests', async () => {
      const error = new Error('Expected true to be false')
      error.stack = 'Error: Expected true to be false\n    at /test/file.ts:25:10'

      const failedTest = {
        ...createMockTestCase({ name: 'failing-test', state: 'fail', error }),
        location: { start: { line: 20 }, end: { line: 30 } }
      }

      reporter.onTestCaseResult(failedTest)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures).toHaveLength(1)

      const failure = output!.failures![0]
      expect(failure.test).toBe('failing-test')
      expect(failure.fileRelative).toBe('/test/file.ts')
      expect(failure.startLine).toBe(20)
      expect(failure.endLine).toBe(30)
      expect(failure.error.message).toBe('Expected true to be false')
      expect(failure.error.type).toBe('Error')
      expect(failure.error.stack).toContain('/test/file.ts:25:10')
    })

    it('should include passed tests in verbose mode', async () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])

      verboseReporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'pass' }))
      verboseReporter.onTestCaseResult(createMockTestCase({ name: 'test2', state: 'pass' }))
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.passed).toHaveLength(2)
      expect(output!.passed![0].status).toBe('passed')
      expect(output!.passed![0].test).toBe('test1')
    })

    it('should include skipped tests in verbose mode', async () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])

      verboseReporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'skip' }))
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.skipped).toHaveLength(1)
      expect(output!.skipped![0].status).toBe('skipped')
    })

    it('should maintain nested suite hierarchy', async () => {
      const nestedTest = {
        ...createMockTestCase({ name: 'nested-test', state: 'fail', error: new Error('Failed') }),
        suite: ['Parent Suite', 'Child Suite']
      }

      reporter.onTestCaseResult(nestedTest)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures![0].suite).toEqual(['Parent Suite', 'Child Suite'])
    })

    it('should capture file paths and line numbers', async () => {
      const testWithLocation = {
        ...createMockTestCase({ name: 'located-test', state: 'pass' }),
        file: { filepath: '/src/components/Button.test.ts' },
        location: { start: { line: 42 }, end: { line: 47 } }
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])
      verboseReporter.onTestCaseResult(testWithLocation)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      const passedTest = output!.passed![0]
      expect(passedTest.fileRelative).toBe('/src/components/Button.test.ts')
      expect(passedTest.startLine).toBe(42)
      expect(passedTest.endLine).toBe(47)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty test suite', async () => {
      reporter.onTestRunStart([])
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(0)
      expect(output!.summary.passed).toBe(0)
      expect(output!.summary.failed).toBe(0)
      expect(output!.summary.skipped).toBe(0)
      expect(output!.failures).toBeUndefined()
    })

    it('should handle only failing tests', async () => {
      for (let i = 0; i < 5; i++) {
        reporter.onTestCaseResult(
          createMockTestCase({ name: `fail${i}`, state: 'fail', error: new Error(`Error ${i}`) })
        )
      }

      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(5)
      expect(output!.summary.passed).toBe(0)
      expect(output!.summary.failed).toBe(5)
      expect(output!.failures).toHaveLength(5)
    })

    it('should handle tests with async errors', async () => {
      const asyncError = new Error('Promise rejected')
      asyncError.stack = `
        Error: Promise rejected
            at async /test/async.ts:15:5
            at async Promise.all
      `

      const asyncTest = createMockTestCase({ name: 'async-test', state: 'fail', error: asyncError })
      reporter.onTestCaseResult(asyncTest)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures![0].error.message).toBe('Promise rejected')
      expect(output!.failures![0].error.stack).toContain('async')
    })

    it('should handle tests with multiple assertions', async () => {
      const multipleAssertionError = new Error(
        'Multiple assertions failed:\n1. Expected A\n2. Expected B'
      )
      const testCase = createMockTestCase({
        name: 'multi-assert',
        state: 'fail',
        error: multipleAssertionError
      })

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures![0].error.message).toContain('Multiple assertions failed')
    })

    it('should identify long-running tests', async () => {
      const longTest = {
        ...createMockTestCase({ name: 'long-test', state: 'pass' }),
        result: {
          state: 'passed',
          duration: 5000 // 5 seconds
        }
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])
      verboseReporter.onTestCaseResult(longTest)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.passed![0].duration).toBe(5000)
    })

    it('should handle concurrent test execution', async () => {
      const concurrentTests = Array.from({ length: 10 }, (_, i) =>
        createMockTestCase({
          name: `concurrent-${i}`,
          state: i % 3 === 0 ? 'fail' : 'pass',
          error: i % 3 === 0 ? new Error('Failed') : undefined
        })
      )

      // Simulate concurrent test results
      concurrentTests.forEach((test) => reporter.onTestCaseResult(test))

      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(10)
      expect(output!.summary.failed).toBe(4) // 0, 3, 6, 9
      expect(output!.summary.passed).toBe(6)
    })

    it('should handle malformed test data gracefully', async () => {
      const malformedTest = {
        id: 'malformed',
        name: null, // Invalid name
        fileRelative: undefined, // Missing file
        result: { state: 'unknown' } // Unknown state
      }

      reporter.onTestCaseResult(malformedTest as any)
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      // Should not crash and should handle gracefully
      expect(output).toBeDefined()
      expect(output!.summary).toBeDefined()
    })

    it('should handle test run interruption', async () => {
      reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])
      reporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'pass' }))

      // Simulate interruption
      await reporter.onTestRunEnd([], [], 'interrupted')

      const output = reporter.getOutput()
      expect(output).toBeDefined()
      expect(output!.summary.total).toBeGreaterThanOrEqual(1)
    })

    it('should handle tests with no location information', async () => {
      const testNoLocation = {
        ...createMockTestCase({ name: 'no-location', state: 'pass' }),
        location: undefined
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])
      verboseReporter.onTestCaseResult(testNoLocation)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.passed![0].startLine).toBe(0)
      expect(output!.passed![0].endLine).toBe(0)
    })
  })

  describe('Configuration Options', () => {
    it('should respect outputFile configuration', () => {
      const reporter = new LLMReporter({ outputFile: 'custom-output.json' })
      expect(reporter.getConfig().outputFile).toBe('custom-output.json')
    })

    it('should respect includePassedTests configuration', async () => {
      const reporter = new LLMReporter({ includePassedTests: true })
      reporter.onTestRunStart([])
      reporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'pass' }))
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output!.passed).toBeDefined()
      expect(output!.passed).toHaveLength(1)
    })

    it('should respect includeSkippedTests configuration', async () => {
      const reporter = new LLMReporter({ includeSkippedTests: true })
      reporter.onTestRunStart([])
      reporter.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'skip' }))
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output!.skipped).toBeDefined()
      expect(output!.skipped).toHaveLength(1)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate maxTokens is positive', () => {
      expect(() => new LLMReporter({ maxTokens: -1 })).toThrow(
        'maxTokens must be a positive number'
      )
    })

    // tokenCountingModel removed; no validation needed

    it('should allow valid maxTokens values', () => {
      expect(() => new LLMReporter({ maxTokens: 0 })).not.toThrow()
      expect(() => new LLMReporter({ maxTokens: 4000 })).not.toThrow()
      expect(() => new LLMReporter({ maxTokens: undefined })).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in lifecycle hooks gracefully', () => {
      const reporter = new LLMReporter()

      // Create a test case with invalid data that might cause processing issues
      const invalidTestCase = {
        id: 'test-1',
        name: null, // Invalid name
        result: {
          state: 'invalid-state' // Invalid state
        }
      }

      // Should not throw when processing invalid test case
      expect(() => reporter.onTestCaseResult(invalidTestCase as any)).not.toThrow()
    })

    it('should handle missing test data', async () => {
      const incompleteTest = {} as any

      reporter.onTestCaseResult(incompleteTest)
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output).toBeDefined()
    })

    it('should handle circular references in error objects', async () => {
      const circularError: any = new Error('Circular reference')
      circularError.self = circularError // Create circular reference

      const testWithCircular = createMockTestCase({
        name: 'circular',
        state: 'fail',
        error: circularError
      })
      reporter.onTestCaseResult(testWithCircular)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures).toHaveLength(1)
      // Should serialize without throwing
      expect(() => JSON.stringify(output)).not.toThrow()
    })
  })

  describe('Output File Writing', () => {
    it('should write output to file when configured', async () => {
      const reporterWithFile = new LLMReporter({ outputFile: 'test-output.json' })
      const writeFileSpy = vi.spyOn((reporterWithFile as any).outputWriter, 'write')

      reporterWithFile.onTestRunStart([])
      reporterWithFile.onTestCaseResult(createMockTestCase({ name: 'test1', state: 'pass' }))
      await reporterWithFile.onTestRunEnd([], [], 'passed')

      expect(writeFileSpy).toHaveBeenCalled()
    })

    it('should not write file when not configured', async () => {
      const writeFileSpy = vi.spyOn((reporter as any).outputWriter, 'write')

      reporter.onTestRunStart([])
      await reporter.onTestRunEnd([], [], 'passed')

      expect(writeFileSpy).not.toHaveBeenCalled()
    })
  })

  describe('Watch Mode Handling', () => {
    it('should reset state when starting a new run while one is active', async () => {
      // Create reporter with includePassedTests to verify reset behavior
      const watchReporter = new LLMReporter({ includePassedTests: true })

      const spec1 = createMockTestSpecification('test1.spec.ts')
      const spec2 = createMockTestSpecification('test2.spec.ts')
      const module1 = createMockTestModule('test1.spec.ts')
      const module2 = createMockTestModule('test2.spec.ts')
      const test1 = createMockTestCase({ name: 'test 1', state: 'pass' })
      const test2 = createMockTestCase({ name: 'test 2', state: 'pass' })

      // First test run
      watchReporter.onTestRunStart([spec1])
      watchReporter.onTestModuleStart(module1)
      watchReporter.onTestCaseResult(test1)
      watchReporter.onTestModuleEnd(module1)

      // Start second run without ending the first (simulates watch mode)
      watchReporter.onTestRunStart([spec2])
      watchReporter.onTestModuleStart(module2)
      watchReporter.onTestCaseResult(test2)
      watchReporter.onTestModuleEnd(module2)
      await watchReporter.onTestRunEnd([module2], [], 'passed')

      const output = watchReporter.getOutput()
      expect(output).toBeDefined()
      // Should only have results from the second run
      expect(output?.summary.total).toBe(1)
      expect(output?.passed).toHaveLength(1)
      expect(output?.passed?.[0].test).toBe('test 2')
    })

    it('should handle multiple consecutive test runs on same reporter instance', async () => {
      // Create reporter with includePassedTests to verify output
      const watchReporter = new LLMReporter({ includePassedTests: true })

      const spec = createMockTestSpecification('test.spec.ts')
      const module = createMockTestModule('test.spec.ts')
      const failedTest1 = createMockTestCase({
        name: 'first run test',
        state: 'fail',
        error: new Error('First run error')
      })
      const passedTest2 = createMockTestCase({
        name: 'second run test',
        state: 'pass'
      })

      // First complete test run
      watchReporter.onTestRunStart([spec])
      watchReporter.onTestModuleStart(module)
      watchReporter.onTestCaseResult(failedTest1)
      watchReporter.onTestModuleEnd(module)
      await watchReporter.onTestRunEnd([module], [], 'failed')

      const firstOutput = watchReporter.getOutput()
      expect(firstOutput?.summary.failed).toBe(1)
      expect(firstOutput?.summary.passed).toBe(0)
      expect(firstOutput?.failures).toHaveLength(1)

      // Second complete test run (should reset state)
      watchReporter.onTestRunStart([spec])
      watchReporter.onTestModuleStart(module)
      watchReporter.onTestCaseResult(passedTest2)
      watchReporter.onTestModuleEnd(module)
      await watchReporter.onTestRunEnd([module], [], 'passed')

      const secondOutput = watchReporter.getOutput()
      expect(secondOutput?.summary.failed).toBe(0)
      expect(secondOutput?.summary.passed).toBe(1)
      expect(secondOutput?.failures).toBeUndefined()
      expect(secondOutput?.passed).toHaveLength(1)
      expect(secondOutput?.passed?.[0].test).toBe('second run test')
    })

    it('should properly cleanup resources between test runs', async () => {
      const watchReporter = new LLMReporter()

      const spec = createMockTestSpecification('test.spec.ts')
      const module = createMockTestModule('test.spec.ts')

      // Set up spies after creating the reporter to avoid counting initialization calls
      const resetSpy = vi.spyOn((watchReporter as any).orchestrator, 'reset')
      const stateResetSpy = vi.spyOn((watchReporter as any).stateManager, 'reset')

      // Clear any initialization calls
      resetSpy.mockClear()
      stateResetSpy.mockClear()

      // First run
      watchReporter.onTestRunStart([spec])
      expect(resetSpy).toHaveBeenCalledTimes(0) // Not called on first start
      expect(stateResetSpy).toHaveBeenCalledTimes(0)

      await watchReporter.onTestRunEnd([module], [], 'passed')

      expect(resetSpy).toHaveBeenCalledTimes(1) // Called once in cleanup
      expect(stateResetSpy).toHaveBeenCalledTimes(1) // Also called via orchestrator.reset()

      // Second run - isTestRunActive is false after cleanup, so no reset
      watchReporter.onTestRunStart([spec])
      expect(resetSpy).toHaveBeenCalledTimes(1) // Still 1, no reset because isTestRunActive was false
      expect(stateResetSpy).toHaveBeenCalledTimes(1) // Still 1

      // Start third run without ending second - this triggers reset
      watchReporter.onTestRunStart([spec])
      expect(resetSpy).toHaveBeenCalledTimes(2) // Called in reset()
      expect(stateResetSpy).toHaveBeenCalledTimes(3) // Called twice: once directly in reset(), once via orchestrator.reset()

      await watchReporter.onTestRunEnd([module], [], 'passed')

      // Cleanup is always called in finally block
      expect(resetSpy).toHaveBeenCalledTimes(3) // Once more in cleanup
      expect(stateResetSpy).toHaveBeenCalledTimes(4) // Also called via orchestrator.reset()
    })

    it('should maintain isTestRunActive flag correctly', async () => {
      const spec = createMockTestSpecification('test.spec.ts')
      const module = createMockTestModule('test.spec.ts')

      // Initially should be false
      expect((reporter as any).isTestRunActive).toBe(false)

      // Should be true after starting
      reporter.onTestRunStart([spec])
      expect((reporter as any).isTestRunActive).toBe(true)

      // Should be false after ending
      await reporter.onTestRunEnd([module], [], 'passed')
      expect((reporter as any).isTestRunActive).toBe(false)

      // Should handle consecutive runs
      reporter.onTestRunStart([spec])
      expect((reporter as any).isTestRunActive).toBe(true)
      reporter.onTestRunStart([spec]) // Start again without ending
      expect((reporter as any).isTestRunActive).toBe(true)
      await reporter.onTestRunEnd([module], [], 'passed')
      expect((reporter as any).isTestRunActive).toBe(false)
    })

    it('should clear previous output when resetting', async () => {
      const spec = createMockTestSpecification('test.spec.ts')
      const module = createMockTestModule('test.spec.ts')
      const test = createMockTestCase({ name: 'test', state: 'pass' })

      // First run
      reporter.onTestRunStart([spec])
      reporter.onTestCaseResult(test)
      await reporter.onTestRunEnd([module], [], 'passed')

      const firstOutput = reporter.getOutput()
      expect(firstOutput).toBeDefined()

      // Start second run (triggers reset)
      reporter.onTestRunStart([spec])

      // Output should be cleared after reset but before new run ends
      // Note: getOutput returns the last built output, which is still from first run
      // until onTestRunEnd is called again

      await reporter.onTestRunEnd([module], [], 'passed')
      const secondOutput = reporter.getOutput()
      expect(secondOutput).toBeDefined()

      // Verify they are different instances
      expect(secondOutput).not.toBe(firstOutput)
    })
  })
})
