/**
 * Markdown Streaming Formatter
 *
 * Formats test results as human-readable Markdown for documentation, reports,
 * and real-time monitoring. Provides progressive output with proper formatting,
 * syntax highlighting hints, and clear visual hierarchy.
 *
 * @module formatters/MarkdownStreamFormatter
 */

import type { LLMReporterOutput, TestSummary, TestFailure } from '../types/schema'
import {
  BaseStreamingFormatter,
  type StreamingEvent,
  type FormatterConfig,
  StreamingEventType,
  type TestCompleteData,
  type TestFailureData,
  type ProgressData,
  type RunStartData,
  type SuiteCompleteData,
  isTestCompleteData,
  isTestFailureData,
  isRunCompleteData,
  isProgressData
} from './StreamingFormatter'

/**
 * Markdown-specific configuration options
 */
export interface MarkdownFormatterConfig extends FormatterConfig {
  /** Include code blocks for errors */
  includeCodeBlocks?: boolean
  /** Use emoji indicators */
  useEmoji?: boolean
  /** Show progress bars */
  showProgressBars?: boolean
  /** Maximum error context lines */
  maxErrorLines?: number
  /** Include table of contents */
  includeToc?: boolean
  /** Use collapsible sections */
  useCollapsible?: boolean
  /** Header level for main sections */
  headerLevel?: number
}

/**
 * Default Markdown formatter configuration
 */
export const DEFAULT_MARKDOWN_CONFIG: Required<MarkdownFormatterConfig> = {
  includeTimestamps: true,
  includeProgress: true,
  useColors: false,
  includeFullErrors: true,
  maxLineLength: 120,
  indent: '  ',
  customOptions: {},
  includeCodeBlocks: true,
  useEmoji: true,
  showProgressBars: true,
  maxErrorLines: 20,
  includeToc: false,
  useCollapsible: true,
  headerLevel: 2
}

/**
 * Progress bar style options
 */
interface ProgressBarOptions {
  width: number
  fillChar: string
  emptyChar: string
  showPercentage: boolean
}

/**
 * Markdown streaming formatter
 *
 * Outputs test results as formatted Markdown suitable for documentation,
 * GitHub issues, or real-time monitoring dashboards.
 *
 * @example
 * ```typescript
 * const formatter = new MarkdownStreamFormatter({
 *   useEmoji: true,
 *   showProgressBars: true,
 *   includeCodeBlocks: true
 * });
 *
 * await formatter.initialize();
 *
 * // Output: ## ✅ Test Passed: `should work`
 * // **File:** `/path/to/test.js:10-15`
 * // **Duration:** 5ms
 * const output = await formatter.formatEvent(testCompleteEvent);
 * ```
 */
export class MarkdownStreamFormatter extends BaseStreamingFormatter {
  private markdownConfig: Required<MarkdownFormatterConfig>
  private sections: string[] = []

  constructor(config: MarkdownFormatterConfig = {}) {
    const mergedConfig = { ...DEFAULT_MARKDOWN_CONFIG, ...config }
    super(mergedConfig)
    this.markdownConfig = mergedConfig
  }

  protected doInitialize(): Promise<void> {
    this.sections = []
    this.state.custom = {
      ...this.state.custom,
      sectionsCreated: 0,
      lastProgressUpdate: 0
    }
    return Promise.resolve()
  }

  formatEvent(event: StreamingEvent): Promise<string> {
    if (!this.state.initialized) {
      return Promise.reject(new Error('MarkdownStreamFormatter must be initialized before use'))
    }

    this.updateCounters(event)

    const output = this.formatEventToMarkdown(event)

    // Track sections created
    if (output.trim()) {
      const custom = this.state.custom as { sectionsCreated?: number }
      custom.sectionsCreated = (custom.sectionsCreated || 0) + 1
    }

    return Promise.resolve(output)
  }

  formatFinal(output: LLMReporterOutput): Promise<string> {
    if (!this.state.initialized) {
      return Promise.reject(new Error('MarkdownStreamFormatter must be initialized before use'))
    }

    const lines: string[] = []

    // Header
    lines.push(`# Test Results Summary\n`)

    if (this.markdownConfig.includeTimestamps) {
      lines.push(`**Generated:** ${new Date().toISOString()}\n`)
    }

    // Overview
    lines.push(`## ${this.getEmoji('summary')} Overview\n`)
    lines.push(this.createSummaryTable(output.summary))
    lines.push('')

    // Progress visualization
    if (this.markdownConfig.showProgressBars && output.summary.total > 0) {
      lines.push(`## ${this.getEmoji('progress')} Progress\n`)
      lines.push(this.createProgressVisualization(output.summary))
      lines.push('')
    }

    // Failures section
    if (output.failures && output.failures.length > 0) {
      lines.push(`## ${this.getEmoji('failure')} Failed Tests (${output.failures.length})\n`)

      if (this.markdownConfig.useCollapsible && output.failures.length > 3) {
        lines.push('<details>')
        lines.push('<summary>Click to expand failed tests</summary>\n')
      }

      for (const [index, failure] of output.failures.entries()) {
        lines.push(this.formatFailureDetail(failure, index + 1))
        lines.push('')
      }

      if (this.markdownConfig.useCollapsible && output.failures.length > 3) {
        lines.push('</details>\n')
      }
    }

    // Passed tests section (if included)
    if (output.passed && output.passed.length > 0) {
      lines.push(`## ${this.getEmoji('success')} Passed Tests (${output.passed.length})\n`)

      if (this.markdownConfig.useCollapsible) {
        lines.push('<details>')
        lines.push('<summary>Click to expand passed tests</summary>\n')
      }

      for (const test of output.passed) {
        lines.push(`- ${this.getEmoji('success')} **${test.test}**`)
        lines.push(`  - File: \`${test.file}:${test.startLine}-${test.endLine}\``)
        if (test.duration) {
          lines.push(`  - Duration: ${test.duration}ms`)
        }
        lines.push('')
      }

      if (this.markdownConfig.useCollapsible) {
        lines.push('</details>\n')
      }
    }

    // Skipped tests section (if included)
    if (output.skipped && output.skipped.length > 0) {
      lines.push(`## ${this.getEmoji('skipped')} Skipped Tests (${output.skipped.length})\n`)

      for (const test of output.skipped) {
        lines.push(`- ${this.getEmoji('skipped')} **${test.test}** in \`${test.file}\``)
      }
      lines.push('')
    }

    return Promise.resolve(lines.join('\n'))
  }

  /**
   * Format individual streaming event to Markdown
   */
  private formatEventToMarkdown(event: StreamingEvent): string {
    const timestamp = this.markdownConfig.includeTimestamps
      ? this.formatTimestamp(event.timestamp)
      : ''

    switch (event.type) {
      case StreamingEventType.RUN_START: {
        const runStart = event.data as RunStartData
        return (
          `# ${this.getEmoji('start')} Test Run Started\n\n` +
          `${timestamp}**Total Tests:** ${runStart.totalTests}\n\n`
        )
      }

      case StreamingEventType.TEST_START:
        return '' // Don't output for test start to avoid clutter

      case StreamingEventType.TEST_COMPLETE:
        if (isTestCompleteData(event.data)) {
          return this.formatTestComplete(event.data, timestamp)
        }
        break

      case StreamingEventType.TEST_FAILURE:
        if (isTestFailureData(event.data)) {
          return this.formatTestFailure(event.data, timestamp)
        }
        break

      case StreamingEventType.SUITE_COMPLETE: {
        const suiteData = event.data as SuiteCompleteData
        return this.formatSuiteComplete(suiteData, timestamp)
      }

      case StreamingEventType.RUN_COMPLETE:
        if (isRunCompleteData(event.data)) {
          return (
            `## ${this.getEmoji('complete')} Test Run Complete\n\n` +
            this.createSummaryTable(event.data.summary) +
            '\n'
          )
        }
        break

      case StreamingEventType.PROGRESS:
        if (isProgressData(event.data)) {
          return this.formatProgressUpdate(event.data, timestamp)
        }
        break
    }

    return ''
  }

  /**
   * Format test completion
   */
  private formatTestComplete(data: TestCompleteData, timestamp: string): string {
    const { result, progress } = data
    const emoji = result.status === 'passed' ? this.getEmoji('success') : this.getEmoji('skipped')
    const status = result.status === 'passed' ? 'Passed' : 'Skipped'

    let output = `### ${emoji}${emoji ? ' ' : ''}Test ${status}: \`${result.test}\`\n\n`
    output += `${timestamp}**File:** \`${result.file}:${result.startLine}-${result.endLine}\`\n`

    if (result.duration) {
      output += `**Duration:** ${result.duration}ms\n`
    }

    if (result.suite && result.suite.length > 0) {
      output += `**Suite:** ${result.suite.join(' > ')}\n`
    }

    if (this.markdownConfig.includeProgress) {
      output += `**Progress:** ${super.formatProgress(progress.completed, progress.total)}\n`

      if (this.markdownConfig.showProgressBars) {
        output += this.createProgressBar(progress.completed, progress.total)
      }
    }

    return output + '\n'
  }

  /**
   * Format test failure
   */
  private formatTestFailure(data: TestFailureData, timestamp: string): string {
    const { failure, progress } = data

    let output = `### ${this.getEmoji('failure')} Test Failed: \`${failure.test}\`\n\n`
    output += `${timestamp}**File:** \`${failure.file}:${failure.startLine}-${failure.endLine}\`\n`
    output += `**Error Type:** ${failure.error.type}\n`

    if (failure.suite && failure.suite.length > 0) {
      output += `**Suite:** ${failure.suite.join(' > ')}\n`
    }

    output += `\n**Error Message:**\n`
    if (this.markdownConfig.includeCodeBlocks) {
      output += '```\n'
      output += failure.error.message + '\n'
      output += '```\n'
    } else {
      output += `> ${failure.error.message}\n`
    }

    // Add assertion details if available
    if (failure.error.assertion) {
      output += `\n**Assertion Details:**\n`
      output += `- **Expected:** \`${JSON.stringify(failure.error.assertion.expected)}\`\n`
      output += `- **Actual:** \`${JSON.stringify(failure.error.assertion.actual)}\`\n`
      if (failure.error.assertion.operator) {
        output += `- **Operator:** \`${failure.error.assertion.operator}\`\n`
      }
    }

    // Add stack trace if enabled
    if (this.markdownConfig.includeFullErrors && failure.error.stack) {
      output += `\n**Stack Trace:**\n`
      if (this.markdownConfig.includeCodeBlocks) {
        const stackLines = failure.error.stack.split('\n')
        const limitedStack = stackLines.slice(0, this.markdownConfig.maxErrorLines)
        output += '```\n'
        output += limitedStack.join('\n')
        if (stackLines.length > this.markdownConfig.maxErrorLines) {
          output += `\n... (${stackLines.length - this.markdownConfig.maxErrorLines} more lines)`
        }
        output += '\n```\n'
      } else {
        output += `\`\`\`\n${failure.error.stack}\n\`\`\`\n`
      }
    }

    // Add console output if available
    if (failure.console && Object.keys(failure.console).length > 0) {
      output += `\n**Console Output:**\n`
      if (failure.console.logs && failure.console.logs.length > 0) {
        output += `- **Logs:** ${failure.console.logs.join(', ')}\n`
      }
      if (failure.console.errors && failure.console.errors.length > 0) {
        output += `- **Errors:** ${failure.console.errors.join(', ')}\n`
      }
      if (failure.console.warns && failure.console.warns.length > 0) {
        output += `- **Warnings:** ${failure.console.warns.join(', ')}\n`
      }
    }

    if (this.markdownConfig.includeProgress) {
      output += `\n**Progress:** ${super.formatProgress(progress.completed, progress.total)}\n`

      if (this.markdownConfig.showProgressBars) {
        output += this.createProgressBar(progress.completed, progress.total)
      }
    }

    return output + '\n'
  }

  /**
   * Format suite completion
   */
  private formatSuiteComplete(data: SuiteCompleteData, timestamp: string): string {
    const { results } = data
    const total = results.passed + results.failed + results.skipped
    const emoji = results.failed > 0 ? this.getEmoji('failure') : this.getEmoji('success')

    let output = `### ${emoji} Suite Complete: \`${data.suiteName}\`\n\n`
    output += `${timestamp}**File:** \`${data.file}\`\n`
    output += `**Results:** ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped (${total} total)\n`

    if (this.markdownConfig.showProgressBars && total > 0) {
      output += this.createProgressBar(results.passed + results.failed + results.skipped, total)
    }

    return output + '\n'
  }

  /**
   * Format progress update
   */
  private formatProgressUpdate(data: ProgressData, timestamp: string): string {
    // Only show progress updates occasionally to avoid spam
    const custom = this.state.custom as { lastProgressUpdate?: number }
    const now = Date.now()
    if (now - (custom.lastProgressUpdate || 0) < 1000) {
      return '' // Skip if less than 1 second since last update
    }
    custom.lastProgressUpdate = now

    let output = `### ${this.getEmoji('progress')} Progress Update\n\n`
    output += `${timestamp}**Completed:** ${data.completed}/${data.total} tests\n`
    output += `**Results:** ${data.passed} passed, ${data.failed} failed, ${data.skipped} skipped\n`

    if (data.currentTest) {
      output += `**Current:** \`${data.currentTest}\`\n`
    }

    if (this.markdownConfig.showProgressBars) {
      output += this.createProgressBar(data.completed, data.total)
    }

    return output + '\n'
  }

  /**
   * Format failure detail for final summary
   */
  private formatFailureDetail(failure: TestFailure, index: number): string {
    let output = `### ${index}. ${this.getEmoji('failure')} \`${failure.test}\`\n\n`
    output += `**File:** \`${failure.file}:${failure.startLine}-${failure.endLine}\`\n`
    output += `**Error:** ${failure.error.message}\n`

    if (failure.error.assertion) {
      output += `\n**Expected vs Actual:**\n`
      if (this.markdownConfig.includeCodeBlocks) {
        output += '```diff\n'
        output += `- Expected: ${JSON.stringify(failure.error.assertion.expected, null, 2)}\n`
        output += `+ Actual:   ${JSON.stringify(failure.error.assertion.actual, null, 2)}\n`
        output += '```\n'
      } else {
        output += `- Expected: \`${JSON.stringify(failure.error.assertion.expected)}\`\n`
        output += `- Actual: \`${JSON.stringify(failure.error.assertion.actual)}\`\n`
      }
    }

    return output
  }

  /**
   * Create summary table
   */
  private createSummaryTable(summary: TestSummary): string {
    const { total, passed, failed, skipped, duration } = summary

    return `| Metric | Value |
|--------|-------|
| **Total Tests** | ${total} |
| **Passed** | ${passed} ${this.getEmoji('success')} |
| **Failed** | ${failed} ${this.getEmoji('failure')} |
| **Skipped** | ${skipped} ${this.getEmoji('skipped')} |
| **Duration** | ${duration}ms |
| **Success Rate** | ${total > 0 ? Math.round((passed / total) * 100) : 0}% |`
  }

  /**
   * Create progress bar visualization
   */
  private createProgressBar(
    completed: number,
    total: number,
    options?: Partial<ProgressBarOptions>
  ): string {
    if (!this.markdownConfig.showProgressBars || total === 0) {
      return ''
    }

    const opts: ProgressBarOptions = {
      width: 20,
      fillChar: '█',
      emptyChar: '░',
      showPercentage: true,
      ...options
    }

    const percentage = Math.round((completed / total) * 100)
    const filled = Math.round((completed / total) * opts.width)
    const empty = opts.width - filled

    const bar = opts.fillChar.repeat(filled) + opts.emptyChar.repeat(empty)
    const percentText = opts.showPercentage ? ` ${percentage}%` : ''

    return `\`${bar}\`${percentText} (${completed}/${total})\n`
  }

  /**
   * Create progress visualization for summary
   */
  private createProgressVisualization(summary: TestSummary): string {
    const { total, passed, failed, skipped } = summary

    if (total === 0) {
      return 'No tests executed.\n'
    }

    let viz = ''

    // Overall progress
    viz += `**Overall:** ${this.createProgressBar(passed + failed + skipped, total)}\n`

    // Breakdown
    viz += `**Passed:** ${this.createProgressBar(passed, total, { fillChar: '🟩', emptyChar: '⬜' })}\n`
    viz += `**Failed:** ${this.createProgressBar(failed, total, { fillChar: '🟥', emptyChar: '⬜' })}\n`
    viz += `**Skipped:** ${this.createProgressBar(skipped, total, { fillChar: '🟨', emptyChar: '⬜' })}\n`

    return viz
  }

  /**
   * Get emoji for different event types
   */
  private getEmoji(type: string): string {
    if (!this.markdownConfig.useEmoji) {
      return ''
    }

    const emojis: Record<string, string> = {
      start: '🚀',
      complete: '🏁',
      success: '✅',
      failure: '❌',
      skipped: '⏭️',
      progress: '📊',
      summary: '📋'
    }

    return emojis[type] || ''
  }

  /**
   * Get Markdown-specific statistics
   */
  getMarkdownStats(): {
    sectionsCreated: number
    useEmoji: boolean
    showProgressBars: boolean
    headerLevel: number
  } {
    const custom = this.state.custom as { sectionsCreated?: number }
    return {
      sectionsCreated: custom?.sectionsCreated || 0,
      useEmoji: this.markdownConfig.useEmoji,
      showProgressBars: this.markdownConfig.showProgressBars,
      headerLevel: this.markdownConfig.headerLevel
    }
  }

  /**
   * Create a Markdown formatter optimized for GitHub
   */
  static createGitHub(): MarkdownStreamFormatter {
    return new MarkdownStreamFormatter({
      useEmoji: true,
      showProgressBars: false, // GitHub doesn't render progress bars well
      includeCodeBlocks: true,
      useCollapsible: true,
      maxErrorLines: 10
    })
  }

  /**
   * Create a minimal Markdown formatter
   */
  static createMinimal(): MarkdownStreamFormatter {
    return new MarkdownStreamFormatter({
      useEmoji: false,
      showProgressBars: false,
      includeTimestamps: false,
      includeProgress: false,
      includeCodeBlocks: false,
      useCollapsible: false
    })
  }
}
