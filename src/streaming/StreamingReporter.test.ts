/**
 * StreamingReporter Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { StreamingReporter } from './StreamingReporter.js'

describe('StreamingReporter', () => {
  it('should create reporter with default config', () => {
    const reporter = new StreamingReporter()
    expect(reporter).toBeDefined()
    expect(reporter.isStreaming).toBe(false)
  })

  it('should enable streaming when configured', () => {
    const reporter = new StreamingReporter({ enableStreaming: true })
    expect(reporter.isStreaming).toBe(true)
  })

  it('should allow enabling/disabling streaming at runtime', () => {
    const reporter = new StreamingReporter()
    expect(reporter.isStreaming).toBe(false)

    reporter.setStreamingEnabled(true)
    expect(reporter.isStreaming).toBe(true)

    reporter.setStreamingEnabled(false)
    expect(reporter.isStreaming).toBe(false)
  })

  it('should call custom output handler when streaming', () => {
    const outputHandler = vi.fn()
    const reporter = new StreamingReporter({
      enableStreaming: true,
      onStreamOutput: outputHandler
    })

    // Mock test case with result
    const testCase = {
      name: 'test case',
      result: {
        state: 'pass',
        duration: 100
      }
    } as any

    reporter.onTestCaseResult(testCase)

    expect(outputHandler).toHaveBeenCalledWith('  ✓ test case (100ms)\n')
  })

  it('should handle different test states', () => {
    const outputHandler = vi.fn()
    const reporter = new StreamingReporter({
      enableStreaming: true,
      onStreamOutput: outputHandler
    })

    const passCase = { name: 'pass test', result: { state: 'pass', duration: 50 } } as any
    const failCase = { name: 'fail test', result: { state: 'fail', duration: 60 } } as any
    const skipCase = { name: 'skip test', result: { state: 'skip', duration: 0 } } as any

    reporter.onTestCaseResult(passCase)
    reporter.onTestCaseResult(failCase)
    reporter.onTestCaseResult(skipCase)

    expect(outputHandler).toHaveBeenNthCalledWith(1, '  ✓ pass test (50ms)\n')
    expect(outputHandler).toHaveBeenNthCalledWith(2, '  ✗ fail test (60ms)\n')
    expect(outputHandler).toHaveBeenNthCalledWith(3, '  ○ skip test (0ms)\n')
  })

  it('should not output when streaming is disabled', () => {
    const outputHandler = vi.fn()
    const reporter = new StreamingReporter({
      enableStreaming: false,
      onStreamOutput: outputHandler
    })

    const testCase = {
      name: 'test case',
      result: {
        state: 'pass',
        duration: 100
      }
    } as any

    reporter.onTestCaseResult(testCase)

    expect(outputHandler).not.toHaveBeenCalled()
  })

  it('should handle test cases without results', () => {
    const outputHandler = vi.fn()
    const reporter = new StreamingReporter({
      enableStreaming: true,
      onStreamOutput: outputHandler
    })

    const testCase = {
      name: 'test case',
      result: null
    } as any

    reporter.onTestCaseResult(testCase)

    expect(outputHandler).not.toHaveBeenCalled()
  })
})
