// This test file intentionally uses console statements to test console capture functionality

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConsoleCapture } from './capture.js'

/**
 * Test Suite: User Redaction Preservation
 *
 * Verifies that ConsoleCapture preserves any redaction that users have
 * already applied to their console output. This is critical for security
 * compliance - we should never interfere with user's data sanitization.
 */
describe('ConsoleCapture - User Redaction Preservation', () => {
  let capture: ConsoleCapture
  let originalConsole: {
    log: typeof console.log
    error: typeof console.error
    warn: typeof console.warn
  }

  beforeEach(() => {
    // Save original console methods
    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn
    }

    capture = new ConsoleCapture({
      enabled: true,
      maxBytes: 50_000,
      maxLines: 100,
      stripAnsi: true // Even with ANSI stripping, redaction should be preserved
    })
  })

  afterEach(() => {
    // Restore original console
    capture.reset()
    console.log = originalConsole.log
    console.error = originalConsole.error
    console.warn = originalConsole.warn
  })

  describe('String Redaction Preservation', () => {
    it('should preserve user-applied redaction markers in strings', async () => {
      const testId = 'test-string-redaction'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        // User has already redacted sensitive data
        console.log('API Key: [REDACTED]')
        console.log('Password: ***HIDDEN***')
        console.log('Token: <SANITIZED>')
        console.log('Secret: [REMOVED_BY_USER]')
      })

      const output = capture.stopCapture(testId)

      expect(output).toBeDefined()
      expect(output.entries).toBeInstanceOf(Array)
      const logEvents = output.entries.filter((e) => e.level === 'log')
      expect(logEvents).toHaveLength(4)

      // Verify exact preservation of user's redaction
      expect(logEvents[0]?.message).toBe('API Key: [REDACTED]')
      expect(logEvents[1]?.message).toBe('Password: ***HIDDEN***')
      expect(logEvents[2]?.message).toBe('Token: <SANITIZED>')
      expect(logEvents[3]?.message).toBe('Secret: [REMOVED_BY_USER]')
    })

    it('should preserve redaction in multi-line strings', async () => {
      const testId = 'test-multiline-redaction'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        console.log(`Database Config:
  host: localhost
  port: 5432
  password: [REDACTED]
  user: admin`)
      })

      const output = capture.stopCapture(testId)

      const logEvents = output.entries.filter((e) => e.level === 'log')
      expect(logEvents[0]?.message).toContain('password: [REDACTED]')
      expect(logEvents[0]?.message).toContain('host: localhost') // Other data preserved
    })
  })

  describe('Object Redaction Preservation', () => {
    it('should preserve redacted values in objects', async () => {
      const testId = 'test-object-redaction'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        const config = {
          apiKey: '[REDACTED]',
          endpoint: 'https://api.example.com',
          secret: '***REMOVED***',
          token: undefined, // User chose to undefined sensitive data
          password: null // User chose to null sensitive data
        }
        console.log(config)
      })

      const output = capture.stopCapture(testId)

      expect(output).toBeDefined()
      const logEvents = output.entries.filter((e) => e.level === 'log')
      const logOutput = logEvents[0]?.message || ''

      // Verify redacted values are preserved in the object output
      expect(logOutput).toContain("apiKey: '[REDACTED]'")
      expect(logOutput).toContain("secret: '***REMOVED***'")
      expect(logOutput).toContain('token: undefined')
      expect(logOutput).toContain('password: null')
      expect(logOutput).toContain('endpoint:') // Non-sensitive data preserved
    })

    it('should preserve redaction in nested objects', async () => {
      const testId = 'test-nested-redaction'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        const data = {
          user: {
            name: 'John Doe',
            credentials: {
              password: '[REDACTED_BY_LOGGER]',
              apiKey: '***'
            }
          }
        }
        console.log(data)
      })

      const output = capture.stopCapture(testId)
      const logEvents = output.entries.filter((e) => e.level === 'log')
      const logOutput = logEvents[0]?.message || ''

      expect(logOutput).toContain('[REDACTED_BY_LOGGER]')
      expect(logOutput).toContain("apiKey: '***'")
      expect(logOutput).toContain('John Doe') // Non-sensitive preserved
    })
  })

  describe('Mixed Content Preservation', () => {
    it('should preserve redaction alongside normal content', async () => {
      const testId = 'test-mixed-content'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        console.log('User:', 'john@example.com', 'Password:', '[REDACTED]')
        console.error('Auth failed for token:', '[SANITIZED]')
        console.warn('Sensitive operation on key:', '***')
      })

      const output = capture.stopCapture(testId)

      // Check each method preserved redaction
      const logEvents = output.entries.filter((e) => e.level === 'log')
      const errorEvents = output.entries.filter((e) => e.level === 'error')
      const warnEvents = output.entries.filter((e) => e.level === 'warn')
      expect(logEvents[0]?.message).toBe('User: john@example.com Password: [REDACTED]')
      expect(errorEvents[0]?.message).toBe('Auth failed for token: [SANITIZED]')
      expect(warnEvents[0]?.message).toBe('Sensitive operation on key: ***')
    })
  })

  describe('Common Redaction Patterns', () => {
    it('should preserve various common redaction patterns', async () => {
      const testId = 'test-common-patterns'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        // Test common redaction patterns from various libraries
        console.log('fastRedact style:', '[REDACTED]')
        console.log('Winston style:', '***')
        console.log('Pino style:', '[Redacted]')
        console.log('Custom style:', '<hidden>')
        console.log('Masked style:', 'sk_test_****4242')
        console.log('Partial mask:', 'xxxx-xxxx-xxxx-1234')
        console.log('Hash style:', '#####')
        console.log('Dotenv style:', '******')
      })

      const output = capture.stopCapture(testId)

      // All patterns should be preserved exactly
      const logEvents2 = output.entries.filter((e) => e.level === 'log')
      const logTexts = logEvents2.map((e) => e.message)
      expect(logTexts).toEqual([
        'fastRedact style: [REDACTED]',
        'Winston style: ***',
        'Pino style: [Redacted]',
        'Custom style: <hidden>',
        'Masked style: sk_test_****4242',
        'Partial mask: xxxx-xxxx-xxxx-1234',
        'Hash style: #####',
        'Dotenv style: ******'
      ])
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty redaction markers', async () => {
      const testId = 'test-empty-markers'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        console.log('Password:', '') // User cleared the value
        console.log('Token:', '[]') // Empty marker
        console.log('Secret:', '()') // Another empty marker
      })

      const output = capture.stopCapture(testId)

      const logEvents3 = output.entries.filter((e) => e.level === 'log')
      expect(logEvents3[0]?.message).toBe('Password: ')
      expect(logEvents3[1]?.message).toBe('Token: []')
      expect(logEvents3[2]?.message).toBe('Secret: ()')
    })

    it('should preserve redaction in error objects', async () => {
      const testId = 'test-error-redaction'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        const error = new Error('Authentication failed')
        // User adds redacted info to error
        ;(error as any).token = '[REDACTED]'
        ;(error as any).apiKey = '***REMOVED***'
        console.error(error)
      })

      const output = capture.stopCapture(testId)
      const errorEvents = output.entries.filter((e) => e.level === 'error')
      const errorOutput = errorEvents[0]?.message || ''

      expect(errorOutput).toContain('[REDACTED]')
      expect(errorOutput).toContain('***REMOVED***')
      expect(errorOutput).toContain('Authentication failed')
    })

    it('should not add redaction where none exists', async () => {
      const testId = 'test-no-false-redaction'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        // These might look sensitive but user chose not to redact
        console.log('password: myPassword123')
        console.log('apiKey: sk_test_realkey')
        console.log('token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
      })

      const output = capture.stopCapture(testId)

      // Should capture exactly what user logged - no added redaction
      const logEvents4 = output.entries.filter((e) => e.level === 'log')
      expect(logEvents4[0]?.message).toBe('password: myPassword123')
      expect(logEvents4[1]?.message).toBe('apiKey: sk_test_realkey')
      expect(logEvents4[2]?.message).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
    })
  })

  describe('Truncation Behavior', () => {
    it('should preserve redaction even when truncating long strings', async () => {
      const testId = 'test-truncation'
      capture.startCapture(testId)

      await capture.runWithCapture(testId, () => {
        const longString = 'A'.repeat(950) + ' Password: [REDACTED] ' + 'B'.repeat(100)
        console.log(longString)
      })

      const output = capture.stopCapture(testId)
      const logEvents = output.entries.filter((e) => e.level === 'log')
      const logOutput = logEvents[0]?.message || ''

      // Even if truncated, the redaction marker should be preserved if it's within the limit
      expect(logOutput).toContain('[REDACTED]')
      expect(logOutput).toContain('[truncated]')
    })
  })
})
