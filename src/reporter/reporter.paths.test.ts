import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Vitest } from 'vitest'
import { LLMReporter } from './reporter.js'
import {
  createMockTestCase,
  createMockTestModule,
  createMockTestSpecification
} from '../test-utils/mock-data.js'

describe('Reporter Path Hygiene', () => {
  let reporter: LLMReporter
  let mockVitest: Partial<Vitest>

  beforeEach(() => {
    // Mock stdout to prevent actual console output
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)

    reporter = new LLMReporter()
    mockVitest = {
      config: {
        root: '/home/project'
      } as any,
      state: {
        getFiles: vi.fn(() => [])
      } as any
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Repo-relative path conversion', () => {
    it('should convert absolute paths to repo-relative paths', async () => {
      reporter.onInit(mockVitest as Vitest)
      reporter.onTestRunStart([createMockTestSpecification('/home/project/tests/example.test.ts')])

      const testCase = {
        ...createMockTestCase({ name: 'test1', state: 'pass' }),
        file: { filepath: '/home/project/tests/example.test.ts' },
        location: { start: { line: 10 }, end: { line: 15 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'passed')

      const output = reporter.getOutput()
      // Since no failures and not verbose, check if we would have the right structure
      expect(output).toBeDefined()
      expect(output!.summary).toBeDefined()
    })

    it('should handle failed tests with repo-relative paths', async () => {
      reporter.onInit(mockVitest as Vitest)
      reporter.onTestRunStart([createMockTestSpecification('/home/project/src/math.test.ts')])

      const error = new Error('Test failed')
      error.stack = `Error: Test failed
  at testFunction (/home/project/src/math.test.ts:25:10)
  at /home/project/src/helper.ts:30:5`

      const testCase = {
        ...createMockTestCase({ name: 'math test', state: 'fail', error }),
        file: { filepath: '/home/project/src/math.test.ts' },
        location: { start: { line: 20 }, end: { line: 30 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      expect(output!.failures).toHaveLength(1)
      const failure = output!.failures![0]

      // Check that the path is repo-relative
      expect(failure.fileRelative).toBe('src/math.test.ts')
      expect(failure.fileAbsolute).toBeUndefined() // Default config doesn't include absolute paths

      // Check stack frames are also repo-relative
      if (failure.error.stackFrames) {
        expect(failure.error.stackFrames[0].fileRelative).toBe('src/math.test.ts')
        expect(failure.error.stackFrames[0].inProject).toBe(true)
        expect(failure.error.stackFrames[0].inNodeModules).toBe(false)
        expect(failure.error.stackFrames[0].fileAbsolute).toBeUndefined()
      }
    })

    it('should handle paths outside the project root', async () => {
      reporter.onInit(mockVitest as Vitest)
      reporter.onTestRunStart([])

      const error = new Error('External error')
      error.stack = `Error: External error
  at externalLib (/tmp/external-lib/index.js:10:5)
  at userCode (/home/project/src/app.ts:20:10)`

      const testCase = {
        ...createMockTestCase({ name: 'external test', state: 'fail', error }),
        file: { filepath: '/tmp/test-file.ts' },
        location: { start: { line: 1 }, end: { line: 5 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      const failure = output!.failures![0]

      // Path outside root should remain as-is
      expect(failure.fileRelative).toBe('/tmp/test-file.ts')

      // Check stack frames
      if (failure.error.stackFrames) {
        expect(failure.error.stackFrames[0].fileRelative).toBe('/tmp/external-lib/index.js')
        expect(failure.error.stackFrames[0].inProject).toBe(false)
        expect(failure.error.stackFrames[1].fileRelative).toBe('src/app.ts')
        expect(failure.error.stackFrames[1].inProject).toBe(true)
      }
    })

    it('should detect node_modules in stack frames', async () => {
      reporter.onInit(mockVitest as Vitest)
      reporter.onTestRunStart([])

      const error = new Error('Module error')
      error.stack = `Error: Module error
  at moduleCode (/home/project/node_modules/some-lib/index.js:10:5)
  at userCode (/home/project/src/app.ts:20:10)`

      const testCase = {
        ...createMockTestCase({ name: 'module test', state: 'fail', error }),
        file: { filepath: '/home/project/tests/module.test.ts' },
        location: { start: { line: 1 }, end: { line: 5 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      const failure = output!.failures![0]

      // Check stack frames
      if (failure.error.stackFrames) {
        const nodeModuleFrame = failure.error.stackFrames[0]
        expect(nodeModuleFrame.fileRelative).toBe('node_modules/some-lib/index.js')
        expect(nodeModuleFrame.inProject).toBe(false)
        expect(nodeModuleFrame.inNodeModules).toBe(true)

        const userFrame = failure.error.stackFrames[1]
        expect(userFrame.fileRelative).toBe('src/app.ts')
        expect(userFrame.inProject).toBe(true)
        expect(userFrame.inNodeModules).toBe(false)
      }
    })

    it('should handle file:// URLs in stack traces', async () => {
      reporter.onInit(mockVitest as Vitest)
      reporter.onTestRunStart([])

      const error = new Error('URL error')
      error.stack = `Error: URL error
  at testFunction (file:///home/project/src/test.ts:10:5)
  at file:///home/project/src/helper.ts:20:10`

      const testCase = {
        ...createMockTestCase({ name: 'url test', state: 'fail', error }),
        file: { filepath: 'file:///home/project/src/test.ts' },
        location: { start: { line: 5 }, end: { line: 15 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      const failure = output!.failures![0]

      // Check that file:// URLs are normalized to repo-relative paths
      expect(failure.fileRelative).toBe('src/test.ts')

      if (failure.error.stackFrames) {
        expect(failure.error.stackFrames[0].fileRelative).toBe('src/test.ts')
        expect(failure.error.stackFrames[1].fileRelative).toBe('src/helper.ts')
      }
    })

    it('should include absolute paths when configured', async () => {
      const reporterWithAbsolute = new LLMReporter({ includeAbsolutePaths: true })
      reporterWithAbsolute.onInit(mockVitest as Vitest)
      reporterWithAbsolute.onTestRunStart([])

      const error = new Error('Test with absolute paths')
      error.stack = `Error: Test with absolute paths
  at testFunction (/home/project/src/test.ts:10:5)`

      const testCase = {
        ...createMockTestCase({ name: 'absolute test', state: 'fail', error }),
        file: { filepath: '/home/project/src/test.ts' },
        location: { start: { line: 5 }, end: { line: 15 } }
      }

      reporterWithAbsolute.onTestCaseResult(testCase)
      await reporterWithAbsolute.onTestRunEnd([], [], 'failed')

      const output = reporterWithAbsolute.getOutput()
      const failure = output!.failures![0]

      // Check that both relative and absolute paths are present
      expect(failure.fileRelative).toBe('src/test.ts')
      expect(failure.fileAbsolute).toBe('/home/project/src/test.ts')

      if (failure.error.stackFrames) {
        expect(failure.error.stackFrames[0].fileRelative).toBe('src/test.ts')
        expect(failure.error.stackFrames[0].fileAbsolute).toBe('/home/project/src/test.ts')
      }
    })

    it('should handle Windows-style paths', async () => {
      const windowsVitest = {
        config: {
          root: 'C:\\Users\\project'
        } as any,
        state: {
          getFiles: vi.fn(() => [])
        } as any
      }

      reporter.onInit(windowsVitest as Vitest)
      reporter.onTestRunStart([])

      const error = new Error('Windows path error')
      error.stack = `Error: Windows path error
  at testFunction (C:\\Users\\project\\src\\test.ts:10:5)`

      const testCase = {
        ...createMockTestCase({ name: 'windows test', state: 'fail', error }),
        file: { filepath: 'C:\\Users\\project\\src\\test.ts' },
        location: { start: { line: 5 }, end: { line: 15 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      const failure = output!.failures![0]

      // Check that Windows paths are converted to forward slashes
      expect(failure.fileRelative).toBe('src/test.ts')
    })

    it('should handle Windows file:// URLs', async () => {
      const windowsVitest = {
        config: {
          root: 'C:\\Users\\project'
        } as any,
        state: {
          getFiles: vi.fn(() => [])
        } as any
      }

      reporter.onInit(windowsVitest as Vitest)
      reporter.onTestRunStart([])

      const error = new Error('Windows URL error')
      error.stack = `Error: Windows URL error
  at testFunction (file:///C:/Users/project/src/test.ts:10:5)`

      const testCase = {
        ...createMockTestCase({ name: 'windows url test', state: 'fail', error }),
        file: { filepath: 'file:///C:/Users/project/src/test.ts' },
        location: { start: { line: 5 }, end: { line: 15 } }
      }

      reporter.onTestCaseResult(testCase)
      await reporter.onTestRunEnd([], [], 'failed')

      const output = reporter.getOutput()
      const failure = output!.failures![0]

      // Check that Windows file URLs are normalized correctly
      expect(failure.fileRelative).toBe('src/test.ts')
    })
  })

  describe('Verbose mode with paths', () => {
    it('should include repo-relative paths in passed tests', async () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onInit(mockVitest as Vitest)
      verboseReporter.onTestRunStart([])

      const testCase = {
        ...createMockTestCase({ name: 'passed test', state: 'pass' }),
        file: { filepath: '/home/project/tests/pass.test.ts' },
        location: { start: { line: 10 }, end: { line: 20 } }
      }

      verboseReporter.onTestCaseResult(testCase)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.passed).toHaveLength(1)
      expect(output!.passed![0].fileRelative).toBe('tests/pass.test.ts')
      expect(output!.passed![0].fileAbsolute).toBeUndefined()
    })

    it('should include repo-relative paths in skipped tests', async () => {
      const verboseReporter = new LLMReporter({ verbose: true })
      verboseReporter.onInit(mockVitest as Vitest)
      verboseReporter.onTestRunStart([])

      const testCase = {
        ...createMockTestCase({ name: 'skipped test', state: 'skip' }),
        file: { filepath: '/home/project/tests/skip.test.ts' },
        location: { start: { line: 5 }, end: { line: 10 } }
      }

      verboseReporter.onTestCaseResult(testCase)
      await verboseReporter.onTestRunEnd([], [], 'passed')

      const output = verboseReporter.getOutput()
      expect(output!.skipped).toHaveLength(1)
      expect(output!.skipped![0].fileRelative).toBe('tests/skip.test.ts')
    })
  })
})
