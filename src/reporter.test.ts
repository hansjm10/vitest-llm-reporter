import { describe, it, expect, beforeEach, vi } from 'vitest'
import type {
  Vitest,
  TestModule,
  TestCase,
  TestSpecification,
  TestProject,
  SerializedError
} from 'vitest'
import type { LLMReporterOutput, TestSummary, TestFailure, TestResult } from './types/schema'

// Import the non-existent LLMReporter class (will fail initially - TDD)
import { LLMReporter } from './reporter'

// Mock data generators
const createMockTestCase = (
  name: string,
  status: 'passed' | 'failed' | 'skipped' = 'passed',
  error?: Error
): Partial<TestCase> => ({
  id: `test-${name}`,
  name,
  mode: status === 'skipped' ? 'skip' : 'run',
  type: 'test',
  file: { filepath: '/test/file.ts', name: 'file.ts' } as any,
  result: {
    state: status,
    startTime: Date.now(),
    duration: 100,
    error: error ? { message: error.message, stack: error.stack } : undefined
  } as any,
  location: {
    start: { line: 10, column: 1 },
    end: { line: 15, column: 1 }
  } as any
})

const createMockTestModule = (
  filepath: string,
  tests: Partial<TestCase>[] = []
): Partial<TestModule> => ({
  id: filepath,
  filepath,
  type: 'module',
  state: () => 'completed' as any,
  children: () => tests as any,
  errors: () => [],
  diagnostics: () => []
})

const createMockTestSpecification = (filepath: string): TestSpecification => ({
  moduleId: filepath,
  project: { config: {} } as TestProject
})

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
      it('should initialize test run with specifications', async () => {
        const specifications = [
          createMockTestSpecification('/test/file1.ts'),
          createMockTestSpecification('/test/file2.ts')
        ]

        await reporter.onTestRunStart(specifications)

        const state = reporter.getState()
        expect(state.startTime).toBeDefined()
        expect(state.specifications).toHaveLength(2)
      })

      it('should handle empty specifications', async () => {
        await reporter.onTestRunStart([])

        const state = reporter.getState()
        expect(state.specifications).toHaveLength(0)
      })
    })

    describe('onTestModuleQueued', () => {
      it('should track queued modules', async () => {
        const module1 = createMockTestModule('/test/file1.ts')
        const module2 = createMockTestModule('/test/file2.ts')

        await reporter.onTestModuleQueued(module1)
        await reporter.onTestModuleQueued(module2)

        const state = reporter.getState()
        expect(state.queuedModules).toHaveLength(2)
        expect(state.queuedModules).toContain('/test/file1.ts')
      })
    })

    describe('onTestModuleCollected', () => {
      it('should collect test information from modules', async () => {
        const tests = [
          createMockTestCase('test1'),
          createMockTestCase('test2', 'skipped'),
          createMockTestCase('test3')
        ]
        const module = createMockTestModule('/test/file.ts', tests)

        await reporter.onTestModuleCollected(module)

        const state = reporter.getState()
        expect(state.collectedTests).toHaveLength(3)
        expect(state.collectedTests.filter((t) => t.mode === 'skip')).toHaveLength(1)
      })

      it('should handle nested test suites', async () => {
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

        await reporter.onTestModuleCollected(module)

        const state = reporter.getState()
        expect(state.collectedTests).toHaveLength(2)
        expect(state.collectedTests[0].suite).toEqual(['suite1'])
        expect(state.collectedTests[1].suite).toEqual(['suite1', 'suite2'])
      })
    })

    describe('onTestModuleStart', () => {
      it('should track module execution start', async () => {
        const module = createMockTestModule('/test/file.ts')

        await reporter.onTestModuleStart(module)

        const state = reporter.getState()
        expect(state.runningModules).toContain('/test/file.ts')
        expect(state.moduleStartTimes['/test/file.ts']).toBeDefined()
      })
    })

    describe('onTestModuleEnd', () => {
      it('should track module execution completion', async () => {
        const module = createMockTestModule('/test/file.ts')

        await reporter.onTestModuleStart(module)
        await reporter.onTestModuleEnd(module)

        const state = reporter.getState()
        expect(state.runningModules).not.toContain('/test/file.ts')
        expect(state.completedModules).toContain('/test/file.ts')
      })

      it('should calculate module duration', async () => {
        const module = createMockTestModule('/test/file.ts')

        await reporter.onTestModuleStart(module)
        await new Promise((resolve) => setTimeout(resolve, 10))
        await reporter.onTestModuleEnd(module)

        const state = reporter.getState()
        expect(state.moduleDurations['/test/file.ts']).toBeGreaterThan(0)
      })
    })

    describe('onTestCaseReady', () => {
      it('should track test case preparation', async () => {
        const testCase = createMockTestCase('test1')

        await reporter.onTestCaseReady(testCase)

        const state = reporter.getState()
        expect(state.readyTests).toContain('test-test1')
      })
    })

    describe('onTestCaseResult', () => {
      it('should track passed test results', async () => {
        const testCase = createMockTestCase('test1', 'passed')

        await reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.passed).toHaveLength(1)
        expect(state.testResults.passed[0].test).toBe('test1')
      })

      it('should track failed test results with error context', async () => {
        const error = new Error('Assertion failed')
        error.stack = 'Error: Assertion failed\n    at /test/file.ts:12:5'
        const testCase = createMockTestCase('test1', 'failed', error)

        await reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.failed).toHaveLength(1)
        expect(state.testResults.failed[0].test).toBe('test1')
        expect(state.testResults.failed[0].error.message).toBe('Assertion failed')
      })

      it('should track skipped test results', async () => {
        const testCase = createMockTestCase('test1', 'skipped')

        await reporter.onTestCaseResult(testCase)

        const state = reporter.getState()
        expect(state.testResults.skipped).toHaveLength(1)
        expect(state.testResults.skipped[0].test).toBe('test1')
      })

      it('should extract error context with code lines', async () => {
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

        await reporter.onTestCaseResult(testCase)

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
        await reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])

        // Add test results
        await reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
        await reporter.onTestCaseResult(createMockTestCase('test2', 'failed', new Error('Failed')))
        await reporter.onTestCaseResult(createMockTestCase('test3', 'skipped'))

        // End test run
        const modules = [createMockTestModule('/test/file.ts')]
        await reporter.onTestRunEnd(modules, [], 'passed')

        const output = reporter.getOutput()
        expect(output).toBeDefined()
        expect(output.summary.total).toBe(3)
        expect(output.summary.passed).toBe(1)
        expect(output.summary.failed).toBe(1)
        expect(output.summary.skipped).toBe(1)
      })

      it('should handle unhandled errors', async () => {
        const unhandledError: SerializedError = {
          message: 'Unhandled rejection',
          stack: 'Error: Unhandled rejection\n    at process'
        }

        await reporter.onTestRunStart([])
        await reporter.onTestRunEnd([], [unhandledError], 'failed')

        const output = reporter.getOutput()
        expect(output.failures).toHaveLength(1)
        expect(output.failures?.[0].error.message).toContain('Unhandled rejection')
      })

      it('should include timestamp in output', async () => {
        await reporter.onTestRunStart([])
        await reporter.onTestRunEnd([], [], 'passed')

        const output = reporter.getOutput()
        expect(output.summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })
    })
  })

  describe('Output Structure Tests', () => {
    beforeEach(async () => {
      await reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])
    })

    it('should generate valid JSON output matching LLMReporterOutput schema', async () => {
      await reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()

      // Validate output structure
      expect(output).toHaveProperty('summary')
      expect(output.summary).toHaveProperty('total')
      expect(output.summary).toHaveProperty('passed')
      expect(output.summary).toHaveProperty('failed')
      expect(output.summary).toHaveProperty('skipped')
      expect(output.summary).toHaveProperty('duration')
      expect(output.summary).toHaveProperty('timestamp')
    })

    it('should calculate accurate summary statistics', async () => {
      // Add various test results
      for (let i = 0; i < 5; i++) {
        await reporter.onTestCaseResult(createMockTestCase(`pass${i}`, 'passed'))
      }
      for (let i = 0; i < 3; i++) {
        await reporter.onTestCaseResult(
          createMockTestCase(`fail${i}`, 'failed', new Error('Failed'))
        )
      }
      for (let i = 0; i < 2; i++) {
        await reporter.onTestCaseResult(createMockTestCase(`skip${i}`, 'skipped'))
      }

      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.summary.total).toBe(10)
      expect(output.summary.passed).toBe(5)
      expect(output.summary.failed).toBe(3)
      expect(output.summary.skipped).toBe(2)
    })

    it('should include failure context for failed tests', async () => {
      const error = new Error('Expected true to be false')
      error.stack = 'Error: Expected true to be false\n    at /test/file.ts:25:10'

      const failedTest = {
        ...createMockTestCase('failing-test', 'failed', error),
        location: { start: { line: 20 }, end: { line: 30 } }
      }

      await reporter.onTestCaseResult(failedTest)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.failures).toHaveLength(1)

      const failure = output.failures![0]
      expect(failure.test).toBe('failing-test')
      expect(failure.file).toBe('/test/file.ts')
      expect(failure.startLine).toBe(20)
      expect(failure.endLine).toBe(30)
      expect(failure.error.message).toBe('Expected true to be false')
      expect(failure.error.type).toBe('Error')
      expect(failure.error.stack).toContain('/test/file.ts:25:10')
    })

    it('should include passed tests in verbose mode', async () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      await verboseReporter.onTestRunStart([])

      await verboseReporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      await verboseReporter.onTestCaseResult(createMockTestCase('test2', 'passed'))
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output.passed).toHaveLength(2)
      expect(output.passed![0].status).toBe('passed')
      expect(output.passed![0].test).toBe('test1')
    })

    it('should include skipped tests in verbose mode', async () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      await verboseReporter.onTestRunStart([])

      await verboseReporter.onTestCaseResult(createMockTestCase('test1', 'skipped'))
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output.skipped).toHaveLength(1)
      expect(output.skipped![0].status).toBe('skipped')
    })

    it('should maintain nested suite hierarchy', async () => {
      const nestedTest = {
        ...createMockTestCase('nested-test', 'failed', new Error('Failed')),
        suite: ['Parent Suite', 'Child Suite']
      }

      await reporter.onTestCaseResult(nestedTest)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.failures![0].suite).toEqual(['Parent Suite', 'Child Suite'])
    })

    it('should capture file paths and line numbers', async () => {
      const testWithLocation = {
        ...createMockTestCase('located-test', 'passed'),
        file: { filepath: '/src/components/Button.test.ts' },
        location: { start: { line: 42 }, end: { line: 47 } }
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      await verboseReporter.onTestRunStart([])
      await verboseReporter.onTestCaseResult(testWithLocation)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      const passedTest = output.passed![0]
      expect(passedTest.file).toBe('/src/components/Button.test.ts')
      expect(passedTest.startLine).toBe(42)
      expect(passedTest.endLine).toBe(47)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty test suite', async () => {
      await reporter.onTestRunStart([])
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output.summary.total).toBe(0)
      expect(output.summary.passed).toBe(0)
      expect(output.summary.failed).toBe(0)
      expect(output.summary.skipped).toBe(0)
      expect(output.failures).toBeUndefined()
    })

    it('should handle only failing tests', async () => {
      for (let i = 0; i < 5; i++) {
        await reporter.onTestCaseResult(
          createMockTestCase(`fail${i}`, 'failed', new Error(`Error ${i}`))
        )
      }

      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.summary.total).toBe(5)
      expect(output.summary.passed).toBe(0)
      expect(output.summary.failed).toBe(5)
      expect(output.failures).toHaveLength(5)
    })

    it('should handle tests with async errors', async () => {
      const asyncError = new Error('Promise rejected')
      asyncError.stack = `
        Error: Promise rejected
            at async /test/async.ts:15:5
            at async Promise.all
      `

      const asyncTest = createMockTestCase('async-test', 'failed', asyncError)
      await reporter.onTestCaseResult(asyncTest)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.failures![0].error.message).toBe('Promise rejected')
      expect(output.failures![0].error.stack).toContain('async')
    })

    it('should handle tests with multiple assertions', async () => {
      const multipleAssertionError = new Error(
        'Multiple assertions failed:\n1. Expected A\n2. Expected B'
      )
      const testCase = createMockTestCase('multi-assert', 'failed', multipleAssertionError)

      await reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.failures![0].error.message).toContain('Multiple assertions failed')
    })

    it('should identify long-running tests', async () => {
      const longTest = {
        ...createMockTestCase('long-test', 'passed'),
        result: {
          state: 'passed',
          duration: 5000 // 5 seconds
        }
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      await verboseReporter.onTestRunStart([])
      await verboseReporter.onTestCaseResult(longTest)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output.passed![0].duration).toBe(5000)
    })

    it('should handle concurrent test execution', async () => {
      const concurrentTests = Array.from({ length: 10 }, (_, i) =>
        createMockTestCase(
          `concurrent-${i}`,
          i % 3 === 0 ? 'failed' : 'passed',
          i % 3 === 0 ? new Error('Failed') : undefined
        )
      )

      // Simulate concurrent test results
      await Promise.all(concurrentTests.map((test) => reporter.onTestCaseResult(test)))

      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.summary.total).toBe(10)
      expect(output.summary.failed).toBe(4) // 0, 3, 6, 9
      expect(output.summary.passed).toBe(6)
    })

    it('should handle malformed test data gracefully', async () => {
      const malformedTest = {
        id: 'malformed',
        name: null, // Invalid name
        file: undefined, // Missing file
        result: { state: 'unknown' } // Unknown state
      }

      await reporter.onTestCaseResult(malformedTest as any)
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      // Should not crash and should handle gracefully
      expect(output).toBeDefined()
      expect(output.summary).toBeDefined()
    })

    it('should handle test run interruption', async () => {
      await reporter.onTestRunStart([createMockTestSpecification('/test/file.ts')])
      await reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))

      // Simulate interruption
      await reporter.onTestRunEnd([], [], 'interrupted')

      const output = reporter.getOutput()
      expect(output).toBeDefined()
      expect(output.summary.total).toBeGreaterThanOrEqual(1)
    })

    it('should handle tests with no location information', async () => {
      const testNoLocation = {
        ...createMockTestCase('no-location', 'passed'),
        location: undefined
      }

      const verboseReporter = new LLMReporter({ verbose: true })
      await verboseReporter.onTestRunStart([])
      await verboseReporter.onTestCaseResult(testNoLocation)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output.passed![0].startLine).toBe(0)
      expect(output.passed![0].endLine).toBe(0)
    })
  })

  describe('Configuration Options', () => {
    it('should respect outputFile configuration', () => {
      const reporter = new LLMReporter({ outputFile: 'custom-output.json' })
      expect(reporter.getConfig().outputFile).toBe('custom-output.json')
    })

    it('should respect includePassedTests configuration', async () => {
      const reporter = new LLMReporter({ includePassedTests: true })
      await reporter.onTestRunStart([])
      await reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output.passed).toBeDefined()
      expect(output.passed).toHaveLength(1)
    })

    it('should respect includeSkippedTests configuration', async () => {
      const reporter = new LLMReporter({ includeSkippedTests: true })
      await reporter.onTestRunStart([])
      await reporter.onTestCaseResult(createMockTestCase('test1', 'skipped'))
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output.skipped).toBeDefined()
      expect(output.skipped).toHaveLength(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in lifecycle hooks gracefully', async () => {
      const reporter = new LLMReporter()

      // Mock internal method to throw error
      reporter['processTestCase'] = vi.fn(() => {
        throw new Error('Internal processing error')
      })

      // Should not throw
      await expect(reporter.onTestCaseResult(createMockTestCase('test1'))).resolves.not.toThrow()
    })

    it('should handle missing test data', async () => {
      const incompleteTest = {} as TestCase

      await reporter.onTestCaseResult(incompleteTest)
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      expect(output).toBeDefined()
    })

    it('should handle circular references in error objects', async () => {
      const circularError: any = new Error('Circular reference')
      circularError.self = circularError // Create circular reference

      const testWithCircular = createMockTestCase('circular', 'failed', circularError)
      await reporter.onTestCaseResult(testWithCircular)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output.failures).toHaveLength(1)
      // Should serialize without throwing
      expect(() => JSON.stringify(output)).not.toThrow()
    })
  })

  describe('Output File Writing', () => {
    it('should write output to file when configured', async () => {
      const writeFileSpy = vi.spyOn(reporter as any, 'writeOutputFile')
      const reporter = new LLMReporter({ outputFile: 'test-output.json' })

      await reporter.onTestRunStart([])
      await reporter.onTestCaseResult(createMockTestCase('test1', 'passed'))
      await reporter.onTestRunEnd([], [], 'passed')

      expect(writeFileSpy).toHaveBeenCalled()
    })

    it('should not write file when not configured', async () => {
      const writeFileSpy = vi.spyOn(reporter as any, 'writeOutputFile')

      await reporter.onTestRunStart([])
      await reporter.onTestRunEnd([], [], 'passed')

      expect(writeFileSpy).not.toHaveBeenCalled()
    })
  })
})
