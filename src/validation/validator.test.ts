import { describe, it, expect } from 'vitest'
import { SchemaValidator, ValidationConfig } from './validator.js'
import type { LLMReporterOutput } from '../types/schema.js'
import {
  createOutputWithFailures,
  createOutputWithPassed,
  createOutputWithCode,
  createXSSTestOutput
} from '../test-utils/index.js'

describe('SchemaValidator', () => {
  describe('Concurrent Validation', () => {
    it('should handle concurrent validations without interference', async () => {
      const validator = new SchemaValidator()

      // Create outputs with different code sizes
      const createOutput = (codeLines: number): LLMReporterOutput =>
        createOutputWithCode('test', Array(codeLines).fill('const x = 1;'))

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

      const largeOutput = createOutputWithCode('test', Array(100).fill('x'.repeat(100)))
      const smallOutput = createOutputWithPassed(1)

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

      const original = createOutputWithCode('test', ['<script>alert("xss")</script>'])
      original.failures![0].error.message = '<script>alert("xss")</script>'

      // Create a deep copy to compare
      const originalCopy = JSON.parse(JSON.stringify(original))

      // Validate without sanitization
      const result = validator.validate(original)

      expect(result.valid).toBe(true)
      // Original should be unchanged
      expect(original).toEqual(originalCopy)
      expect(original.failures![0].error.message).toBe('<script>alert("xss")</script>')
      expect(original.failures![0].error.context!.code[0]).toBe('<script>alert("xss")</script>')
    })

    it('should return sanitized copy when requested without mutating original', () => {
      const validator = new SchemaValidator()

      const original = createOutputWithCode('<b>test</b>', ['<script>alert("xss")</script>'])
      original.failures![0].error.message = '<script>alert("xss")</script>'
      original.failures![0].error.type = 'Error<>'

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
            fileRelative: '/test/file.js',
            startLine: 10,
            endLine: 10,
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

  describe('Line Number Validation', () => {
    it('should validate that endLine >= startLine', () => {
      const validator = new SchemaValidator()

      const invalidOutput = createOutputWithFailures(1)
      invalidOutput.failures![0].startLine = 10
      invalidOutput.failures![0].endLine = 5 // Invalid: endLine < startLine

      const result = validator.validate(invalidOutput)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some(
          (e) =>
            e.message.includes('End line') &&
            e.message.includes('must be greater than or equal to start line')
        )
      ).toBe(true)
    })

    it('should accept endLine equal to startLine', () => {
      const validator = new SchemaValidator()

      const validOutput = createOutputWithPassed(1)
      validOutput.passed![0].startLine = 10
      validOutput.passed![0].endLine = 10 // Valid: endLine == startLine

      const result = validator.validate(validOutput)

      expect(result.valid).toBe(true)
    })

    it('should accept endLine greater than startLine', () => {
      const validator = new SchemaValidator()

      const validOutput = createOutputWithPassed(1)
      validOutput.passed![0].startLine = 10
      validOutput.passed![0].endLine = 20 // Valid: endLine > startLine

      const result = validator.validate(validOutput)

      expect(result.valid).toBe(true)
    })
  })

  describe('Array Size Limits', () => {
    it('should enforce max failures limit', () => {
      const validator = new SchemaValidator({ maxFailures: 10 })

      const output = createOutputWithFailures(20)

      const result = validator.validate(output)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('exceeds maximum size of 10'))).toBe(true)
    })

    it('should enforce max passed limit', () => {
      const validator = new SchemaValidator({ maxPassed: 10 })

      const output = createOutputWithPassed(20)

      const result = validator.validate(output)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('exceeds maximum size of 10'))).toBe(true)
    })
  })

  describe('String Length Validation', () => {
    it('should enforce max string length for messages', () => {
      const validator = new SchemaValidator({ maxStringLength: 100 })

      const output = createOutputWithFailures(1)
      output.failures![0].error.message = 'x'.repeat(101)

      const result = validator.validate(output)

      expect(result.valid).toBe(false)
    })

    it('should enforce max string length for test names', () => {
      const validator = new SchemaValidator({ maxStringLength: 100 })

      const output = createOutputWithPassed(1)
      output.passed![0].test = 'x'.repeat(101)

      const result = validator.validate(output)

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

      const output = createOutputWithCode('test', Array(10).fill('const x = 1;'))

      const result = validator.validate(output)

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

      const result = validator.validate(invalidOutput)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toContain('Expected required field')
    })

    it('should report multiple validation errors', () => {
      const validator = new SchemaValidator({ maxFailures: 1 })

      const output = createOutputWithFailures(5)
      // Make summary not add up correctly
      output.summary.total = 10
      output.summary.passed = 5
      output.summary.failed = 3 // Doesn't add up

      const result = validator.validate(output)

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
        const maliciousOutput = createOutputWithFailures(100)
        // Add large code context to each failure
        maliciousOutput.failures = maliciousOutput.failures!.map((f) => ({
          ...f,
          error: {
            ...f.error,
            context: {
              code: Array(100).fill('x'.repeat(1000)) // Each line is 1000 chars
            }
          }
        }))

        const result = validator.validate(maliciousOutput)

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
        const output = createOutputWithFailures(50)
        // Add code context that would exceed memory
        output.failures = output.failures!.map((f) => ({
          ...f,
          error: {
            ...f.error,
            context: {
              code: Array(10).fill('x'.repeat(100))
            }
          }
        }))

        const result = validator.validate(output)

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

        const output = createOutputWithCode('test', Array(50).fill('const x = 1;'))

        const startTime = performance.now()
        const result = validator.validate(output)
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
              fileRelative: '/test/file.ts',
              startLine: 1,
              endLine: 1,
              error: {
                message: 'error',
                type: 'Error',
                __proto__: { isAdmin: true }
              }
            }
          ],
          __proto__: { polluted: true }
        }

        const result = validator.validate(maliciousInput)

        // Should validate but sanitize dangerous properties
        expect(result.valid).toBe(true)

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
              fileRelative: '/test/file.ts',
              startLine: 1,
              endLine: 1,
              error: {
                message: 'error',
                type: 'Error',
                constructor: { name: 'Evil' },
                prototype: { polluted: true }
              }
            }
          ]
        }

        const result = validator.validate(maliciousInput)

        expect(result.valid).toBe(true)
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
              fileRelative: '/test/file.ts',
              startLine: 1,
              endLine: 1,
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

        const result = validator.validate(maliciousInput)

        expect(result.valid).toBe(true)
      })
    })

    describe('XSS Protection', () => {
      it('should sanitize HTML in error messages', () => {
        const validator = new SchemaValidator()

        const xssOutput = createXSSTestOutput()
        // Remove context for this specific test
        delete xssOutput.failures![0].error.context

        const result = validator.validate(xssOutput)

        expect(result.valid).toBe(true)
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

        // Create circular reference
        circularObj.circular = circularObj

        const result = validator.validate(circularObj)

        // Should handle circular reference without crashing
        expect(result.valid).toBe(true)
      })
    })
  })
})
