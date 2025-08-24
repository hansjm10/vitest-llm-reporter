/**
 * Streaming Performance Benchmarks (Simplified)
 *
 * Consolidated streaming tests using parameterization for core scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StreamBuffer } from '../../src/streaming/StreamBuffer'
import type { StreamBufferConfig } from '../../src/streaming/StreamBuffer'
import { BenchmarkRunner, TestDataGenerator, PerformanceAssertions } from './utils'

describe('Streaming Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({ iterations: 100, warmupIterations: 10, timeout: 5000 })

  let buffer: StreamBuffer

  beforeEach(() => {
    const config: StreamBufferConfig = {
      enabled: true,
      maxBufferSize: 10000,
      flushOnError: true
    }
    buffer = new StreamBuffer(config)
    buffer.start()
  })

  afterEach(() => {
    buffer?.clear()
  })

  describe.each([
    ['single', 1, 10],
    ['small_batch', 10, 50],
    ['large_batch', 100, 200],
    ['high_frequency', 200, 500]
  ] as const)('Streaming %s operations', (_name, count, maxMs) => {
    it(`handles ${count} writes within ${maxMs}ms`, async () => {
      const data = TestDataGenerator.generateTests(count)

      const result = await runner.run(`streaming_${_name}`, async () => {
        for (const d of data) {
          buffer.addEvent('test-complete', d)
        }
        buffer.flush()
      })

      PerformanceAssertions.assertPerformance(result, maxMs, `Streaming ${_name}`)
      PerformanceAssertions.assertReliability(result, 95)
      PerformanceAssertions.assertResources(result, 200)

      expect(result.averageTime).toBeLessThanOrEqual(maxMs)
    })
  })
})
