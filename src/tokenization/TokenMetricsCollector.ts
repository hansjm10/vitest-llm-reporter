/**
 * Token Metrics Collector - Main collector class
 *
 * Orchestrates token counting across test results with hierarchical tracking,
 * threshold monitoring, and warning systems.
 */

import { createLogger } from '../utils/logger.js'
import { TokenCounter, getTokenCounter } from './TokenCounter.js'
import { MetricsAggregator, BatchAggregator, StreamingAggregator } from './metrics/aggregator.js'
import {
  ThresholdManager,
  getThresholdManager,
  createModelAwareThresholds
} from './metrics/thresholds.js'
import { WarningSystem, getWarningSystem, WarningFormatter } from './metrics/warnings.js'
import type { SupportedModel } from './types.js'
import type { LLMReporterConfig } from '../types/reporter.js'
import type { LLMReporterOutput, TestFailure, TestResult, TestSummary } from '../types/schema.js'
import type {
  TokenMetrics,
  TokenMetricsConfig,
  TestTokenMetrics,
  FileTokenMetrics,
  TokenMetricsSummary,
  MetricsContext,
  MetricsUpdateEvent,
  MetricsStats,
  SectionTokens,
  MetricSection,
  MetricsExportOptions,
  MetricsWarning
} from './metrics/types.js'
import type { AggregationOptions } from './metrics/aggregator.js'

const logger = createLogger('token-metrics:collector')

/**
 * Export data structure for metrics
 */
interface ExportData {
  summary?: TokenMetricsSummary
  files?: FileTokenMetrics[]
  warnings?: MetricsWarning[]
}

/**
 * Collection events
 */
export interface CollectionEvents {
  onTestComplete?: (metrics: TestTokenMetrics) => void
  onFileComplete?: (metrics: FileTokenMetrics) => void
  onWarning?: (warning: MetricsUpdateEvent) => void
  onError?: (error: MetricsUpdateEvent) => void
  onProgress?: (progress: { completed: number; total: number; current: string }) => void
}

/**
 * Main Token Metrics Collector
 */
export class TokenMetricsCollector {
  private config: TokenMetricsConfig
  private context: MetricsContext
  private counter: TokenCounter
  private thresholdManager: ThresholdManager
  private warningSystem: WarningSystem
  private aggregator?: MetricsAggregator
  private streamingAggregator?: StreamingAggregator
  private batchAggregator?: BatchAggregator
  private events: CollectionEvents

  private testMetrics: Map<string, TestTokenMetrics> = new Map()
  private fileMetrics: Map<string, FileTokenMetrics> = new Map()
  private summary?: TokenMetricsSummary
  private collectionStartTime: number = 0

  constructor(config: TokenMetricsConfig, events: CollectionEvents = {}) {
    this.config = this.validateAndNormalizeConfig(config)
    this.events = events

    this.context = {
      runId: this.generateRunId(),
      startTime: Date.now(),
      config: this.config,
      state: 'initializing'
    }

    this.counter = getTokenCounter({
      defaultModel: this.config.model,
      enableBatching: this.config.enableBatching,
      maxBatchSize: 50
    })

    this.thresholdManager = getThresholdManager(createModelAwareThresholds(this.config.model))

    this.warningSystem = getWarningSystem()
    this.setupWarningHandlers()

    logger(`Initialized TokenMetricsCollector with model: ${this.config.model}`)
  }

  /**
   * Initialize collection for test run
   */
  initialize(): void {
    this.collectionStartTime = Date.now()
    this.context.state = 'collecting'

    const aggregationOptions = {
      includePassedTests: this.config.includePassedTests,
      includeSkippedTests: this.config.includeSkippedTests,
      model: this.config.model,
      startTime: this.collectionStartTime
    }

    this.aggregator = new MetricsAggregator(this.config)

    if (this.config.enableBatching) {
      this.batchAggregator = new BatchAggregator(this.config)
    }

    // Initialize streaming aggregator for real-time updates
    this.streamingAggregator = new StreamingAggregator(this.config, aggregationOptions)

    logger('TokenMetricsCollector initialized for collection')
  }

  /**
   * Collect metrics for a complete reporter output
   */
  async collectFromOutput(output: LLMReporterOutput): Promise<TokenMetrics> {
    logger('Starting token metrics collection from reporter output')

    if (this.context.state !== 'collecting') {
      this.initialize()
    }

    try {
      // Clear previous results
      this.testMetrics.clear()
      this.fileMetrics.clear()

      // Process summary
      this.processSummary(output.summary)

      // Process test results
      let totalTests = 0
      let processedTests = 0

      // Count total tests for progress tracking
      totalTests += output.failures?.length || 0
      totalTests += (this.config.includePassedTests ? output.passed?.length : 0) || 0
      totalTests += (this.config.includeSkippedTests ? output.skipped?.length : 0) || 0

      // Process failures
      if (output.failures) {
        for (const failure of output.failures) {
          await this.processTestFailure(failure)
          processedTests++
          this.reportProgress(processedTests, totalTests, `Processing failure: ${failure.test}`)
        }
      }

      // Process passed tests if configured
      if (this.config.includePassedTests && output.passed) {
        for (const passed of output.passed) {
          await this.processTestResult(passed)
          processedTests++
          this.reportProgress(processedTests, totalTests, `Processing passed: ${passed.test}`)
        }
      }

      // Process skipped tests if configured
      if (this.config.includeSkippedTests && output.skipped) {
        for (const skipped of output.skipped) {
          await this.processTestResult(skipped)
          processedTests++
          this.reportProgress(processedTests, totalTests, `Processing skipped: ${skipped.test}`)
        }
      }

      // Finalize collection
      return await this.finalize()
    } catch (error) {
      this.context.state = 'error'
      this.context.error = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }

      this.warningSystem.recordError(
        'system-error',
        'Failed to collect token metrics',
        { operation: 'collectFromOutput' },
        error instanceof Error ? error : undefined
      )

      throw error
    }
  }

  /**
   * Process individual test and collect metrics
   */
  async processTest(
    testData: TestFailure | TestResult,
    customSections?: Record<string, string>
  ): Promise<TestTokenMetrics> {
    const testId = this.generateTestId(testData)

    logger(`Processing test: ${testId}`)

    try {
      const sections = this.extractTestSections(testData, customSections)
      const sectionMetrics = await this.countSectionTokens(sections)

      const totalTokens = Object.values(sectionMetrics).reduce(
        (sum, section) => sum + section.count,
        0
      )

      // Check thresholds
      this.checkTestThresholds(testId, totalTokens, sectionMetrics)

      const testMetrics: TestTokenMetrics = {
        testId,
        testName: testData.test,
        filePath: testData.file,
        status: 'error' in testData ? 'failed' : testData.status,
        sections: sectionMetrics,
        totalTokens,
        duration: 'duration' in testData ? testData.duration || 0 : 0,
        collectedAt: Date.now()
      }

      this.testMetrics.set(testId, testMetrics)

      // Update streaming aggregation
      if (this.streamingAggregator) {
        const updates = this.streamingAggregator.addTest(testMetrics)

        if (updates.fileUpdate) {
          this.fileMetrics.set(testData.file, updates.fileUpdate)
          this.events.onFileComplete?.(updates.fileUpdate)
        }
      }

      this.events.onTestComplete?.(testMetrics)

      return testMetrics
    } catch (error) {
      this.warningSystem.recordError(
        'tokenization-error',
        'Failed to process test metrics',
        { testId, filePath: testData.file, operation: 'processTest' },
        error instanceof Error ? error : undefined
      )
      throw error
    }
  }

  /**
   * Finalize collection and generate summary
   */
  async finalize(): Promise<TokenMetrics> {
    logger('Finalizing token metrics collection')

    this.context.state = 'aggregating'

    try {
      const aggregationOptions = {
        includePassedTests: this.config.includePassedTests,
        includeSkippedTests: this.config.includeSkippedTests,
        model: this.config.model,
        startTime: this.collectionStartTime
      }

      let fileMetrics: FileTokenMetrics[]
      let summary: TokenMetricsSummary

      if (this.batchAggregator && this.testMetrics.size > 100) {
        // Use batch aggregation for large numbers of tests
        const testsByFile = this.groupTestsByFile()
        const results = await this.batchAggregator.aggregateInBatches(
          testsByFile,
          aggregationOptions
        )
        fileMetrics = results.files
        summary = results.summary
      } else if (this.aggregator) {
        // Use regular aggregation
        fileMetrics = this.aggregateFileMetrics(aggregationOptions)
        summary = this.aggregator.aggregateSummary(fileMetrics, aggregationOptions)
      } else {
        throw new Error('No aggregator available')
      }

      this.summary = summary

      // Store file metrics
      for (const fileMetric of fileMetrics) {
        this.fileMetrics.set(fileMetric.filePath, fileMetric)
      }

      // Check summary thresholds
      this.checkSummaryThresholds(summary)

      const finalMetrics: TokenMetrics = {
        summary,
        files: fileMetrics,
        metadata: {
          version: '1.0.0',
          config: this.config,
          environment: {
            nodeVersion: process.version,
            platform: process.platform,
            timestamp: new Date().toISOString()
          }
        }
      }

      this.context.state = 'complete'

      logger(
        `Collection complete. Total tokens: ${summary.totalTokens}, Files: ${fileMetrics.length}, Tests: ${summary.testCounts.total}`
      )

      return finalMetrics
    } catch (error) {
      this.context.state = 'error'
      this.context.error = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }

      this.warningSystem.recordError(
        'aggregation-error',
        'Failed to finalize metrics collection',
        { operation: 'finalize' },
        error instanceof Error ? error : undefined
      )

      throw error
    }
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): Partial<TokenMetrics> {
    const summary = this.streamingAggregator?.getCurrentSummary()
    const files =
      this.streamingAggregator?.getCurrentFiles() || Array.from(this.fileMetrics.values())

    return {
      summary,
      files,
      metadata: summary
        ? {
            version: '1.0.0',
            config: this.config,
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              timestamp: new Date().toISOString()
            }
          }
        : undefined
    }
  }

  /**
   * Export metrics in specified format
   */
  exportMetrics(
    metrics: TokenMetrics,
    options: MetricsExportOptions = {
      includeTests: true,
      includeFiles: true,
      includeSummary: true,
      includeMetadata: true,
      includeStats: false,
      includeIssues: false,
      format: 'json',
      prettyPrint: false
    }
  ): string {
    const exportData: Record<string, unknown> = {}

    if (options.includeSummary) {
      exportData.summary = metrics.summary
    }

    if (options.includeFiles) {
      exportData.files = options.includeTests
        ? metrics.files
        : metrics.files.map((f) => ({ ...f, tests: [] }))
    }

    if (options.includeMetadata) {
      exportData.metadata = metrics.metadata
    }

    if (options.includeStats) {
      exportData.stats = this.getCollectionStats()
    }

    if (options.includeIssues) {
      exportData.warnings = this.warningSystem.getWarnings()
      exportData.errors = this.warningSystem.getErrors()
    }

    switch (options.format) {
      case 'json':
        return options.prettyPrint
          ? JSON.stringify(exportData, null, 2)
          : JSON.stringify(exportData)

      case 'jsonl': {
        // Export as JSON Lines format
        const lines: string[] = []
        if (exportData.summary)
          lines.push(JSON.stringify({ type: 'summary', data: exportData.summary }))
        if (exportData.files && Array.isArray(exportData.files)) {
          for (const file of exportData.files as FileTokenMetrics[]) {
            lines.push(JSON.stringify({ type: 'file', data: file }))
          }
        }
        return lines.join('\n')
      }

      case 'markdown':
        return this.formatAsMarkdown(exportData)

      case 'csv':
        return this.formatAsCSV(exportData)

      default:
        return JSON.stringify(exportData, null, options.prettyPrint ? 2 : 0)
    }
  }

  /**
   * Get collection statistics
   */
  getCollectionStats(): MetricsStats {
    const baseStats = this.aggregator?.getStats() ||
      this.batchAggregator?.getStats() || {
        testsProcessed: this.testMetrics.size,
        filesProcessed: this.fileMetrics.size,
        tokenizationOperations: 0,
        cacheHits: 0,
        cacheMisses: 0,
        processingTime: 0,
        averageProcessingTime: 0,
        memoryUsage: typeof process?.memoryUsage === 'function' ? process.memoryUsage().heapUsed : 0,
        warningsCount: this.warningSystem.getWarnings().length,
        errorsCount: this.warningSystem.getErrors().length
      }

    const cacheStats = this.counter.getCacheStats()

    return {
      ...baseStats,
      warningsCount: this.warningSystem.getWarnings().length,
      errorsCount: this.warningSystem.getErrors().length,
      cacheHits: cacheStats.size > 0 ? Math.round(cacheStats.size * 0.7) : 0, // Approximation
      cacheMisses: Math.round(baseStats.testsProcessed * 0.3) // Approximation
    }
  }

  /**
   * Get current context
   */
  getContext(): MetricsContext {
    return { ...this.context }
  }

  /**
   * Reset collector state
   */
  reset(): void {
    this.testMetrics.clear()
    this.fileMetrics.clear()
    this.summary = undefined
    this.warningSystem.clear()

    this.context = {
      runId: this.generateRunId(),
      startTime: Date.now(),
      config: this.config,
      state: 'initializing'
    }

    logger('TokenMetricsCollector reset')
  }

  // Private methods

  private processSummary(summary: TestSummary): void {
    // Summary processing would count tokens in summary fields
    // For now, this is a placeholder as summary structure varies
    logger(`Processing summary: ${summary.total} total tests`)
  }

  private async processTestFailure(failure: TestFailure): Promise<TestTokenMetrics> {
    return this.processTest(failure)
  }

  private async processTestResult(result: TestResult): Promise<TestTokenMetrics> {
    return this.processTest(result)
  }

  private extractTestSections(
    testData: TestFailure | TestResult,
    customSections?: Record<string, string>
  ): Record<MetricSection, string> {
    const sections: Record<MetricSection, string> = {
      summary: '', // Test basic info
      testCases: testData.test,
      failures: '',
      context: '',
      console: '',
      metadata: JSON.stringify({ file: testData.file, suite: testData.suite }),
      total: '' // Will be calculated
    }

    // Basic test info
    sections.summary = `${testData.test} in ${testData.file}`

    // Failure details
    if ('error' in testData) {
      sections.failures = JSON.stringify({
        message: testData.error.message,
        type: testData.error.type,
        stack: testData.error.stack,
        assertion: testData.error.assertion
      })

      // Context from error
      if (testData.error.context) {
        sections.context = JSON.stringify(testData.error.context)
      }

      // Console output
      if (testData.console) {
        sections.console = JSON.stringify(testData.console)
      }
    }

    // Add custom sections
    if (customSections) {
      Object.entries(customSections).forEach(([section, content]) => {
        if (section in sections) {
          sections[section as MetricSection] += '\n' + content
        }
      })
    }

    return sections
  }

  private async countSectionTokens(
    sections: Record<MetricSection, string>
  ): Promise<Record<MetricSection, SectionTokens>> {
    const results: Record<MetricSection, SectionTokens> = {} as Record<MetricSection, SectionTokens>

    for (const [section, content] of Object.entries(sections) as [MetricSection, string][]) {
      if (section === 'total') continue // Skip total section

      try {
        const truncatedContent = this.truncateContent(content)
        const tokenResult = await this.counter.countWithDetails(truncatedContent, this.config.model)

        results[section] = {
          count: tokenResult.tokenCount,
          model: tokenResult.model,
          fromCache: tokenResult.fromCache,
          timestamp: Date.now(),
          details: {
            characterCount: content.length,
            lineCount: content.split('\n').length,
            contentType: section
          }
        }

        if (content.length > truncatedContent.length) {
          this.warningSystem.warnContentTruncated(content.length, truncatedContent.length, {
            section
          })
        }
      } catch (error) {
        this.warningSystem.warnTokenizationFailed(
          error instanceof Error ? error.message : String(error),
          { section }
        )

        // Create empty section on error
        results[section] = {
          count: 0,
          model: this.config.model,
          fromCache: false,
          timestamp: Date.now()
        }
      }
    }

    // Calculate total
    const totalCount = Object.values(results).reduce((sum, section) => sum + section.count, 0)
    results.total = {
      count: totalCount,
      model: this.config.model,
      fromCache: false,
      timestamp: Date.now()
    }

    return results
  }

  private truncateContent(content: string): string {
    if (content.length <= this.config.maxContentSize) {
      return content
    }
    return content.substring(0, this.config.maxContentSize)
  }

  private checkTestThresholds(
    testId: string,
    totalTokens: number,
    sections: Record<MetricSection, SectionTokens>
  ): void {
    // Check per-test threshold
    const testThreshold = this.thresholdManager.checkThreshold('perTestTokens', totalTokens)
    if (testThreshold) {
      this.warningSystem.warnThresholdExceeded(
        testThreshold,
        'per-test tokens',
        totalTokens,
        this.thresholdManager.getSettings().perTestTokens.warning || 1000,
        { testId }
      )
    }

    // Check model limits
    const modelThreshold = this.thresholdManager.checkModelLimit(this.config.model, totalTokens)
    if (modelThreshold) {
      const limits = this.thresholdManager.getModelLimits(this.config.model)
      this.warningSystem.warnModelLimit(
        this.config.model,
        totalTokens,
        limits.conservativeThreshold,
        'conservative',
        { testId }
      )
    }

    // Check section percentages
    for (const [section, sectionData] of Object.entries(sections) as [
      MetricSection,
      SectionTokens
    ][]) {
      if (section === 'total') continue

      const percentage = totalTokens > 0 ? (sectionData.count / totalTokens) * 100 : 0
      const sectionThreshold = this.thresholdManager.checkSectionThreshold(section, percentage)

      if (sectionThreshold) {
        this.warningSystem.warnThresholdExceeded(
          sectionThreshold,
          `${section} section percentage`,
          percentage,
          this.thresholdManager.getSettings().sectionPercentage[section].warning || 50,
          { testId, section }
        )
      }
    }
  }

  private checkSummaryThresholds(summary: TokenMetricsSummary): void {
    // Check total tokens
    const totalThreshold = this.thresholdManager.checkThreshold('totalTokens', summary.totalTokens)
    if (totalThreshold) {
      this.warningSystem.warnThresholdExceeded(
        totalThreshold,
        'total tokens',
        summary.totalTokens,
        this.thresholdManager.getSettings().totalTokens.warning || 25000
      )
    }
  }

  private groupTestsByFile(): Map<string, TestTokenMetrics[]> {
    const grouped = new Map<string, TestTokenMetrics[]>()

    for (const test of this.testMetrics.values()) {
      const existing = grouped.get(test.filePath) || []
      existing.push(test)
      grouped.set(test.filePath, existing)
    }

    return grouped
  }

  private aggregateFileMetrics(options: AggregationOptions): FileTokenMetrics[] {
    if (!this.aggregator) {
      throw new Error('Aggregator not initialized')
    }

    const fileMetrics: FileTokenMetrics[] = []
    const testsByFile = this.groupTestsByFile()

    for (const [filePath, tests] of testsByFile) {
      const fileMetric = this.aggregator.aggregateFileMetrics(filePath, tests, options)
      fileMetrics.push(fileMetric)
    }

    return fileMetrics
  }

  private setupWarningHandlers(): void {
    this.warningSystem.onWarning((warning) => {
      const event: MetricsUpdateEvent = {
        type: 'warning',
        timestamp: Date.now(),
        data: warning
      }
      this.events.onWarning?.(event)
    })

    this.warningSystem.onError((error) => {
      const event: MetricsUpdateEvent = {
        type: 'error',
        timestamp: Date.now(),
        data: error
      }
      this.events.onError?.(event)
    })
  }

  private reportProgress(completed: number, total: number, current: string): void {
    this.events.onProgress?.({ completed, total, current })
  }

  private generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateTestId(testData: TestFailure | TestResult): string {
    return `${testData.file}:${testData.startLine}:${testData.test.replace(/\s+/g, '_')}`
  }

  private validateAndNormalizeConfig(config: TokenMetricsConfig): TokenMetricsConfig {
    return {
      enabled: config.enabled ?? true,
      model: config.model ?? 'gpt-4',
      trackSections: config.trackSections ?? true,
      includePassedTests: config.includePassedTests ?? false,
      includeSkippedTests: config.includeSkippedTests ?? false,
      maxContentSize: config.maxContentSize ?? 50000,
      enableBatching: config.enableBatching ?? true,
      thresholds: config.thresholds ?? {}
    }
  }

  private formatAsMarkdown(data: ExportData): string {
    let markdown = '# Token Metrics Report\n\n'

    if (data.summary) {
      const s = data.summary
      markdown += `## Summary\n\n`
      markdown += `- **Total Tokens:** ${s.totalTokens}\n`
      markdown += `- **Total Tests:** ${s.testCounts.total}\n`
      markdown += `- **Failed Tests:** ${s.testCounts.failed}\n`
      markdown += `- **Average Tokens per Test:** ${s.averageTokensPerTest}\n`
      markdown += `- **Duration:** ${s.duration}ms\n\n`
    }

    if (data.warnings && data.warnings.length > 0) {
      markdown += `## Warnings\n\n`
      for (const warning of data.warnings) {
        markdown += `- ${WarningFormatter.formatConsole(warning)}\n`
      }
      markdown += '\n'
    }

    return markdown
  }

  private formatAsCSV(data: ExportData): string {
    const rows: string[] = []
    rows.push('Type,Name,File,Tokens,Status,Duration')

    if (data.files) {
      for (const file of data.files) {
        for (const test of file.tests) {
          rows.push(
            [
              'test',
              `"${test.testName}"`,
              `"${test.filePath}"`,
              test.totalTokens.toString(),
              test.status,
              test.duration.toString()
            ].join(',')
          )
        }
      }
    }

    return rows.join('\n')
  }
}

/**
 * Create token metrics collector from reporter config
 */
export function createTokenMetricsCollector(
  config: LLMReporterConfig,
  events?: CollectionEvents
): TokenMetricsCollector {
  const metricsConfig: TokenMetricsConfig = {
    enabled: config.tokenCountingEnabled ?? false,
    model: (config.tokenCountingModel as SupportedModel) ?? 'gpt-4',
    trackSections: true,
    includePassedTests: config.includePassedTests ?? false,
    includeSkippedTests: config.includeSkippedTests ?? false,
    maxContentSize: config.maxTokens ?? 50000,
    enableBatching: true,
    thresholds: {
      totalTokens: config.maxTokens
    }
  }

  return new TokenMetricsCollector(metricsConfig, events)
}
