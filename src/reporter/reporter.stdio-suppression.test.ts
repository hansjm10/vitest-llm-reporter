import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { LLMReporter } from './reporter.js'
import type { TestRunEndReason } from 'vitest/node'

const nativeStdoutWrite = process.stdout.write.bind(process.stdout)
const nativeStderrWrite = process.stderr.write.bind(process.stderr)

describe('LLMReporter stdio suppression', () => {
  let originalDebug: string | undefined

  // Helper to create mock test data
  const createMockTestModule = (): any => ({
    id: 'test-1',
    name: 'test.spec.ts',
    type: 'suite',
    mode: 'run',
    filepath: '/test/test.spec.ts',
    tasks: [
      {
        id: 'test-1-1',
        name: 'mock test',
        type: 'test',
        mode: 'run',
        suite: null,
        result: {
          state: 'passed',
          duration: 10
        }
      }
    ]
  })

  beforeEach(() => {
    // Ensure DEBUG is not enabled for the reporter namespaces
    originalDebug = process.env.DEBUG
    delete process.env.DEBUG
  })

  afterEach(() => {
    process.stdout.write = nativeStdoutWrite
    process.stderr.write = nativeStderrWrite
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
  })

  it('suppresses external stdout writes when configured', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    // Mock stdout to capture all writes
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false
      // Using default config which has suppressStdout: true
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Process a test module through the lifecycle to update statistics
    const mockModule = createMockTestModule()
    reporter.onTestModuleCollected(mockModule)
    reporter.onTestModuleStart(mockModule)

    // Process the test case
    const testCase = mockModule.tasks[0]
    reporter.onTestCaseReady(testCase)
    reporter.onTestCaseResult(testCase)

    reporter.onTestModuleEnd(mockModule)

    // Simulate external framework writing to stdout
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Some other log\n')

    // End the test run
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    // Restore original
    process.stdout.write = originalWrite

    // The NestJS log should be filtered out (matching default pattern)
    const hasNestLog = stdoutWrites.some((write) => write.includes('[Nest]'))
    expect(hasNestLog).toBe(false)

    // The reporter should have written JSON output (since we provided test data)
    // Note: The actual JSON output requires proper test lifecycle processing
    // which is complex to mock. The core suppression behavior is verified above.
  })

  it('retains default presets when optional filterPattern resolves to undefined', async () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const optionalPattern: RegExp | undefined = undefined
    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStdout: true,
        filterPattern: optionalPattern
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Some other log\n')

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    process.stdout.write = originalWrite

    const hasNestLog = stdoutWrites.some((write) => write.includes('[Nest]'))
    expect(hasNestLog).toBe(false)

    const hasOtherLog = stdoutWrites.some((write) => write.includes('Some other log'))
    expect(hasOtherLog).toBe(true)
  })

  it('allows stdout when suppressStdout is explicitly disabled', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    // Mock stdout to capture all writes
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: { suppressStdout: false }
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Simulate external framework writing to stdout
    process.stdout.write('[Nest] 12345 - Starting application...\n')

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    // Restore original
    process.stdout.write = originalWrite

    // The NestJS log should NOT be filtered when suppression is disabled
    const hasNestLog = stdoutWrites.some((write) => write.includes('[Nest]'))
    expect(hasNestLog).toBe(true)
  })

  it('pure stdout mode suppresses all external stdout', async () => {
    const reporter = new LLMReporter({
      framedOutput: false,
      pureStdout: true
    })

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Simulate various external writes
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Random log without pattern\n')
    process.stdout.write('Another unrelated output\n')

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    stdoutSpy.mockRestore()

    // Get all stdout writes
    const allWrites = stdoutSpy.mock.calls.map((call) => String(call[0]))

    // Only the reporter's JSON should be present, all other output suppressed
    const nonJsonWrites = allWrites.filter((write) => {
      try {
        JSON.parse(write.trim())
        return false // It's JSON, so not a non-JSON write
      } catch {
        return true // Not JSON, so it's external output
      }
    })

    expect(nonJsonWrites.length).toBe(0)
  })

  it('keeps stdout intercepted until onFinished, then restores original writers', async () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // stdout.write should be patched during the run
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(process.stdout.write).not.toBe(originalWrite)

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    process.stdout.write('[Nest] still intercepted before reporter finished\n')
    reporter.onFinished([], [], undefined)
    process.stdout.write('[Nest] no longer intercepted after reporter finished\n')
    process.stdout.write = originalWrite

    expect(stdoutWrites).not.toContain('[Nest] still intercepted before reporter finished\n')
    expect(stdoutWrites).toContain('[Nest] no longer intercepted after reporter finished\n')
  })

  it('suppresses post-run stdout until onFinished in pure stdout mode', async () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      pureStdout: true,
      environmentMetadata: { enabled: false }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)

    process.stdout.write('% Coverage report from v8\n')
    reporter.onFinished([], [], undefined)
    process.stdout.write = originalWrite

    expect(stdoutWrites).not.toContain('% Coverage report from v8\n')
  })

  it('allows standalone terminal control sequences after onFinished', async () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      environmentMetadata: { enabled: false }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    process.stdout.write('\u001b[?25h')
    process.stdout.write = originalWrite

    expect(stdoutWrites).toContain('\u001b[?25h')
  })

  it('restores original writers from ctx.onClose even without onTestRunEnd', () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    let closeHandler: (() => void) | undefined

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false
    })

    const mockVitest = {
      config: { root: '/test-project' },
      onClose: (handler: () => void) => {
        closeHandler = handler
      }
    }

    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    expect(process.stdout.write).not.toBe(originalWrite)

    closeHandler?.()

    process.stdout.write('[Nest] restored on close\n')
    process.stdout.write = originalWrite

    expect(stdoutWrites).toContain('[Nest] restored on close\n')
  })

  it('filters buffered suppressed stdout before restoring writers from ctx.onClose', () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    let closeHandler: (() => void) | undefined

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false
    })

    const mockVitest = {
      config: { root: '/test-project' },
      onClose: (handler: () => void) => {
        closeHandler = handler
      }
    }

    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    process.stdout.write('[Nest] buffered spinner frame')

    closeHandler?.()

    process.stdout.write('[Nest] restored on close\n')
    process.stdout.write = originalWrite

    expect(stdoutWrites.join('')).not.toContain('[Nest] buffered spinner frame')
    expect(stdoutWrites).toContain('[Nest] restored on close\n')
  })

  it('stops the spinner from ctx.onClose when onTestRunEnd never fires', () => {
    vi.useFakeTimers()

    const stderrWrites: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    const originalIsTTY = process.stderr.isTTY
    let closeHandler: (() => void) | undefined

    process.stderr.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stderrWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    Object.defineProperty(process.stderr, 'isTTY', {
      value: true,
      configurable: true
    })

    try {
      const reporter = new LLMReporter({
        framedOutput: false
      })
      const reporterInternals = reporter as any
      reporterInternals.config.spinner.enabled = true

      const mockVitest = {
        config: { root: '/test-project' },
        onClose: (handler: () => void) => {
          closeHandler = handler
        }
      }

      reporter.onInit(mockVitest as any)
      reporter.onTestRunStart([])

      expect(reporterInternals.spinnerActive).toBe(true)
      expect(reporterInternals.spinnerTimer).toBeDefined()
      expect(stderrWrites.some((write) => write.includes('Running tests'))).toBe(true)

      closeHandler?.()

      expect(reporterInternals.spinnerActive).toBe(false)
      expect(reporterInternals.spinnerTimer).toBeUndefined()

      const writeCountAfterClose = stderrWrites.length
      vi.advanceTimersByTime(reporterInternals.config.spinner.intervalMs * 2)
      expect(stderrWrites).toHaveLength(writeCountAfterClose)
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', {
        value: originalIsTTY,
        configurable: true
      })
      process.stderr.write = originalWrite
      vi.useRealTimers()
    }
  })

  it('handles custom filter patterns', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    // Mock stdout to capture all writes
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStdout: true,
        filterPattern: /^CustomPrefix:/
      }
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    // Write various outputs
    process.stdout.write('CustomPrefix: This should be filtered\n')
    process.stdout.write('NormalLog: This should pass through\n')
    process.stdout.write('[Nest] This should also pass through\n')

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    // Restore original
    process.stdout.write = originalWrite

    // CustomPrefix should be filtered
    const hasCustomPrefix = stdoutWrites.some((write) => write.includes('CustomPrefix:'))
    expect(hasCustomPrefix).toBe(false)

    // Other logs should pass through
    const hasNormalLog = stdoutWrites.some((write) => write.includes('NormalLog:'))
    expect(hasNormalLog).toBe(true)
  })

  it('supports multiple stdio filter patterns', async () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStdout: true,
        filterPattern: [/^Foo:/, /^Bar:/],
        frameworkPresets: []
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    process.stdout.write('Foo: filtered\n')
    process.stdout.write('Bar: filtered\n')
    process.stdout.write('Baz: visible\n')

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    process.stdout.write = originalWrite

    expect(stdoutWrites).not.toContain('Foo: filtered\n')
    expect(stdoutWrites).not.toContain('Bar: filtered\n')
    expect(stdoutWrites).toContain('Baz: visible\n')
  })

  it('applies framework presets when provided', async () => {
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStdout: true,
        frameworkPresets: ['next']
      }
    })

    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)
    reporter.onTestRunStart([])

    process.stdout.write('info  - Loaded env from .env.local\n')
    process.stdout.write('Regular log\n')

    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    process.stdout.write = originalWrite

    expect(stdoutWrites).not.toContain('info  - Loaded env from .env.local\n')
    expect(stdoutWrites).toContain('Regular log\n')
  })

  it('auto-detects framework presets from package.json', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-reporter-'))
    const packageJsonPath = path.join(tempDir, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify({ dependencies: { next: '13.0.0' } }), 'utf8')

    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      if (typeof encoding === 'function') {
        callback = encoding
        encoding = undefined
      }
      stdoutWrites.push(String(chunk))
      if (callback) process.nextTick(callback)
      return true
    }) as any

    try {
      const reporter = new LLMReporter({
        framedOutput: false,
        stdio: {
          suppressStdout: true,
          autoDetectFrameworks: true
        }
      })

      const mockVitest = { config: { root: tempDir } }
      reporter.onInit(mockVitest as any)
      reporter.onTestRunStart([])

      const resolvedPresets = (reporter as any).config.stdio.frameworkPresets as string[]
      expect(resolvedPresets).toContain('next')

      process.stdout.write('info  - Auto detected\n')
      process.stdout.write('Regular output\n')

      const mockModule = createMockTestModule()
      await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
      reporter.onFinished([], [], undefined)

      expect(stdoutWrites).not.toContain('info  - Auto detected\n')
      expect(stdoutWrites).toContain('Regular output\n')
    } finally {
      process.stdout.write = originalWrite
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('does not start spinner when stderr is suppressed', async () => {
    const reporter = new LLMReporter({
      framedOutput: false,
      stdio: {
        suppressStderr: true
      }
    })

    // Mock Vitest context and set up test run state
    const mockVitest = { config: { root: '/test-project' } }
    reporter.onInit(mockVitest as any)

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any)

    reporter.onTestRunStart([])

    // Provide mock test module to ensure output generation
    const mockModule = createMockTestModule()
    await reporter.onTestRunEnd([mockModule], [], 'passed' as TestRunEndReason)
    reporter.onFinished([], [], undefined)

    stderrSpy.mockRestore()

    // No spinner output should be written to stderr
    const allWrites = stderrSpy.mock.calls.map((call) => String(call[0]))
    const hasSpinnerOutput = allWrites.some(
      (write) => write.includes('Running tests') || write.includes('|') || write.includes('/')
    )
    expect(hasSpinnerOutput).toBe(false)
  })
})
