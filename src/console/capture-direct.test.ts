import { describe, it, expect } from 'vitest'
import { ConsoleCapture } from './capture.js'

describe('ConsoleCapture Direct Test', () => {
  it('should capture ingested console logs', () => {
    const capture = new ConsoleCapture({ enabled: true })
    const testId = 'direct-test'

    // Start capture
    capture.startCapture(testId)

    // Ingest logs directly
    capture.ingest(testId, 'log', ['Test log message'])
    capture.ingest(testId, 'error', ['Test error message'])
    capture.ingest(testId, 'warn', ['Test warning'])

    // Stop and get output
    const output = capture.stopCapture(testId)

    console.log('Direct capture output:', JSON.stringify(output, null, 2))

    // Verify output
    expect(output).toBeDefined()
    expect(output.entries).toBeInstanceOf(Array)
    expect(output.entries.some((e) => e.level === 'log' && e.message === 'Test log message')).toBe(
      true
    )
    expect(
      output.entries.some((e) => e.level === 'error' && e.message === 'Test error message')
    ).toBe(true)
    expect(output.entries.some((e) => e.level === 'warn' && e.message === 'Test warning')).toBe(
      true
    )
  })
})
