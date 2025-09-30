/**
 * Baseline Performance Comparator
 *
 * Utilities for comparing current benchmark results against established baselines
 * to detect performance regressions.
 *
 * @module BaselineComparator
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BenchmarkResult } from './types.js'

/**
 * Baseline metric definition
 */
export interface BaselineMetric {
  /** Maximum acceptable time in milliseconds */
  maxMs: number
  /** Average time in milliseconds from baseline run */
  avgMs: number
  /** Memory usage in MB from baseline run */
  memoryMB: number
  /** Expected success rate percentage */
  successRate: number
  /** Description of what this metric measures */
  description: string
}

/**
 * Baseline metrics file structure
 */
export interface BaselineMetrics {
  version: string
  capturedAt: string
  description: string
  metrics: Record<string, BaselineMetric>
  environment: {
    nodeVersion: string
    platform: string
    arch: string
    cpuModel: string
  }
  notes: string[]
}

/**
 * Regression comparison result
 */
export interface RegressionResult {
  /** Benchmark name */
  name: string
  /** Whether a regression was detected */
  hasRegression: boolean
  /** Severity level: 'none' | 'warning' | 'critical' */
  severity: 'none' | 'warning' | 'critical'
  /** Time comparison details */
  timeComparison: {
    baseline: number
    current: number
    percentChange: number
    exceedsThreshold: boolean
  }
  /** Memory comparison details */
  memoryComparison: {
    baseline: number
    current: number
    percentChange: number
    exceedsThreshold: boolean
  }
  /** Success rate comparison */
  successRateComparison: {
    baseline: number
    current: number
    percentChange: number
    exceedsThreshold: boolean
  }
  /** Human-readable summary */
  summary: string
}

/**
 * Full regression report
 */
export interface RegressionReport {
  /** Total number of benchmarks compared */
  totalBenchmarks: number
  /** Number of regressions detected */
  regressionsDetected: number
  /** Number of warnings */
  warnings: number
  /** Number of critical regressions */
  critical: number
  /** Individual regression results */
  results: RegressionResult[]
  /** Overall status */
  overallStatus: 'pass' | 'warning' | 'fail'
  /** Summary message */
  summary: string
}

/**
 * Regression detection thresholds
 */
export interface RegressionThresholds {
  /** Time increase percentage for warning (default: 20%) */
  timeWarning: number
  /** Time increase percentage for critical (default: 50%) */
  timeCritical: number
  /** Absolute time delta in milliseconds that must be exceeded before flagging (default: 0.5ms) */
  timeAbsoluteToleranceMs: number
  /** Memory increase percentage for warning (default: 30%) */
  memoryWarning: number
  /** Memory increase percentage for critical (default: 100%) */
  memoryCritical: number
  /** Success rate decrease percentage for warning (default: 5%) */
  successRateWarning: number
  /** Success rate decrease percentage for critical (default: 10%) */
  successRateCritical: number
}

/**
 * Default regression thresholds
 */
export const DEFAULT_THRESHOLDS: RegressionThresholds = {
  timeWarning: 20,
  timeCritical: 50,
  timeAbsoluteToleranceMs: 0.5,
  memoryWarning: 30,
  memoryCritical: 100,
  successRateWarning: 5,
  successRateCritical: 10
}

/**
 * Load baseline metrics from file
 *
 * @param baselineFile - Path to baseline metrics JSON file (defaults to ./baseline-metrics.json)
 * @returns Parsed baseline metrics
 * @throws Error if file cannot be read or parsed
 */
export function loadBaseline(baselineFile?: string): BaselineMetrics {
  const filePath = baselineFile || join(__dirname, 'baseline-metrics.json')

  try {
    const content = readFileSync(filePath, 'utf-8')
    const baseline = JSON.parse(content) as BaselineMetrics

    // Validate baseline structure
    if (!baseline.metrics || typeof baseline.metrics !== 'object') {
      throw new Error('Invalid baseline file: missing or invalid metrics field')
    }

    return baseline
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Baseline file not found: ${filePath}`)
    }
    throw new Error(`Failed to load baseline: ${(error as Error).message}`)
  }
}

/**
 * Compare a benchmark result against its baseline
 *
 * @param name - Benchmark name
 * @param result - Current benchmark result
 * @param baseline - Baseline metrics
 * @param thresholds - Regression detection thresholds (optional)
 * @returns Regression comparison result
 */
export function compareToBaseline(
  name: string,
  result: BenchmarkResult,
  baseline: BaselineMetrics,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS
): RegressionResult {
  const baselineMetric = baseline.metrics[name]

  if (!baselineMetric) {
    return {
      name,
      hasRegression: false,
      severity: 'none',
      timeComparison: {
        baseline: 0,
        current: result.averageTime,
        percentChange: 0,
        exceedsThreshold: false
      },
      memoryComparison: {
        baseline: 0,
        current: result.memoryDelta / 1024 / 1024,
        percentChange: 0,
        exceedsThreshold: false
      },
      successRateComparison: {
        baseline: 0,
        current: result.successRate,
        percentChange: 0,
        exceedsThreshold: false
      },
      summary: `No baseline found for ${name}`
    }
  }

  // Calculate time comparison
  const timeDeltaMs = result.averageTime - baselineMetric.avgMs
  const timePercent =
    baselineMetric.avgMs === 0
      ? timeDeltaMs > 0
        ? Infinity
        : 0
      : (timeDeltaMs / baselineMetric.avgMs) * 100
  const timeAboveTolerance = timeDeltaMs > thresholds.timeAbsoluteToleranceMs
  const timeWarningExceeded = timeAboveTolerance && timePercent > thresholds.timeWarning
  const timeCriticalExceeded = timeAboveTolerance && timePercent > thresholds.timeCritical
  const timeMaxExceeded = result.averageTime > baselineMetric.maxMs
  const timeExceeds = timeWarningExceeded || timeMaxExceeded

  // Calculate memory comparison
  const currentMemoryMB = result.memoryDelta / 1024 / 1024
  const memoryPercent =
    ((currentMemoryMB - baselineMetric.memoryMB) / baselineMetric.memoryMB) * 100
  const memoryExceeds = memoryPercent > thresholds.memoryWarning

  // Calculate success rate comparison (note: decrease is bad)
  const successRatePercent =
    ((baselineMetric.successRate - result.successRate) / baselineMetric.successRate) * 100
  const successRateExceeds = successRatePercent > thresholds.successRateWarning

  // Determine severity
  let severity: 'none' | 'warning' | 'critical' = 'none'
  let hasRegression = false

  if (
    timeCriticalExceeded ||
    memoryPercent > thresholds.memoryCritical ||
    successRatePercent > thresholds.successRateCritical
  ) {
    severity = 'critical'
    hasRegression = true
  } else if (timeExceeds || memoryExceeds || successRateExceeds) {
    severity = 'warning'
    hasRegression = true
  }

  // Generate summary
  const issues: string[] = []
  const formattedTimePercent = Number.isFinite(timePercent) ? timePercent.toFixed(1) : '∞'

  if (timeWarningExceeded || timeCriticalExceeded || timeMaxExceeded) {
    issues.push(
      `time ${timePercent > 0 ? '+' : ''}${formattedTimePercent}% (${result.averageTime.toFixed(2)}ms vs ${baselineMetric.avgMs.toFixed(2)}ms)`
    )
  }
  if (memoryExceeds) {
    issues.push(
      `memory ${memoryPercent > 0 ? '+' : ''}${memoryPercent.toFixed(1)}% (${currentMemoryMB.toFixed(2)}MB vs ${baselineMetric.memoryMB.toFixed(2)}MB)`
    )
  }
  if (successRateExceeds) {
    issues.push(
      `success rate -${successRatePercent.toFixed(1)}% (${result.successRate.toFixed(1)}% vs ${baselineMetric.successRate.toFixed(1)}%)`
    )
  }

  const summary =
    issues.length > 0
      ? `${severity.toUpperCase()}: ${issues.join(', ')}`
      : `Performance within baseline thresholds`

  return {
    name,
    hasRegression,
    severity,
    timeComparison: {
      baseline: baselineMetric.avgMs,
      current: result.averageTime,
      percentChange: timePercent,
      exceedsThreshold: timeExceeds
    },
    memoryComparison: {
      baseline: baselineMetric.memoryMB,
      current: currentMemoryMB,
      percentChange: memoryPercent,
      exceedsThreshold: memoryExceeds
    },
    successRateComparison: {
      baseline: baselineMetric.successRate,
      current: result.successRate,
      percentChange: -successRatePercent, // Negative because decrease is bad
      exceedsThreshold: successRateExceeds
    },
    summary
  }
}

/**
 * Compare multiple benchmark results against baselines
 *
 * @param results - Map of benchmark names to results
 * @param baseline - Baseline metrics
 * @param thresholds - Regression detection thresholds (optional)
 * @returns Full regression report
 */
export function compareMultipleToBaseline(
  results: Record<string, BenchmarkResult>,
  baseline: BaselineMetrics,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS
): RegressionReport {
  const comparisonResults: RegressionResult[] = []
  let warnings = 0
  let critical = 0

  for (const [name, result] of Object.entries(results)) {
    const comparison = compareToBaseline(name, result, baseline, thresholds)
    comparisonResults.push(comparison)

    if (comparison.severity === 'warning') warnings++
    if (comparison.severity === 'critical') critical++
  }

  const regressionsDetected = warnings + critical
  const overallStatus = critical > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass'

  const summary =
    overallStatus === 'pass'
      ? `All ${comparisonResults.length} benchmarks passed baseline validation`
      : `${regressionsDetected} regression(s) detected: ${critical} critical, ${warnings} warning(s)`

  return {
    totalBenchmarks: comparisonResults.length,
    regressionsDetected,
    warnings,
    critical,
    results: comparisonResults,
    overallStatus,
    summary
  }
}

/**
 * Format regression report for console output
 *
 * @param report - Regression report to format
 * @returns Formatted string for console output
 */
export function formatRegressionReport(report: RegressionReport): string {
  const lines: string[] = []

  lines.push('='.repeat(80))
  lines.push('PERFORMANCE REGRESSION DETECTION REPORT')
  lines.push('='.repeat(80))
  lines.push('')
  lines.push(`Total Benchmarks: ${report.totalBenchmarks}`)
  lines.push(`Regressions Detected: ${report.regressionsDetected}`)
  lines.push(`  - Critical: ${report.critical}`)
  lines.push(`  - Warnings: ${report.warnings}`)
  lines.push(`Overall Status: ${report.overallStatus.toUpperCase()}`)
  lines.push('')
  lines.push('-'.repeat(80))

  for (const result of report.results) {
    if (result.hasRegression) {
      const icon = result.severity === 'critical' ? '🔴' : '🟡'
      lines.push(`${icon} ${result.name}`)
      lines.push(`   ${result.summary}`)
      lines.push('')
    }
  }

  if (report.regressionsDetected === 0) {
    lines.push('✅ All benchmarks passed baseline validation')
    lines.push('')
  }

  lines.push('='.repeat(80))

  return lines.join('\n')
}

/**
 * Assert no significant regression for a benchmark
 *
 * Throws an error if a critical regression is detected.
 * Logs a warning if a non-critical regression is detected.
 *
 * @param name - Benchmark name
 * @param result - Current benchmark result
 * @param baseline - Baseline metrics
 * @param thresholds - Regression detection thresholds (optional)
 */
export function assertNoRegression(
  name: string,
  result: BenchmarkResult,
  baseline: BaselineMetrics,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS
): void {
  const comparison = compareToBaseline(name, result, baseline, thresholds)

  if (comparison.severity === 'critical') {
    throw new Error(`Performance regression detected for ${name}: ${comparison.summary}`)
  }

  if (comparison.severity === 'warning') {
    console.warn(`⚠️  Performance warning for ${name}: ${comparison.summary}`)
  }
}
