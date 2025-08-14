import { describe, it, expect } from 'vitest'
import { SchemaProcessor } from './processor'
import { SanitizationStrategy } from '../sanitization/sanitizer'
import type { LLMReporterOutput } from '../types/schema'

describe('SchemaProcessor', () => {
  const validOutput: LLMReporterOutput = {
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
        test: 'test with <script>XSS</script>',
        file: '/test/file.ts',
        line: 1,
        status: 'passed'
      }
    ]
  }

  const invalidOutput = {
    summary: {
      total: 'not a number', // Invalid type
      passed: 1,
      failed: 0,
      skipped: 0,
      duration: 100,
      timestamp: '2024-01-15T10:30:00Z'
    }
  }

  describe('Default Processing', () => {
    it('should validate and sanitize by default', () => {
      const processor = new SchemaProcessor()
      const result = processor.process(validOutput)

      expect(result.success).toBe(true)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(true)
      expect(result.data).toBeDefined()

      // Check that sanitization occurred
      expect(result.data!.passed![0].test).not.toContain('<script>')
    })

    it('should fail on invalid input', () => {
      const processor = new SchemaProcessor()
      const result = processor.process(invalidOutput)

      expect(result.success).toBe(false)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })
  })

  describe('Validation Only', () => {
    it('should only validate when sanitize is false', () => {
      const processor = new SchemaProcessor()
      const result = processor.process(validOutput, { sanitize: false })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(false)
      expect(result.data).toBeDefined()

      // Check that sanitization did NOT occur
      expect(result.data!.passed![0].test).toContain('<script>')
    })

    it('should use validate convenience method', () => {
      const processor = new SchemaProcessor()
      const result = processor.validate(validOutput)

      expect(result.valid).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.passed![0].test).toContain('<script>')
    })
  })

  describe('Sanitization Only', () => {
    it('should only sanitize when validate is false', () => {
      const processor = new SchemaProcessor()
      const result = processor.process(validOutput, { validate: false })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(true)
      expect(result.data).toBeDefined()

      // Check that sanitization occurred
      expect(result.data!.passed![0].test).not.toContain('<script>')
    })

    it('should use sanitize convenience method', () => {
      const processor = new SchemaProcessor()
      const result = processor.sanitize(validOutput)

      expect(result).toBeDefined()
      expect(result.passed![0].test).not.toContain('<script>')
    })

    it('should handle sanitization errors gracefully', () => {
      const processor = new SchemaProcessor()
      // Force an error by passing null (which would only work if validation is skipped)
      const result = processor.process(null, { validate: false })

      expect(result.success).toBe(false)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })

  describe('No Processing', () => {
    it('should pass through when both validate and sanitize are false', () => {
      const processor = new SchemaProcessor()
      const result = processor.process(validOutput, { validate: false, sanitize: false })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(false)
      expect(result.data).toBe(validOutput)
    })
  })

  describe('Custom Configuration', () => {
    it('should use custom validation config', () => {
      const processor = new SchemaProcessor({
        validationConfig: { maxCodeLines: 1 }
      })

      const outputWithCode: LLMReporterOutput = {
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
                code: ['line1', 'line2'] // Exceeds maxCodeLines
              }
            }
          }
        ]
      }

      const result = processor.process(outputWithCode)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('should use custom sanitization config', () => {
      const processor = new SchemaProcessor({
        sanitizationConfig: { strategy: SanitizationStrategy.JSON }
      })

      const outputWithQuotes: LLMReporterOutput = {
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
            test: 'test with "quotes"',
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = processor.process(outputWithQuotes)

      expect(result.success).toBe(true)
      expect(result.data!.passed![0].test).toContain('\\"quotes\\"')
    })

    it('should allow updating configuration', () => {
      const processor = new SchemaProcessor()

      // Update to use JSON sanitization
      processor.updateSanitizationConfig({ strategy: SanitizationStrategy.JSON })

      const outputWithQuotes: LLMReporterOutput = {
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
            test: 'test with "quotes"',
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = processor.process(outputWithQuotes)

      expect(result.success).toBe(true)
      expect(result.data!.passed![0].test).toContain('\\"quotes\\"')
    })
  })

  describe('Constructor Defaults', () => {
    it('should respect constructor defaults for validate and sanitize', () => {
      const processor = new SchemaProcessor({ validate: false, sanitize: false })
      const result = processor.process(validOutput)

      expect(result.success).toBe(true)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(false)
      expect(result.data).toBe(validOutput)
    })

    it('should allow overriding constructor defaults', () => {
      const processor = new SchemaProcessor({ validate: false, sanitize: false })
      const result = processor.process(validOutput, { validate: true, sanitize: true })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(true)
      expect(result.data!.passed![0].test).not.toContain('<script>')
    })
  })
})
