import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ErrorExtractor } from './ErrorExtractor.js'
import type { ErrorExtractionConfig } from '../types/extraction.js'
import * as fs from 'node:fs'

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  realpathSync: vi.fn()
}))

// Mock PathValidator to bypass filesystem checks
vi.mock('../utils/path-validator.js', () => {
  return {
    PathValidator: class {
      constructor() {
        // No need to store rootDir for the mock
      }
      validate(path: string) {
        // Return the path as-is for successful validation
        // Return null for paths that should fail validation
        if (path && !path.includes('non-existent')) {
          return path
        }
        return null
      }
    }
  }
})

describe('ErrorExtractor', () => {
  let extractor: ErrorExtractor

  beforeEach(() => {
    extractor = new ErrorExtractor()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Basic Error Extraction', () => {
    it('should extract basic error properties', () => {
      const error = new Error('Test error message')
      const result = extractor.extract(error)

      expect(result.message).toBe('Test error message')
      expect(result.type).toBe('Error')
      expect(result.stack).toBeDefined()
    })

    it('should handle assertion errors with expected and actual values', () => {
      const assertionError = {
        name: 'AssertionError',
        message: 'Expected 5 but received 4',
        expected: 5,
        actual: 4,
        operator: 'toBe',
        stack: 'AssertionError: Expected 5 but received 4\n  at /src/math.test.ts:15:12'
      }

      const result = extractor.extract(assertionError)

      expect(result.message).toBe('Expected 5 but received 4')
      expect(result.type).toBe('AssertionError')
      expect(result.expected).toBe(5)
      expect(result.actual).toBe(4)
    })

    it('should handle null and undefined errors gracefully', () => {
      const nullResult = extractor.extract(null)
      expect(nullResult.message).toBe('Unknown error')
      expect(nullResult.type).toBe('Error')

      const undefinedResult = extractor.extract(undefined)
      expect(undefinedResult.message).toBe('Unknown error')
      expect(undefinedResult.type).toBe('Error')
    })
  })

  describe('Context Extraction', () => {
    it('should extract code snippet around failure point', () => {
      const mockFileContent = `function add(a, b) {
  return a + b
}

function testAdd() {
  const result = add(2, 2)
  expect(result).toBe(5) // Line 7
  console.log('Test completed')
}

export { add, testAdd }
// Line 12
// Line 13
// Line 14
// Line 15 - Error here
// Line 16
// Line 17
// Line 18`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const config: ErrorExtractionConfig = {
        maxContextLines: 3,
        includeSourceCode: true
      }
      const contextExtractor = new ErrorExtractor(config)

      const error = {
        message: 'Test failed',
        stack: 'Error: Test failed\n  at /src/math.test.ts:15:12',
        file: '/src/math.test.ts',
        line: 15,
        column: 12
      }

      const result = contextExtractor.extractWithContext(error)

      expect(result.context).toBeDefined()
      expect(result.context?.code).toHaveLength(7) // 3 before + line + 3 after
      expect(result.context?.lineNumber).toBe(15)
      expect(result.context?.columnNumber).toBe(12)
    })

    it('should respect maxContextLines configuration', () => {
      const mockFileContent = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join('\n')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const config: ErrorExtractionConfig = {
        maxContextLines: 5,
        includeSourceCode: true
      }
      const contextExtractor = new ErrorExtractor(config)

      const error = {
        message: 'Test failed',
        stack: 'Error: Test failed\n  at /src/large-file.test.ts:50:20',
        file: '/src/large-file.test.ts',
        line: 50
      }

      const result = contextExtractor.extractWithContext(error)

      expect(result.context?.code).toHaveLength(11) // 5 before + line + 5 after
    })

    it('should handle file not found gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const error = {
        message: 'Test failed',
        stack: 'Error: Test failed\n  at /non-existent-file.ts:10:5',
        file: '/non-existent-file.ts',
        line: 10
      }

      const result = extractor.extractWithContext(error)

      expect(result.context).toBeUndefined()
      expect(result.lineNumber).toBe(10)
    })

    it('should handle edge cases for line numbers', () => {
      const mockFileContent = `First line
Second line
Third line
Fourth line`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const error = {
        message: 'Test failed',
        stack: 'Error: Test failed\n  at /src/test.ts:1:1',
        file: '/src/test.ts',
        line: 1
      }

      const result = extractor.extractWithContext(error)

      // Should handle being at the start of file
      expect(result.context?.lineNumber).toBe(1)
      expect(result.context?.code).toBeDefined()
    })
  })

  describe('Stack Trace Parsing', () => {
    it('should parse stack traces to extract file, line, and column', () => {
      const error = {
        message: 'Test error',
        stack: `Error: Test error
  at testSum (/Users/test/project/src/math.test.ts:15:12)
  at Object.<anonymous> (/Users/test/project/src/math.test.ts:20:5)
  at Module._compile (node:internal/modules/cjs/loader:1234:30)`
      }

      const result = extractor.extractStackFrames(error)

      expect(result.stackFrames).toBeDefined()
      expect(result.stackFrames).toHaveLength(2) // Filtered out node_modules
      expect(result.stackFrames?.[0]).toEqual({
        file: '/Users/test/project/src/math.test.ts',
        line: 15,
        column: 12,
        function: 'testSum'
      })
    })

    it('should filter out node_modules and internal frames', () => {
      const config: ErrorExtractionConfig = {
        filterNodeModules: true
      }
      const contextExtractor = new ErrorExtractor(config)

      const error = {
        stack: `Error: Test error
  at userCode (/project/src/test.ts:10:5)
  at node_modules/vitest/dist/runner.js:500:10
  at internal/process/task_queues:95:5
  at anotherUserCode (/project/src/helper.ts:20:15)`
      }

      const result = contextExtractor.extractStackFrames(error)

      expect(result.stackFrames).toHaveLength(2)
      expect(result.stackFrames?.[0].file).toContain('/project/src/test.ts')
      expect(result.stackFrames?.[1].file).toContain('/project/src/helper.ts')
    })

    it('should handle malformed stack traces gracefully', () => {
      const error = {
        message: 'Test error',
        stack: 'This is not a valid stack trace'
      }

      const result = extractor.extractStackFrames(error)

      expect(result.stackFrames).toEqual([])
    })
  })

  describe('Async Error Handling', () => {
    it('should handle promise rejection errors', () => {
      const promiseError = {
        name: 'UnhandledPromiseRejection',
        message: 'Promise rejected with: Database connection failed',
        reason: 'Database connection failed',
        promise: {},
        stack:
          'UnhandledPromiseRejection: Database connection failed\n  at async connectDB (/src/db.test.ts:25:10)'
      }

      const result = extractor.extract(promiseError)

      expect(result.type).toBe('UnhandledPromiseRejection')
      expect(result.message).toContain('Database connection failed')
    })

    it('should handle async/await errors with proper context', () => {
      const asyncError = {
        name: 'Error',
        message: 'Async operation failed',
        stack: `Error: Async operation failed
  at async testAsyncFunction (/src/async.test.ts:30:15)
  at async Object.<anonymous> (/src/async.test.ts:35:5)`
      }

      const result = extractor.extractWithContext(asyncError)

      expect(result.message).toBe('Async operation failed')
      expect(result.stackFrames).toBeDefined()
      expect(result.stackFrames?.[0].function).toBe('testAsyncFunction')
    })
  })

  describe('Assertion Details Extraction', () => {
    it('should extract assertion operator and values', () => {
      const vitestAssertion = {
        name: 'AssertionError',
        message: 'expected 5 to be 10',
        expected: 10,
        actual: 5,
        operator: 'toBe',
        stack: 'AssertionError: expected 5 to be 10\n  at /src/test.ts:10:20'
      }

      const result = extractor.extractAssertionDetails(vitestAssertion)

      expect(result.assertion).toBeDefined()
      expect(result.assertion?.expected).toBe(10)
      expect(result.assertion?.actual).toBe(5)
      expect(result.assertion?.operator).toBe('toBe')
    })

    it('should handle complex object assertions', () => {
      const complexAssertion = {
        name: 'AssertionError',
        message: 'expected objects to match',
        expected: { name: 'John', age: 30 },
        actual: { name: 'Jane', age: 25 },
        operator: 'toEqual'
      }

      const result = extractor.extractAssertionDetails(complexAssertion)

      expect(result.assertion?.expected).toEqual({ name: 'John', age: 30 })
      expect(result.assertion?.actual).toEqual({ name: 'Jane', age: 25 })
      expect(result.assertion?.operator).toBe('toEqual')
    })

    it('should handle array assertions', () => {
      const arrayAssertion = {
        name: 'AssertionError',
        message: 'arrays do not match',
        expected: [1, 2, 3],
        actual: [1, 2],
        operator: 'toEqual'
      }

      const result = extractor.extractAssertionDetails(arrayAssertion)

      expect(result.assertion?.expected).toEqual([1, 2, 3])
      expect(result.assertion?.actual).toEqual([1, 2])
    })
  })

  describe('Error Type Detection', () => {
    it('should detect different error types correctly', () => {
      const typeError = new TypeError('Cannot read property of undefined')
      const typeResult = extractor.extract(typeError)
      expect(typeResult.type).toBe('TypeError')

      const rangeError = new RangeError('Index out of bounds')
      const rangeResult = extractor.extract(rangeError)
      expect(rangeResult.type).toBe('RangeError')

      const customError = { name: 'CustomError', message: 'Custom error occurred' }
      const customResult = extractor.extract(customError)
      expect(customResult.type).toBe('CustomError')
    })
  })

  describe('Integration with Vitest Errors', () => {
    it('should handle Vitest serialized errors', () => {
      const vitestError = {
        message: 'expected "foo" to be "bar"',
        name: 'AssertionError',
        nameStr: 'AssertionError',
        expected: 'bar',
        actual: 'foo',
        operator: 'strictEqual',
        stack: `AssertionError: expected "foo" to be "bar"
  at Context.<anonymous> (/src/string.test.ts:5:18)
  at processImmediate (node:internal/timers:471:21)`,
        stackStr: 'AssertionError: expected "foo" to be "bar"'
      }

      const result = extractor.extract(vitestError)

      expect(result.message).toBe('expected "foo" to be "bar"')
      expect(result.type).toBe('AssertionError')
      expect(result.expected).toBe('bar')
      expect(result.actual).toBe('foo')
      expect(result.lineNumber).toBe(5)
    })
  })

  describe('Configuration Options', () => {
    it('should respect includeSourceCode configuration', () => {
      const config: ErrorExtractionConfig = {
        includeSourceCode: false
      }
      const noSourceExtractor = new ErrorExtractor(config)

      const error = {
        message: 'Test failed',
        stack: 'Error: Test failed\n  at /src/test.ts:10:5'
      }

      const result = noSourceExtractor.extractWithContext(error)

      expect(result.context?.code).toBeUndefined()
      expect(result.lineNumber).toBe(10)
    })

    it('should use custom default values', () => {
      const config: ErrorExtractionConfig = {
        defaultErrorType: 'UnknownError',
        defaultErrorMessage: 'An error occurred'
      }
      const customExtractor = new ErrorExtractor(config)

      const result = customExtractor.extract({})

      expect(result.type).toBe('UnknownError')
      expect(result.message).toBe('An error occurred')
    })
  })
})
