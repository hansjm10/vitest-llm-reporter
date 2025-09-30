import { describe, it, expect } from 'vitest'
import { JsonSanitizer } from './json-sanitizer.js'
import type { LLMReporterOutput } from '../types/schema.js'
import { getRuntimeEnvironmentSummary } from '../utils/runtime-environment.js'

describe('JsonSanitizer', () => {
  describe('Type Preservation', () => {
    it('should preserve primitive types in assertion values', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'type test',
            fileRelative: '/test.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'Type mismatch',
              type: 'AssertionError',
              assertion: {
                expected: 42,
                actual: true,
                expectedType: 'number',
                actualType: 'boolean',
                operator: 'toBe'
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const assertion = result.failures![0].error.assertion!

      // Numbers should remain numbers
      expect(assertion.expected).toBe(42)
      expect(typeof assertion.expected).toBe('number')

      // Booleans should remain booleans
      expect(assertion.actual).toBe(true)
      expect(typeof assertion.actual).toBe('boolean')

      // Type metadata should be preserved
      expect(assertion.expectedType).toBe('number')
      expect(assertion.actualType).toBe('boolean')
    })

    it('should preserve null values in assertions', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'null test',
            fileRelative: '/test.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'Null check',
              type: 'AssertionError',
              assertion: {
                expected: null,
                actual: 'not null',
                expectedType: 'null',
                actualType: 'string',
                operator: 'toBeNull'
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const assertion = result.failures![0].error.assertion!

      expect(assertion.expected).toBe(null)
      expect(assertion.actual).toBe('not null')
      expect(assertion.expectedType).toBe('null')
      expect(assertion.actualType).toBe('string')
    })

    it('should sanitize strings but preserve type', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'string test',
            fileRelative: '/test.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'String check',
              type: 'AssertionError',
              assertion: {
                expected: 'string with "quotes"',
                actual: 'string with\nnewline',
                expectedType: 'string',
                actualType: 'string',
                operator: 'toBe'
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const assertion = result.failures![0].error.assertion!

      // Strings should be escaped but remain strings
      expect(assertion.expected).toBe('string with \\"quotes\\"')
      expect(assertion.actual).toBe('string with\\nnewline')
      expect(typeof assertion.expected).toBe('string')
      expect(typeof assertion.actual).toBe('string')
    })
  })

  describe('JSON String Escaping', () => {
    it('should escape JSON special characters', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'test with "quotes" and \\backslash',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'Error with \n newline and \t tab',
              type: 'Error',
              stack: 'Stack with \r carriage return'
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      // Check that quotes are escaped
      expect(result.failures![0].test).toBe('test with \\"quotes\\" and \\\\backslash')
      // Check that newlines and tabs are escaped
      expect(result.failures![0].error.message).toBe('Error with \\n newline and \\t tab')
      // Check that carriage return is escaped (when stack is present)
      expect(result.failures![0].error.stack).toBe('Stack with \\r carriage return')
    })

    it('should escape control characters', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        passed: [
          {
            test: 'test with \x00 null and \x1f unit separator',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      // Control characters should be escaped as Unicode
      expect(result.passed![0].test).toContain('\\u0000')
      expect(result.passed![0].test).toContain('\\u001f')
    })

    it('should sanitize code arrays', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'test',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: [
                  'const x = "string with \\"quotes\\""',
                  'const y = `template ${literal}`',
                  'const z = "normal\\nstring"'
                ]
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      const sanitizedCode = result.failures![0].error.context!.code
      expect(sanitizedCode[0]).toBe('const x = \\"string with \\\\\\"quotes\\\\\\"\\"')
      expect(sanitizedCode[1]).toBe('const y = `template ${literal}`')
      expect(sanitizedCode[2]).toBe('const z = \\"normal\\\\nstring\\"')
    })
  })

  describe('File Path Sanitization', () => {
    it('should optionally sanitize file paths', () => {
      const sanitizer = new JsonSanitizer({ sanitizeFilePaths: true })

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        passed: [
          {
            test: 'test',
            fileRelative: 'Users/johndoe/projects/test.ts',
            startLine: 1,
            endLine: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      expect(result.passed![0].fileRelative).toBe('Users/***/projects/test.ts')
    })

    it('should not sanitize file paths by default', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        passed: [
          {
            test: 'test',
            fileRelative: 'Users/johndoe/projects/test.ts',
            startLine: 1,
            endLine: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      expect(result.passed![0].fileRelative).toBe('Users/johndoe/projects/test.ts')
    })
  })

  describe('Assertion Value Sanitization', () => {
    it('should sanitize nested assertion values', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'test',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'error',
              type: 'Error',
              assertion: {
                expected: {
                  value: 'expected "value"',
                  nested: {
                    field: 'with\nnewline'
                  }
                },
                actual: ['array', 'with', '"quotes"']
              },
              context: {
                code: []
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      const assertion = result.failures![0].error.assertion!
      expect((assertion.expected as any).value).toBe('expected \\"value\\"')
      expect((assertion.expected as any).nested.field).toBe('with\\nnewline')
      expect((assertion.actual as string[])[2]).toBe('\\"quotes\\"')
    })

    it('should handle max depth for nested objects', () => {
      const sanitizer = new JsonSanitizer({ maxDepth: 2 })

      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: 'too deep'
            }
          }
        }
      }

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'test',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'error',
              type: 'Error',
              assertion: {
                expected: deeplyNested,
                actual: null
              },
              context: {
                code: []
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const expected = result.failures![0].error.assertion!.expected as any
      expect(expected.level1.level2.level3).toBe('[Max depth exceeded]')
    })
  })

  describe('Suite Hierarchy', () => {
    it('should sanitize suite names', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'test',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            suite: ['Parent "Suite"', 'Child\\Suite'],
            error: {
              message: 'error',
              type: 'Error'
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      expect(result.failures![0].suite![0]).toBe('Parent \\"Suite\\"')
      expect(result.failures![0].suite![1]).toBe('Child\\\\Suite')
    })
  })

  describe('Error Context', () => {
    it('should preserve numeric line and column numbers', () => {
      const sanitizer = new JsonSanitizer()

      const input: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'test',
            fileRelative: '/test/file.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: ['line 1'],
                lineNumber: 42,
                columnNumber: 15
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const context = result.failures![0].error.context!
      expect(context.lineNumber).toBe(42)
      expect(context.columnNumber).toBe(15)
    })
  })
})
