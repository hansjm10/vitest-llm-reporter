import { describe, it, expect } from 'vitest'
import { SchemaSanitizer, SanitizationStrategy } from './sanitizer'
import type { LLMReporterOutput } from '../types/schema'

describe('SchemaSanitizer', () => {
  describe('HTML Sanitization', () => {
    it('should sanitize HTML special characters', () => {
      const sanitizer = new SchemaSanitizer({ strategy: SanitizationStrategy.HTML })

      const input: LLMReporterOutput = {
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
            test: 'test with <script>alert("XSS")</script>',
            file: '/test/file.ts',
            line: 1,
            error: {
              message: 'Error with <img src=x onerror=alert(1)>',
              type: 'Error',
              stack: 'Stack with & < > " \' characters'
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.failures![0].test).not.toContain('<script>')
      expect(result.failures![0].test).toContain('&#60;script&#62;')
      expect(result.failures![0].error.message).not.toContain('<img')
      expect(result.failures![0].error.stack).not.toContain('<')
    })

    it('should sanitize code arrays', () => {
      const sanitizer = new SchemaSanitizer()

      const input: LLMReporterOutput = {
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
                code: [
                  'const x = "<script>alert(1)</script>"',
                  'const y = `${user.input}`', // Template literal injection
                  'const z = "normal string"'
                ]
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      const sanitizedCode = result.failures![0].error.context!.code
      expect(sanitizedCode[0]).not.toContain('<script>')
      expect(sanitizedCode[1]).not.toContain('${')
      expect(sanitizedCode[1]).toContain('&#36;&#123;')
    })
  })

  describe('JSON Sanitization', () => {
    it('should escape JSON special characters', () => {
      const sanitizer = new SchemaSanitizer({ strategy: SanitizationStrategy.JSON })

      const input: LLMReporterOutput = {
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
            test: 'test with "quotes" and \\backslash',
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.passed![0].test).toContain('\\"quotes\\"')
      expect(result.passed![0].test).toContain('\\\\backslash')
    })
  })

  describe('Markdown Sanitization', () => {
    it('should escape markdown special characters', () => {
      const sanitizer = new SchemaSanitizer({ strategy: SanitizationStrategy.MARKDOWN })

      const input: LLMReporterOutput = {
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
            test: 'test with *bold* and _italic_ and [link](url)',
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.passed![0].test).toContain('\\*bold\\*')
      expect(result.passed![0].test).toContain('\\_italic\\_')
      expect(result.passed![0].test).toContain('\\[link\\]')
    })
  })

  describe('No Sanitization', () => {
    it('should not modify strings when strategy is NONE', () => {
      const sanitizer = new SchemaSanitizer({ strategy: SanitizationStrategy.NONE })

      const input: LLMReporterOutput = {
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
            test: '<script>alert("XSS")</script>',
            file: '/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.passed![0].test).toBe('<script>alert("XSS")</script>')
    })
  })

  describe('File Path Sanitization', () => {
    it('should sanitize file paths when configured', () => {
      const sanitizer = new SchemaSanitizer({ sanitizeFilePaths: true })

      const input: LLMReporterOutput = {
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
            file: '/Users/johndoe/projects/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.passed![0].file).toBe('/Users/***/projects/test/file.ts')
    })

    it('should not sanitize file paths by default', () => {
      const sanitizer = new SchemaSanitizer()

      const input: LLMReporterOutput = {
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
            file: '/Users/johndoe/projects/test/file.ts',
            line: 1,
            status: 'passed'
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.passed![0].file).toBe('/Users/johndoe/projects/test/file.ts')
    })
  })

  describe('Assertion Value Sanitization', () => {
    it('should sanitize nested objects and arrays', () => {
      const sanitizer = new SchemaSanitizer()

      const input: LLMReporterOutput = {
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
                code: ['test'],
                expected: {
                  nested: {
                    value: '<script>alert(1)</script>',
                    array: ['<img src=x>', 'normal']
                  }
                },
                actual: ['<div onclick="alert(1)">', { key: '<script>' }]
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const context = result.failures![0].error.context!

      // Check nested object sanitization
      const expected = context.expected as any
      expect(expected.nested.value).not.toContain('<script>')
      expect(expected.nested.array[0]).not.toContain('<img')

      // Check array sanitization
      const actual = context.actual as any[]
      expect(actual[0]).not.toContain('<div')
      expect(actual[1].key).not.toContain('<script>')
    })

    it('should handle max depth for deeply nested objects', () => {
      const sanitizer = new SchemaSanitizer({ maxDepth: 2 })

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
                code: ['test'],
                expected: deeplyNested
              }
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)
      const context = result.failures![0].error.context!
      const sanitized = context.expected as any

      expect(sanitized.level1.level2.level3).toBe('[Max depth exceeded]')
    })
  })

  describe('Suite Array Sanitization', () => {
    it('should sanitize suite arrays', () => {
      const sanitizer = new SchemaSanitizer()

      const input: LLMReporterOutput = {
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
            suite: ['Suite <script>', 'Nested & Suite'],
            error: {
              message: 'error',
              type: 'Error'
            }
          }
        ]
      }

      const result = sanitizer.sanitize(input)

      expect(result.failures![0].suite![0]).not.toContain('<script>')
      expect(result.failures![0].suite![1]).toContain('&#38;')
    })
  })
})
