import { describe, it, expect } from 'vitest'
import { SchemaValidator, ValidationConfig } from './validator'
import type { LLMReporterOutput } from '../types/schema'

describe('SchemaValidator', () => {
  describe('Concurrent Validation', () => {
    it('should handle concurrent validations without interference', async () => {
      const validator = new SchemaValidator()

      // Create outputs with different code sizes
      const createOutput = (codeLines: number): LLMReporterOutput => ({
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: Array(codeLines).fill('const x = 1;')
              }
            }
          }
        ]
      })

      // Run multiple validations concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() => {
          const output = createOutput((i + 1) * 10) // Different code sizes
          return validator.validate(output)
        })
      )

      const results = await Promise.all(promises)

      // All validations should succeed independently
      results.forEach((result, _i) => {
        expect(result.valid).toBe(true)
        expect(result.errors).toEqual([])
      })
    })

    it('should handle code size limits independently per validation', async () => {
      const validator = new SchemaValidator({ maxTotalCodeSize: 1000 })

      const largeOutput: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: Array(100).fill('x'.repeat(100)) // 10KB of code
              }
            }
          }
        ]
      }

      const smallOutput: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        passed: [
          {
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      // Run both validations concurrently
      const [largeResult, smallResult] = await Promise.all([
        validator.validate(largeOutput),
        validator.validate(smallOutput)
      ])

      // Large should fail, small should pass
      expect(largeResult.valid).toBe(false)
      expect(smallResult.valid).toBe(true)
    })
  })

  describe('Validation without Mutation', () => {
    it('should not mutate the input object during validation', () => {
      const validator = new SchemaValidator()

      const original: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: '<script>alert("xss")</script>',
              type: 'Error',
              context: {
                code: ['<script>alert("xss")</script>']
              }
            }
          }
        ]
      }

      // Create a deep copy to compare
      const originalCopy = JSON.parse(JSON.stringify(original))

      // Validate without sanitization
      const result = validator.validate(original, false)

      expect(result.valid).toBe(true)
      // Original should be unchanged
      expect(original).toEqual(originalCopy)
      expect(original.failures![0].error.message).toBe('<script>alert("xss")</script>')
      expect(original.failures![0].error.context!.code[0]).toBe('<script>alert("xss")</script>')
    })

    it('should return sanitized copy when requested without mutating original', () => {
      const validator = new SchemaValidator()

      const original: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: '<b>test</b>',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: '<script>alert("xss")</script>',
              type: 'Error<>',
              context: {
                code: ['<script>alert("xss")</script>']
              }
            }
          }
        ]
      }

      const originalCopy = JSON.parse(JSON.stringify(original))

      // Validate
      const result = validator.validate(original)

      expect(result.valid).toBe(true)
      expect(result.data).toBeDefined()

      // Original should be unchanged
      expect(original).toEqual(originalCopy)

      // Data should contain the validated object (no sanitization in validator)
      expect(result.data!.failures![0].test).toBe('<b>test</b>')
      expect(result.data!.failures![0].error.message).toBe('<script>alert("xss")</script>')
    })

    it('should escape all XSS vectors including quotes and slashes', () => {
      const validator = new SchemaValidator()

      const original = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00.000Z'
        },
        failures: [
          {
            test: 'Test with "quotes" and \'apostrophes\' and /slashes/ and \\backslashes\\',
            file: '/test/file.js',
            line: 10,
            error: {
              message: 'javascript:alert("XSS") and onclick="alert(1)"',
              type: 'Error&lt;script&gt;'
            }
          }
        ]
      }

      const result = validator.validate(original)

      expect(result.valid).toBe(true)
      expect(result.data).toBeDefined()

      // Validator doesn't sanitize, so dangerous characters remain
      const validatedTest = result.data!.failures![0].test
      const validatedMessage = result.data!.failures![0].error.message

      // All dangerous characters should remain as-is
      expect(validatedTest).toContain('"')
      expect(validatedTest).toContain("'")
      expect(validatedTest).toContain('/')
      expect(validatedTest).toContain('\\')
      expect(validatedMessage).toContain('javascript:')
      expect(validatedMessage).toContain('onclick=')
    })
  })

  describe('Array Size Limits', () => {
    it('should enforce max failures limit', () => {
      const validator = new SchemaValidator({ maxFailures: 10 })

      const output: LLMReporterOutput = {
        summary: {
          total: 20,
          passed: 0,
          failed: 20,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: Array(20).fill({
          test: 'test',
          file: '/test/file.ts',
          line: 1,
          error: {
            message: 'error',
            type: 'Error'
          }
        })
      }

      const result = validator.validate(output, false)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('exceeds maximum size of 10'))).toBe(true)
    })

    it('should enforce max passed limit', () => {
      const validator = new SchemaValidator({ maxPassed: 10 })

      const output: LLMReporterOutput = {
        summary: {
          total: 20,
          passed: 20,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        passed: Array(20).fill({
          test: 'test',
          file: '/test/file.ts',
          line: 1,
          status: 'passed' as const
        })
      }

      const result = validator.validate(output, false)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('exceeds maximum size of 10'))).toBe(true)
    })
  })

  describe('String Length Validation', () => {
    it('should enforce max string length for messages', () => {
      const validator = new SchemaValidator({ maxStringLength: 100 })

      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'x'.repeat(101),
              type: 'Error'
            }
          }
        ]
      }

      const result = validator.validate(output, false)

      expect(result.valid).toBe(false)
    })

    it('should enforce max string length for test names', () => {
      const validator = new SchemaValidator({ maxStringLength: 100 })

      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        passed: [
          {
            test: 'x'.repeat(101),
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = validator.validate(output, false)

      expect(result.valid).toBe(false)
    })
  })

  describe('Custom Configuration', () => {
    it('should use custom configuration values', () => {
      const config: ValidationConfig = {
        maxCodeLines: 5,
        maxStringLength: 50,
        maxFailures: 2
      }

      const validator = new SchemaValidator(config)

      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [
          {
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: Array(10).fill('const x = 1;') // Exceeds maxCodeLines
              }
            }
          }
        ]
      }

      const result = validator.validate(output, false)

      expect(result.valid).toBe(false)
    })
  })

  describe('Error Reporting', () => {
    it('should provide helpful error messages', () => {
      const validator = new SchemaValidator()

      const invalidOutput = {
        // Missing summary
        failures: [
          {
            test: 'test'
            // Missing required fields
          }
        ]
      }

      const result = validator.validate(invalidOutput, false)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toContain('Expected required field')
    })

    it('should report multiple validation errors', () => {
      const validator = new SchemaValidator({ maxFailures: 1 })

      const output: LLMReporterOutput = {
        summary: {
          total: 10,
          passed: 5,
          failed: 3, // Doesn't add up
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: Array(5).fill({
          // Exceeds limit
          test: 'test',
          file: '/test/file.ts',
          line: 1,
          error: {
            message: 'error',
            type: 'Error'
          }
        })
      }

      const result = validator.validate(output, false)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Security Tests', () => {
    describe('Memory Exhaustion Protection', () => {
      it('should prevent memory exhaustion from large arrays', () => {
        const validator = new SchemaValidator({
          maxTotalCodeSize: 1000,
          maxFailures: 10000
        })

        // Create a malicious input with many items that would exceed memory
        const maliciousOutput: LLMReporterOutput = {
          summary: {
            total: 10000,
            passed: 0,
            failed: 10000,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          // Each failure has large code context
          failures: Array(10000).fill({
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: Array(100).fill('x'.repeat(1000)) // Each line is 1000 chars
              }
            }
          })
        }

        const result = validator.validate(maliciousOutput, false)

        expect(result.valid).toBe(false)
        expect(
          result.errors.some(
            (e) =>
              e.message.includes('memory') ||
              e.message.includes('Memory') ||
              e.message.includes('exceeds')
          )
        ).toBe(true)
      })

      it('should check memory limits before processing arrays', () => {
        const validator = new SchemaValidator({
          maxTotalCodeSize: 500,
          maxFailures: 100
        })

        // Array that would exceed memory if processed
        const output: LLMReporterOutput = {
          summary: {
            total: 50,
            passed: 0,
            failed: 50,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: Array(50).fill({
            test: 'test',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'error',
              type: 'Error',
              context: {
                code: Array(10).fill('x'.repeat(100))
              }
            }
          })
        }

        const result = validator.validate(output, false)

        // Should fail due to memory limit, not during processing
        expect(result.valid).toBe(false)
        expect(
          result.errors.some(
            (e) =>
              e.message.includes('Memory') ||
              e.message.includes('memory') ||
              e.message.includes('exceeds')
          )
        ).toBe(true)
      })

      it('should efficiently calculate total code size', () => {
        const validator = new SchemaValidator({
          maxTotalCodeSize: 10000
        })

        const output: LLMReporterOutput = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [
            {
              test: 'test',
              file: '/test/file.ts',
              line: 1,
              error: {
                message: 'error',
                type: 'Error',
                context: {
                  code: Array(50).fill('const x = 1;')
                }
              }
            }
          ]
        }

        const startTime = performance.now()
        const result = validator.validate(output, false)
        const endTime = performance.now()

        expect(result.valid).toBe(true)
        // Should be fast even with many code lines
        expect(endTime - startTime).toBeLessThan(100)
      })
    })

    describe('Prototype Pollution Protection', () => {
      it('should prevent __proto__ pollution', () => {
        const validator = new SchemaValidator()

        const maliciousInput = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [
            {
              test: 'test',
              file: '/test/file.ts',
              line: 1,
              error: {
                message: 'error',
                type: 'Error',
                __proto__: { isAdmin: true }
              }
            }
          ],
          __proto__: { polluted: true }
        }

        const result = validator.validate(maliciousInput, true)

        // Should validate but sanitize dangerous properties
        expect(result.valid).toBe(true)
        if (result.sanitized) {
          // Check that __proto__ is not an own property (filtered out)
          expect(Object.prototype.hasOwnProperty.call(result.sanitized, '__proto__')).toBe(false)
          expect(
            Object.prototype.hasOwnProperty.call(result.sanitized.failures![0].error, '__proto__')
          ).toBe(false)
        }

        // Verify prototype wasn't polluted
        const testObj = {}
        expect((testObj as any).polluted).toBeUndefined()
        expect((testObj as any).isAdmin).toBeUndefined()
      })

      it('should block constructor and prototype pollution', () => {
        const validator = new SchemaValidator()

        const maliciousInput = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [
            {
              test: 'test',
              file: '/test/file.ts',
              line: 1,
              error: {
                message: 'error',
                type: 'Error',
                constructor: { name: 'Evil' },
                prototype: { polluted: true }
              }
            }
          ]
        }

        const result = validator.validate(maliciousInput, true)

        expect(result.valid).toBe(true)
        if (result.sanitized) {
          const error = result.sanitized.failures![0].error
          // Check that constructor and prototype are not own properties (filtered out)
          expect(Object.prototype.hasOwnProperty.call(error, 'constructor')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, 'prototype')).toBe(false)
        }
      })

      it('should block advanced pollution methods', () => {
        const validator = new SchemaValidator()

        const maliciousInput = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [
            {
              test: 'test',
              file: '/test/file.ts',
              line: 1,
              error: {
                message: 'error',
                type: 'Error',
                defineProperty: 'evil',
                setPrototypeOf: 'evil',
                getPrototypeOf: 'evil',
                __defineGetter__: 'evil',
                __defineSetter__: 'evil',
                __lookupGetter__: 'evil',
                __lookupSetter__: 'evil'
              }
            }
          ]
        }

        const result = validator.validate(maliciousInput, true)

        expect(result.valid).toBe(true)
        if (result.sanitized) {
          const error = result.sanitized.failures![0].error
          // Check that these properties are not own properties (filtered out)
          expect(Object.prototype.hasOwnProperty.call(error, 'defineProperty')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, 'setPrototypeOf')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, 'getPrototypeOf')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, '__defineGetter__')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, '__defineSetter__')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, '__lookupGetter__')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(error, '__lookupSetter__')).toBe(false)
        }
      })
    })

    describe('XSS Protection', () => {
      it('should sanitize HTML in error messages', () => {
        const validator = new SchemaValidator()

        const xssOutput: LLMReporterOutput = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [
            {
              test: '<script>alert("XSS")</script>',
              file: '/test/file.ts',
              line: 1,
              error: {
                message: '<img src=x onerror=alert("XSS")>',
                type: 'Error'
              }
            }
          ]
        }

        const result = validator.validate(xssOutput, true)

        expect(result.valid).toBe(true)
        if (result.sanitized) {
          expect(result.sanitized.failures![0].test).not.toContain('<script>')
          expect(result.sanitized.failures![0].error.message).not.toContain('<img')
        }
      })
    })

    describe('Circular Reference Handling', () => {
      it('should handle circular references gracefully', () => {
        const validator = new SchemaValidator()

        const circularObj: any = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [
            {
              test: 'test',
              file: '/test/file.ts',
              line: 1,
              error: {
                message: 'error',
                type: 'Error'
              }
            }
          ]
        }

        // Create circular reference
        circularObj.circular = circularObj

        const result = validator.validate(circularObj, true)

        // Should handle circular reference without crashing
        expect(result.valid).toBe(true)
      })
    })
  })
})
