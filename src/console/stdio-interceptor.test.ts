import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StdioInterceptor } from './stdio-interceptor.js'

const RAW_CLEAR_LINE_PREFIX = new RegExp(String.raw`^\u001b\[2K\r`)

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

    it('does not restore stderr if stderr was never intercepted', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      const stderrSpy = ((chunk: any, encoding?: any, callback?: any) => {
        if (typeof encoding === 'function') {
          callback = encoding
          encoding = undefined
        }
        stderrOutput.push(`spy:${String(chunk)}`)
        if (callback) process.nextTick(callback)
        return true
      }) as any

      process.stderr.write = stderrSpy

      interceptor.disable()

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(process.stderr.write).toBe(stderrSpy)
      process.stderr.write('still wrapped\n')
      expect(stderrOutput).toContain('spy:still wrapped\n')
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

    it('passes through standalone terminal control sequences immediately', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      process.stdout.write('\u001b[?25h')

      expect(stdoutOutput).toContain('\u001b[?25h')

      interceptor.disable()
    })

    it('passes through standalone terminal reset chunks immediately', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      process.stdout.write('\u001b[0m')

      expect(stdoutOutput).toContain('\u001b[0m')

      interceptor.disable()
    })

    it('keeps standalone line-clear and cursor-hide chunks buffered', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      process.stdout.write('\r')
      process.stdout.write('\u001b[2K\r')
      process.stdout.write('\u001b[?25l')

      expect(stdoutOutput).toEqual([])

      interceptor.disable()
    })

    it('keeps control chunks behind buffered text to preserve write order', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      process.stdout.write('Compiling...')
      process.stdout.write('\r')

      expect(stdoutOutput).toEqual([])

      interceptor.disable()

      expect(stdoutOutput.join('')).toBe('Compiling...\r')
    })

    it('drops held terminal restore chunks when disabling with discard', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()
      interceptor.prepareForReportHold()

      process.stdout.write('\u001b[?25h')

      interceptor.disable({ bufferedOutput: 'discard' })

      expect(stdoutOutput).toEqual([])
    })

    it('filters held mixed stdout line by line when disabling with filter', () => {
      const firstInterceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      firstInterceptor.enable()
      firstInterceptor.prepareForReportHold()
      process.stdout.write('[Nest] hidden\nVisible\n')
      firstInterceptor.disable({ bufferedOutput: 'filter' })

      expect(stdoutOutput.join('')).toBe('Visible\n')

      stdoutOutput = []

      const secondInterceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      secondInterceptor.enable()
      secondInterceptor.prepareForReportHold()
      process.stdout.write('Visible\n[Nest] hidden\n')
      secondInterceptor.disable({ bufferedOutput: 'filter' })

      expect(stdoutOutput.join('')).toBe('Visible\n')
    })

    it('holds only stdout during report hold while stderr keeps filtering live', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        suppressStderr: true,
        frameworkPresets: [],
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()
      interceptor.prepareForReportHold()

      process.stdout.write('held stdout\n')
      process.stderr.write('[Nest] hidden stderr\n')
      process.stderr.write('Visible stderr\n')

      expect(stdoutOutput).toEqual([])
      expect(stderrOutput).not.toContain('[Nest] hidden stderr\n')
      expect(stderrOutput).toContain('Visible stderr\n')

      interceptor.disable({ bufferedOutput: 'discard' })

      expect(stdoutOutput).toEqual([])
      expect(stderrOutput).toContain('Visible stderr\n')
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

    it('does not suppress when pattern is undefined and presets are cleared', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: undefined, // Undefined means no filtering
        frameworkPresets: []
      })

      interceptor.enable()

      process.stdout.write('[Nest] Log\n')
      process.stdout.write('Regular log\n')
      process.stdout.write('Any other output\n')

      interceptor.disable()

      // No suppression with undefined pattern when presets are cleared
      expect(stdoutOutput).toContain('[Nest] Log\n')
      expect(stdoutOutput).toContain('Regular log\n')
      expect(stdoutOutput).toContain('Any other output\n')
    })

    it('retains default presets when filterPattern resolves to undefined', () => {
      const optionalPattern: RegExp | undefined = undefined
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: optionalPattern
      })

      interceptor.enable()

      process.stdout.write('[Nest] Log\n')
      process.stdout.write('Regular log\n')

      interceptor.disable()

      expect(stdoutOutput).not.toContain('[Nest] Log\n')
      expect(stdoutOutput).toContain('Regular log\n')
    })

    it('suppresses standalone terminal control sequences when pattern is null', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: null
      })

      interceptor.enable()

      process.stdout.write('\u001b[?25h')

      interceptor.disable()

      expect(stdoutOutput).toHaveLength(0)
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

    it.each(['\r', '\u001b[2K\r'])(
      'suppresses Next.js partial stdout with %j control prefix during flush',
      (prefix) => {
        const interceptor = new StdioInterceptor({
          suppressStdout: true,
          frameworkPresets: ['next'],
          flushWithFiltering: true
        })

        interceptor.enable()

        process.stdout.write(`${prefix}info  - Loaded env from .env.local`)

        interceptor.disable()

        expect(stdoutOutput.join('')).not.toContain('Loaded env from .env.local')
      }
    )

    it('drops trailing cursor-show when suppressing buffered Next.js stdout', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        frameworkPresets: ['next'],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local\u001b[?25h')

      interceptor.disable()

      expect(stdoutOutput.join('')).toBe('')
    })

    it('drops trailing reset when suppressing buffered Next.js stdout', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        frameworkPresets: ['next'],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local\u001b[0m')

      interceptor.disable()

      expect(stdoutOutput.join('')).toBe('')
    })

    it('drops chained terminal restore suffixes when suppressing buffered Next.js stdout', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        frameworkPresets: ['next'],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local\u001b[?25h\u001b[0m')

      interceptor.disable()

      expect(stdoutOutput.join('')).toBe('')
    })

    it('drops trailing cursor-show when the buffered control suffix ends with carriage return', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        frameworkPresets: ['next'],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local\u001b[?25h\r')

      interceptor.disable()

      expect(stdoutOutput.join('')).toBe('')
    })

    it('does not emit trailing reset bytes from suppressed complete lines', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        frameworkPresets: ['next']
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local\u001b[0m\n')

      interceptor.disable()

      expect(stdoutOutput.join('')).toBe('')
    })

    it('drops buffered control-only stdout chunks during filtered flush', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/,
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[?25l')

      interceptor.disable()

      expect(stdoutOutput).toEqual([])
    })

    it('does not normalize custom regex filters during flush', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^info/,
        frameworkPresets: [],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local')

      interceptor.disable()

      expect(stdoutOutput.join('')).toContain('\u001b[2K\rinfo  - Loaded env from .env.local')
    })

    it('applies custom raw-prefix regex filters during flush', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: [/^\r/, RAW_CLEAR_LINE_PREFIX],
        frameworkPresets: [],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rspinner update')

      interceptor.disable()

      expect(stdoutOutput).toEqual([])
    })

    it('passes raw control prefixes to custom predicate filters during flush', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: [(line) => line.startsWith('\u001b[2K\r')],
        frameworkPresets: [],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rspinner update')

      interceptor.disable()

      expect(stdoutOutput).toEqual([])
    })

    it('invokes custom predicate filters once per buffered chunk during flush', () => {
      const seen: string[] = []
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: [
          (line) => {
            seen.push(line)
            return false
          }
        ],
        frameworkPresets: [],
        flushWithFiltering: true
      })

      interceptor.enable()

      process.stdout.write('\u001b[2K\rinfo  - Loaded env from .env.local')

      interceptor.disable()

      expect(seen).toEqual(['\u001b[2K\rinfo  - Loaded env from .env.local'])
      expect(stdoutOutput.join('')).toContain('\u001b[2K\rinfo  - Loaded env from .env.local')
    })

    it('can force filtered shutdown during disable without changing the base config', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      interceptor.enable()

      process.stdout.write('[Nest] Partial log')

      interceptor.disable({ bufferedOutput: 'filter' })

      expect(stdoutOutput.join('')).not.toContain('[Nest] Partial log')

      stdoutOutput = []

      const visibleInterceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^\[Nest\]/
      })

      visibleInterceptor.enable()

      process.stdout.write('Visible partial log')

      visibleInterceptor.disable({ bufferedOutput: 'filter' })

      expect(stdoutOutput.join('')).toContain('Visible partial log')
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

  describe('advanced filtering', () => {
    it('supports multiple filter patterns', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: [/^Foo:/, /^Bar:/],
        frameworkPresets: []
      })

      interceptor.enable()

      process.stdout.write('Foo: should be filtered\n')
      process.stdout.write('Bar: should also be filtered\n')
      process.stdout.write('Baz: should pass\n')

      interceptor.disable()

      expect(stdoutOutput).not.toContain('Foo: should be filtered\n')
      expect(stdoutOutput).not.toContain('Bar: should also be filtered\n')
      expect(stdoutOutput).toContain('Baz: should pass\n')
    })

    it('supports predicate filter functions', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: [(line) => line.includes('suppress-me')],
        frameworkPresets: []
      })

      interceptor.enable()

      process.stdout.write('Please suppress-me\n')
      process.stdout.write('Let me through\n')

      interceptor.disable()

      expect(stdoutOutput).not.toContain('Please suppress-me\n')
      expect(stdoutOutput).toContain('Let me through\n')
    })

    it('suppresses CRLF-terminated lines that match an exact custom pattern', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        filterPattern: /^Secret$/,
        frameworkPresets: []
      })

      interceptor.enable()

      process.stdout.write('Secret\r\n')
      process.stdout.write('Visible\r\n')

      interceptor.disable()

      expect(stdoutOutput).not.toContain('Secret\r\n')
      expect(stdoutOutput).toContain('Visible\r\n')
    })

    it('applies framework presets', () => {
      const interceptor = new StdioInterceptor({
        suppressStdout: true,
        frameworkPresets: ['next']
      })

      interceptor.enable()

      process.stdout.write('info  - Loaded env from .env.local\n')
      process.stdout.write('A regular log line\n')

      interceptor.disable()

      expect(stdoutOutput).not.toContain('info  - Loaded env from .env.local\n')
      expect(stdoutOutput).toContain('A regular log line\n')
    })
  })
})
