/**
 * Token Metrics Warning System
 *
 * Handles generation, collection, and reporting of warnings
 * related to token usage and metrics collection.
 */

import { createLogger } from '../../utils/logger.js'
import type {
  MetricsWarning,
  MetricsError,
  MetricSection,
  TestTokenMetrics,
  FileTokenMetrics,
  TokenMetricsSummary
} from './types.js'
import type { ThresholdLevel } from './thresholds.js'
import type { SupportedModel } from '../types.js'

const logger = createLogger('token-metrics:warnings')

/**
 * Warning event handler type
 */
export type WarningHandler = (warning: MetricsWarning) => void

/**
 * Error event handler type
 */
export type ErrorHandler = (error: MetricsError) => void

/**
 * Warning statistics
 */
export interface WarningStats {
  /** Total warnings issued */
  total: number
  /** Warnings by severity */
  bySeverity: Record<'low' | 'medium' | 'high', number>
  /** Warnings by type */
  byType: Record<string, number>
  /** Most recent warning timestamp */
  lastWarning?: number
  /** Most common warning type */
  mostCommon?: string
}

/**
 * Warning and error collection system
 */
export class WarningSystem {
  private warnings: MetricsWarning[] = []
  private errors: MetricsError[] = []
  private warningHandlers: WarningHandler[] = []
  private errorHandlers: ErrorHandler[] = []
  private maxWarnings: number
  private maxErrors: number

  constructor(options: { maxWarnings?: number; maxErrors?: number } = {}) {
    this.maxWarnings = options.maxWarnings ?? 1000
    this.maxErrors = options.maxErrors ?? 100
  }

  /**
   * Add a warning handler
   */
  onWarning(handler: WarningHandler): void {
    this.warningHandlers.push(handler)
  }

  /**
   * Add an error handler
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler)
  }

  /**
   * Issue a threshold exceeded warning
   */
  warnThresholdExceeded(
    threshold: ThresholdLevel,
    metricType: string,
    actual: number,
    limit: number,
    context: {
      testId?: string
      filePath?: string
      section?: MetricSection
    } = {}
  ): void {
    const severity = this.mapThresholdToSeverity(threshold)
    const warning: MetricsWarning = {
      type: 'threshold-exceeded',
      message: `${metricType} threshold exceeded: ${actual} > ${limit} (${threshold} level)`,
      severity,
      context: {
        ...context,
        threshold: limit,
        actual
      },
      timestamp: Date.now()
    }

    this.addWarning(warning)
  }

  /**
   * Issue a content truncation warning
   */
  warnContentTruncated(
    originalSize: number,
    truncatedSize: number,
    context: {
      testId?: string
      filePath?: string
      section?: MetricSection
    } = {}
  ): void {
    const warning: MetricsWarning = {
      type: 'content-truncated',
      message: `Content truncated from ${originalSize} to ${truncatedSize} bytes`,
      severity: 'medium',
      context: {
        ...context,
        threshold: truncatedSize,
        actual: originalSize
      },
      timestamp: Date.now()
    }

    this.addWarning(warning)
  }

  /**
   * Issue a tokenization failure warning
   */
  warnTokenizationFailed(
    error: string,
    context: {
      testId?: string
      filePath?: string
      section?: MetricSection
    } = {}
  ): void {
    const warning: MetricsWarning = {
      type: 'tokenization-failed',
      message: `Tokenization failed: ${error}`,
      severity: 'high',
      context,
      timestamp: Date.now()
    }

    this.addWarning(warning)
  }

  /**
   * Issue a performance warning
   */
  warnPerformance(
    operation: string,
    duration: number,
    threshold: number,
    context: {
      testId?: string
      filePath?: string
    } = {}
  ): void {
    const warning: MetricsWarning = {
      type: 'performance',
      message: `${operation} took ${duration}ms (threshold: ${threshold}ms)`,
      severity: duration > threshold * 2 ? 'high' : 'medium',
      context: {
        ...context,
        threshold,
        actual: duration
      },
      timestamp: Date.now()
    }

    this.addWarning(warning)
  }

  /**
   * Issue a model limit warning
   */
  warnModelLimit(
    model: SupportedModel,
    tokenCount: number,
    limit: number,
    limitType: 'context' | 'recommended' | 'conservative',
    context: {
      testId?: string
      filePath?: string
    } = {}
  ): void {
    const severity =
      limitType === 'context' ? 'high' : limitType === 'recommended' ? 'medium' : 'low'

    const warning: MetricsWarning = {
      type: 'threshold-exceeded',
      message: `Token count ${tokenCount} exceeds ${limitType} limit ${limit} for ${model}`,
      severity,
      context: {
        ...context,
        threshold: limit,
        actual: tokenCount
      },
      timestamp: Date.now()
    }

    this.addWarning(warning)
  }

  /**
   * Record an error
   */
  recordError(
    type: MetricsError['type'],
    message: string,
    context: {
      testId?: string
      filePath?: string
      operation?: string
      inputSize?: number
    } = {},
    error?: Error
  ): void {
    const metricsError: MetricsError = {
      type,
      message,
      stack: error?.stack,
      code: (error as any)?.code,
      context,
      timestamp: Date.now()
    }

    this.addError(metricsError)
  }

  /**
   * Get all warnings
   */
  getWarnings(): MetricsWarning[] {
    return [...this.warnings]
  }

  /**
   * Get all errors
   */
  getErrors(): MetricsError[] {
    return [...this.errors]
  }

  /**
   * Get warnings filtered by criteria
   */
  getFilteredWarnings(filter: {
    type?: MetricsWarning['type']
    severity?: MetricsWarning['severity']
    testId?: string
    filePath?: string
    since?: number
  }): MetricsWarning[] {
    return this.warnings.filter((warning) => {
      if (filter.type && warning.type !== filter.type) return false
      if (filter.severity && warning.severity !== filter.severity) return false
      if (filter.testId && warning.context.testId !== filter.testId) return false
      if (filter.filePath && warning.context.filePath !== filter.filePath) return false
      if (filter.since && warning.timestamp < filter.since) return false
      return true
    })
  }

  /**
   * Get warning statistics
   */
  getWarningStats(): WarningStats {
    const stats: WarningStats = {
      total: this.warnings.length,
      bySeverity: { low: 0, medium: 0, high: 0 },
      byType: {},
      lastWarning: undefined,
      mostCommon: undefined
    }

    let maxCount = 0

    for (const warning of this.warnings) {
      // Count by severity
      stats.bySeverity[warning.severity]++

      // Count by type
      stats.byType[warning.type] = (stats.byType[warning.type] || 0) + 1

      // Track most common
      if (stats.byType[warning.type] > maxCount) {
        maxCount = stats.byType[warning.type]
        stats.mostCommon = warning.type
      }

      // Track latest
      if (!stats.lastWarning || warning.timestamp > stats.lastWarning) {
        stats.lastWarning = warning.timestamp
      }
    }

    return stats
  }

  /**
   * Clear all warnings and errors
   */
  clear(): void {
    this.warnings = []
    this.errors = []
  }

  /**
   * Clear warnings older than specified timestamp
   */
  clearOldWarnings(olderThan: number): number {
    const originalLength = this.warnings.length
    this.warnings = this.warnings.filter((warning) => warning.timestamp >= olderThan)
    return originalLength - this.warnings.length
  }

  /**
   * Clear errors older than specified timestamp
   */
  clearOldErrors(olderThan: number): number {
    const originalLength = this.errors.length
    this.errors = this.errors.filter((error) => error.timestamp >= olderThan)
    return originalLength - this.errors.length
  }

  /**
   * Generate summary of issues for a test
   */
  getTestSummary(testId: string): {
    warnings: MetricsWarning[]
    errors: MetricsError[]
    hasIssues: boolean
    severityCount: Record<'low' | 'medium' | 'high', number>
  } {
    const warnings = this.warnings.filter((w) => w.context.testId === testId)
    const errors = this.errors.filter((e) => e.context.testId === testId)

    const severityCount = { low: 0, medium: 0, high: 0 }
    for (const warning of warnings) {
      severityCount[warning.severity]++
    }

    return {
      warnings,
      errors,
      hasIssues: warnings.length > 0 || errors.length > 0,
      severityCount
    }
  }

  /**
   * Generate summary of issues for a file
   */
  getFileSummary(filePath: string): {
    warnings: MetricsWarning[]
    errors: MetricsError[]
    hasIssues: boolean
    affectedTests: Set<string>
  } {
    const warnings = this.warnings.filter((w) => w.context.filePath === filePath)
    const errors = this.errors.filter((e) => e.context.filePath === filePath)

    const affectedTests = new Set<string>()
    warnings.forEach((w) => w.context.testId && affectedTests.add(w.context.testId))
    errors.forEach((e) => e.context.testId && affectedTests.add(e.context.testId))

    return {
      warnings,
      errors,
      hasIssues: warnings.length > 0 || errors.length > 0,
      affectedTests
    }
  }

  /**
   * Add warning to collection
   */
  private addWarning(warning: MetricsWarning): void {
    // Prevent overflow
    if (this.warnings.length >= this.maxWarnings) {
      this.warnings.shift() // Remove oldest
    }

    this.warnings.push(warning)

    // Log the warning
    logger(`Warning: ${warning.message}`)

    // Notify handlers
    for (const handler of this.warningHandlers) {
      try {
        handler(warning)
      } catch (error) {
        logger(`Error in warning handler: ${error}`)
      }
    }
  }

  /**
   * Add error to collection
   */
  private addError(error: MetricsError): void {
    // Prevent overflow
    if (this.errors.length >= this.maxErrors) {
      this.errors.shift() // Remove oldest
    }

    this.errors.push(error)

    // Log the error
    logger(`Error: ${error.message}`)

    // Notify handlers
    for (const handler of this.errorHandlers) {
      try {
        handler(error)
      } catch (handlerError) {
        logger(`Error in error handler: ${handlerError}`)
      }
    }
  }

  /**
   * Map threshold level to warning severity
   */
  private mapThresholdToSeverity(threshold: ThresholdLevel): 'low' | 'medium' | 'high' {
    switch (threshold) {
      case 'info':
        return 'low'
      case 'warning':
        return 'medium'
      case 'critical':
        return 'high'
      default:
        return 'medium'
    }
  }
}

/**
 * Warning formatter utility
 */
export class WarningFormatter {
  /**
   * Format warning for console output
   */
  static formatConsole(warning: MetricsWarning): string {
    const emoji = warning.severity === 'high' ? '🚨' : warning.severity === 'medium' ? '⚠️' : 'ℹ️'

    let message = `${emoji} ${warning.message}`

    if (warning.context.testId) {
      message += ` (Test: ${warning.context.testId})`
    }

    if (warning.context.filePath) {
      message += ` (File: ${warning.context.filePath})`
    }

    if (warning.context.section) {
      message += ` (Section: ${warning.context.section})`
    }

    return message
  }

  /**
   * Format error for console output
   */
  static formatErrorConsole(error: MetricsError): string {
    let message = `❌ ${error.message}`

    if (error.context.testId) {
      message += ` (Test: ${error.context.testId})`
    }

    if (error.context.filePath) {
      message += ` (File: ${error.context.filePath})`
    }

    if (error.context.operation) {
      message += ` (Operation: ${error.context.operation})`
    }

    return message
  }

  /**
   * Format warnings summary
   */
  static formatSummary(stats: WarningStats): string {
    if (stats.total === 0) {
      return '✅ No warnings detected'
    }

    const parts = [`⚠️ ${stats.total} warning${stats.total !== 1 ? 's' : ''} detected`]

    if (stats.bySeverity.high > 0) {
      parts.push(`🚨 ${stats.bySeverity.high} high severity`)
    }

    if (stats.bySeverity.medium > 0) {
      parts.push(`⚠️ ${stats.bySeverity.medium} medium severity`)
    }

    if (stats.bySeverity.low > 0) {
      parts.push(`ℹ️ ${stats.bySeverity.low} low severity`)
    }

    if (stats.mostCommon) {
      parts.push(`Most common: ${stats.mostCommon}`)
    }

    return parts.join(', ')
  }
}

/**
 * Default warning system instance
 */
let defaultSystem: WarningSystem | null = null

/**
 * Get or create default warning system
 */
export function getWarningSystem(options?: {
  maxWarnings?: number
  maxErrors?: number
}): WarningSystem {
  if (!defaultSystem) {
    defaultSystem = new WarningSystem(options)
  }
  return defaultSystem
}

/**
 * Reset default warning system (useful for testing)
 */
export function resetWarningSystem(): void {
  defaultSystem = null
}
