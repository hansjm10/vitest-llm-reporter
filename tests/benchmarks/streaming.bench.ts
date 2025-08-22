/**
 * Streaming Performance Benchmarks
 *
 * Benchmarks for the streaming system performance including buffer management,
 * output synchronization, background processing, and stream optimization.
 *
 * @module StreamingBenchmarks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Vitest, File } from 'vitest'
import { StreamManager } from '../../src/streaming/StreamManager'
import { OutputSynchronizer } from '../../src/streaming/OutputSynchronizer'
import type { OutputOperation } from '../../src/streaming/OutputSynchronizer'
import { StreamingReporter } from '../../src/streaming/StreamingReporter'
import {
  BenchmarkRunner,
  TestDataGenerator,
  PerformanceAssertions,
  BASELINE_METRICS
} from './utils'
import type { StreamConfig } from '../../src/streaming/types'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'

describe('Streaming Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({
    iterations: 100,
    warmupIterations: 10,
    timeout: 5000
  })

  let tempFiles: string[] = []
  let streamManager: StreamManager

  beforeEach(async () => {
    const config: StreamConfig = {
      enabled: true,
      maxBufferSize: 1024 * 1024, // 1MB
      flushInterval: 100,
      enableBackpressure: true
    }
    streamManager = new StreamManager()
    await streamManager.initialize(config)
  })

  afterEach(async () => {
    if (streamManager?.isReady()) {
      await streamManager.close()
    }

    for (const file of tempFiles) {
      try {
        await unlink(file)
      } catch {
        // Ignore cleanup errors
      }
    }
    tempFiles = []
  })

  describe('Basic Streaming Operations', () => {
    it('should write single stream operation efficiently', async () => {
      const data = TestDataGenerator.generateMockTask()

      const result = await runner.run('streaming_single_write', async () => {
        await streamManager.write(data)
      })

      PerformanceAssertions.assertMeetsBaseline(
        result,
        BASELINE_METRICS.STREAMING_LATENCY,
        'Single stream write'
      )
      PerformanceAssertions.assertOpsPerSecond(result, BASELINE_METRICS.OPS_PER_SECOND.STREAMING)
      PerformanceAssertions.assertSuccessRate(result, 99)

      expect(result.averageTime).toBeLessThan(BASELINE_METRICS.STREAMING_LATENCY)
      expect(result.successRate).toBeGreaterThan(98)
    })

    it('should handle batch writes efficiently', async () => {
      const batchSize = 10
      const data = TestDataGenerator.generateTestSuite(batchSize)

      const result = await runner.run('streaming_batch_write', async () => {
        for (const item of data) {
          await streamManager.write(item)
        }
      })

      PerformanceAssertions.assertMeetsBaseline(result, 50, 'Batch stream writes')
      PerformanceAssertions.assertOpsPerSecond(result, 200)
      PerformanceAssertions.assertSuccessRate(result, 98)

      expect(result.averageTime).toBeLessThan(50)
    })

    it('should flush streams efficiently', async () => {
      // Pre-populate stream with data
      const data = TestDataGenerator.generateTestSuite(20)
      for (const item of data) {
        await streamManager.write(item)
      }

      const result = await runner.run('streaming_flush', async () => {
        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 20, 'Stream flush')
      PerformanceAssertions.assertSuccessRate(result, 99)

      expect(result.averageTime).toBeLessThan(20)
    })
  })

  describe('Buffer Management Performance', () => {
    it('should handle buffer growth efficiently', async () => {
      const result = await runner.run('streaming_buffer_growth', async () => {
        // Generate data that will cause buffer growth
        const largeData = TestDataGenerator.generateMemoryIntensiveData(1) // 1MB

        for (let i = 0; i < 10; i++) {
          await streamManager.write({ ...largeData, index: i })
        }

        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 200, 'Buffer growth handling')
      PerformanceAssertions.assertMemoryWithinLimits(result, 150)
      PerformanceAssertions.assertSuccessRate(result, 95)

      expect(result.averageTime).toBeLessThan(200)
    })

    it('should handle buffer overflow gracefully', async () => {
      const result = await runner.run('streaming_buffer_overflow', async () => {
        // Generate data larger than buffer
        const largeDataItems = Array.from(
          { length: 50 },
          (_: unknown, _i: number) => TestDataGenerator.generateMemoryIntensiveData(0.1) // 100KB each
        )

        for (const item of largeDataItems) {
          await streamManager.write(item)
        }

        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 500, 'Buffer overflow handling')
      PerformanceAssertions.assertSuccessRate(result, 95)

      expect(result.averageTime).toBeLessThan(500)
    })
  })

  describe('Backpressure Performance', () => {
    it('should handle backpressure efficiently', async () => {
      const result = await runner.run('streaming_backpressure', async () => {
        // Simulate high-frequency writes that trigger backpressure
        const promises = Array.from({ length: 100 }, async (_: unknown, i: number) => {
          const data = TestDataGenerator.generateMockTask(`high-freq-${i}`)
          return streamManager.write(data)
        })

        await Promise.all(promises)
        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 300, 'Backpressure handling')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 200)

      expect(result.averageTime).toBeLessThan(300)
    })
  })

  describe('Output Synchronization Performance', () => {
    it('should synchronize output efficiently', async () => {
      const outputFile = join(tmpdir(), `bench-sync-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const synchronizer = new OutputSynchronizer({
        outputPath: outputFile,
        enabled: true,
        maxRetries: 3,
        lockTimeout: 1000
      })

      const result = await runner.run('streaming_output_sync', async () => {
        const data = TestDataGenerator.generateTestSuite(20)

        await (
          synchronizer as Record<string, unknown> as {
            synchronize: (
              fn: (writer: { write: (data: string) => Promise<void> }) => Promise<void>
            ) => Promise<void>
          }
        ).synchronize(async (writer) => {
          for (const item of data) {
            await writer.write(JSON.stringify(item) + '\n')
          }
        })
      })

      PerformanceAssertions.assertMeetsBaseline(result, 100, 'Output synchronization')
      PerformanceAssertions.assertSuccessRate(result, 98)

      expect(result.averageTime).toBeLessThan(100)
    })

    it('should handle concurrent synchronization', async () => {
      const outputFile = join(tmpdir(), `bench-concurrent-sync-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const result = await runner.run('streaming_concurrent_sync', async () => {
        const synchronizers = Array.from(
          { length: 4 },
          () =>
            new OutputSynchronizer({
              outputPath: outputFile,
              enabled: true,
              maxRetries: 3,
              lockTimeout: 1000
            })
        )

        const promises = synchronizers.map((sync, i) => {
          const data = TestDataGenerator.generateTestSuite(5)

          // Use writeOutput instead of non-existent synchronize method
          const operations = data.map((item) => ({
            testId: `sync-${i}-${item.id}`,
            timestamp: Date.now(),
            data: JSON.stringify({ ...item, syncId: i }) + '\n'
          } as OutputOperation))

          return Promise.all(operations.map((op) => sync.writeOutput(op)))
        })

        await Promise.all(promises)
      })

      PerformanceAssertions.assertMeetsBaseline(result, 200, 'Concurrent synchronization')
      PerformanceAssertions.assertSuccessRate(result, 95)

      expect(result.averageTime).toBeLessThan(200)
    })
  })

  describe('Streaming Reporter Performance', () => {
    it('should handle streaming reporter operations efficiently', async () => {
      const outputFile = join(tmpdir(), `bench-streaming-reporter-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const result = await runner.run('streaming_reporter', async () => {
        const streamingReporter = new StreamingReporter({
          outputFile,
          enableStreaming: true,
          streamConfig: {
            enabled: true,
            maxBufferSize: 1024 * 1024,
            flushInterval: 50,
            enableBackpressure: true
          }
        })

        const tasks = TestDataGenerator.generateTestSuite(30)

        await streamingReporter.initialize()

        // Simulate test events
        for (const task of tasks) {
          await streamingReporter.onTestFinished(task)
        }

        await streamingReporter.finalize()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 300, 'Streaming reporter operations')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 100)

      expect(result.averageTime).toBeLessThan(300)
    })
  })

  describe('Stream Optimization Performance', () => {
    it('should optimize buffer sizes dynamically', async () => {
      const result = await runner.run('streaming_buffer_optimization', async () => {
        // Start with small buffer and let it optimize
        const config: StreamConfig = {
          enabled: true,
          maxBufferSize: 4096, // Start small
          flushInterval: 100,
          enableBackpressure: true
        }

        const testManager = new StreamManager()
        await testManager.initialize(config)

        try {
          // Generate varying load patterns
          const phases = [
            { size: 10, dataSize: 0.01 }, // Small data, few items
            { size: 50, dataSize: 0.05 }, // Medium data
            { size: 20, dataSize: 0.1 } // Large data, fewer items
          ]

          for (const phase of phases) {
            const data = Array.from({ length: phase.size }, (_, i) =>
              TestDataGenerator.generateMemoryIntensiveData(phase.dataSize)
            )

            for (const item of data) {
              await testManager.write(item)
            }

            await testManager.flush()
          }
        } finally {
          await testManager.close()
        }
      })

      PerformanceAssertions.assertMeetsBaseline(result, 400, 'Buffer optimization')
      PerformanceAssertions.assertSuccessRate(result, 95)

      expect(result.averageTime).toBeLessThan(400)
    })

    it('should handle adaptive flush intervals', async () => {
      const result = await runner.run('streaming_adaptive_flush', async () => {
        const config: StreamConfig = {
          enabled: true,
          maxBufferSize: 1024 * 1024,
          flushInterval: 50, // Start with fast flush
          enableBackpressure: true
        }

        const testManager = new StreamManager()
        await testManager.initialize(config)

        try {
          // Generate burst patterns
          for (let burst = 0; burst < 5; burst++) {
            const burstData = TestDataGenerator.generateTestSuite(20)

            // Write burst quickly
            for (const item of burstData) {
              await testManager.write(item)
            }

            // Small delay between bursts
            await new Promise((resolve) => setTimeout(resolve, 10))
          }

          await testManager.flush()
        } finally {
          await testManager.close()
        }
      })

      PerformanceAssertions.assertMeetsBaseline(result, 300, 'Adaptive flush intervals')
      PerformanceAssertions.assertSuccessRate(result, 95)

      expect(result.averageTime).toBeLessThan(300)
    })
  })

  describe('High Throughput Performance', () => {
    it('should handle high-frequency writes', async () => {
      const result = await runner.run('streaming_high_frequency', async () => {
        const promises = Array.from({ length: 200 }, async (_, i) => {
          const data = TestDataGenerator.generateMockTask(`high-freq-${i}`)
          return streamManager.write(data)
        })

        await Promise.all(promises)
        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 500, 'High-frequency writes')
      PerformanceAssertions.assertOpsPerSecond(result, 10)
      PerformanceAssertions.assertSuccessRate(result, 95)

      expect(result.averageTime).toBeLessThan(500)
    })

    it('should maintain throughput under sustained load', async () => {
      const result = await runner.run('streaming_sustained_load', async () => {
        // Simulate sustained load over time
        for (let batch = 0; batch < 10; batch++) {
          const batchData = TestDataGenerator.generateTestSuite(20)

          for (const item of batchData) {
            await streamManager.write(item)
          }

          // Periodic flush to simulate real usage
          if (batch % 3 === 0) {
            await streamManager.flush()
          }
        }

        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 1000, 'Sustained load handling')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 200)

      expect(result.averageTime).toBeLessThan(1000)
    })
  })

  describe('Memory Efficiency', () => {
    it('should manage memory efficiently during streaming', async () => {
      const result = await runner.run('streaming_memory_efficiency', async () => {
        // Generate large amounts of data to test memory management
        for (let i = 0; i < 100; i++) {
          const largeData = TestDataGenerator.generateMemoryIntensiveData(0.1) // 100KB
          await streamManager.write(largeData)

          // Flush periodically to manage memory
          if (i % 20 === 0) {
            await streamManager.flush()
          }
        }

        await streamManager.flush()
      })

      PerformanceAssertions.assertMemoryWithinLimits(result, 250)
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertGCCount(result, 20)

      // Memory delta should be reasonable despite large data
      expect(result.memoryDelta).toBeLessThan(100 * 1024 * 1024) // 100MB max delta
    })
  })

  describe('Error Recovery Performance', () => {
    it('should recover from stream errors efficiently', async () => {
      const result = await runner.run('streaming_error_recovery', async () => {
        // Simulate operations that might cause errors
        const operations = Array.from({ length: 50 }, (_, i) => ({
          data: TestDataGenerator.generateMockTask(`error-test-${i}`),
          shouldError: i % 10 === 0 // 10% error rate
        }))

        for (const { data, shouldError } of operations) {
          try {
            if (shouldError) {
              // Simulate error condition
              await streamManager.write(null as any)
            } else {
              await streamManager.write(data)
            }
          } catch {
            // Continue processing despite errors
          }
        }

        await streamManager.flush()
      })

      PerformanceAssertions.assertMeetsBaseline(result, 400, 'Error recovery')
      PerformanceAssertions.assertSuccessRate(result, 80) // Lower due to intentional errors

      expect(result.averageTime).toBeLessThan(400)
    })
  })

  describe('Configuration Impact', () => {
    it('should compare performance across different buffer sizes', async () => {
      const bufferSizes = [4096, 16384, 65536, 262144] // 4KB to 256KB
      const results = []

      for (const bufferSize of bufferSizes) {
        const config: StreamConfig = {
          enabled: true,
          maxBufferSize: bufferSize,
          flushInterval: 100,
          enableBackpressure: true
        }

        const testManager = new StreamManager()
        await testManager.initialize(config)

        const result = await runner.run(`streaming_buffer_${bufferSize}`, async () => {
          const data = TestDataGenerator.generateTestSuite(30)

          for (const item of data) {
            await testManager.write(item)
          }

          await testManager.flush()
        })

        await testManager.close()
        results.push({ bufferSize, result })
      }

      // All configurations should meet baseline
      for (const { result } of results) {
        PerformanceAssertions.assertSuccessRate(result, 95)
        expect(result.averageTime).toBeLessThan(300)
      }

      // Optimal buffer size should exist
      const times = results.map((r) => r.result.averageTime)
      const minTime = Math.min(...times)
      const maxTime = Math.max(...times)
      expect(maxTime / minTime).toBeLessThan(3) // Performance shouldn't vary by more than 3x
    })
  })
})
