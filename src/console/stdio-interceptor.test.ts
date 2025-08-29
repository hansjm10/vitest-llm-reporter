import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StdioInterceptor } from './stdio-interceptor.js'

describe('StdioInterceptor', () => {
  let originalStdoutWrite: typeof process.stdout.write
  let originalStderrWrite: typeof process.stderr.write
  let stdoutOutput: string[]
  let stderrOutput: string[]

  beforeEach(() => {
    // Save original writers - bind to avoid unbound method warnings
    originalStdoutWrite = process.stdout.write.bind(process.stdout)
    originalStderrWrite = process.stderr.write.bind(process.stderr)

    // Capture output
    stdoutOutput = []
    stderrOutput = []

    // Mock writers to capture output
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutOutput.push(chunk.toString())
      if (callback) process.nextTick(callback)
      return true
    }) as any

    process.stderr.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stderrOutput.push(chunk.toString())
      if (callback) process.nextTick(callback)
      return true
    }) as any
  })

  afterEach(() => {
    // Restore original writers
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  })

  describe('basic functionality', () => {
    it('does not intercept when not enabled', () => {
      const interceptor = new StdioInterceptor()

      process.stdout.write('test output\n')

      expect(stdoutOutput).toContain('test output\n')
      expect(interceptor.isActive()).toBe(false)
    })

    it('intercepts and filters stdout when enabled', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      process.stdout.write('[Nest] 12345 - Starting...\n')
      process.stdout.write('Regular log\n')

      interceptor.disable()

      expect(stdoutOutput).not.toContain('[Nest] 12345 - Starting...\n')
      expect(stdoutOutput).toContain('Regular log\n')
    })

    it('restores original writers when disabled', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      // Clear any previous output
      stdoutOutput = []

      interceptor.enable()
      // Check that interception is active
      expect(interceptor.isActive()).toBe(true)

      // Write something to test filtering works
      process.stdout.write('[Nest] Should be filtered\n')
      process.stdout.write('Should pass through\n')

      // Check filtering worked
      expect(stdoutOutput).not.toContain('[Nest] Should be filtered\n')
      expect(stdoutOutput).toContain('Should pass through\n')

      interceptor.disable()
      // Check that interception is disabled
      expect(interceptor.isActive()).toBe(false)

      // Clear output before testing post-disable
      stdoutOutput = []

      // After disable, nothing should be filtered
      process.stdout.write('[Nest] Should not be filtered after disable\n')
      expect(stdoutOutput).toContain('[Nest] Should not be filtered after disable\n')
    })
  })

  describe('line buffering', () => {
    it('handles chunked writes correctly', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      // Write in chunks
      process.stdout.write('[Nest')
      process.stdout.write('] 12345 - ')
      process.stdout.write('Starting...\n')
      process.stdout.write('Regular log\n')

      interceptor.disable()

      // The complete Nest line should be filtered
      expect(stdoutOutput.join('')).not.toContain('[Nest] 12345')
      expect(stdoutOutput.join('')).toContain('Regular log\n')
    })

    it('flushes remaining buffer on disable', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      // Write without newline
      process.stdout.write('Incomplete line without newline')

      interceptor.disable()

      // Buffer should be flushed
      expect(stdoutOutput.join('')).toContain('Incomplete line without newline')
    })
  })

  describe('pure mode', () => {
    it('suppresses all output when pattern is null', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: null // Use null for pure mode
      })

      interceptor.enable()

      process.stdout.write('[Nest] Log\n')
      process.stdout.write('Regular log\n')
      process.stdout.write('Any other output\n')

      interceptor.disable()

      // All output should be suppressed in pure mode
      expect(stdoutOutput.length).toBe(0)
    })

    it('does not suppress when pattern is undefined', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: undefined // Undefined means no filtering
      })

      interceptor.enable()

      process.stdout.write('[Nest] Log\n')
      process.stdout.write('Regular log\n')
      process.stdout.write('Any other output\n')

      interceptor.disable()

      // No suppression with undefined pattern
      expect(stdoutOutput.length).toBe(3)
    })
  })

  describe('flush filtering', () => {
    it('applies filtering during flush when flushWithFiltering is true', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/,
        flushWithFiltering: true
      })

      interceptor.enable()

      // Write partial lines that should be filtered
      process.stdout.write('[Nest] Partial log') // Should be filtered

      interceptor.disable()

      // With flushWithFiltering, the partial line should be suppressed
      expect(stdoutOutput.join('')).not.toContain('[Nest] Partial log')
    })

    it('does not apply filtering during flush by default', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
        // flushWithFiltering defaults to false
      })

      interceptor.enable()

      // Write partial lines that would normally be filtered
      process.stdout.write('[Nest] Partial log') // Would be filtered if complete

      interceptor.disable()

      // Without flushWithFiltering, the partial line is not filtered
      expect(stdoutOutput.join('')).toContain('[Nest] Partial log')
    })
  })

  describe('stderr handling', () => {
    it('intercepts stderr when configured', () => {
      const interceptor = new StdioInterceptor({
        suppressStderr: true,
        filterPattern: /^ERROR:/
      })

      interceptor.enable()

      process.stderr.write('ERROR: Something went wrong\n')
      process.stderr.write('Warning: Just a warning\n')

      interceptor.disable()

      expect(stderrOutput).not.toContain('ERROR: Something went wrong\n')
      expect(stderrOutput).toContain('Warning: Just a warning\n')
    })
  })

  describe('redirection', () => {
    it('redirects filtered stdout to stderr when configured', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/,
        redirectToStderr: true
      })

      interceptor.enable()

      process.stdout.write('[Nest] Redirected log\n')
      process.stdout.write('Normal stdout log\n')

      interceptor.disable()

      // Nest log should be redirected to stderr
      expect(stdoutOutput).not.toContain('[Nest] Redirected log\n')
      expect(stderrOutput).toContain('[Nest] Redirected log\n')

      // Normal log stays in stdout
      expect(stdoutOutput).toContain('Normal stdout log\n')
    })
  })

  describe('Buffer handling', () => {
    it('handles Buffer inputs correctly', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      const buffer = Buffer.from('[Nest] Buffer log\n', 'utf8')
      process.stdout.write(buffer)

      const normalBuffer = Buffer.from('Normal log\n', 'utf8')
      process.stdout.write(normalBuffer)

      interceptor.disable()

      expect(stdoutOutput.join('')).not.toContain('[Nest] Buffer log')
      expect(stdoutOutput.join('')).toContain('Normal log')
    })
  })

  describe('getOriginalWriters', () => {
    it('provides access to original writers', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true
      })

      interceptor.enable()

      const writers = interceptor.getOriginalWriters()
      // The original writer should be the mock we set in beforeEach
      expect(typeof writers.stdout).toBe('function')
      expect(typeof writers.stderr).toBe('function')

      // Original writer should bypass filtering
      writers.stdout('[Nest] This goes through\n')
      expect(stdoutOutput).toContain('[Nest] This goes through\n')

      interceptor.disable()
    })
  })
})
