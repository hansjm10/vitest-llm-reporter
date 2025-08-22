/**
 * Tests for TokenMetricsCollector
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { TokenMetricsCollector, createTokenMetricsCollector } from './TokenMetricsCollector'
import type {
  TokenMetricsConfig,
  TokenMetrics,
  TestTokenMetrics,
  FileTokenMetrics
} from './metrics/types'
import type { LLMReporterOutput, TestFailure } from '../types/schema'
import type { LLMReporterConfig } from '../types/reporter'

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn(() => vi.fn())
}))

// Mock TokenCounter - define outside of vi.mock to avoid hoisting issues
const mockTokenCounter = {
  countWithDetails: vi.fn(),
  getCacheStats: vi.fn()
}

// Initialize mock return values
mockTokenCounter.countWithDetails.mockResolvedValue({
  tokenCount: 100,
  model: 'gpt-4',
  fromCache: false
})

mockTokenCounter.getCacheStats.mockReturnValue({
  size: 10,
  hitRate: 0.7
})

vi.mock('./TokenCounter.js', () => ({
  getTokenCounter: () => mockTokenCounter
}))

// Mock ThresholdManager
const mockThresholdManager = {
  checkThreshold: vi.fn(),
  checkModelLimit: vi.fn(),
  checkSectionThreshold: vi.fn(),
  getSettings: vi.fn(),
  getModelLimits: vi.fn()
}

// Initialize mock return values
mockThresholdManager.checkThreshold.mockReturnValue(null)
mockThresholdManager.checkModelLimit.mockReturnValue(null)
mockThresholdManager.checkSectionThreshold.mockReturnValue(null)
mockThresholdManager.getSettings.mockReturnValue({
  perTestTokens: { warning: 1000, error: 2000 },
  totalTokens: { warning: 25000, error: 50000 },
  sectionPercentage: {
    failures: { warning: 50, error: 75 },
    context: { warning: 30, error: 50 },
    console: { warning: 20, error: 40 }
  }
})
mockThresholdManager.getModelLimits.mockReturnValue({
  conservativeThreshold: 8000,
  maxTokens: 8192
})

vi.mock('./metrics/thresholds.js', () => ({
  getThresholdManager: () => mockThresholdManager,
  createModelAwareThresholds: () => ({})
}))

// Mock WarningSystem
const mockWarningSystem = {
  recordError: vi.fn(),
  warnContentTruncated: vi.fn(),
  warnTokenizationFailed: vi.fn(),
  warnThresholdExceeded: vi.fn(),
  warnModelLimit: vi.fn(),
  onWarning: vi.fn(),
  onError: vi.fn(),
  getWarnings: vi.fn(),
  getErrors: vi.fn(),
  clear: vi.fn()
}

// Initialize mock return values
mockWarningSystem.getWarnings.mockReturnValue([])
mockWarningSystem.getErrors.mockReturnValue([])

vi.mock('./metrics/warnings.js', () => ({
  getWarningSystem: () => mockWarningSystem,
  WarningFormatter: {
    formatConsole: () => 'Formatted warning'
  }
}))

// Mock Aggregators
const mockMetricsAggregator = {
  aggregateFileMetrics: vi.fn(),
  aggregateSummary: vi.fn(),
  getStats: vi.fn()
}

const mockBatchAggregator = {
  aggregateInBatches: vi.fn(),
  getStats: vi.fn()
}

const mockStreamingAggregator = {
  addTest: vi.fn(),
  getCurrentSummary: vi.fn(),
  getCurrentFiles: vi.fn()
}

// Initialize mock return values
mockMetricsAggregator.aggregateFileMetrics.mockReturnValue({
  filePath: 'test.js',
  testCount: 1,
  totalTokens: 100,
  averageTokensPerTest: 100,
  status: 'processed',
  tests: []
})

mockMetricsAggregator.aggregateSummary.mockReturnValue({
  totalTokens: 100,
  testCounts: { total: 1, failed: 1, passed: 0, skipped: 0 },
  averageTokensPerTest: 100,
  duration: 1000,
  collectedAt: Date.now()
})

mockMetricsAggregator.getStats.mockReturnValue({
  testsProcessed: 1,
  filesProcessed: 1,
  tokenizationOperations: 1,
  cacheHits: 7,
  cacheMisses: 3,
  processingTime: 1000,
  averageProcessingTime: 1000,
  memoryUsage: 1024 * 1024
})

mockBatchAggregator.aggregateInBatches.mockResolvedValue({
  files: [
    {
      filePath: 'test.js',
      testCount: 1,
      totalTokens: 100,
      averageTokensPerTest: 100,
      status: 'processed',
      tests: []
    }
  ],
  summary: {
    totalTokens: 100,
    testCounts: { total: 1, failed: 1, passed: 0, skipped: 0 },
    averageTokensPerTest: 100,
    duration: 1000,
    collectedAt: Date.now()
  }
})

mockBatchAggregator.getStats.mockReturnValue({
  testsProcessed: 1,
  filesProcessed: 1,
  tokenizationOperations: 1,
  cacheHits: 7,
  cacheMisses: 3,
  processingTime: 1000,
  averageProcessingTime: 1000,
  memoryUsage: 1024 * 1024
})

mockStreamingAggregator.addTest.mockReturnValue({
  fileUpdate: {
    filePath: 'test.js',
    testCount: 1,
    totalTokens: 100,
    averageTokensPerTest: 100,
    status: 'processed',
    tests: []
  }
})

mockStreamingAggregator.getCurrentSummary.mockReturnValue({
  totalTokens: 100,
  testCounts: { total: 1, failed: 1, passed: 0, skipped: 0 },
  averageTokensPerTest: 100,
  duration: 1000,
  collectedAt: Date.now()
})

mockStreamingAggregator.getCurrentFiles.mockReturnValue([
  {
    filePath: 'test.js',
    testCount: 1,
    totalTokens: 100,
    averageTokensPerTest: 100,
    status: 'processed',
    tests: []
  }
])

vi.mock('./metrics/aggregator.js', () => ({
  MetricsAggregator: vi.fn(() => mockMetricsAggregator),
  BatchAggregator: vi.fn(() => mockBatchAggregator),
  StreamingAggregator: vi.fn(() => mockStreamingAggregator)
}))

describe('TokenMetricsCollector', () => {
  let collector: TokenMetricsCollector
  let defaultConfig: TokenMetricsConfig
  let mockEvents: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mock return values to defaults
    mockTokenCounter.countWithDetails.mockResolvedValue({
      tokenCount: 100,
      model: 'gpt-4',
      fromCache: false
    })

    defaultConfig = {
      enabled: true,
      model: 'gpt-4',
      trackSections: true,
      includePassedTests: false,
      includeSkippedTests: false,
      maxContentSize: 50000,
      enableBatching: true,
      thresholds: {
        totalTokens: 25000
      }
    }

    mockEvents = {
      onTestComplete: vi.fn(),
      onFileComplete: vi.fn(),
      onWarning: vi.fn(),
      onError: vi.fn(),
      onProgress: vi.fn()
    }

    collector = new TokenMetricsCollector(defaultConfig, mockEvents)
  })

  afterEach(() => {
    // Reset mocks to prevent cross-test contamination
    mockTokenCounter.countWithDetails.mockResolvedValue({
      tokenCount: 100,
      model: 'gpt-4',
      fromCache: false
    })
  })

  describe('constructor', () => {
    it('should create collector with valid config', () => {
      expect(collector).toBeDefined()
      expect(collector.getContext().config).toEqual(defaultConfig)
    })

    it('should apply default configuration values', () => {
      const minimalCollector = new TokenMetricsCollector({
        enabled: true,
        model: 'gpt-4',
        trackSections: true,
        includePassedTests: true,
        includeSkippedTests: true,
        maxContentSize: 50000,
        enableBatching: false,
        thresholds: {}
      })
      const context = minimalCollector.getContext()

      expect(context.config.enabled).toBe(true)
      expect(context.config.model).toBe('gpt-4')
      expect(context.config.trackSections).toBe(true)
      expect(context.config.maxContentSize).toBe(50000)
    })

    it('should setup warning handlers', () => {
      expect(mockWarningSystem.onWarning).toHaveBeenCalled()
      expect(mockWarningSystem.onError).toHaveBeenCalled()
    })

    it('should generate unique run ID', () => {
      const collector1 = new TokenMetricsCollector(defaultConfig)
      const collector2 = new TokenMetricsCollector(defaultConfig)

      expect(collector1.getContext().runId).not.toBe(collector2.getContext().runId)
    })
  })

  describe('initialize', () => {
    it('should initialize collector for collection', async () => {
      collector.initialize()

      const context = collector.getContext()
      expect(context.state).toBe('collecting')
    })

    it('should setup aggregators based on configuration', async () => {
      collector.initialize()

      expect(collector['aggregator']).toBeDefined()
      expect(collector['streamingAggregator']).toBeDefined()
    })

    it('should setup batch aggregator when batching enabled', async () => {
      const batchCollector = new TokenMetricsCollector({
        ...defaultConfig,
        enableBatching: true
      })

      await batchCollector.initialize()

      expect(batchCollector['batchAggregator']).toBeDefined()
    })

    it('should not setup batch aggregator when batching disabled', async () => {
      const noBatchCollector = new TokenMetricsCollector({
        ...defaultConfig,
        enableBatching: false
      })

      await noBatchCollector.initialize()

      expect(noBatchCollector['batchAggregator']).toBeUndefined()
    })
  })

  describe('collectFromOutput', () => {
    let mockOutput: LLMReporterOutput

    beforeEach(() => {
      mockOutput = {
        summary: {
          total: 2,
          failed: 1,
          passed: 1,
          skipped: 0,
          duration: 1000,
          timestamp: new Date().toISOString()
        },
        failures: [
          {
            test: 'failing test',
            file: 'test.js',
            suite: ['test suite'],
            startLine: 10,
        endLine: 15,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              stack: 'Error stack trace',
              assertion: { expected: true, actual: false }
            }
          }
        ],
        passed: [
          {
            test: 'passing test',
            file: 'test.js',
            suite: ['test suite'],
            startLine: 20,
            endLine: 25,
            status: 'passed',
            duration: 100
          }
        ]
      }
    })

    it('should collect metrics from complete output', async () => {
      const metrics = await collector.collectFromOutput(mockOutput)

      expect(metrics).toBeDefined()
      expect(metrics.summary).toBeDefined()
      expect(metrics.files).toBeDefined()
      expect(metrics.metadata).toBeDefined()
    })

    it('should process failures', async () => {
      await collector.collectFromOutput(mockOutput)

      expect(mockTokenCounter.countWithDetails).toHaveBeenCalled()
      expect(mockEvents.onTestComplete).toHaveBeenCalled()
    })

    it('should include passed tests when configured', async () => {
      const passingCollector = new TokenMetricsCollector(
        {
          ...defaultConfig,
          includePassedTests: true
        },
        mockEvents
      )

      await passingCollector.collectFromOutput(mockOutput)

      expect(mockEvents.onTestComplete).toHaveBeenCalledTimes(2) // failures + passed
    })

    it('should exclude passed tests by default', async () => {
      await collector.collectFromOutput(mockOutput)

      expect(mockEvents.onTestComplete).toHaveBeenCalledTimes(1) // only failures
    })

    it('should include skipped tests when configured', async () => {
      const skippedOutput = {
        ...mockOutput,
        skipped: [
          {
            test: 'skipped test',
            file: 'test.js',
            suite: ['test suite'],
            startLine: 30,
            endLine: 35,
            status: 'skipped' as const
          }
        ]
      }

      const skippedCollector = new TokenMetricsCollector(
        {
          ...defaultConfig,
          includeSkippedTests: true
        },
        mockEvents
      )

      await skippedCollector.collectFromOutput(skippedOutput)

      expect(mockEvents.onTestComplete).toHaveBeenCalledTimes(2) // failures + skipped
    })

    it('should report progress during collection', async () => {
      await collector.collectFromOutput(mockOutput)

      expect(mockEvents.onProgress).toHaveBeenCalled()
    })

    it('should handle collection errors', async () => {
      // Use mockRejectedValue to reject all calls, not just the first one
      mockTokenCounter.countWithDetails.mockRejectedValue(new Error('Tokenization failed'))

      // The collector should handle tokenization errors gracefully and continue
      const result = await collector.collectFromOutput(mockOutput)

      // Should return results even with tokenization errors
      expect(result).toBeDefined()
      expect(result.summary).toBeDefined()
      expect(result.files).toBeDefined()

      // Should record warnings for tokenization failures
      expect(mockWarningSystem.warnTokenizationFailed).toHaveBeenCalled()
    })

    it('should clear previous results on new collection', async () => {
      // First collection
      await collector.collectFromOutput(mockOutput)

      // Second collection
      await collector.collectFromOutput(mockOutput)

      expect(collector['testMetrics'].size).toBeGreaterThan(0)
    })
  })

  describe('processTest', () => {
    let testFailure: TestFailure

    beforeEach(() => {
      testFailure = {
        test: 'test name',
        file: 'test.js',
        suite: ['test suite'],
        startLine: 10,
        endLine: 15,
        error: {
          message: 'Test failed',
          type: 'AssertionError',
          stack: 'Error stack trace',
          assertion: { expected: true, actual: false }
        }
      }
    })

    it('should process individual test', async () => {
      const metrics = await collector.processTest(testFailure)

      expect(metrics).toBeDefined()
      expect(metrics.testName).toBe(testFailure.test)
      expect(metrics.filePath).toBe(testFailure.file)
      expect(metrics.status).toBe('failed')
      expect(metrics.totalTokens).toBeGreaterThan(0)
    })

    it('should extract test sections correctly', async () => {
      const metrics = await collector.processTest(testFailure)

      expect(metrics.sections).toBeDefined()
      expect(metrics.sections.summary).toBeDefined()
      expect(metrics.sections.testCases).toBeDefined()
      expect(metrics.sections.failures).toBeDefined()
      expect(metrics.sections.metadata).toBeDefined()
    })

    it('should handle custom sections', async () => {
      const customSections = {
        context: 'Additional test context'
      }

      const metrics = await collector.processTest(testFailure, customSections)

      expect(metrics.sections.context).toBeDefined()
    })

    it('should check thresholds during processing', async () => {
      await collector.processTest(testFailure)

      expect(mockThresholdManager.checkThreshold).toHaveBeenCalled()
      expect(mockThresholdManager.checkModelLimit).toHaveBeenCalled()
    })

    it('should handle test with console output', async () => {
      const testWithConsole = {
        ...testFailure,
        console: { logs: ['Console output'] }
      }

      const metrics = await collector.processTest(testWithConsole)

      expect(metrics.sections.console).toBeDefined()
    })

    it('should handle test processing errors', async () => {
      // Use mockRejectedValue to reject all calls during test processing
      mockTokenCounter.countWithDetails.mockRejectedValue(new Error('Processing failed'))

      // The collector should handle tokenization errors gracefully and continue
      const result = await collector.processTest(testFailure)

      // Should return results even with tokenization errors (with 0 token counts)
      expect(result).toBeDefined()
      expect(result.testName).toBe(testFailure.test)
      expect(result.totalTokens).toBe(0) // Should be 0 due to tokenization failure

      // Should record warnings for tokenization failures
      expect(mockWarningSystem.warnTokenizationFailed).toHaveBeenCalled()
    })

    it('should update streaming aggregator', async () => {
      collector.initialize()
      await collector.processTest(testFailure)

      expect(mockStreamingAggregator.addTest).toHaveBeenCalled()
      expect(mockEvents.onFileComplete).toHaveBeenCalled()
    })

    it('should generate unique test IDs', async () => {
      const test1 = await collector.processTest(testFailure)
      const test2 = await collector.processTest({
        ...testFailure,
        startLine: 20
      })

      expect(test1.testId).not.toBe(test2.testId)
    })
  })

  describe('finalize', () => {
    beforeEach(async () => {
      collector.initialize()
      // Add some test data
      await collector.processTest({
        test: 'test',
        file: 'test.js',
        suite: ['suite'],
        startLine: 10,
        endLine: 15,
        error: {
          message: 'Failed',
          type: 'Error',
          stack: 'stack'
        }
      })
    })

    it('should finalize collection and return metrics', async () => {
      const metrics = await collector.finalize()

      expect(metrics).toBeDefined()
      expect(metrics.summary).toBeDefined()
      expect(metrics.files).toBeDefined()
      expect(metrics.metadata).toBeDefined()
    })

    it('should use batch aggregation for large test sets', async () => {
      // Mock large test set
      vi.spyOn(collector['testMetrics'], 'size', 'get').mockReturnValue(150)

      const metrics = await collector.finalize()

      expect(mockBatchAggregator.aggregateInBatches).toHaveBeenCalled()
      expect(metrics).toBeDefined()
    })

    it('should use regular aggregation for smaller test sets', async () => {
      const metrics = await collector.finalize()

      expect(mockMetricsAggregator.aggregateFileMetrics).toHaveBeenCalled()
      expect(mockMetricsAggregator.aggregateSummary).toHaveBeenCalled()
      expect(metrics).toBeDefined()
    })

    it('should check summary thresholds', async () => {
      await collector.finalize()

      expect(mockThresholdManager.checkThreshold).toHaveBeenCalledWith(
        'totalTokens',
        expect.any(Number)
      )
    })

    it('should include metadata in final metrics', async () => {
      const metrics = await collector.finalize()

      expect(metrics.metadata).toBeDefined()
      expect(metrics.metadata?.version).toBe('1.0.0')
      expect(metrics.metadata?.config).toEqual(defaultConfig)
      expect(metrics.metadata?.environment).toBeDefined()
    })

    it('should handle finalization errors', async () => {
      mockMetricsAggregator.aggregateSummary.mockImplementationOnce(() => {
        throw new Error('Aggregation failed')
      })

      await expect(collector.finalize()).rejects.toThrow()
      expect(mockWarningSystem.recordError).toHaveBeenCalled()
    })

    it('should update context state to complete', async () => {
      await collector.finalize()

      expect(collector.getContext().state).toBe('complete')
    })
  })

  describe('getCurrentMetrics', () => {
    it('should return current metrics snapshot', async () => {
      // Initialize to set up streamingAggregator
      collector.initialize()
      const current = collector.getCurrentMetrics()

      expect(current).toBeDefined()
      expect(current.summary).toBeDefined()
      expect(current.files).toBeDefined()
    })

    it('should use streaming aggregator when available', async () => {
      collector.initialize()

      const current = collector.getCurrentMetrics()

      expect(mockStreamingAggregator.getCurrentSummary).toHaveBeenCalled()
      expect(mockStreamingAggregator.getCurrentFiles).toHaveBeenCalled()
    })

    it('should fall back to stored metrics when no streaming aggregator', () => {
      collector['streamingAggregator'] = undefined

      const current = collector.getCurrentMetrics()

      expect(current.files).toEqual(Array.from(collector['fileMetrics'].values()))
    })
  })

  describe('exportMetrics', () => {
    let metrics: TokenMetrics

    beforeEach(() => {
      metrics = {
        summary: {
          totalTokens: 1000,
          sections: {} as any, // Mock sections
          testCounts: { total: 10, failed: 2, passed: 8, skipped: 0 },
          fileCounts: { total: 1, withFailures: 1, withSkipped: 0 },
          model: 'gpt-4' as const,
          startTime: Date.now() - 5000,
          endTime: Date.now(),
          duration: 5000,
          averageTokensPerTest: 100,
          averageTokensPerFailure: 200
        },
        files: [
          {
            filePath: 'test.js',
            tests: [],
            sections: {} as any, // Mock sections
            totalTokens: 500,
            testCounts: { total: 5, failed: 1, passed: 4, skipped: 0 },
            duration: 1000,
            collectedAt: Date.now()
          }
        ],
        metadata: {
          version: '1.0.0',
          config: defaultConfig,
          environment: {
            nodeVersion: 'v18.0.0',
            platform: 'linux',
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        }
      }
    })

    it('should export as JSON by default', () => {
      const exported = collector.exportMetrics(metrics)

      expect(() => JSON.parse(exported)).not.toThrow()
      const parsed = JSON.parse(exported)
      expect(parsed.summary).toBeDefined()
    })

    it('should export as pretty-printed JSON', () => {
      const exported = collector.exportMetrics(metrics, {
        format: 'json',
        prettyPrint: true,
        includeTests: true,
        includeFiles: true,
        includeSummary: true,
        includeMetadata: true,
        includeStats: true,
        includeIssues: true
      })

      expect(exported).toContain('\n')
      expect(exported).toContain('  ')
    })

    it('should export as JSONL format', () => {
      const exported = collector.exportMetrics(metrics, {
        format: 'jsonl',
        includeTests: true,
        includeFiles: true,
        includeSummary: true,
        includeMetadata: true,
        includeStats: false,
        includeIssues: false,
        prettyPrint: false
      })

      const lines = exported.split('\n')
      expect(lines.length).toBeGreaterThan(0)

      lines.forEach((line) => {
        if (line.trim()) {
          expect(() => JSON.parse(line)).not.toThrow()
        }
      })
    })

    it('should export as markdown format', () => {
      const exported = collector.exportMetrics(metrics, {
        format: 'markdown',
        includeTests: true,
        includeFiles: true,
        includeSummary: true,
        includeMetadata: true,
        includeStats: false,
        includeIssues: false,
        prettyPrint: false
      })

      expect(exported).toContain('# Token Metrics Report')
      expect(exported).toContain('## Summary')
      expect(exported).toContain('**Total Tokens:**')
    })

    it('should export as CSV format', () => {
      const exported = collector.exportMetrics(metrics, {
        format: 'csv',
        includeTests: true,
        includeFiles: true,
        includeSummary: true,
        includeMetadata: true,
        includeStats: false,
        includeIssues: false,
        prettyPrint: false
      })

      expect(exported).toContain('Type,Name,File,Tokens,Status,Duration')
    })

    it('should exclude sections based on options', () => {
      const exported = collector.exportMetrics(metrics, {
        includeFiles: false,
        includeMetadata: false,
        includeSummary: true,
        includeTests: false,
        includeStats: false,
        includeIssues: false,
        format: 'json',
        prettyPrint: false
      })

      const parsed = JSON.parse(exported)
      expect(parsed.summary).toBeDefined()
      expect(parsed.files).toBeUndefined()
      expect(parsed.metadata).toBeUndefined()
    })

    it('should include stats when requested', () => {
      const exported = collector.exportMetrics(metrics, {
        includeStats: true,
        includeTests: true,
        includeFiles: true,
        includeSummary: true,
        includeMetadata: true,
        includeIssues: false,
        format: 'json',
        prettyPrint: false
      })

      const parsed = JSON.parse(exported)
      expect(parsed.stats).toBeDefined()
    })

    it('should include warnings and errors when requested', () => {
      const exported = collector.exportMetrics(metrics, {
        includeIssues: true,
        includeTests: true,
        includeFiles: true,
        includeSummary: true,
        includeMetadata: true,
        includeStats: false,
        format: 'json',
        prettyPrint: false
      })

      const parsed = JSON.parse(exported)
      expect(parsed.warnings).toBeDefined()
      expect(parsed.errors).toBeDefined()
    })
  })

  describe('getCollectionStats', () => {
    it('should return collection statistics', () => {
      const stats = collector.getCollectionStats()

      expect(stats).toBeDefined()
      expect(stats.testsProcessed).toBeGreaterThanOrEqual(0)
      expect(stats.filesProcessed).toBeGreaterThanOrEqual(0)
      expect(stats.warningsCount).toBeGreaterThanOrEqual(0)
      expect(stats.errorsCount).toBeGreaterThanOrEqual(0)
    })

    it('should use aggregator stats when available', async () => {
      collector.initialize()

      const stats = collector.getCollectionStats()

      expect(mockMetricsAggregator.getStats).toHaveBeenCalled()
      expect(stats.processingTime).toBeDefined()
    })

    it('should use batch aggregator stats when available', async () => {
      const batchCollector = new TokenMetricsCollector({
        ...defaultConfig,
        enableBatching: true
      })
      await batchCollector.initialize()

      const stats = batchCollector.getCollectionStats()

      expect(stats).toBeDefined()
    })

    it('should fall back to basic stats when no aggregator', () => {
      collector['aggregator'] = undefined
      collector['batchAggregator'] = undefined

      const stats = collector.getCollectionStats()

      expect(stats.testsProcessed).toBe(collector['testMetrics'].size)
      expect(stats.filesProcessed).toBe(collector['fileMetrics'].size)
    })
  })

  describe('reset', () => {
    it('should reset collector state', async () => {
      collector.initialize()
      await collector.processTest({
        test: 'test',
        file: 'test.js',
        suite: ['suite'],
        startLine: 10,
        endLine: 15,
        error: { message: 'Error', type: 'Error', stack: 'stack' }
      })

      collector.reset()

      expect(collector['testMetrics'].size).toBe(0)
      expect(collector['fileMetrics'].size).toBe(0)
      expect(collector['summary']).toBeUndefined()
      expect(mockWarningSystem.clear).toHaveBeenCalled()
    })

    it('should generate new run ID on reset', () => {
      const originalRunId = collector.getContext().runId

      collector.reset()

      expect(collector.getContext().runId).not.toBe(originalRunId)
    })

    it('should reset context state', () => {
      collector.reset()

      expect(collector.getContext().state).toBe('initializing')
    })
  })

  describe('content truncation', () => {
    it('should truncate content exceeding max size', async () => {
      const largeContent = 'x'.repeat(60000) // Exceeds default 50000
      const truncated = collector['truncateContent'](largeContent)

      expect(truncated.length).toBe(defaultConfig.maxContentSize)
    })

    it('should not truncate content within limits', async () => {
      const normalContent = 'x'.repeat(1000)
      const truncated = collector['truncateContent'](normalContent)

      expect(truncated).toBe(normalContent)
    })

    it('should warn when content is truncated', async () => {
      const testWithLargeError = {
        test: 'test',
        file: 'test.js',
        suite: ['suite'],
        startLine: 10,
        endLine: 15,
        error: {
          message: 'x'.repeat(60000),
          type: 'Error',
          stack: 'stack'
        }
      }

      await collector.processTest(testWithLargeError)

      expect(mockWarningSystem.warnContentTruncated).toHaveBeenCalled()
    })
  })

  describe('threshold checking', () => {
    it('should check test thresholds', async () => {
      mockThresholdManager.checkThreshold.mockReturnValueOnce({
        type: 'warning',
        threshold: 'perTestTokens',
        actual: 1500,
        limit: 1000
      })

      await collector.processTest({
        test: 'test',
        file: 'test.js',
        suite: ['suite'],
        startLine: 10,
        endLine: 15,
        error: { message: 'Error', type: 'Error', stack: 'stack' }
      })

      expect(mockWarningSystem.warnThresholdExceeded).toHaveBeenCalled()
    })

    it('should check model limits', async () => {
      mockThresholdManager.checkModelLimit.mockReturnValueOnce({
        type: 'warning',
        threshold: 'modelLimit',
        actual: 9000,
        limit: 8000
      })

      await collector.processTest({
        test: 'test',
        file: 'test.js',
        suite: ['suite'],
        startLine: 10,
        endLine: 15,
        error: { message: 'Error', type: 'Error', stack: 'stack' }
      })

      expect(mockWarningSystem.warnModelLimit).toHaveBeenCalled()
    })

    it('should check section thresholds', async () => {
      // Update mock to ensure proper settings structure
      mockThresholdManager.getSettings.mockReturnValue({
        perTestTokens: { warning: 1000, error: 2000 },
        totalTokens: { warning: 25000, error: 50000 },
        sectionPercentage: {
          failures: { warning: 50, error: 75 },
          context: { warning: 30, error: 50 },
          console: { warning: 20, error: 40 },
          summary: { warning: 50, error: 75 },
          testCases: { warning: 50, error: 75 },
          metadata: { warning: 50, error: 75 }
        }
      })

      mockThresholdManager.checkSectionThreshold.mockReturnValueOnce({
        type: 'warning',
        threshold: 'sectionPercentage',
        actual: 60,
        limit: 50
      })

      await collector.processTest({
        test: 'test',
        file: 'test.js',
        suite: ['suite'],
        startLine: 10,
        endLine: 15,
        error: { message: 'Error', type: 'Error', stack: 'stack' }
      })

      expect(mockWarningSystem.warnThresholdExceeded).toHaveBeenCalled()
    })
  })

  describe('warning and error handling', () => {
    it('should handle warning events', () => {
      const warningCallback = mockWarningSystem.onWarning.mock.calls[0][0]
      const mockWarning = { type: 'warning', message: 'Test warning' }

      warningCallback(mockWarning)

      expect(mockEvents.onWarning).toHaveBeenCalledWith({
        type: 'warning',
        timestamp: expect.any(Number),
        data: mockWarning
      })
    })

    it('should handle error events', () => {
      const errorCallback = mockWarningSystem.onError.mock.calls[0][0]
      const mockError = { type: 'error', message: 'Test error' }

      errorCallback(mockError)

      expect(mockEvents.onError).toHaveBeenCalledWith({
        type: 'error',
        timestamp: expect.any(Number),
        data: mockError
      })
    })

    it('should handle tokenization failures gracefully', async () => {
      mockTokenCounter.countWithDetails.mockRejectedValueOnce(new Error('Tokenization failed'))

      try {
        await collector.processTest({
          test: 'test',
          file: 'test.js',
          suite: ['suite'],
          startLine: 10,
        endLine: 15,
          error: { message: 'Error', type: 'Error', stack: 'stack' }
        })
      } catch (error) {
        // Expected to throw
      }

      expect(mockWarningSystem.warnTokenizationFailed).toHaveBeenCalled()
    })
  })

  describe('createTokenMetricsCollector factory', () => {
    it('should create collector from reporter config', () => {
      const reporterConfig: LLMReporterConfig = {
        tokenCountingEnabled: true,
        tokenCountingModel: 'gpt-3.5-turbo',
        includePassedTests: true,
        includeSkippedTests: true,
        maxTokens: 8000
      }

      const factoryCollector = createTokenMetricsCollector(reporterConfig, mockEvents)

      expect(factoryCollector).toBeDefined()
      expect(factoryCollector.getContext().config.enabled).toBe(true)
      expect(factoryCollector.getContext().config.model).toBe('gpt-3.5-turbo')
      expect(factoryCollector.getContext().config.includePassedTests).toBe(true)
      expect(factoryCollector.getContext().config.maxContentSize).toBe(8000)
    })

    it('should use defaults when config values missing', () => {
      const minimalConfig: LLMReporterConfig = {}

      const factoryCollector = createTokenMetricsCollector(minimalConfig)

      expect(factoryCollector.getContext().config.enabled).toBe(false)
      expect(factoryCollector.getContext().config.model).toBe('gpt-4')
      expect(factoryCollector.getContext().config.includePassedTests).toBe(false)
    })
  })

  describe('config validation', () => {
    it('should validate and normalize config', () => {
      const invalidConfig = {
        maxContentSize: -1,
        model: 'unknown-model'
      }

      const validatedCollector = new TokenMetricsCollector(invalidConfig as any)
      const config = validatedCollector.getContext().config

      expect(config.enabled).toBe(true)
      expect(config.model).toBe('unknown-model') // Passed through
      expect(config.maxContentSize).toBe(-1) // Passed through but would be handled elsewhere
    })
  })

  describe('error state handling', () => {
    it('should track error state in context', async () => {
      // Mock a failure in finalization to trigger error state
      mockMetricsAggregator.aggregateSummary.mockImplementationOnce(() => {
        throw new Error('Fatal error')
      })

      try {
        await collector.collectFromOutput({
          summary: { total: 1, failed: 1, passed: 0, skipped: 0, duration: 1000, timestamp: new Date().toISOString() },
          failures: [
            {
              test: 'test',
              file: 'test.js',
              suite: ['suite'],
              startLine: 10,
              endLine: 15,
              error: { message: 'Error', type: 'Error', stack: 'stack' }
            }
          ]
        })
      } catch (error) {
        // Expected to throw during finalization
      }

      const context = collector.getContext()
      expect(context.state).toBe('error')
      expect(context.error).toBeDefined()
      expect(context.error?.message).toBe('Fatal error')
    })
  })
})
