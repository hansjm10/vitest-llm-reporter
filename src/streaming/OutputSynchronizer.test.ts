/**
 * Tests for OutputSynchronizer
 *
 * @module streaming/OutputSynchronizer.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { OutputSynchronizer } from './OutputSynchronizer.js'
import { OutputPriority, OutputSource } from './queue.js'

// Mock process.stdout and process.stderr
const mockStdout = {
  write: vi.fn()
}

const mockStderr = {
  write: vi.fn()
}

// Preserve the original process object and only override stdout/stderr
const originalProcess = process
vi.stubGlobal('process', {
  ...originalProcess,
  stdout: mockStdout,
  stderr: mockStderr
})

describe('OutputSynchronizer', () => {
  let synchronizer: OutputSynchronizer

  beforeEach(() => {
    synchronizer = new OutputSynchronizer({
      locks: { timeout: 1000 },
      queue: { enableBatching: false },
      maxConcurrentTests: 5,
      enableMonitoring: false // Disable for testing
    })

    // Clear mock calls
    mockStdout.write.mockClear()
    mockStderr.write.mockClear()
  })

  afterEach(async () => {
    await synchronizer.shutdown()
  })

  describe('test context management', () => {
    it('should register test contexts', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'should work')

      await expect(synchronizer.registerTest(context)).resolves.toBeUndefined()

      const stats = synchronizer.getStats()
      expect(stats.activeTests).toBe(1)

      const activeTests = synchronizer.getActiveTests()
      expect(activeTests).toHaveLength(1)
      expect(activeTests[0]).toEqual(context)
    })

    it('should unregister test contexts', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'should work')

      await synchronizer.registerTest(context)
      expect(synchronizer.getStats().activeTests).toBe(1)

      await synchronizer.unregisterTest(context)
      expect(synchronizer.getStats().activeTests).toBe(0)
    })

    it('should prevent duplicate test registration', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'should work')

      await synchronizer.registerTest(context)

      await expect(synchronizer.registerTest(context)).rejects.toThrow('Test already registered')
    })

    it('should enforce concurrent test limit', async () => {
      const limitedSync = new OutputSynchronizer({
        maxConcurrentTests: 2,
        enableMonitoring: false
      })

      try {
        // Register up to limit
        const context1 = OutputSynchronizer.createTestContext('test1.test.ts', 'test1')
        const context2 = OutputSynchronizer.createTestContext('test2.test.ts', 'test2')

        await limitedSync.registerTest(context1)
        await limitedSync.registerTest(context2)

        // This should fail
        const context3 = OutputSynchronizer.createTestContext('test3.test.ts', 'test3')
        await expect(limitedSync.registerTest(context3)).rejects.toThrow(
          'Maximum concurrent tests exceeded'
        )
      } finally {
        await limitedSync.shutdown()
      }
    })
  })

  describe('output operations', () => {
    it('should write to stdout', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      const operation = OutputSynchronizer.createOutputOperation(
        'test output\n',
        'stdout',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        context
      )

      await synchronizer.writeOutput(operation)

      expect(mockStdout.write).toHaveBeenCalledWith('test output\n')
      expect(mockStderr.write).not.toHaveBeenCalled()
    })

    it('should write to stderr', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      const operation = OutputSynchronizer.createOutputOperation(
        'error output\n',
        'stderr',
        OutputPriority.HIGH,
        OutputSource.ERROR,
        context
      )

      await synchronizer.writeOutput(operation)

      expect(mockStderr.write).toHaveBeenCalledWith('error output\n')
      expect(mockStdout.write).not.toHaveBeenCalled()
    })

    it('should handle system-level output without context', async () => {
      const operation = OutputSynchronizer.createOutputOperation(
        'system message\n',
        'stdout',
        OutputPriority.CRITICAL,
        OutputSource.SYSTEM
      )

      await synchronizer.writeOutput(operation)

      expect(mockStdout.write).toHaveBeenCalledWith('system message\n')
    })

    it('should reject output for unregistered tests', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      // Don't register the context

      const operation = OutputSynchronizer.createOutputOperation(
        'test output\n',
        'stdout',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        context
      )

      await expect(synchronizer.writeOutput(operation)).rejects.toThrow('Test not registered')
    })

    it('should handle buffer data', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      const buffer = Buffer.from('buffer output\n', 'utf8')
      const operation = OutputSynchronizer.createOutputOperation(
        buffer,
        'stdout',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        context
      )

      await synchronizer.writeOutput(operation)

      expect(mockStdout.write).toHaveBeenCalledWith(buffer)
    })
  })

  describe('concurrent output coordination', () => {
    it('should coordinate output from multiple tests', async () => {
      const context1 = OutputSynchronizer.createTestContext('test1.test.ts', 'test1')
      const context2 = OutputSynchronizer.createTestContext('test2.test.ts', 'test2')

      await synchronizer.registerTest(context1)
      await synchronizer.registerTest(context2)

      const outputs: string[] = []

      // Mock stdout to capture order
      mockStdout.write.mockImplementation((data: string) => {
        outputs.push(data)
      })

      // Send outputs concurrently
      const promises = []

      promises.push(
        synchronizer.writeOutput(
          OutputSynchronizer.createOutputOperation(
            'output1\n',
            'stdout',
            OutputPriority.NORMAL,
            OutputSource.TEST,
            context1
          )
        )
      )

      promises.push(
        synchronizer.writeOutput(
          OutputSynchronizer.createOutputOperation(
            'output2\n',
            'stdout',
            OutputPriority.NORMAL,
            OutputSource.TEST,
            context2
          )
        )
      )

      await Promise.all(promises)

      expect(outputs).toHaveLength(2)
      expect(outputs).toContain('output1\n')
      expect(outputs).toContain('output2\n')
    })

    it('should respect priority ordering', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      const outputs: string[] = []
      mockStdout.write.mockImplementation((data: string) => {
        outputs.push(data)
      })

      // Send in reverse priority order
      const promises = []

      promises.push(
        synchronizer.writeOutput(
          OutputSynchronizer.createOutputOperation(
            'low\n',
            'stdout',
            OutputPriority.LOW,
            OutputSource.TEST,
            context
          )
        )
      )

      promises.push(
        synchronizer.writeOutput(
          OutputSynchronizer.createOutputOperation(
            'critical\n',
            'stdout',
            OutputPriority.CRITICAL,
            OutputSource.ERROR,
            context
          )
        )
      )

      promises.push(
        synchronizer.writeOutput(
          OutputSynchronizer.createOutputOperation(
            'high\n',
            'stdout',
            OutputPriority.HIGH,
            OutputSource.TEST,
            context
          )
        )
      )

      await Promise.all(promises)

      expect(outputs).toEqual(['critical\n', 'high\n', 'low\n'])
    })
  })

  describe('flushing and cleanup', () => {
    it('should flush all pending output', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      // Queue some operations with delays
      const promises = []
      for (let i = 0; i < 3; i++) {
        promises.push(
          synchronizer.writeOutput(
            OutputSynchronizer.createOutputOperation(
              `output${i}\n`,
              'stdout',
              OutputPriority.NORMAL,
              OutputSource.TEST,
              context
            )
          )
        )
      }

      // Wait for all operations and then flush
      await Promise.all(promises)
      await synchronizer.flush()

      // All outputs should be complete
      expect(mockStdout.write).toHaveBeenCalledTimes(3)
    })

    it('should wait for test completion', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      // Start some output
      const outputPromise = synchronizer.writeOutput(
        OutputSynchronizer.createOutputOperation(
          'test output\n',
          'stdout',
          OutputPriority.NORMAL,
          OutputSource.TEST,
          context
        )
      )

      // Unregister should wait for output completion
      await Promise.all([outputPromise, synchronizer.unregisterTest(context)])

      expect(mockStdout.write).toHaveBeenCalledWith('test output\n')
      expect(synchronizer.getStats().activeTests).toBe(0)
    })
  })

  describe('statistics and monitoring', () => {
    it('should provide comprehensive statistics', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      const initialStats = synchronizer.getStats()
      expect(initialStats.activeTests).toBe(1)
      expect(initialStats.queue).toBeDefined()
      expect(initialStats.locks).toBeDefined()
      expect(initialStats.performance).toBeDefined()
    })

    it('should track performance metrics', async () => {
      // Create a new synchronizer with monitoring enabled for this test
      const monitoringSync = new OutputSynchronizer({
        locks: { timeout: 1000 },
        queue: { enableBatching: false },
        enableMonitoring: true
      })

      try {
        const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
        await monitoringSync.registerTest(context)

        await monitoringSync.writeOutput(
          OutputSynchronizer.createOutputOperation(
            'test output\n',
            'stdout',
            OutputPriority.NORMAL,
            OutputSource.TEST,
            context
          )
        )

        const stats = monitoringSync.getStats()
        expect(stats.performance.totalOperations).toBeGreaterThan(0)
        expect(stats.performance.avgProcessingTime).toBeGreaterThanOrEqual(0)
      } finally {
        await monitoringSync.shutdown()
      }
    })

    it('should detect idle state', async () => {
      expect(synchronizer.isIdle).toBe(true)

      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      expect(synchronizer.isIdle).toBe(false)

      await synchronizer.unregisterTest(context)
      expect(synchronizer.isIdle).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle write errors gracefully', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      // Mock an error in stdout.write
      mockStdout.write.mockImplementationOnce(() => {
        throw new Error('Write error')
      })

      const operation = OutputSynchronizer.createOutputOperation(
        'test output\n',
        'stdout',
        OutputPriority.NORMAL,
        OutputSource.TEST,
        context
      )

      await expect(synchronizer.writeOutput(operation)).rejects.toThrow('Write error')
    })

    it('should handle shutdown gracefully', async () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      await synchronizer.registerTest(context)

      // Start some operations
      const outputPromise = synchronizer.writeOutput(
        OutputSynchronizer.createOutputOperation(
          'test output\n',
          'stdout',
          OutputPriority.NORMAL,
          OutputSource.TEST,
          context
        )
      )

      // Shutdown should wait for completion
      await Promise.all([outputPromise, synchronizer.shutdown()])

      expect(synchronizer.getStats().activeTests).toBe(0)
      expect(synchronizer.isIdle).toBe(true)
    })
  })

  describe('helper methods', () => {
    it('should create test contexts with defaults', () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test case')

      expect(context.file).toBe('test.test.ts')
      expect(context.name).toBe('test case')
      expect(context.priority).toBe(OutputPriority.NORMAL)
      expect(context.id).toMatch(/^test-\d+-[a-z0-9]+$/)
      expect(context.startTime).toBeGreaterThan(0)
    })

    it('should create output operations with defaults', () => {
      const operation = OutputSynchronizer.createOutputOperation('test data')

      expect(operation.data).toBe('test data')
      expect(operation.stream).toBe('stdout')
      expect(operation.priority).toBe(OutputPriority.NORMAL)
      expect(operation.source).toBe(OutputSource.TEST)
      expect(operation.context).toBeUndefined()
    })

    it('should create output operations with custom parameters', () => {
      const context = OutputSynchronizer.createTestContext('test.test.ts', 'test')
      const operation = OutputSynchronizer.createOutputOperation(
        Buffer.from('test'),
        'stderr',
        OutputPriority.HIGH,
        OutputSource.ERROR,
        context
      )

      expect(operation.data).toBeInstanceOf(Buffer)
      expect(operation.stream).toBe('stderr')
      expect(operation.priority).toBe(OutputPriority.HIGH)
      expect(operation.source).toBe(OutputSource.ERROR)
      expect(operation.context).toBe(context)
    })
  })
})
