import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Vitest, SerializedError } from 'vitest'

// Import the non-existent LLMReporter class (will fail initially - TDD)
import { LLMReporter } from './reporter'
import {
  createMockTestCase,
  createMockTestModule,
  createMockTestSpecification
} from '../test-utils/mock-data'

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
      expect(reporter.getConfig()).toEqual({
        verbose: false,
        outputFile: undefined,
        includePassedTests: false,
        includeSkippedTests: false
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
          createMockTestCase('test1'),
          createMockTestCase('test2', 'skipped'),
          createMockTestCase('test3')
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
            ...createMockTestCase('suite1.test1'),
            suite: ['suite1']
          },
          {
            ...createMockTestCase('suite1.suite2.test1'),
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
        const testCase = createMockTestCase('test1')

        reporter.onTestCaseReady(testCase)

        const state = reporter.getState()
        expect(state.readyTests).toContain('test-test1')
      })
    })

    describe('onTestCaseResult', () => {
      it('should track passed test results', () => {
        const testCase = createMockTestCase('test1', 'passed')

        reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.passed).toHaveLength(1)
        expect(state.testResults.passed[0].test).toBe('test1')
      })

      it('should track failed test results with error context', () => {
        const error = new Error('Assertion failed')
        error.stack = 'Error: Assertion failed\n    at /test/file.ts:12:5'
        const testCase = createMockTestCase('test1', 'failed', error)

        reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.failed).toHaveLength(1)
        expect(state.testResults.failed[0].test).toBe('test1')
        expect(state.testResults.failed[0].error.message).toBe('Assertion failed')
      })

      it('should track skipped test results', () => {
        const testCase = createMockTestCase('test1', 'skipped')

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
          ...createMockTestCase('test1', 'failed', error),
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
      it('should generate final JSON output', () => {
        // Setup test run
        reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])

        // Add test results
        reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
        reporter.onTestCaseResult(createMockTestCase('test2', 'failed', new Error('Failed')))
        reporter.onTestCaseResult(createMockTestCase('test3', 'skipped'))

        // End test run
        const modules = [createMockTestModule('/test/file.ts')]
        reporter.onTestRunEnd(modules, [], 'passed')

        const output = reporter.getOutput()
        expect(output).toBeDefined()
        expect(output!.summary.total).toBe(3)
        expect(output!.summary.passed).toBe(1)
        expect(output!.summary.failed).toBe(1)
        expect(output!.summary.skipped).toBe(1)
      })

      it('should handle unhandled errors', () => {
        const unhandledError: SerializedError = {
          message: 'Unhandled rejection',
          stack: 'Error: Unhandled rejection\n    at process'
        }

        reporter.onTestRunStart([])
        reporter.onTestRunEnd([], [unhandledError], 'failed')

        const output = reporter.getOutput()
        expect(output!.failures).toHaveLength(1)
        expect(output!.failures?.[0].error.message).toContain('Unhandled rejection')
      })

      it('should include timestamp in output', () => {
        reporter.onTestRunStart([])
        reporter.onTestRunEnd([], [], 'passed')

        const output = reporter.getOutput()
        expect(output!.summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })
    })
  })

  describe('Output Structure Tests', () => {
    beforeEach(() => {
      reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])
    })

    it('should generate valid JSON output matching LLMReporterOutput schema', () => {
      reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      reporter.onTestRunEnd([], [], 'passed')

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

    it('should calculate accurate summary statistics', () => {
      // Add various test results
      for (let i = 0; i < 5; i++) {
        reporter.onTestCaseResult(createMockTestCase(`pass${i}`, 'passed'))
      }
      for (let i = 0; i < 3; i++) {
        reporter.onTestCaseResult(createMockTestCase(`fail${i}`, 'failed', new Error('Failed')))
      }
      for (let i = 0; i < 2; i++) {
        reporter.onTestCaseResult(createMockTestCase(`skip${i}`, 'skipped'))
      }

      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(10)
      expect(output!.summary.passed).toBe(5)
      expect(output!.summary.failed).toBe(3)
      expect(output!.summary.skipped).toBe(2)
    })

    it('should include failure context for failed tests', () => {
      const error = new Error('Expected true to be false')
      error.stack = 'Error: Expected true to be false\n    at /test/file.ts:25:10'

      const failedTest = {
        ...createMockTestCase('failing-test', 'failed', error),
        location: { start: { line: 20 }, end: { line: 30 } }
      }

      reporter.onTestCaseResult(failedTest)
      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures).toHaveLength(1)

      const failure = output!.failures![0]
      expect(failure.test).toBe('failing-test')
      expect(failure.file).toBe('/test/file.ts')
      expect(failure.startLine).toBe(20)
      expect(failure.endLine).toBe(30)
      expect(failure.error.message).toBe('Expected true to be false')
      expect(failure.error.type).toBe('Error')
      expect(failure.error.stack).toContain('/test/file.ts:25:10')
    })

    it('should include passed tests in verbose mode', () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])

      verboseReporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      verboseReporter.onTestCaseResult(createMockTestCase('test2', 'passed'))
      verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.passed).toHaveLength(2)
      expect(output!.passed![0].status).toBe('passed')
      expect(output!.passed![0].test).toBe('test1')
    })

    it('should include skipped tests in verbose mode', () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])

      verboseReporter.onTestCaseResult(createMockTestCase('test1', 'skipped'))
      verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.skipped).toHaveLength(1)
      expect(output!.skipped![0].status).toBe('skipped')
    })

    it('should maintain nested suite hierarchy', () => {
      const nestedTest = {
        ...createMockTestCase('nested-test', 'failed', new Error('Failed')),
        suite: ['Parent Suite', 'Child Suite']
      }

      reporter.onTestCaseResult(nestedTest)
      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures![0].suite).toEqual(['Parent Suite', 'Child Suite'])
    })

    it('should capture file paths and line numbers', () => {
      const testWithLocation = {
        ...createMockTestCase('located-test', 'passed'),
        file: { filepath: '/src/components/Button.test.ts' },
        location: { start: { line: 42 }, end: { line: 47 } }
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])
      verboseReporter.onTestCaseResult(testWithLocation)
      verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      const passedTest = output!.passed![0]
      expect(passedTest.file).toBe('/src/components/Button.test.ts')
      expect(passedTest.startLine).toBe(42)
      expect(passedTest.endLine).toBe(47)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty test suite', () => {
      reporter.onTestRunStart([])
      reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(0)
      expect(output!.summary.passed).toBe(0)
      expect(output!.summary.failed).toBe(0)
      expect(output!.summary.skipped).toBe(0)
      expect(output!.failures).toBeUndefined()
    })

    it('should handle only failing tests', () => {
      for (let i = 0; i < 5; i++) {
        reporter.onTestCaseResult(createMockTestCase(`fail${i}`, 'failed', new Error(`Error ${i}`)))
      }

      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(5)
      expect(output!.summary.passed).toBe(0)
      expect(output!.summary.failed).toBe(5)
      expect(output!.failures).toHaveLength(5)
    })

    it('should handle tests with async errors', () => {
      const asyncError = new Error('Promise rejected')
      asyncError.stack = `
        Error: Promise rejected
            at async /test/async.ts:15:5
            at async Promise.all
      `

      const asyncTest = createMockTestCase('async-test', 'failed', asyncError)
      reporter.onTestCaseResult(asyncTest)
      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures![0].error.message).toBe('Promise rejected')
      expect(output!.failures![0].error.stack).toContain('async')
    })

    it('should handle tests with multiple assertions', () => {
      const multipleAssertionError = new Error(
        'Multiple assertions failed:\n1. Expected A\n2. Expected B'
      )
      const testCase = createMockTestCase('multi-assert', 'failed', multipleAssertionError)

      reporter.onTestCaseResult(testCase)
      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures![0].error.message).toContain('Multiple assertions failed')
    })

    it('should identify long-running tests', () => {
      const longTest = {
        ...createMockTestCase('long-test', 'passed'),
        result: {
          state: 'passed',
          duration: 5000 // 5 seconds
        }
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])
      verboseReporter.onTestCaseResult(longTest)
      verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.passed![0].duration).toBe(5000)
    })

    it('should handle concurrent test execution', () => {
      const concurrentTests = Array.from({ length: 10 }, (_, i) =>
        createMockTestCase(
          `concurrent-${i}`,
          i % 3 === 0 ? 'failed' : 'passed',
          i % 3 === 0 ? new Error('Failed') : undefined
        )
      )

      // Simulate concurrent test results
      concurrentTests.forEach((test) => reporter.onTestCaseResult(test))

      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.summary.total).toBe(10)
      expect(output!.summary.failed).toBe(4) // 0, 3, 6, 9
      expect(output!.summary.passed).toBe(6)
    })

    it('should handle malformed test data gracefully', () => {
      const malformedTest = {
        id: 'malformed',
        name: null, // Invalid name
        file: undefined, // Missing file
        result: { state: 'unknown' } // Unknown state
      }

      reporter.onTestCaseResult(malformedTest as any)
      reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      // Should not crash and should handle gracefully
      expect(output).toBeDefined()
      expect(output!.summary).toBeDefined()
    })

    it('should handle test run interruption', () => {
      reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])
      reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))

      // Simulate interruption
      reporter.onTestRunEnd([], [], 'interrupted')

      const output = reporter.getOutput()
      expect(output).toBeDefined()
      expect(output!.summary.total).toBeGreaterThanOrEqual(1)
    })

    it('should handle tests with no location information', () => {
      const testNoLocation = {
        ...createMockTestCase('no-location', 'passed'),
        location: undefined
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onTestRunStart([])
      verboseReporter.onTestCaseResult(testNoLocation)
      verboseReporter.onTestRunEnd([], [], 'passed')

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

    it('should respect includePassedTests configuration', () => {
      const reporter = new LLMReporter({ includePassedTests: true })
      reporter.onTestRunStart([])
      reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output!.passed).toBeDefined()
      expect(output!.passed).toHaveLength(1)
    })

    it('should respect includeSkippedTests configuration', () => {
      const reporter = new LLMReporter({ includeSkippedTests: true })
      reporter.onTestRunStart([])
      reporter.onTestCaseResult(createMockTestCase('test1', 'skipped'))
      reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output!.skipped).toBeDefined()
      expect(output!.skipped).toHaveLength(1)
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
      expect(() => reporter.onTestCaseResult(invalidTestCase)).not.toThrow()
    })

    it('should handle missing test data', () => {
      const incompleteTest = {} as any

      reporter.onTestCaseResult(incompleteTest)
      reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output).toBeDefined()
    })

    it('should handle circular references in error objects', () => {
      const circularError: any = new Error('Circular reference')
      circularError.self = circularError // Create circular reference

      const testWithCircular = createMockTestCase('circular', 'failed', circularError)
      reporter.onTestCaseResult(testWithCircular)
      reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures).toHaveLength(1)
      // Should serialize without throwing
      expect(() => JSON.stringify(output)).not.toThrow()
    })
  })

  describe('Output File Writing', () => {
    it('should write output to file when configured', () => {
      const reporterWithFile = new LLMReporter({ outputFile: 'test-output.json' })
      const writeFileSpy = vi.spyOn((reporterWithFile as any).outputWriter, 'write')

      reporterWithFile.onTestRunStart([])
      reporterWithFile.onTestCaseResult(createMockTestCase('test1', 'passed'))
      reporterWithFile.onTestRunEnd([], [], 'passed')

      expect(writeFileSpy).toHaveBeenCalled()
    })

    it('should not write file when not configured', () => {
      const writeFileSpy = vi.spyOn((reporter as any).outputWriter, 'write')

      reporter.onTestRunStart([])
      reporter.onTestRunEnd([], [], 'passed')

      expect(writeFileSpy).not.toHaveBeenCalled()
    })
  })
})
