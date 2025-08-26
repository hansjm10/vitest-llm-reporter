import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ContextExtractor } from './ContextExtractor.js'
import * as fs from 'node:fs'

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  realpathSync: vi.fn()
}))

// Mock PathValidator to bypass filesystem checks
vi.mock('../utils/path-validator', () => {
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

describe('ContextExtractor', () => {
  let extractor: ContextExtractor

  beforeEach(() => {
    extractor = new ContextExtractor()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Code Context Extraction', () => {
    it('should extract code context with default 3 lines before and after', () => {
      const mockFileContent = `function add(a, b) {
  return a + b
}

function testAdd() {
  const result = add(2, 2)
  expect(result).toBe(5) // This will fail
  console.log('Test completed')
}

export { add, testAdd }`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const context = extractor.extractCodeContext('/src/math.test.ts', 7, 20)

      expect(context).toBeDefined()
      expect(context?.code).toHaveLength(7) // 3 before + line + 3 after
      expect(context?.lineNumber).toBe(7)
      expect(context?.columnNumber).toBe(20)
      expect(context?.code[3]).toContain('expect(result).toBe(5)')
      expect(context?.code[3]).toContain('// <- failure')
    })

    it('should respect custom maxContextLines', () => {
      const mockFileContent = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const customExtractor = new ContextExtractor({ maxContextLines: 5 })
      const context = customExtractor.extractCodeContext('/test.ts', 10)

      expect(context?.code).toHaveLength(11) // 5 before + line + 5 after
      expect(context?.code[0]).toContain('Line 5')
      expect(context?.code[10]).toContain('Line 15')
    })

    it('should handle edge case at start of file', () => {
      const mockFileContent = `Line 1
Line 2
Line 3
Line 4
Line 5`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const context = extractor.extractCodeContext('/test.ts', 1)

      expect(context?.code).toHaveLength(4) // line 1 + 3 after
      expect(context?.code[0]).toContain('Line 1')
      expect(context?.code[0]).toContain('// <- failure')
    })

    it('should handle edge case at end of file', () => {
      const mockFileContent = `Line 1
Line 2
Line 3
Line 4
Line 5`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const context = extractor.extractCodeContext('/test.ts', 5)

      expect(context?.code).toHaveLength(4) // 3 before + line 5
      expect(context?.code[3]).toContain('Line 5')
      expect(context?.code[3]).toContain('// <- failure')
    })

    it('should return undefined for non-existent files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const context = extractor.extractCodeContext('/non-existent.ts', 10)

      expect(context).toBeUndefined()
    })

    it('should return undefined for invalid line numbers', () => {
      const mockFileContent = `Line 1
Line 2
Line 3`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const contextNegative = extractor.extractCodeContext('/test.ts', -1)
      expect(contextNegative).toBeUndefined()

      const contextTooLarge = extractor.extractCodeContext('/test.ts', 10)
      expect(contextTooLarge).toBeUndefined()
    })

    it('should handle file read errors gracefully', () => {
      const readError = new Error('Permission denied')

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw readError
      })

      const context = extractor.extractCodeContext('/protected.ts', 1)

      // Should return undefined when there's an error reading the file
      expect(context).toBeUndefined()

      // Reset the mock for next tests
      vi.mocked(fs.readFileSync).mockReset()
    })

    it('should include line numbers when configured', () => {
      const mockFileContent = `Line 1
Line 2
Line 3`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const context = extractor.extractCodeContext('/test.ts', 2)

      expect(context?.code[0]).toMatch(/^\s*1:\s+Line 1$/)
      expect(context?.code[1]).toMatch(/^\s*2:\s+Line 2.*failure/)
      expect(context?.code[2]).toMatch(/^\s*3:\s+Line 3$/)
    })

    it('should not include line numbers when disabled', () => {
      const mockFileContent = `Line 1
Line 2
Line 3`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const customExtractor = new ContextExtractor({ includeLineNumbers: false })
      const context = customExtractor.extractCodeContext('/test.ts', 2)

      expect(context?.code[0]).toBe('Line 1')
      expect(context?.code[1]).toContain('Line 2')
      expect(context?.code[1]).toContain('// <- failure')
      expect(context?.code[2]).toBe('Line 3')
    })
  })

  describe('Stack Trace Parsing', () => {
    it('should parse V8/Node.js style stack traces', () => {
      const stack = `Error: Test failed
  at testFunction (/Users/test/project/src/test.ts:10:15)
  at Object.<anonymous> (/Users/test/project/src/main.ts:20:5)
  at Module._compile (node:internal/modules/cjs/loader:1234:30)
  at Object.Module._extensions..js (node:internal/modules/cjs/loader:1289:10)`

      const frames = extractor.parseStackTrace(stack)

      expect(frames).toHaveLength(2) // node_modules filtered out
      expect(frames[0]).toEqual({
        file: '/Users/test/project/src/test.ts',
        line: 10,
        column: 15,
        function: 'testFunction'
      })
      expect(frames[1]).toEqual({
        file: '/Users/test/project/src/main.ts',
        line: 20,
        column: 5,
        function: 'Object.<anonymous>'
      })
    })

    it('should parse async function stack traces', () => {
      const stack = `Error: Async failed
  at async fetchData (/src/api.ts:15:10)
  at async processRequest (/src/handler.ts:25:8)
  at async Object.<anonymous> (/src/server.ts:100:5)`

      const frames = extractor.parseStackTrace(stack)

      expect(frames).toHaveLength(3)
      expect(frames[0].function).toBe('fetchData')
      expect(frames[1].function).toBe('processRequest')
    })

    it('should filter node_modules when configured', () => {
      const stack = `Error: Test error
  at userCode (/project/src/test.ts:10:5)
  at /project/node_modules/vitest/dist/runner.js:500:10
  at internal/process/task_queues:95:5
  at anotherUserCode (/project/src/helper.ts:20:15)`

      const frames = extractor.parseStackTrace(stack)

      expect(frames).toHaveLength(2)
      expect(frames[0].file).toBe('/project/src/test.ts')
      expect(frames[1].file).toBe('/project/src/helper.ts')
    })

    it('should not filter node_modules when disabled', () => {
      const customExtractor = new ContextExtractor({ filterNodeModules: false })

      const stack = `Error: Test error
  at userCode (/project/src/test.ts:10:5)
  at /project/node_modules/vitest/dist/runner.js:500:10`

      const frames = customExtractor.parseStackTrace(stack)

      expect(frames).toHaveLength(2)
      expect(frames[1].file).toContain('node_modules')
    })

    it('should handle V8 style stack traces exclusively', () => {
      const stack = `Error: Test failed
  at testFunction (/src/test.ts:10:15)
  at async processData (/src/processor.ts:20:8)
  at /src/main.ts:5:1`

      const frames = extractor.parseStackTrace(stack)

      expect(frames).toHaveLength(3)
      expect(frames[0]).toEqual({
        file: '/src/test.ts',
        line: 10,
        column: 15,
        function: 'testFunction'
      })
      expect(frames[1]).toEqual({
        file: '/src/processor.ts',
        line: 20,
        column: 8,
        function: 'processData'
      })
      expect(frames[2]).toEqual({
        file: '/src/main.ts',
        line: 5,
        column: 1
      })
    })

    it('should handle malformed stack traces gracefully', () => {
      const invalidStack = `This is not a valid stack trace
Just some random text
Without any file references`

      const frames = extractor.parseStackTrace(invalidStack)

      expect(frames).toEqual([])
    })

    it('should handle empty or undefined stack traces', () => {
      expect(extractor.parseStackTrace('')).toEqual([])
      expect(extractor.parseStackTrace(undefined as any)).toEqual([])
    })

    it('should clean file paths correctly', () => {
      const stack = `Error: Test
  at file:///Users/test/project/src/test.ts:10:5
  at (internal/modules/cjs/loader.js:1234:30)
  at Object.<anonymous> (/src/main.ts?cache=123:20:8)`

      const frames = extractor.parseStackTrace(stack)

      expect(frames[0].file).toBe('/Users/test/project/src/test.ts')
      expect(frames[1].file).toBe('/src/main.ts')
    })
  })

  describe('Full Context Extraction', () => {
    it('should combine stack parsing with code extraction', () => {
      const stack = `Error: Test failed
  at testFunction (/src/test.ts:10:15)
  at main (/src/main.ts:5:10)`

      // Create a file with enough lines (at least 13 lines to cover line 10 with context)
      const mockFileContent = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10 - Error here
Line 11
Line 12
Line 13
Line 14
Line 15`

      // Mock file system - return true for any path checking existence
      vi.mocked(fs.existsSync).mockReturnValue(true)
      // Mock readFileSync to return our mock content
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const result = extractor.extractFullContext(stack)

      expect(result.stackFrames).toHaveLength(2)
      expect(result.context).toBeDefined()
      expect(result.context?.lineNumber).toBe(10)
      expect(result.context?.columnNumber).toBe(15)
      // Check that the correct line is marked with failure indicator
      const failureLine = result.context?.code.find((line) => line.includes('Line 10'))
      expect(failureLine).toContain('// <- failure')
    })

    it('should use fallback when no stack frames found', () => {
      const mockFileContent = `Fallback line 1
Fallback line 2
Fallback line 3`

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const result = extractor.extractFullContext('Invalid stack', '/fallback.ts', 2)

      expect(result.stackFrames).toEqual([])
      expect(result.context).toBeDefined()
      expect(result.context?.lineNumber).toBe(2)
      expect(result.context?.code[1]).toContain('Fallback line 2')
    })
  })

  describe('Utility Methods', () => {
    it('should identify test files correctly', () => {
      expect(extractor.isTestFile('/src/math.test.ts')).toBe(true)
      expect(extractor.isTestFile('/src/utils.spec.js')).toBe(true)
      expect(extractor.isTestFile('/src/__tests__/helper.ts')).toBe(true)
      expect(extractor.isTestFile('/src/.test/config.js')).toBe(true)

      expect(extractor.isTestFile('/src/math.ts')).toBe(false)
      expect(extractor.isTestFile('/src/index.js')).toBe(false)
    })

    it('should get relative paths correctly', () => {
      const customExtractor = new ContextExtractor({ rootDir: '/project' })

      expect(customExtractor.getRelativePath('/project/src/test.ts')).toBe('src/test.ts')
      expect(customExtractor.getRelativePath('src/test.ts')).toBe('src/test.ts')
      expect(customExtractor.getRelativePath('/other/path/test.ts')).toBe('/other/path/test.ts')
    })

    it('should extract first relevant frame', () => {
      const stack = `Error: Test
  at node:internal/modules:100:5
  at userFunction (/src/test.ts:10:15)
  at main (/src/main.ts:5:10)`

      const frame = extractor.extractFirstRelevantFrame(stack)

      expect(frame).toBeDefined()
      expect(frame?.file).toBe('/src/test.ts')
      expect(frame?.function).toBe('userFunction')
    })
  })
})
