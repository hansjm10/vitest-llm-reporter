/**
 * Token Metrics Aggregation Logic
 *
 * Handles aggregation of token metrics from individual tests
 * into file-level and summary-level statistics.
 */

import { createLogger } from '../../utils/logger.js'
import type {
  TestTokenMetrics,
  FileTokenMetrics,
  TokenMetricsSummary,
  MetricSection,
  SectionTokens,
  TokenMetricsConfig,
  MetricsStats
} from './types.js'
import type { SupportedModel } from '../types.js'

const logger = createLogger('token-metrics:aggregator')

/**
 * Aggregation options
 */
export interface AggregationOptions {
  /** Whether to include passed tests in aggregation */
  includePassedTests: boolean
  /** Whether to include skipped tests in aggregation */
  includeSkippedTests: boolean
  /** Model being used for consistency */
  model: SupportedModel
  /** Start time of collection */
  startTime: number
}

/**
 * Aggregation utilities for token metrics
 */
export class MetricsAggregator {
  private config: TokenMetricsConfig
  private stats: MetricsStats

  constructor(config: TokenMetricsConfig) {
    this.config = config
    this.stats = this.initializeStats()
  }

  /**
   * Aggregate test metrics into file metrics
   */
  aggregateFileMetrics(
    filePath: string,
    testMetrics: TestTokenMetrics[],
    options: AggregationOptions
  ): FileTokenMetrics {
    const startTime = Date.now()

    // Filter tests based on options
    const filteredTests = this.filterTests(testMetrics, options)

    logger(`Aggregating ${filteredTests.length} tests for file: ${filePath}`)

    // Initialize file sections
    const fileSections = this.initializeSections(options.model)

    // Aggregate token counts by section
    let totalTokens = 0

    for (const test of filteredTests) {
      for (const section of Object.keys(test.sections) as MetricSection[]) {
        const testSection = test.sections[section]
        const fileSection = fileSections[section]

        // Add token counts
        fileSection.count += testSection.count

        // Update details if present
        if (testSection.details) {
          if (!fileSection.details) {
            fileSection.details = {
              characterCount: 0,
              lineCount: 0,
              contentType: testSection.details.contentType
            }
          }

          if (testSection.details.characterCount) {
            fileSection.details.characterCount =
              (fileSection.details.characterCount || 0) + testSection.details.characterCount
          }

          if (testSection.details.lineCount) {
            fileSection.details.lineCount =
              (fileSection.details.lineCount || 0) + testSection.details.lineCount
          }
        }

        // Update cache status (true if any were cached)
        fileSection.fromCache = fileSection.fromCache || testSection.fromCache

        // Update timestamp to latest
        fileSection.timestamp = Math.max(fileSection.timestamp, testSection.timestamp)
      }

      totalTokens += test.totalTokens
    }

    // Calculate test counts
    const testCounts = this.calculateTestCounts(filteredTests)

    const duration = Date.now() - startTime

    // Update stats
    this.stats.filesProcessed++
    this.stats.processingTime += duration

    return {
      filePath,
      tests: filteredTests,
      sections: fileSections,
      totalTokens,
      testCounts,
      duration,
      collectedAt: Date.now()
    }
  }

  /**
   * Aggregate file metrics into summary
   */
  aggregateSummary(
    fileMetrics: FileTokenMetrics[],
    options: AggregationOptions
  ): TokenMetricsSummary {
    const startTime = Date.now()

    logger(`Aggregating summary from ${fileMetrics.length} files`)

    // Initialize summary sections
    const summarySections = this.initializeSections(options.model)

    let totalTokens = 0
    let totalTests = 0
    let totalPassed = 0
    let totalFailed = 0
    let totalSkipped = 0
    let filesWithFailures = 0
    let filesWithSkipped = 0

    // Track largest test
    let largestTest: TokenMetricsSummary['largestTest'] | undefined

    for (const file of fileMetrics) {
      // Aggregate section tokens
      for (const section of Object.keys(file.sections) as MetricSection[]) {
        const fileSection = file.sections[section]
        const summarySection = summarySections[section]

        summarySection.count += fileSection.count

        // Merge details
        if (fileSection.details) {
          if (!summarySection.details) {
            summarySection.details = {
              characterCount: 0,
              lineCount: 0,
              contentType: fileSection.details.contentType
            }
          }

          if (fileSection.details.characterCount) {
            summarySection.details.characterCount =
              (summarySection.details.characterCount || 0) + fileSection.details.characterCount
          }

          if (fileSection.details.lineCount) {
            summarySection.details.lineCount =
              (summarySection.details.lineCount || 0) + fileSection.details.lineCount
          }
        }

        // Update cache status
        summarySection.fromCache = summarySection.fromCache || fileSection.fromCache

        // Update timestamp
        summarySection.timestamp = Math.max(summarySection.timestamp, fileSection.timestamp)
      }

      // Aggregate totals
      totalTokens += file.totalTokens
      totalTests += file.testCounts.total
      totalPassed += file.testCounts.passed
      totalFailed += file.testCounts.failed
      totalSkipped += file.testCounts.skipped

      if (file.testCounts.failed > 0) filesWithFailures++
      if (file.testCounts.skipped > 0) filesWithSkipped++

      // Track largest test
      for (const test of file.tests) {
        if (!largestTest || test.totalTokens > largestTest.tokenCount) {
          largestTest = {
            testId: test.testId,
            testName: test.testName,
            filePath: test.filePath,
            tokenCount: test.totalTokens
          }
        }
      }
    }

    // Find heaviest section
    const heaviestSection = this.findHeaviestSection(summarySections, totalTokens)

    const duration = Date.now() - startTime
    const endTime = Date.now()

    // Update stats
    this.stats.processingTime += duration

    return {
      totalTokens,
      sections: summarySections,
      testCounts: {
        total: totalTests,
        passed: totalPassed,
        failed: totalFailed,
        skipped: totalSkipped
      },
      fileCounts: {
        total: fileMetrics.length,
        withFailures: filesWithFailures,
        withSkipped: filesWithSkipped
      },
      model: options.model,
      startTime: options.startTime,
      endTime,
      duration: endTime - options.startTime,
      averageTokensPerTest: totalTests > 0 ? Math.round(totalTokens / totalTests) : 0,
      averageTokensPerFailure:
        totalFailed > 0
          ? Math.round(
              fileMetrics
                .flatMap((f) => f.tests.filter((t) => t.status === 'failed'))
                .reduce((sum, test) => sum + test.totalTokens, 0) / totalFailed
            )
          : 0,
      largestTest,
      heaviestSection
    }
  }

  /**
   * Calculate section percentages
   */
  calculateSectionPercentages(
    sections: Record<MetricSection, SectionTokens>,
    totalTokens: number
  ): Record<MetricSection, number> {
    const percentages = {} as Record<MetricSection, number>

    for (const section of Object.keys(sections) as MetricSection[]) {
      percentages[section] =
        totalTokens > 0
          ? Math.round((sections[section].count / totalTokens) * 100 * 100) / 100 // 2 decimal places
          : 0
    }

    return percentages
  }

  /**
   * Get aggregation statistics
   */
  getStats(): MetricsStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats()
  }

  /**
   * Merge two section token objects
   */
  static mergeSections(
    section1: SectionTokens,
    section2: SectionTokens,
    model: SupportedModel
  ): SectionTokens {
    return {
      count: section1.count + section2.count,
      model,
      fromCache: section1.fromCache || section2.fromCache,
      timestamp: Math.max(section1.timestamp, section2.timestamp),
      details:
        section1.details && section2.details
          ? {
              characterCount:
                (section1.details.characterCount || 0) + (section2.details.characterCount || 0),
              lineCount: (section1.details.lineCount || 0) + (section2.details.lineCount || 0),
              contentType: section1.details.contentType || section2.details.contentType
            }
          : section1.details || section2.details
    }
  }

  /**
   * Create empty section tokens
   */
  static createEmptySection(model: SupportedModel): SectionTokens {
    return {
      count: 0,
      model,
      fromCache: false,
      timestamp: Date.now()
    }
  }

  /**
   * Filter tests based on aggregation options
   */
  private filterTests(tests: TestTokenMetrics[], options: AggregationOptions): TestTokenMetrics[] {
    return tests.filter((test) => {
      if (test.status === 'passed' && !options.includePassedTests) {
        return false
      }
      if (test.status === 'skipped' && !options.includeSkippedTests) {
        return false
      }
      return true
    })
  }

  /**
   * Initialize section tokens for aggregation
   */
  private initializeSections(model: SupportedModel): Record<MetricSection, SectionTokens> {
    const sections = {} as Record<MetricSection, SectionTokens>

    const sectionNames: MetricSection[] = [
      'summary',
      'testCases',
      'failures',
      'context',
      'console',
      'metadata',
      'total'
    ]

    for (const section of sectionNames) {
      sections[section] = MetricsAggregator.createEmptySection(model)
    }

    return sections
  }

  /**
   * Calculate test counts from test metrics
   */
  private calculateTestCounts(tests: TestTokenMetrics[]): {
    total: number
    passed: number
    failed: number
    skipped: number
  } {
    return {
      total: tests.length,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status === 'failed').length,
      skipped: tests.filter((t) => t.status === 'skipped').length
    }
  }

  /**
   * Find the section with the highest token count
   */
  private findHeaviestSection(
    sections: Record<MetricSection, SectionTokens>,
    totalTokens: number
  ): TokenMetricsSummary['heaviestSection'] {
    let heaviestSection: TokenMetricsSummary['heaviestSection']
    let maxTokens = 0

    // Exclude 'total' section from consideration
    for (const section of Object.keys(sections) as MetricSection[]) {
      if (section === 'total') continue

      const tokenCount = sections[section].count
      if (tokenCount > maxTokens) {
        maxTokens = tokenCount
        heaviestSection = {
          section,
          tokenCount,
          percentage: totalTokens > 0 ? Math.round((tokenCount / totalTokens) * 100 * 100) / 100 : 0
        }
      }
    }

    return heaviestSection
  }

  /**
   * Initialize statistics tracking
   */
  private initializeStats(): MetricsStats {
    return {
      testsProcessed: 0,
      filesProcessed: 0,
      tokenizationOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      processingTime: 0,
      averageProcessingTime: 0,
      memoryUsage: 0,
      warningsCount: 0,
      errorsCount: 0
    }
  }
}

/**
 * Batch aggregation utilities
 */
export class BatchAggregator {
  private aggregator: MetricsAggregator
  private batchSize: number

  constructor(config: TokenMetricsConfig, batchSize = 100) {
    this.aggregator = new MetricsAggregator(config)
    this.batchSize = batchSize
  }

  /**
   * Process large numbers of test metrics in batches
   */
  async aggregateInBatches(
    testMetricsByFile: Map<string, TestTokenMetrics[]>,
    options: AggregationOptions
  ): Promise<{ files: FileTokenMetrics[]; summary: TokenMetricsSummary }> {
    const fileMetrics: FileTokenMetrics[] = []
    const files = Array.from(testMetricsByFile.entries())

    logger(`Processing ${files.length} files in batches of ${this.batchSize}`)

    // Process files in batches to manage memory
    for (let i = 0; i < files.length; i += this.batchSize) {
      const batch = files.slice(i, i + this.batchSize)

      for (const [filePath, tests] of batch) {
        const fileMetric = this.aggregator.aggregateFileMetrics(filePath, tests, options)
        fileMetrics.push(fileMetric)
      }

      // Allow event loop to process other tasks
      if (i + this.batchSize < files.length) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }

    // Aggregate final summary
    const summary = this.aggregator.aggregateSummary(fileMetrics, options)

    return { files: fileMetrics, summary }
  }

  /**
   * Get aggregation statistics
   */
  getStats(): MetricsStats {
    return this.aggregator.getStats()
  }
}

/**
 * Streaming aggregator for real-time updates
 */
export class StreamingAggregator {
  private aggregator: MetricsAggregator
  private currentFiles: Map<string, FileTokenMetrics> = new Map()
  private currentSummary?: TokenMetricsSummary
  private options: AggregationOptions

  constructor(config: TokenMetricsConfig, options: AggregationOptions) {
    this.aggregator = new MetricsAggregator(config)
    this.options = options
  }

  /**
   * Add a test metric and update running aggregations
   */
  addTest(testMetric: TestTokenMetrics): {
    fileUpdate?: FileTokenMetrics
    summaryUpdate?: TokenMetricsSummary
  } {
    const filePath = testMetric.filePath

    // Get current file metrics or create new
    let currentFile = this.currentFiles.get(filePath)
    if (!currentFile) {
      currentFile = this.aggregator.aggregateFileMetrics(filePath, [], this.options)
      this.currentFiles.set(filePath, currentFile)
    }

    // Add test to file and re-aggregate
    const updatedTests = [...currentFile.tests, testMetric]
    const fileUpdate = this.aggregator.aggregateFileMetrics(filePath, updatedTests, this.options)
    this.currentFiles.set(filePath, fileUpdate)

    // Update summary
    const allFiles = Array.from(this.currentFiles.values())
    const summaryUpdate = this.aggregator.aggregateSummary(allFiles, this.options)
    this.currentSummary = summaryUpdate

    return { fileUpdate, summaryUpdate }
  }

  /**
   * Get current summary
   */
  getCurrentSummary(): TokenMetricsSummary | undefined {
    return this.currentSummary
  }

  /**
   * Get current file metrics
   */
  getCurrentFiles(): FileTokenMetrics[] {
    return Array.from(this.currentFiles.values())
  }

  /**
   * Get statistics
   */
  getStats(): MetricsStats {
    return this.aggregator.getStats()
  }
}
