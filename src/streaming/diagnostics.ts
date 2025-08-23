/**
 * Streaming Diagnostics
 *
 * Provides comprehensive diagnostic logging and monitoring for streaming operations.
 * Tracks performance metrics, error patterns, and system health indicators.
 *
 * @module streaming/diagnostics
 */

import { createLogger, perfLogger, errorLogger } from '../utils/logger'
import { StreamErrorType, StreamErrorSeverity, type StreamErrorContext } from './ErrorHandler'
import { StreamHealth, type StreamMonitoringData } from './StreamRecovery'
import { OutputPriority, OutputSource } from './queue'

/**
 * Diagnostic event types
 */
export enum DiagnosticEvent {
  OPERATION_START = 'operation_start',
  OPERATION_COMPLETE = 'operation_complete',
  OPERATION_ERROR = 'operation_error',
  PERFORMANCE_WARNING = 'performance_warning',
  RESOURCE_WARNING = 'resource_warning',
  QUEUE_WARNING = 'queue_warning',
  HEALTH_CHECK = 'health_check',
  RECOVERY_EVENT = 'recovery_event',
  SYSTEM_EVENT = 'system_event'
}

/**
 * Diagnostic levels
 */
export enum DiagnosticLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Operation metrics
 */
export interface OperationMetrics {
  /** Operation identifier */
  operationId: string
  /** Operation type */
  operation: string
  /** Priority level */
  priority: OutputPriority
  /** Source of operation */
  source: OutputSource
  /** Start timestamp */
  startTime: number
  /** End timestamp */
  endTime?: number
  /** Duration in milliseconds */
  duration?: number
  /** Success status */
  success?: boolean
  /** Error information */
  error?: {
    type: StreamErrorType
    severity: StreamErrorSeverity
    message: string
  }
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Timestamp */
  timestamp: number
  /** Memory usage in MB */
  memoryUsage: number
  /** CPU usage percentage */
  cpuUsage?: number
  /** Queue sizes */
  queueMetrics: {
    /** Current queue size */
    currentSize: number
    /** Maximum queue size reached */
    maxSize: number
    /** Operations processed per second */
    throughput: number
  }
  /** Latency metrics */
  latencyMetrics: {
    /** Average latency in ms */
    average: number
    /** 95th percentile latency */
    p95: number
    /** 99th percentile latency */
    p99: number
    /** Maximum latency */
    max: number
  }
  /** Error rates */
  errorMetrics: {
    /** Total error count */
    totalErrors: number
    /** Error rate (errors per operation) */
    errorRate: number
    /** Errors by type */
    errorsByType: Record<string, number>
  }
}

/**
 * System resource information
 */
export interface SystemResources {
  /** Memory information */
  memory: {
    /** Total system memory (MB) */
    total: number
    /** Free system memory (MB) */
    free: number
    /** Process heap used (MB) */
    heapUsed: number
    /** Process heap total (MB) */
    heapTotal: number
    /** External memory (MB) */
    external: number
  }
  /** Process information */
  process: {
    /** Process ID */
    pid: number
    /** Uptime in seconds */
    uptime: number
    /** Process version */
    version: string
    /** Platform */
    platform: string
  }
}

/**
 * Diagnostic report
 */
export interface DiagnosticReport {
  /** Report timestamp */
  timestamp: number
  /** Report duration (from start) */
  duration: number
  /** Current stream health */
  health: StreamHealth
  /** Performance summary */
  performance: PerformanceMetrics
  /** System resources */
  system: SystemResources
  /** Recent operations summary */
  operations: {
    /** Total operations */
    total: number
    /** Successful operations */
    successful: number
    /** Failed operations */
    failed: number
    /** Average operation time */
    averageTime: number
  }
  /** Error summary */
  errors: {
    /** Total errors */
    total: number
    /** Errors by type */
    byType: Record<string, number>
    /** Errors by severity */
    bySeverity: Record<string, number>
    /** Recent errors */
    recent: StreamErrorContext[]
  }
  /** Recommendations */
  recommendations: string[]
}

/**
 * Diagnostic configuration
 */
export interface DiagnosticsConfig {
  /** Enable diagnostic logging */
  enabled?: boolean
  /** Log level for diagnostics */
  logLevel?: DiagnosticLevel
  /** Maximum operations to track */
  maxOperationHistory?: number
  /** Maximum error history */
  maxErrorHistory?: number
  /** Performance monitoring interval (ms) */
  performanceInterval?: number
  /** Enable detailed operation tracking */
  enableOperationTracking?: boolean
  /** Enable performance warnings */
  enablePerformanceWarnings?: boolean
  /** Enable resource monitoring */
  enableResourceMonitoring?: boolean
  /** Warning thresholds */
  warningThresholds?: {
    /** Memory usage warning threshold (MB) */
    memoryUsage?: number
    /** Queue size warning threshold */
    queueSize?: number
    /** Latency warning threshold (ms) */
    latency?: number
    /** Error rate warning threshold */
    errorRate?: number
  }
}

/**
 * Streaming diagnostics system
 */
export class StreamingDiagnostics {
  private config: Required<DiagnosticsConfig>
  private debug = createLogger('diagnostics')
  private debugPerf = perfLogger()
  private debugError = errorLogger()

  private isActive = false
  private startTime = 0
  private operationHistory: OperationMetrics[] = []
  private errorHistory: StreamErrorContext[] = []
  private performanceHistory: PerformanceMetrics[] = []
  private performanceTimer?: NodeJS.Timeout

  private operationCounter = 0
  private activeOperations = new Map<string, OperationMetrics>()

  constructor(config: DiagnosticsConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logLevel: config.logLevel ?? DiagnosticLevel.INFO,
      maxOperationHistory: config.maxOperationHistory ?? 1000,
      maxErrorHistory: config.maxErrorHistory ?? 100,
      performanceInterval: config.performanceInterval ?? 5000,
      enableOperationTracking: config.enableOperationTracking ?? true,
      enablePerformanceWarnings: config.enablePerformanceWarnings ?? true,
      enableResourceMonitoring: config.enableResourceMonitoring ?? true,
      warningThresholds: {
        memoryUsage: 100,
        queueSize: 50,
        latency: 1000,
        errorRate: 0.1,
        ...config.warningThresholds
      }
    }

    this.debug('Streaming diagnostics initialized with config: %O', this.config)
  }

  /**
   * Start diagnostics monitoring
   */
  start(): void {
    if (!this.config.enabled || this.isActive) {
      return
    }

    this.isActive = true
    this.startTime = Date.now()

    // Start performance monitoring
    if (this.config.enableResourceMonitoring) {
      this.performanceTimer = setInterval(() => {
        this.collectPerformanceMetrics()
      }, this.config.performanceInterval)
    }

    this.logEvent(
      DiagnosticEvent.SYSTEM_EVENT,
      DiagnosticLevel.INFO,
      'Streaming diagnostics started',
      { startTime: this.startTime }
    )
  }

  /**
   * Stop diagnostics monitoring
   */
  stop(): void {
    if (!this.isActive) {
      return
    }

    this.isActive = false

    if (this.performanceTimer) {
      clearInterval(this.performanceTimer)
      this.performanceTimer = undefined
    }

    this.logEvent(
      DiagnosticEvent.SYSTEM_EVENT,
      DiagnosticLevel.INFO,
      'Streaming diagnostics stopped',
      {
        duration: Date.now() - this.startTime,
        totalOperations: this.operationCounter,
        totalErrors: this.errorHistory.length
      }
    )
  }

  /**
   * Track operation start
   */
  trackOperationStart(
    operation: string,
    priority: OutputPriority,
    source: OutputSource,
    metadata?: Record<string, unknown>
  ): string {
    if (!this.config.enabled || !this.config.enableOperationTracking) {
      return ''
    }

    const operationId = `op-${++this.operationCounter}-${Date.now()}`
    const metrics: OperationMetrics = {
      operationId,
      operation,
      priority,
      source,
      startTime: Date.now(),
      metadata
    }

    this.activeOperations.set(operationId, metrics)

    this.logEvent(
      DiagnosticEvent.OPERATION_START,
      DiagnosticLevel.DEBUG,
      `Operation started: ${operation}`,
      { operationId, priority, source }
    )

    return operationId
  }

  /**
   * Track operation completion
   */
  trackOperationComplete(operationId: string, success: boolean, result?: unknown): void {
    if (!this.config.enabled || !operationId) {
      return
    }

    const metrics = this.activeOperations.get(operationId)
    if (!metrics) {
      return
    }

    metrics.endTime = Date.now()
    metrics.duration = metrics.endTime - metrics.startTime
    metrics.success = success

    if (result) {
      metrics.metadata = { ...metrics.metadata, result }
    }

    this.activeOperations.delete(operationId)
    this.addToOperationHistory(metrics)

    // Check for performance warnings
    if (this.config.enablePerformanceWarnings && metrics.duration) {
      this.checkPerformanceWarnings(metrics)
    }

    this.logEvent(
      DiagnosticEvent.OPERATION_COMPLETE,
      DiagnosticLevel.DEBUG,
      `Operation completed: ${metrics.operation}`,
      {
        operationId,
        duration: metrics.duration,
        success
      }
    )
  }

  /**
   * Track operation error
   */
  trackOperationError(operationId: string, errorContext: StreamErrorContext): void {
    if (!this.config.enabled) {
      return
    }

    const metrics = this.activeOperations.get(operationId)
    if (metrics) {
      metrics.endTime = Date.now()
      metrics.duration = metrics.endTime - metrics.startTime
      metrics.success = false
      metrics.error = {
        type: errorContext.type,
        severity: errorContext.severity,
        message: errorContext.error.message
      }

      this.activeOperations.delete(operationId)
      this.addToOperationHistory(metrics)
    }

    this.addToErrorHistory(errorContext)

    this.logEvent(
      DiagnosticEvent.OPERATION_ERROR,
      DiagnosticLevel.ERROR,
      `Operation error: ${errorContext.source.operation}`,
      {
        operationId,
        errorType: errorContext.type,
        severity: errorContext.severity,
        message: errorContext.error.message
      }
    )
  }

  /**
   * Log health check results
   */
  logHealthCheck(health: StreamHealth, monitoringData: StreamMonitoringData): void {
    if (!this.config.enabled) {
      return
    }

    const level =
      health === StreamHealth.HEALTHY
        ? DiagnosticLevel.DEBUG
        : health === StreamHealth.DEGRADED
          ? DiagnosticLevel.WARN
          : DiagnosticLevel.ERROR

    this.logEvent(DiagnosticEvent.HEALTH_CHECK, level, `Stream health check: ${health}`, {
      health,
      performance: monitoringData.performance,
      circuitBreaker: monitoringData.circuitBreaker
    })

    // Check for resource warnings
    if (this.config.enablePerformanceWarnings) {
      this.checkResourceWarnings(monitoringData.performance)
    }
  }

  /**
   * Log recovery events
   */
  logRecoveryEvent(
    event: string,
    data: unknown,
    level: DiagnosticLevel = DiagnosticLevel.INFO
  ): void {
    if (!this.config.enabled) {
      return
    }

    this.logEvent(DiagnosticEvent.RECOVERY_EVENT, level, `Recovery: ${event}`, data)
  }

  /**
   * Collect current performance metrics
   */
  private collectPerformanceMetrics(): void {
    if (!this.isActive) {
      return
    }

    // Check if process.memoryUsage is available (may not be in test environment)
    if (typeof process?.memoryUsage !== 'function') {
      return
    }

    const memUsage = process.memoryUsage()
    const now = Date.now()

    // Calculate latency metrics from recent operations
    const recentOps = this.operationHistory.slice(-100) // Last 100 operations
    const latencies = recentOps
      .filter((op) => op.duration !== undefined)
      .map((op) => op.duration!)
      .sort((a, b) => a - b)

    const latencyMetrics = {
      average: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p95: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
      p99: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0,
      max: latencies.length > 0 ? Math.max(...latencies) : 0
    }

    // Calculate error metrics
    const recentErrors = this.errorHistory.slice(-100)
    const errorsByType: Record<string, number> = {}
    recentErrors.forEach((error) => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
    })

    const metrics: PerformanceMetrics = {
      timestamp: now,
      memoryUsage: memUsage.heapUsed / 1024 / 1024,
      queueMetrics: {
        currentSize: this.activeOperations.size,
        maxSize: this.activeOperations.size, // Would track max over time
        throughput: this.calculateThroughput()
      },
      latencyMetrics,
      errorMetrics: {
        totalErrors: this.errorHistory.length,
        errorRate: recentOps.length > 0 ? recentErrors.length / recentOps.length : 0,
        errorsByType
      }
    }

    this.addToPerformanceHistory(metrics)
  }

  /**
   * Calculate operations throughput
   */
  private calculateThroughput(): number {
    const recentOps = this.operationHistory.slice(-100)
    if (recentOps.length < 2) {
      return 0
    }

    const timeSpan = Date.now() - recentOps[0].startTime
    return timeSpan > 0 ? (recentOps.length / timeSpan) * 1000 : 0
  }

  /**
   * Check for performance warnings
   */
  private checkPerformanceWarnings(metrics: OperationMetrics): void {
    const thresholds = this.config.warningThresholds

    if (metrics.duration && metrics.duration > (thresholds.latency || 1000)) {
      this.logEvent(
        DiagnosticEvent.PERFORMANCE_WARNING,
        DiagnosticLevel.WARN,
        `High latency detected: ${metrics.duration}ms`,
        {
          operation: metrics.operation,
          duration: metrics.duration,
          threshold: thresholds.latency
        }
      )
    }
  }

  /**
   * Check for resource warnings
   */
  private checkResourceWarnings(performance: StreamMonitoringData['performance']): void {
    const thresholds = this.config.warningThresholds

    if (performance.memoryUsage > (thresholds.memoryUsage || 100)) {
      this.logEvent(
        DiagnosticEvent.RESOURCE_WARNING,
        DiagnosticLevel.WARN,
        `High memory usage: ${performance.memoryUsage}MB`,
        {
          memoryUsage: performance.memoryUsage,
          threshold: thresholds.memoryUsage
        }
      )
    }

    if (performance.queueSize > (thresholds.queueSize || 50)) {
      this.logEvent(
        DiagnosticEvent.QUEUE_WARNING,
        DiagnosticLevel.WARN,
        `Large queue size: ${performance.queueSize}`,
        {
          queueSize: performance.queueSize,
          threshold: thresholds.queueSize
        }
      )
    }
  }

  /**
   * Add operation to history
   */
  private addToOperationHistory(metrics: OperationMetrics): void {
    this.operationHistory.push(metrics)
    if (this.operationHistory.length > this.config.maxOperationHistory) {
      this.operationHistory.shift()
    }
  }

  /**
   * Add error to history
   */
  private addToErrorHistory(errorContext: StreamErrorContext): void {
    this.errorHistory.push(errorContext)
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory.shift()
    }
  }

  /**
   * Add performance metrics to history
   */
  private addToPerformanceHistory(metrics: PerformanceMetrics): void {
    this.performanceHistory.push(metrics)
    if (this.performanceHistory.length > 100) {
      // Keep last 100 performance measurements
      this.performanceHistory.shift()
    }
  }

  /**
   * Log diagnostic event
   */
  private logEvent(
    event: DiagnosticEvent,
    level: DiagnosticLevel,
    message: string,
    data?: unknown
  ): void {
    if (!this.shouldLog(level)) {
      return
    }

    const _logData: Record<string, unknown> = {
      event,
      level,
      message,
      timestamp: Date.now(),
      ...(typeof data === 'object' && data !== null ? data : { data })
    }

    switch (level) {
      case DiagnosticLevel.DEBUG:
        this.debug('%s: %s %O', event, message, data)
        break
      case DiagnosticLevel.INFO:
        this.debug('%s: %s %O', event, message, data)
        break
      case DiagnosticLevel.WARN:
        this.debug('%s: %s %O', event, message, data)
        break
      case DiagnosticLevel.ERROR:
      case DiagnosticLevel.CRITICAL:
        this.debugError('%s: %s %O', event, message, data)
        break
    }
  }

  /**
   * Check if we should log at this level
   */
  private shouldLog(level: DiagnosticLevel): boolean {
    const levels = [
      DiagnosticLevel.DEBUG,
      DiagnosticLevel.INFO,
      DiagnosticLevel.WARN,
      DiagnosticLevel.ERROR,
      DiagnosticLevel.CRITICAL
    ]

    const currentLevelIndex = levels.indexOf(this.config.logLevel)
    const eventLevelIndex = levels.indexOf(level)

    return eventLevelIndex >= currentLevelIndex
  }

  /**
   * Generate comprehensive diagnostic report
   */
  generateReport(): DiagnosticReport {
    const now = Date.now()
    const duration = now - this.startTime

    // Calculate operation statistics
    const successfulOps = this.operationHistory.filter((op) => op.success === true).length
    const failedOps = this.operationHistory.filter((op) => op.success === false).length
    const totalOps = this.operationHistory.length
    const avgTime =
      totalOps > 0
        ? this.operationHistory.reduce((sum, op) => sum + (op.duration || 0), 0) / totalOps
        : 0

    // Calculate error statistics
    const errorsByType: Record<string, number> = {}
    const errorsBySeverity: Record<string, number> = {}

    this.errorHistory.forEach((error) => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1
    })

    // Get latest performance metrics
    const latestPerf = this.performanceHistory[this.performanceHistory.length - 1] || {
      timestamp: now,
      memoryUsage: (process?.memoryUsage?.()?.heapUsed || 0) / 1024 / 1024,
      queueMetrics: { currentSize: 0, maxSize: 0, throughput: 0 },
      latencyMetrics: { average: 0, p95: 0, p99: 0, max: 0 },
      errorMetrics: { totalErrors: 0, errorRate: 0, errorsByType: {} }
    }

    // Get system resources
    const memUsage = process.memoryUsage()
    const system: SystemResources = {
      memory: {
        total: 0, // Would need OS-specific code to get total memory
        free: 0, // Would need OS-specific code to get free memory
        heapUsed: memUsage.heapUsed / 1024 / 1024,
        heapTotal: memUsage.heapTotal / 1024 / 1024,
        external: memUsage.external / 1024 / 1024
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        version: process.version,
        platform: process.platform
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(latestPerf, errorsByType)

    return {
      timestamp: now,
      duration,
      health: StreamHealth.HEALTHY, // Would get from monitoring system
      performance: latestPerf,
      system,
      operations: {
        total: totalOps,
        successful: successfulOps,
        failed: failedOps,
        averageTime: avgTime
      },
      errors: {
        total: this.errorHistory.length,
        byType: errorsByType,
        bySeverity: errorsBySeverity,
        recent: this.errorHistory.slice(-10)
      },
      recommendations
    }
  }

  /**
   * Generate recommendations based on current metrics
   */
  private generateRecommendations(
    perf: PerformanceMetrics,
    errorsByType: Record<string, number>
  ): string[] {
    const recommendations: string[] = []

    // Memory recommendations
    if (perf.memoryUsage > (this.config.warningThresholds?.memoryUsage || 100)) {
      recommendations.push(
        `Consider reducing memory usage (current: ${perf.memoryUsage.toFixed(1)}MB)`
      )
    }

    // Queue recommendations
    if (perf.queueMetrics.currentSize > (this.config.warningThresholds?.queueSize || 50)) {
      recommendations.push('Consider increasing queue processing capacity or reducing queue size')
    }

    // Latency recommendations
    if (perf.latencyMetrics.average > (this.config.warningThresholds?.latency || 1000)) {
      recommendations.push(
        'High average latency detected - consider optimizing critical operations'
      )
    }

    // Error-specific recommendations
    if (errorsByType[StreamErrorType.TIMEOUT] > 0) {
      recommendations.push(
        'Timeout errors detected - consider increasing timeout values or optimizing slow operations'
      )
    }

    if (errorsByType[StreamErrorType.QUEUE] > 0) {
      recommendations.push(
        'Queue errors detected - consider increasing queue capacity or implementing backpressure'
      )
    }

    if (errorsByType[StreamErrorType.RESOURCE] > 0) {
      recommendations.push(
        'Resource errors detected - consider implementing resource pooling or cleanup'
      )
    }

    return recommendations
  }

  /**
   * Get current statistics
   */
  getStats(): {
    isActive: boolean
    duration: number
    operationCount: number
    activeOperations: number
    errorCount: number
    eventCount: number
    history: OperationMetrics[]
  } {
    return {
      isActive: this.isActive,
      duration: this.isActive ? Date.now() - this.startTime : 0,
      operationCount: this.operationCounter,
      activeOperations: this.activeOperations.size,
      errorCount: this.errorHistory.length,
      eventCount: this.operationHistory.length,
      history: this.operationHistory
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DiagnosticsConfig>): void {
    this.config = { ...this.config, ...config }
    this.debug('Diagnostics configuration updated: %O', config)
  }
}
