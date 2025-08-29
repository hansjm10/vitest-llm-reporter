import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMReporter } from './reporter.js'
import type { TestRunEndReason } from 'vitest/node'

describe('LLMReporter stdio suppression', () => {
  let originalDebug: string | undefined

  beforeEach(() => {
    // Ensure DEBUG is not enabled for the reporter namespaces
    originalDebug = process.env.DEBUG
    delete process.env.DEBUG
  })

  afterEach(() => {
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
  })

  it('suppresses external stdout writes when configured', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write
    
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
      forceConsoleOutput: true,
      // Using default config which has suppressStdout: true
    })

    reporter.onTestRunStart([])
    
    // Simulate external framework writing to stdout
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Some other log\n')
    
    await reporter.onTestRunEnd([], [], 'passed' as TestRunEndReason)

    // Restore original
    process.stdout.write = originalWrite
    
    // The NestJS log should be filtered out (matching default pattern)
    const hasNestLog = stdoutWrites.some(write => write.includes('[Nest]'))
    expect(hasNestLog).toBe(false)
    
    // The reporter's JSON output should still be present
    const jsonWrites = stdoutWrites.filter(write => {
      try {
        JSON.parse(write.trim())
        return true
      } catch {
        return false
      }
    })
    expect(jsonWrites.length).toBeGreaterThan(0)
  })

  it('allows stdout when suppressStdout is explicitly disabled', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write
    
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
      forceConsoleOutput: true,
      stdio: { suppressStdout: false }
    })

    reporter.onTestRunStart([])
    
    // Simulate external framework writing to stdout
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    
    await reporter.onTestRunEnd([], [], 'passed' as TestRunEndReason)

    // Restore original
    process.stdout.write = originalWrite
    
    // The NestJS log should NOT be filtered when suppression is disabled
    const hasNestLog = stdoutWrites.some(write => write.includes('[Nest]'))
    expect(hasNestLog).toBe(true)
  })

  it('pure stdout mode suppresses all external stdout', async () => {
    const reporter = new LLMReporter({ 
      framedOutput: false, 
      forceConsoleOutput: true,
      pureStdout: true
    })

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any)

    reporter.onTestRunStart([])
    
    // Simulate various external writes
    process.stdout.write('[Nest] 12345 - Starting application...\n')
    process.stdout.write('Random log without pattern\n')
    process.stdout.write('Another unrelated output\n')
    
    await reporter.onTestRunEnd([], [], 'passed' as TestRunEndReason)

    stdoutSpy.mockRestore()

    // Get all stdout writes
    const allWrites = stdoutSpy.mock.calls.map((call) => String(call[0]))
    
    // Only the reporter's JSON should be present, all other output suppressed
    const nonJsonWrites = allWrites.filter(write => {
      try {
        JSON.parse(write.trim())
        return false // It's JSON, so not a non-JSON write
      } catch {
        return true // Not JSON, so it's external output
      }
    })
    
    expect(nonJsonWrites.length).toBe(0)
  })

  it('restores original writers after test run', async () => {
    const originalWrite = process.stdout.write
    
    const reporter = new LLMReporter({ 
      framedOutput: false, 
      forceConsoleOutput: true
    })

    reporter.onTestRunStart([])
    
    // stdout.write should be patched during the run
    const patchedWrite = process.stdout.write
    expect(patchedWrite).not.toBe(originalWrite)
    
    await reporter.onTestRunEnd([], [], 'passed' as TestRunEndReason)
    
    // After cleanup, original writer should be restored
    expect(process.stdout.write).toBe(originalWrite)
  })

  it('handles custom filter patterns', async () => {
    // Collect output
    const stdoutWrites: string[] = []
    const originalWrite = process.stdout.write
    
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
      forceConsoleOutput: true,
      stdio: { 
        suppressStdout: true,
        filterPattern: /^CustomPrefix:/
      }
    })

    reporter.onTestRunStart([])
    
    // Write various outputs
    process.stdout.write('CustomPrefix: This should be filtered\n')
    process.stdout.write('NormalLog: This should pass through\n')
    process.stdout.write('[Nest] This should also pass through\n')
    
    await reporter.onTestRunEnd([], [], 'passed' as TestRunEndReason)

    // Restore original
    process.stdout.write = originalWrite
    
    // CustomPrefix should be filtered
    const hasCustomPrefix = stdoutWrites.some(write => write.includes('CustomPrefix:'))
    expect(hasCustomPrefix).toBe(false)
    
    // Other logs should pass through
    const hasNormalLog = stdoutWrites.some(write => write.includes('NormalLog:'))
    expect(hasNormalLog).toBe(true)
  })

  it('does not start spinner when stderr is suppressed', async () => {
    const reporter = new LLMReporter({ 
      framedOutput: false, 
      forceConsoleOutput: true,
      stdio: { 
        suppressStderr: true
      }
    })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any)

    reporter.onTestRunStart([])
    await reporter.onTestRunEnd([], [], 'passed' as TestRunEndReason)

    stderrSpy.mockRestore()

    // No spinner output should be written to stderr
    const allWrites = stderrSpy.mock.calls.map((call) => String(call[0]))
    const hasSpinnerOutput = allWrites.some(write => 
      write.includes('Running tests') || write.includes('|') || write.includes('/')
    )
    expect(hasSpinnerOutput).toBe(false)
  })
})