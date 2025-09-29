import { describe, it, expect } from 'vitest'
import type { LLMReporterOutput, TestSummary, TestFailure } from './schema.js'
import { SchemaValidator } from '../validation/validator.js'
import {
  isValidTestSummary,
  isValidTestFailure,
  isValidTestResult
} from '../test-utils/validation-helpers.js'
import { getRuntimeEnvironmentSummary } from '../utils/runtime-environment.js'
import { prepareForSnapshot } from '../test-utils/snapshot-helpers.js'

describe('LLM Reporter Schema', () => {
  const validator = new SchemaValidator()
  describe('TestSummary validation', () => {
    it('should validate a valid test summary', () => {
      const summary: TestSummary = {
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 1234,
        timestamp: '2024-01-15T10:30:00Z',
        environment: getRuntimeEnvironmentSummary()
      }

      expect(isValidTestSummary(summary)).toBe(true)
    })

    it('should reject summary with missing required fields', () => {
      const invalidSummary = {
        total: 10,
        passed: 8
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
        timestamp: '2024-01-15T10:30:00Z',
        environment: getRuntimeEnvironmentSummary()
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
        timestamp: '2024-01-15T10:30:00Z',
        environment: getRuntimeEnvironmentSummary()
      }

      expect(isValidTestSummary(invalidSummary)).toBe(false)
    })
  })

  describe('TestFailure validation', () => {
    it('should validate a complete test failure', () => {
      const failure: TestFailure = {
        test: 'should calculate sum correctly',
        fileRelative: '/src/math.test.ts',
        startLine: 15,
        endLine: 15,
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
        fileRelative: '/test/example.test.ts',
        startLine: 1,
        endLine: 1,
        error: {
          message: 'Error message',
          type: 'Error'
        }
      }

      expect(isValidTestFailure(minimalFailure)).toBe(true)
    })

    it('should reject failure without required fields', () => {
      const invalidFailure = {
        test: 'test name'
        // missing file, line, error
      }

      expect(isValidTestFailure(invalidFailure as any)).toBe(false)
    })

    it('should reject TestResult with invalid line number', () => {
      const invalidResult = {
        test: 'test name',
        fileRelative: '/test.ts',
        line: 0, // Invalid: should be >= 1
        status: 'passed'
      }
      expect(isValidTestResult(invalidResult)).toBe(false)

      const negativeLineResult = {
        test: 'test name',
        fileRelative: '/test.ts',
        line: -5, // Invalid: should be >= 1
        status: 'passed'
      }
      expect(isValidTestResult(negativeLineResult)).toBe(false)
    })

    it('should reject TestFailure with invalid line number', () => {
      const invalidFailure = {
        test: 'test name',
        fileRelative: '/test.ts',
        line: 0, // Invalid: should be >= 1
        error: {
          message: 'test failed',
          type: 'Error'
        }
      }
      expect(isValidTestFailure(invalidFailure)).toBe(false)
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
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        }
      }

      expect(validator.validate(output).valid).toBe(true)
    })

    it('should validate output with only failures', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1234,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'should calculate tax correctly',
            fileRelative: '/src/tax.test.ts',
            startLine: 45,
            endLine: 45,
            error: {
              message: 'Expected 105.50 but got 105.00',
              type: 'AssertionError',
              context: {
                code: [
                  '44: const price = 100;',
                  '45: expect(calculateTax(price)).toBe(105.50);',
                  '46: // Tax should be 5.5%'
                ],
                lineNumber: 45
              }
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })

    it('should validate output with only failures (snapshot)', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1234,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'should calculate tax correctly',
            fileRelative: '/src/tax.test.ts',
            startLine: 45,
            endLine: 45,
            error: {
              message: 'Expected 105.50 but got 105.00',
              type: 'AssertionError',
              context: {
                code: [
                  '44: const price = 100;',
                  '45: expect(calculateTax(price)).toBe(105.50);',
                  '46: // Tax should be 5.5%'
                ],
                lineNumber: 45
              }
            }
          }
        ]
      }

      const normalized = prepareForSnapshot(output, { stripConsole: true })
      expect(normalized).toMatchInlineSnapshot(`
        {
          "failures": [
            {
              "duration": undefined,
              "endLine": 45,
              "error": {
                "context": {
                  "code": [
                    "44: const price = 100;",
                    "45: expect(calculateTax(price)).toBe(105.50);",
                    "46: // Tax should be 5.5%",
                  ],
                  "lineNumber": 45,
                },
                "message": "Expected 105.50 but got 105.00",
                "stackFrames": undefined,
                "type": "AssertionError",
              },
              "fileRelative": "src/tax.test.ts",
              "startLine": 45,
              "test": "should calculate tax correctly",
            },
          ],
          "summary": {
            "duration": 0,
            "environment": {
              "ci": false,
              "node": {
                "runtime": "node",
                "version": "v18.0.0",
              },
              "os": {
                "arch": "x64",
                "platform": "linux",
                "release": "5.0.0",
                "version": "5.0.0",
              },
              "packageManager": "npm@9.0.0",
              "vitest": {
                "version": "3.0.0",
              },
            },
            "failed": 2,
            "passed": 8,
            "skipped": 0,
            "timestamp": "2024-01-01T00:00:00.000Z",
            "total": 10,
          },
        }
      `)
    })

    it('should validate output with passed tests in verbose mode', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        passed: [
          {
            test: 'should add numbers',
            fileRelative: '/src/math.test.ts',
            startLine: 10,
            endLine: 10,
            duration: 50,
            status: 'passed'
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })

    it('should validate output with nested suite structure', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 5,
          passed: 3,
          failed: 1,
          skipped: 1,
          duration: 500,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'Math > Calculator > should multiply correctly',
            fileRelative: '/src/calculator.test.ts',
            startLine: 25,
            endLine: 25,
            suite: ['Math', 'Calculator'],
            error: {
              message: 'Expected 20 but got 21',
              type: 'AssertionError'
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })

    it('should reject output with invalid summary', () => {
      const output = {
        summary: {
          total: 'not a number', // invalid type
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        }
      }

      expect(validator.validate(output as any).valid).toBe(false)
    })

    it('should handle large test suites efficiently', () => {
      const failures: TestFailure[] = Array.from({ length: 100 }, (_, i) => ({
        test: `test ${i}`,
        fileRelative: `/src/test${i}.test.ts`,
        startLine: i + 1,
        endLine: i + 10,
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
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures
      }

      expect(validator.validate(output).valid).toBe(true)

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
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
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
        fileRelative: '/test.ts',
        startLine: 1,
        endLine: 1,
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
