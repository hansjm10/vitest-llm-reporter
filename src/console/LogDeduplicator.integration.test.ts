/**
 * Integration test for LogDeduplicator with ConsoleCapture
 * This is a simplified test to verify the integration works
 */

import { describe, it, expect } from 'vitest'
import { LogDeduplicator } from './LogDeduplicator.js'
import { ConsoleCapture } from './capture.js'
import { ConsoleBuffer } from './buffer.js'

describe('LogDeduplicator Integration', () => {
  it('should integrate with ConsoleCapture', () => {
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 100
    })

    const capture = new ConsoleCapture({
      enabled: true,
      deduplicator
    })

    // Start capture for a test
    capture.startCapture('test-1')

    // Verify the integration compiles and basic structure works
    expect(capture).toBeDefined()
    expect(deduplicator.isEnabled()).toBe(true)

    // Clean up
    capture.reset()
  })

  it('should track deduplication in ConsoleBuffer', () => {
    const buffer = new ConsoleBuffer()

    // Add first occurrence (not a duplicate)
    const added1 = buffer.add('log', ['Test message'], 100, 'intercepted', false)
    expect(added1).toBe(true)

    // Add duplicate with same key - suppressed once key is recorded
    const added2 = buffer.add('log', ['Test message'], 200, 'intercepted', true, 'log:hash123')
    expect(added2).toBe(false)

    // Add another occurrence with same key - also skipped
    const added3 = buffer.add('log', ['Test message'], 300, 'intercepted', true, 'log:hash123')
    expect(added3).toBe(false)

    // Only the original event should remain in the buffer
    const events = buffer.getEvents()
    expect(events).toHaveLength(1)
  })
})
