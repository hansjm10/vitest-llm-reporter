import { describe, it, expect } from 'vitest'
import type {
  LLMReporterOutput,
  TestSummary,
  TestFailure,
  TestResult,
  ErrorContext
} from './schema'
import { validateSchema, isValidTestSummary, isValidTestFailure } from './schema'

describe('LLM Reporter Schema', () => {
  describe('TestSummary validation', () => {
    it('should validate a valid test summary', () => {
      const summary: TestSummary = {
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 1234,
        timestamp: '2024-01-15T10:30:00Z'
      }
      
      expect(isValidTestSummary(summary)).toBe(true)
    })

    it('should reject summary with missing required fields', () => {
      const invalidSummary = {
        total: 10,
        passed: 8,
        // missing failed, duration, timestamp
      }
      
      expect(isValidTestSummary(invalidSummary as any)).toBe(false)
    })

    it('should reject summary with negative values', () => {
      const invalidSummary: TestSummary = {
        total: -1,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 1234,
        timestamp: '2024-01-15T10:30:00Z'
      }
      
      expect(isValidTestSummary(invalidSummary)).toBe(false)
    })

    it('should validate that total equals sum of passed, failed, and skipped', () => {
      const invalidSummary: TestSummary = {
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 1, // sum is 11, not 10
        duration: 1234,
        timestamp: '2024-01-15T10:30:00Z'
      }
      
      expect(isValidTestSummary(invalidSummary)).toBe(false)
    })
  })

  describe('TestFailure validation', () => {
    it('should validate a complete test failure', () => {
      const failure: TestFailure = {
        test: 'should calculate sum correctly',
        file: '/src/math.test.ts',
        line: 15,
        error: {
          message: 'Expected 5 but received 4',
          type: 'AssertionError',
          stack: 'Error: Expected 5 but received 4\n    at /src/math.test.ts:15:12',
          context: {
            code: [
              '13: function testSum() {',
              '14:   const result = sum(2, 2);',
              '15:   expect(result).toBe(5);',
              '16:   return result;',
              '17: }'
            ],
            expected: 5,
            actual: 4,
            lineNumber: 15,
            columnNumber: 12
          }
        }
      }
      
      expect(isValidTestFailure(failure)).toBe(true)
    })

    it('should validate failure with minimal required fields', () => {
      const minimalFailure: TestFailure = {
        test: 'test name',
        file: '/path/to/test.ts',
        line: 1,
        error: {
          message: 'Error message',
          type: 'Error'
        }
      }
      
      expect(isValidTestFailure(minimalFailure)).toBe(true)
    })

    it('should reject failure without required fields', () => {
      const invalidFailure = {
        test: 'test name',
        // missing file, line, error
      }
      
      expect(isValidTestFailure(invalidFailure as any)).toBe(false)
    })
  })

  describe('Complete LLMReporterOutput validation', () => {
    it('should validate empty test results', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          timestamp: '2024-01-15T10:30:00Z'
        }
      }
      
      expect(validateSchema(output)).toBe(true)
    })

    it('should validate output with only failures', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1234,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'should calculate tax correctly',
            file: '/src/tax.test.ts',
            line: 45,
            error: {
              message: 'Expected 105.50 but got 105.00',
              type: 'AssertionError',
              context: {
                code: [
                  '44: const price = 100;',
                  '45: expect(calculateTax(price)).toBe(105.50);',
                  '46: // Tax should be 5.5%'
                ],
                expected: 105.50,
                actual: 105.00,
                lineNumber: 45
              }
            }
          }
        ]
      }
      
      expect(validateSchema(output)).toBe(true)
    })

    it('should validate output with passed tests in verbose mode', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        passed: [
          {
            test: 'should add numbers',
            file: '/src/math.test.ts',
            line: 10,
            duration: 50,
            status: 'passed'
          }
        ]
      }
      
      expect(validateSchema(output)).toBe(true)
    })

    it('should validate output with nested suite structure', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 5,
          passed: 3,
          failed: 1,
          skipped: 1,
          duration: 500,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'Math > Calculator > should multiply correctly',
            file: '/src/calculator.test.ts',
            line: 25,
            suite: ['Math', 'Calculator'],
            error: {
              message: 'Expected 20 but got 21',
              type: 'AssertionError'
            }
          }
        ]
      }
      
      expect(validateSchema(output)).toBe(true)
    })

    it('should reject output with invalid summary', () => {
      const output = {
        summary: {
          total: 'not a number', // invalid type
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          timestamp: '2024-01-15T10:30:00Z'
        }
      }
      
      expect(validateSchema(output as any)).toBe(false)
    })

    it('should handle large test suites efficiently', () => {
      const failures: TestFailure[] = Array.from({ length: 100 }, (_, i) => ({
        test: `test ${i}`,
        file: `/src/test${i}.test.ts`,
        line: i + 1,
        error: {
          message: `Error in test ${i}`,
          type: 'Error'
        }
      }))

      const output: LLMReporterOutput = {
        summary: {
          total: 1000,
          passed: 900,
          failed: 100,
          skipped: 0,
          duration: 5000,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures
      }
      
      expect(validateSchema(output)).toBe(true)
      
      // Verify token efficiency - serialized size should be reasonable
      const serialized = JSON.stringify(output)
      expect(serialized.length).toBeLessThan(20000) // Reasonable size for 100 failures
    })
  })

  describe('Schema optimization for LLM consumption', () => {
    it('should use concise field names for token efficiency', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1234,
          timestamp: '2024-01-15T10:30:00Z'
        }
      }
      
      const serialized = JSON.stringify(output)
      // Check that field names are concise
      expect(serialized).toContain('"total"')
      expect(serialized).toContain('"passed"')
      expect(serialized).toContain('"failed"')
      expect(serialized).not.toContain('"totalTestCount"') // Avoid verbose names
      expect(serialized).not.toContain('"numberOfPassedTests"')
    })

    it('should exclude null/undefined optional fields to save tokens', () => {
      const failure: TestFailure = {
        test: 'test name',
        file: '/test.ts',
        line: 1,
        error: {
          message: 'error',
          type: 'Error'
          // no stack, no context - should not appear in output
        }
      }
      
      const serialized = JSON.stringify(failure)
      expect(serialized).not.toContain('null')
      expect(serialized).not.toContain('undefined')
      expect(serialized).not.toContain('"stack":')
      expect(serialized).not.toContain('"context":')
    })
  })
})