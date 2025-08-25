/**
 * Token Metrics Warning System
 *
 * Minimal warning and error collection for token metrics.
 */

import type {
  MetricsWarning,
  MetricsError,
  MetricSection
} from './types.js'
import type { ThresholdLevel } from './thresholds.js'
import type { SupportedModel } from '../types.js'

/**
 * Minimal warning and error collection system
 */
export class WarningSystem {
  private warnings: MetricsWarning[] = []
  private errors: MetricsError[] = []

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
  ): MetricsWarning {
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

    this.warnings.push(warning)
    return warning
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
  ): MetricsWarning {
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

    this.warnings.push(warning)
    return warning
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
  ): MetricsWarning {
    const warning: MetricsWarning = {
      type: 'tokenization-failed',
      message: `Tokenization failed: ${error}`,
      severity: 'high',
      context,
      timestamp: Date.now()
    }

    this.warnings.push(warning)
    return warning
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
  ): MetricsWarning {
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

    this.warnings.push(warning)
    return warning
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
  ): MetricsWarning {
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

    this.warnings.push(warning)
    return warning
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
  ): MetricsError {
    const metricsError: MetricsError = {
      type,
      message,
      stack: error?.stack,
      code: error && 'code' in error && typeof error.code === 'string' ? error.code : undefined,
      context,
      timestamp: Date.now()
    }

    this.errors.push(metricsError)
    return metricsError
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
   * Clear all warnings and errors
   */
  clear(): void {
    this.warnings = []
    this.errors = []
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