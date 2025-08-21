/**
 * Tests for Pattern Matchers
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { StackTracePattern } from './StackTracePattern'
import { ErrorMessagePattern } from './ErrorMessagePattern'
import { ConsoleOutputPattern } from './ConsoleOutputPattern'
import { AssertionPattern } from './AssertionPattern'

describe('Pattern Matchers', () => {
  describe('StackTracePattern', () => {
    let pattern: StackTracePattern

    beforeEach(() => {
      pattern = new StackTracePattern()
    })

    it('should identify pattern type', () => {
      expect(pattern.type).toBe('stack-trace')
    })

    it('should match identical stack traces', () => {
      const trace = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)
        at Module._compile (module.js:653:30)`

      const result = pattern.match(trace, trace)
      
      expect(result.score).toBe(1)
      expect(result.level).toBe('exact')
    })

    it('should match similar stack traces with different line numbers', () => {
      const trace1 = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)
        at Module._compile (module.js:653:30)`
      
      const trace2 = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:12:5)
        at Module._compile (module.js:653:30)`

      const result = pattern.match(trace1, trace2)
      
      expect(result.score).toBeGreaterThan(0.8)
      expect(result.level).toBe('high')
    })

    it('should match stack traces with different file paths', () => {
      const trace1 = `Error: Test failed
        at Object.<anonymous> (/Users/john/project/src/test.ts:10:5)
        at Module._compile (module.js:653:30)`
      
      const trace2 = `Error: Test failed
        at Object.<anonymous> (/Users/jane/project/src/test.ts:10:5)
        at Module._compile (module.js:653:30)`

      const result = pattern.match(trace1, trace2)
      
      expect(result.score).toBeGreaterThan(0.5)
    })

    it('should not match completely different stack traces', () => {
      const trace1 = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)`
      
      const trace2 = `TypeError: Cannot read property
        at Array.forEach (<anonymous>)
        at processTicksAndRejections (internal/process/task_queues.js:97:5)`

      const result = pattern.match(trace1, trace2)
      
      expect(result.score).toBeLessThan(0.5)
      expect(result.level).toBe('low')
    })

    it('should extract signature from stack trace', () => {
      const trace = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)
        at Module._compile (module.js:653:30)`

      const signature = pattern.extractSignature(trace)
      
      expect(signature).toBeDefined()
      expect(signature).toContain('test.ts')
    })

    it('should normalize stack trace', () => {
      const trace = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)
        at Module._compile (module.js:653:30)`

      const normalized = pattern.normalize(trace)
      
      expect(normalized).toBeDefined()
      expect(normalized).toContain('at')
    })
  })

  describe('ErrorMessagePattern', () => {
    let pattern: ErrorMessagePattern

    beforeEach(() => {
      pattern = new ErrorMessagePattern()
    })

    it('should identify pattern type', () => {
      expect(pattern.type).toBe('error-message')
    })

    it('should match identical error messages', () => {
      const message = 'Cannot read property "name" of undefined'
      
      const result = pattern.match(message, message)
      
      expect(result.score).toBeCloseTo(1, 10)
      expect(result.level).toBe('exact')
    })

    it('should match similar error messages with different values', () => {
      const message1 = 'Cannot read property "name" of undefined'
      const message2 = 'Cannot read property "value" of undefined'

      const result = pattern.match(message1, message2)
      
      expect(result.score).toBeGreaterThan(0.7)
    })

    it('should match error messages with different numbers', () => {
      const message1 = 'Error: Expected 5 but got 10'
      const message2 = 'Error: Expected 3 but got 7'

      const result = pattern.match(message1, message2)
      
      expect(result.score).toBeGreaterThan(0.8)
    })

    it('should match error messages with different paths', () => {
      const message1 = 'File not found: /Users/john/file.txt'
      const message2 = 'File not found: /Users/jane/file.txt'

      const result = pattern.match(message1, message2)
      
      expect(result.score).toBeGreaterThan(0.7)
    })

    it('should not match completely different error messages', () => {
      const message1 = 'Cannot read property of undefined'
      const message2 = 'Network timeout occurred'

      const result = pattern.match(message1, message2)
      
      expect(result.score).toBeLessThan(0.5)
      expect(result.level).toBe('low')
    })

    it('should extract signature from error message', () => {
      const message = 'Cannot read property "name" of undefined'
      
      const signature = pattern.extractSignature(message)
      
      expect(signature).toBeDefined()
      expect(signature).toContain('cannot')
    })

    it('should normalize error message', () => {
      const message = 'Error occurred at line 42 in file /path/to/file.js'
      
      const normalized = pattern.normalize(message)
      
      expect(normalized).toContain('<NUM>')
      expect(normalized).toContain('<PATH>')
    })
  })

  describe('ConsoleOutputPattern', () => {
    let pattern: ConsoleOutputPattern

    beforeEach(() => {
      pattern = new ConsoleOutputPattern()
    })

    it('should identify pattern type', () => {
      expect(pattern.type).toBe('console-output')
    })

    it('should match identical console output', () => {
      const output = `[INFO] Starting test
[ERROR] Test failed
[DEBUG] Cleanup complete`

      const result = pattern.match(output, output)
      
      expect(result.score).toBeCloseTo(1, 10)
      expect(result.level).toBe('exact')
    })

    it('should match similar console output with different timestamps', () => {
      const output1 = `2024-01-01T10:00:00Z [INFO] Starting test
2024-01-01T10:00:01Z [ERROR] Test failed`
      
      const output2 = `2024-01-01T11:00:00Z [INFO] Starting test
2024-01-01T11:00:01Z [ERROR] Test failed`

      const result = pattern.match(output1, output2)
      
      // With different timestamps, the score will be lower
      expect(result.score).toBeGreaterThan(0.4)
      expect(result.level).toBe('low')
    })

    it('should match console output with different numbers', () => {
      const output1 = 'Processing item 1 of 100'
      const output2 = 'Processing item 5 of 100'

      const result = pattern.match(output1, output2)
      
      expect(result.score).toBeGreaterThan(0.7)
    })

    it('should extract signature from console output', () => {
      const output = `[ERROR] Test failed
[WARN] Memory usage high`

      const signature = pattern.extractSignature(output)
      
      expect(signature).toBeDefined()
      expect(signature.length).toBeGreaterThan(0)
      // The signature should contain type information
      expect(signature).toMatch(/error|warn|log/)
    })
  })

  describe('AssertionPattern', () => {
    let pattern: AssertionPattern

    beforeEach(() => {
      pattern = new AssertionPattern()
    })

    it('should identify pattern type', () => {
      expect(pattern.type).toBe('assertion')
    })

    it('should match identical assertions', () => {
      const assertion = 'expect(value).toBe(5)'
      
      const result = pattern.match(assertion, assertion)
      
      expect(result.score).toBe(1)
      expect(result.level).toBe('exact')
    })

    it('should match similar assertions with different values', () => {
      const assertion1 = 'expect(result).toBe(5)'
      const assertion2 = 'expect(result).toBe(10)'

      const result = pattern.match(assertion1, assertion2)
      
      expect(result.score).toBeGreaterThan(0.7)
    })

    it('should match assertions with different operators', () => {
      const assertion1 = 'expect(value).toBe(5)'
      const assertion2 = 'expect(value).toEqual(5)'

      const result = pattern.match(assertion1, assertion2)
      
      expect(result.score).toBeGreaterThan(0.6)
    })

    it('should match expected vs actual patterns', () => {
      const assertion1 = 'Expected: 5, Actual: 10'
      const assertion2 = 'Expected: 3, Actual: 7'

      const result = pattern.match(assertion1, assertion2)
      
      expect(result.score).toBeGreaterThan(0.8)
    })

    it('should not match different assertion types', () => {
      const assertion1 = 'expect(value).toBe(5)'
      const assertion2 = 'expect(fn).toThrow()'

      const result = pattern.match(assertion1, assertion2)
      
      expect(result.score).toBeLessThanOrEqual(0.51)
      expect(result.level).toBe('low')
    })

    it('should extract signature from assertion', () => {
      const assertion = 'expect(value).toBe(5)'
      
      const signature = pattern.extractSignature(assertion)
      
      expect(signature).toBeDefined()
      expect(signature).toContain('equality')
    })

    it('should normalize assertion', () => {
      const assertion = 'expect(value).toBe(42)'
      
      const normalized = pattern.normalize(assertion)
      
      expect(normalized).toContain('<NUM>')
    })
  })

  describe('Pattern Matching Integration', () => {
    it('should work with multiple patterns', () => {
      const stackPattern = new StackTracePattern()
      const errorPattern = new ErrorMessagePattern()
      
      const error1 = {
        message: 'Cannot read property "x" of undefined',
        stack: `Error: Cannot read property "x" of undefined
          at test.ts:10:5`
      }
      
      const error2 = {
        message: 'Cannot read property "y" of undefined',
        stack: `Error: Cannot read property "y" of undefined
          at test.ts:10:5`
      }

      const messageResult = errorPattern.match(error1.message, error2.message)
      const stackResult = stackPattern.match(error1.stack, error2.stack)
      
      expect(messageResult.score).toBeGreaterThan(0.7)
      expect(stackResult.score).toBeGreaterThan(0.8)
    })
  })
})