import { describe, it, expect } from 'vitest'
import { SchemaProcessor } from './processor.js'
import {
  createOutputWithPassed,
  createInvalidOutput,
  createOutputWithCode,
  createOutputWithFilePath
} from '../test-utils'

describe('SchemaProcessor', () => {
  // Create a valid output with special characters for testing sanitization
  const validOutput = (() => {
    const output = createOutputWithPassed(1)
    output.passed![0].test = 'test with "quotes" and <script>'
    return output
  })()

  const invalidOutput = createInvalidOutput('summary')

  describe('Default Processing', () => {
    it('should validate and sanitize by default', async () => {
      const processor = new SchemaProcessor()
      const result = await processor.process(validOutput)

      expect(result.success).toBe(true)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(true)
      expect(result.data).toBeDefined()

      // Check that JSON sanitization occurred (quotes escaped)
      expect(result.data!.passed![0].test).toBe('test with \\"quotes\\" and <script>')
    })

    it('should fail on invalid input', async () => {
      const processor = new SchemaProcessor()
      const result = await processor.process(invalidOutput)

      expect(result.success).toBe(false)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })
  })

  describe('Validation Only', () => {
    it('should only validate when sanitize is false', async () => {
      const processor = new SchemaProcessor()
      const result = await processor.process(validOutput, { sanitize: false })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(true)
      expect(result.sanitized).toBe(false)
      expect(result.data).toBeDefined()

      // Check that sanitization did NOT occur
      expect(result.data!.passed![0].test).toContain('"quotes"')
    })

    it('should use validate convenience method', () => {
      const processor = new SchemaProcessor()
      const result = processor.validate(validOutput)

      expect(result.valid).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.passed![0].test).toContain('"quotes"')
    })
  })

  describe('Sanitization Only', () => {
    it('should only sanitize when validate is false', async () => {
      const processor = new SchemaProcessor()
      const result = await processor.process(validOutput, { validate: false })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(true)
      expect(result.data).toBeDefined()

      // Check that JSON sanitization occurred
      expect(result.data!.passed![0].test).toBe('test with \\"quotes\\" and <script>')
    })

    it('should use sanitize convenience method', () => {
      const processor = new SchemaProcessor()
      const result = processor.sanitize(validOutput)

      expect(result).toBeDefined()
      expect(result.passed![0].test).toBe('test with \\"quotes\\" and <script>')
    })

    it('should handle sanitization errors gracefully', async () => {
      const processor = new SchemaProcessor()
      // Force an error by passing null (which would only work if validation is skipped)
      const result = await processor.process(null, { validate: false })

      expect(result.success).toBe(false)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })

  describe('No Processing', () => {
    it('should pass through when both validate and sanitize are false', async () => {
      const processor = new SchemaProcessor()
      const result = await processor.process(validOutput, { validate: false, sanitize: false })

      expect(result.success).toBe(true)
      expect(result.validated).toBe(false)
      expect(result.sanitized).toBe(false)
      expect(result.data).toBe(validOutput)
    })
  })

  describe('Custom Configuration', () => {
    it('should use custom validation config', async () => {
      const processor = new SchemaProcessor({
        validationConfig: { maxCodeLines: 1 }
      })

      const outputWithCode = createOutputWithCode('test', ['line 1', 'line 2'])

      const result = await processor.process(outputWithCode)

      expect(result.success).toBe(false)
      expect(result.validated).toBe(true)
      expect(result.errors).toBeDefined()
    })

    it('should use custom sanitization config', async () => {
      const processor = new SchemaProcessor({
        sanitizationConfig: { sanitizeFilePaths: true }
      })

      const output = (() => {
        const o = createOutputWithFilePath('/Users/johndoe/test/file.ts')
        o.passed![0].test = 'test with "quotes"'
        return o
      })()

      const result = await processor.process(output)

      expect(result.success).toBe(true)
      // Should escape quotes for JSON
      expect(result.data!.passed![0].test).toBe('test with \\"quotes\\"')
      // Should sanitize file path
      expect(result.data!.passed![0].file).toBe('/Users/***/test/file.ts')
    })
  })

  describe('Configuration Updates', () => {
    it('should update validation config', async () => {
      const processor = new SchemaProcessor()

      // First attempt with default config should pass
      const outputWithManyLines = createOutputWithCode('test', Array(50).fill('line'))

      let result = await processor.process(outputWithManyLines)
      expect(result.success).toBe(true)

      // Update config to restrict code lines
      processor.updateValidationConfig({ maxCodeLines: 10 })

      // Now it should fail
      result = await processor.process(outputWithManyLines)
      expect(result.success).toBe(false)
    })

    it('should update sanitization config', async () => {
      const processor = new SchemaProcessor()

      const output = createOutputWithFilePath('/Users/johndoe/test/file.ts')

      // First attempt with default config (no file path sanitization)
      let result = await processor.process(output)
      expect(result.data!.passed![0].file).toBe('/Users/johndoe/test/file.ts')

      // Update config to sanitize file paths
      processor.updateSanitizationConfig({ sanitizeFilePaths: true })

      // Now it should sanitize paths
      result = await processor.process(output)
      expect(result.data!.passed![0].file).toBe('/Users/***/test/file.ts')
    })
  })
})
