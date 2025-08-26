/* eslint-disable no-console */
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
    expect(output?.logs).toBeInstanceOf(Array)
    expect(output?.logs).toContain('Test log message')
    expect(output?.errors).toBeInstanceOf(Array)
    expect(output?.errors).toContain('Test error message')
    expect(output?.warns).toBeInstanceOf(Array)
    expect(output?.warns).toContain('Test warning')
  })
})
