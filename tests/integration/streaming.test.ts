/**
 * Streaming Workflow Integration Tests
 *
 * Tests the integration between StreamManager, ConsoleStreamAdapter,
 * and the overall streaming infrastructure.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MockConsoleStreamAdapter,
  createIntegratedMockServices
} from '../fixtures/mock-implementations'
import {
  createStreamOperations,
  createConsoleStreamData,
  SAMPLE_TEST_DATA
} from '../fixtures/test-data'
import type { StreamConfig, StreamOperation, StreamEvent } from '../../src/streaming/types'

describe('Streaming Workflow Integration', () => {
  let services: ReturnType<typeof createIntegratedMockServices>

  beforeEach(() => {
    services = createIntegratedMockServices()
  })

  afterEach(async () => {
    if (services.streamManager.isReady()) {
      await services.streamManager.close()
    }
    services.consoleAdapter.destroy()
  })

  describe('StreamManager Initialization and Configuration', () => {
    it('should initialize with default configuration', async () => {
      const config: StreamConfig = {
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      }

      await services.streamManager.initialize(config)

      expect(services.streamManager.isReady()).toBe(true)
      expect(services.streamManager.getConfig()).toEqual(config)
    })

    it('should handle disabled streaming configuration', async () => {
      const config: StreamConfig = {
        enabled: false,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: false
      }

      await services.streamManager.initialize(config)

      expect(services.streamManager.isReady()).toBe(false)
    })

    it('should emit stream_start event on initialization', async () => {
      const events: StreamEvent[] = []
      services.streamManager.on('stream_start', (event) => events.push(event))

      const config: StreamConfig = {
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      }

      await services.streamManager.initialize(config)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('stream_start')
    })
  })

  describe('Stream Operations and Data Flow', () => {
    beforeEach(async () => {
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
    })

    it('should write and track stream operations', async () => {
      const operations = createStreamOperations(5)

      for (const operation of operations) {
        await services.streamManager.write(operation)
      }

      const writtenOperations = services.streamManager.getOperations()
      expect(writtenOperations).toHaveLength(5)
      expect(writtenOperations).toEqual(operations)
    })

    it('should emit stream_data events for each operation', async () => {
      const events: StreamEvent[] = []
      services.streamManager.on('stream_data', (event) => events.push(event))

      const operations = createStreamOperations(3)

      for (const operation of operations) {
        await services.streamManager.write(operation)
      }

      expect(events).toHaveLength(3)
      events.forEach((event, _index) => {
        expect(event.type).toBe('stream_data')
        expect(event.data).toHaveProperty('operation')
      })
    })

    it('should handle high-priority operations', async () => {
      const criticalOperation: StreamOperation = {
        content: 'Critical system error',
        priority: 0, // CRITICAL
        stream: 'stderr',
        testId: 'critical-test',
        timestamp: Date.now()
      }

      await services.streamManager.write(criticalOperation)

      const operations = services.streamManager.getOperations()
      expect(operations[0]).toEqual(criticalOperation)
    })

    it('should flush operations and emit flush event', async () => {
      const flushEvents: StreamEvent[] = []
      services.streamManager.on('stream_flush', (event) => flushEvents.push(event))

      const operations = createStreamOperations(3)
      for (const operation of operations) {
        await services.streamManager.write(operation)
      }

      await services.streamManager.flush()

      expect(flushEvents).toHaveLength(1)
      expect(flushEvents[0].type).toBe('stream_flush')
      expect(flushEvents[0].data).toHaveProperty('operationsCount', 3)
    })

    it('should reject operations when not ready', async () => {
      await services.streamManager.close()

      const operation = createStreamOperations(1)[0]

      await expect(services.streamManager.write(operation)).rejects.toThrow(
        'StreamManager not initialized or not ready'
      )
    })
  })

  describe('Console Stream Adapter Integration', () => {
    beforeEach(async () => {
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
      services.consoleAdapter.initialize(services.streamManager)
    })

    it('should initialize adapter with stream manager', () => {
      expect(services.consoleAdapter.isReady()).toBe(true)
    })

    it('should stream console data through stream manager', async () => {
      const consoleData = createConsoleStreamData(3)

      for (const data of consoleData) {
        await services.consoleAdapter.streamConsoleData(data)
      }

      const streamedData = services.consoleAdapter.getStreamedData()
      const streamOperations = services.streamManager.getOperations()

      expect(streamedData).toHaveLength(3)
      expect(streamOperations).toHaveLength(3)
      expect(streamedData).toEqual(consoleData)
    })

    it('should convert console data to stream operations correctly', async () => {
      const logData = SAMPLE_TEST_DATA.consoleLog
      const errorData = SAMPLE_TEST_DATA.consoleError

      await services.consoleAdapter.streamConsoleData(logData)
      await services.consoleAdapter.streamConsoleData(errorData)

      const operations = services.streamManager.getOperations()

      expect(operations).toHaveLength(2)

      // Log operation should go to stdout with normal priority
      expect(operations[0].stream).toBe('stdout')
      expect(operations[0].priority).toBe(2)
      expect(operations[0].testId).toBe(logData.testId)

      // Error operation should go to stderr with high priority
      expect(operations[1].stream).toBe('stderr')
      expect(operations[1].priority).toBe(1)
      expect(operations[1].testId).toBe(errorData.testId)
    })

    it('should handle adapter destruction', () => {
      services.consoleAdapter.destroy()

      expect(services.consoleAdapter.isReady()).toBe(false)
      expect(services.consoleAdapter.getStreamedData()).toHaveLength(0)
    })

    it('should reject operations when adapter not ready', async () => {
      services.consoleAdapter.destroy()

      const consoleData = createConsoleStreamData(1)[0]

      await expect(services.consoleAdapter.streamConsoleData(consoleData)).rejects.toThrow(
        'Adapter not initialized or not ready'
      )
    })
  })

  describe('Event System Integration', () => {
    beforeEach(async () => {
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
    })

    it('should handle multiple event listeners', async () => {
      const listener1Events: StreamEvent[] = []
      const listener2Events: StreamEvent[] = []

      services.streamManager.on('stream_data', (event) => listener1Events.push(event))
      services.streamManager.on('stream_data', (event) => listener2Events.push(event))

      const operation = createStreamOperations(1)[0]
      await services.streamManager.write(operation)

      expect(listener1Events).toHaveLength(1)
      expect(listener2Events).toHaveLength(1)
    })

    it('should remove event listeners correctly', async () => {
      const events: StreamEvent[] = []
      const listener = (event: StreamEvent) => events.push(event)

      services.streamManager.on('stream_data', listener)

      const operation1 = createStreamOperations(1)[0]
      await services.streamManager.write(operation1)

      services.streamManager.off('stream_data', listener)

      const operation2 = createStreamOperations(1)[0]
      await services.streamManager.write(operation2)

      expect(events).toHaveLength(1) // Only first operation should be captured
    })

    it('should emit stream_end event on close', async () => {
      const endEvents: StreamEvent[] = []
      services.streamManager.on('stream_end', (event) => endEvents.push(event))

      await services.streamManager.close()

      expect(endEvents).toHaveLength(1)
      expect(endEvents[0].type).toBe('stream_end')
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle stream manager initialization failure gracefully', async () => {
      // Simulate initialization with invalid config
      const invalidConfig = {
        enabled: true,
        maxBufferSize: -1, // Invalid buffer size
        flushInterval: 0, // Invalid interval
        enableBackpressure: true
      }

      // Mock implementation should still initialize but track the invalid config
      await services.streamManager.initialize(invalidConfig as StreamConfig)
      expect(services.streamManager.getConfig()).toEqual(invalidConfig)
    })

    it('should handle console adapter without stream manager', async () => {
      const standalone = new MockConsoleStreamAdapter()
      const consoleData = createConsoleStreamData(1)[0]

      await expect(standalone.streamConsoleData(consoleData)).rejects.toThrow(
        'Adapter not initialized or not ready'
      )
    })

    it('should maintain state consistency after errors', async () => {
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })

      // Write some operations successfully
      const operations1 = createStreamOperations(2)
      for (const op of operations1) {
        await services.streamManager.write(op)
      }

      // Close and reinitialize
      await services.streamManager.close()
      expect(services.streamManager.isReady()).toBe(false)

      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })

      // Should start fresh
      expect(services.streamManager.getOperations()).toHaveLength(0)
      expect(services.streamManager.isReady()).toBe(true)
    })
  })

  describe('Performance and Timing', () => {
    beforeEach(async () => {
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
    })

    it('should handle rapid operation writes', async () => {
      const startTime = Date.now()
      const operations = createStreamOperations(100)

      for (const operation of operations) {
        await services.streamManager.write(operation)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(services.streamManager.getOperations()).toHaveLength(100)
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent console streaming', async () => {
      services.consoleAdapter.initialize(services.streamManager)

      const consoleData = createConsoleStreamData(50)
      const promises = consoleData.map((data) => services.consoleAdapter.streamConsoleData(data))

      await Promise.all(promises)

      expect(services.consoleAdapter.getStreamedData()).toHaveLength(50)
      expect(services.streamManager.getOperations()).toHaveLength(50)
    })

    it('should maintain operation ordering under load', async () => {
      const orderedOperations = createStreamOperations(20).map((op, index) => ({
        ...op,
        content: `Operation ${index}`,
        timestamp: Date.now() + index
      }))

      for (const operation of orderedOperations) {
        await services.streamManager.write(operation)
      }

      const writtenOperations = services.streamManager.getOperations()

      for (let i = 0; i < orderedOperations.length; i++) {
        expect(writtenOperations[i].content).toBe(`Operation ${i}`)
      }
    })
  })
})
