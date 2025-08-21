/**
 * Stream Recovery System
 *
 * Provides stream failure detection and recovery mechanisms for the streaming reporter.
 * Monitors stream health and automatically recovers from various failure scenarios.
 *
 * @module streaming/StreamRecovery
 */

import { EventEmitter } from 'events'
import { coreLogger, errorLogger, perfLogger } from '../utils/logger'
import {
  StreamErrorHandler,
  StreamErrorType,
  StreamErrorSeverity,
  RecoveryStrategy
} from './ErrorHandler'
import { OutputPriority, OutputSource } from './queue'

/**
 * Stream health status
 */
export enum StreamHealth {
  /** Stream is operating normally */
  HEALTHY = 'healthy',
  /** Stream is experiencing minor issues */
  DEGRADED = 'degraded',
  /** Stream is experiencing major issues */
  UNHEALTHY = 'unhealthy',
  /** Stream has failed completely */
  FAILED = 'failed',
  /** Stream is recovering from failure */
  RECOVERING = 'recovering'
}

/**
 * Recovery mode options
 */
export enum RecoveryMode {
  /** Automatic recovery without intervention */
  AUTOMATIC = 'automatic',
  /** Manual recovery required */
  MANUAL = 'manual',
  /** No recovery possible */
  NONE = 'none'
}

/**
 * Stream failure types
 */
export enum StreamFailureType {
  /** Connection/network failure */
  CONNECTION_LOSS = 'connection_loss',
  /** Queue overflow/backlog */
  QUEUE_OVERFLOW = 'queue_overflow',
  /** Deadlock detection */
  DEADLOCK = 'deadlock',
  /** Performance degradation */
  PERFORMANCE = 'performance',
  /** Resource exhaustion */
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  /** Configuration error */
  CONFIGURATION_ERROR = 'configuration_error',
  /** External system failure */
  EXTERNAL_FAILURE = 'external_failure'
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Interval between health checks (ms) */
  interval?: number
  /** Timeout for health check operations (ms) */
  timeout?: number
  /** Number of failed checks before marking unhealthy */
  failureThreshold?: number
  /** Number of successful checks needed to recover */
  recoveryThreshold?: number
  /** Enable performance monitoring */
  enablePerformanceMonitoring?: boolean
  /** Performance thresholds */
  performanceThresholds?: {
    /** Maximum acceptable latency (ms) */
    maxLatency?: number
    /** Maximum queue size */
    maxQueueSize?: number
    /** Maximum memory usage (MB) */
    maxMemoryUsage?: number
  }
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  /** Enable automatic recovery */
  enableAutoRecovery?: boolean
  /** Recovery timeout (ms) */
  recoveryTimeout?: number
  /** Maximum recovery attempts */
  maxRecoveryAttempts?: number
  /** Delay between recovery attempts (ms) */
  recoveryDelay?: number
  /** Enable circuit breaker pattern */
  enableCircuitBreaker?: boolean
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number
  /** Circuit breaker timeout (ms) */
  circuitBreakerTimeout?: number
}

/**
 * Stream monitoring data
 */
export interface StreamMonitoringData {
  /** Current health status */
  health: StreamHealth
  /** Last health check timestamp */
  lastHealthCheck: number
  /** Number of consecutive failures */
  consecutiveFailures: number
  /** Number of consecutive successes */
  consecutiveSuccesses: number
  /** Performance metrics */
  performance: {
    /** Average operation latency */
    averageLatency: number
    /** Current queue size */
    queueSize: number
    /** Memory usage (MB) */
    memoryUsage: number
    /** Operations per second */
    operationsPerSecond: number
  }
  /** Circuit breaker status */
  circuitBreaker: {
    /** Is circuit breaker open */
    isOpen: boolean
    /** Failure count */
    failureCount: number
    /** Last failure time */
    lastFailureTime?: number
  }
  /** Active recovery information */
  recovery?: {
    /** Current recovery mode */
    mode: RecoveryMode
    /** Recovery attempt number */
    attempt: number
    /** Recovery start time */
    startTime: number
    /** Recovery strategy being used */
    strategy: RecoveryStrategy
  }
}

/**
 * Stream recovery event types
 */
export enum StreamRecoveryEvent {
  HEALTH_CHECK_STARTED = 'health_check_started',
  HEALTH_CHECK_COMPLETED = 'health_check_completed',
  HEALTH_STATUS_CHANGED = 'health_status_changed',
  FAILURE_DETECTED = 'failure_detected',
  RECOVERY_STARTED = 'recovery_started',
  RECOVERY_COMPLETED = 'recovery_completed',
  RECOVERY_FAILED = 'recovery_failed',
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker_opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker_closed'
}

/**
 * Stream recovery system for monitoring and recovering from failures
 */
export class StreamRecovery extends EventEmitter {
  private errorHandler: StreamErrorHandler
  private healthConfig: Required<HealthCheckConfig>
  private recoveryConfig: Required<RecoveryConfig>
  private debug = coreLogger()
  private debugError = errorLogger()
  private debugPerf = perfLogger()

  private monitoringData: StreamMonitoringData
  private healthCheckTimer?: NodeJS.Timeout
  private isActive = false
  private performanceHistory: Array<{ timestamp: number; latency: number; queueSize: number }> = []
  private maxPerformanceHistory = 100

  constructor(
    errorHandler: StreamErrorHandler,
    healthConfig: HealthCheckConfig = {},
    recoveryConfig: RecoveryConfig = {}
  ) {
    super()

    this.errorHandler = errorHandler

    this.healthConfig = {
      interval: healthConfig.interval ?? 5000,
      timeout: healthConfig.timeout ?? 2000,
      failureThreshold: healthConfig.failureThreshold ?? 3,
      recoveryThreshold: healthConfig.recoveryThreshold ?? 2,
      enablePerformanceMonitoring: healthConfig.enablePerformanceMonitoring ?? true,
      performanceThresholds: {
        maxLatency: 1000,
        maxQueueSize: 100,
        maxMemoryUsage: 100,
        ...healthConfig.performanceThresholds
      }
    }

    this.recoveryConfig = {
      enableAutoRecovery: recoveryConfig.enableAutoRecovery ?? true,
      recoveryTimeout: recoveryConfig.recoveryTimeout ?? 30000,
      maxRecoveryAttempts: recoveryConfig.maxRecoveryAttempts ?? 3,
      recoveryDelay: recoveryConfig.recoveryDelay ?? 1000,
      enableCircuitBreaker: recoveryConfig.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: recoveryConfig.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: recoveryConfig.circuitBreakerTimeout ?? 60000
    }

    this.monitoringData = {
      health: StreamHealth.HEALTHY,
      lastHealthCheck: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      performance: {
        averageLatency: 0,
        queueSize: 0,
        memoryUsage: 0,
        operationsPerSecond: 0
      },
      circuitBreaker: {
        isOpen: false,
        failureCount: 0
      }
    }

    this.debug('Stream recovery system initialized')
  }

  /**
   * Start monitoring the stream health
   */
  start(): void {
    if (this.isActive) {
      this.debug('Stream recovery already active')
      return
    }

    this.isActive = true
    this.monitoringData.health = StreamHealth.HEALTHY
    this.monitoringData.lastHealthCheck = Date.now()

    // Start periodic health checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        this.debugError('Health check failed: %O', error)
      })
    }, this.healthConfig.interval)

    this.debug('Stream recovery monitoring started')
    this.emit(StreamRecoveryEvent.HEALTH_CHECK_STARTED)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isActive) {
      return
    }

    this.isActive = false

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }

    this.debug('Stream recovery monitoring stopped')
  }

  /**
   * Perform a health check
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.isActive) {
      return
    }

    const startTime = Date.now()
    this.emit(StreamRecoveryEvent.HEALTH_CHECK_STARTED)

    try {
      // Collect current metrics
      const metrics = await this.collectMetrics()

      // Update performance history
      this.updatePerformanceHistory(metrics)

      // Analyze health
      const newHealth = this.analyzeHealth(metrics)

      // Update monitoring data
      this.updateMonitoringData(metrics, newHealth)

      // Handle health status change
      if (newHealth !== this.monitoringData.health) {
        await this.handleHealthStatusChange(this.monitoringData.health, newHealth)
      }

      this.monitoringData.health = newHealth
      this.monitoringData.lastHealthCheck = Date.now()

      const duration = Date.now() - startTime
      this.debugPerf('Health check completed in %dms - Status: %s', duration, newHealth)

      this.emit(StreamRecoveryEvent.HEALTH_CHECK_COMPLETED, {
        health: newHealth,
        duration,
        metrics
      })
    } catch (error) {
      this.debugError('Health check error: %O', error)
      this.monitoringData.consecutiveFailures++

      // If we can't even perform health checks, something is seriously wrong
      if (this.monitoringData.consecutiveFailures >= this.healthConfig.failureThreshold) {
        await this.handleHealthStatusChange(this.monitoringData.health, StreamHealth.FAILED)
        this.monitoringData.health = StreamHealth.FAILED
      }
    }
  }

  /**
   * Collect current stream metrics
   */
  private async collectMetrics(): Promise<any> {
    // This would collect metrics from the streaming system
    // For now, we'll simulate some basic metrics
    const metrics = {
      timestamp: Date.now(),
      latency: Math.random() * 500, // Simulated latency
      queueSize: Math.floor(Math.random() * 50), // Simulated queue size
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // Actual memory usage in MB
      operationsPerSecond: this.calculateOperationsPerSecond(),
      errorRate: this.calculateErrorRate(),
      circuitBreakerStatus: this.monitoringData.circuitBreaker.isOpen
    }

    return metrics
  }

  /**
   * Calculate operations per second from recent history
   */
  private calculateOperationsPerSecond(): number {
    if (this.performanceHistory.length < 2) {
      return 0
    }

    const recent = this.performanceHistory.slice(-10) // Last 10 measurements
    if (recent.length < 2) {
      return 0
    }

    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp
    return timeSpan > 0 ? (recent.length / timeSpan) * 1000 : 0
  }

  /**
   * Calculate error rate from error handler statistics
   */
  private calculateErrorRate(): number {
    const stats = this.errorHandler.getStats()
    const recentErrors = stats.recentErrors?.length ?? 0
    return recentErrors / 10 // Error rate based on last 10 operations
  }

  /**
   * Update performance history
   */
  private updatePerformanceHistory(metrics: any): void {
    this.performanceHistory.push({
      timestamp: metrics.timestamp,
      latency: metrics.latency,
      queueSize: metrics.queueSize
    })

    // Keep history size manageable
    if (this.performanceHistory.length > this.maxPerformanceHistory) {
      this.performanceHistory.shift()
    }
  }

  /**
   * Analyze health based on collected metrics
   */
  private analyzeHealth(metrics: any): StreamHealth {
    const thresholds = this.healthConfig.performanceThresholds

    // Check circuit breaker
    if (this.monitoringData.circuitBreaker.isOpen) {
      return StreamHealth.FAILED
    }

    // Check critical thresholds
    if (
      metrics.latency > (thresholds.maxLatency || 1000) * 2 ||
      metrics.queueSize > (thresholds.maxQueueSize || 100) * 2 ||
      metrics.memoryUsage > (thresholds.maxMemoryUsage || 100) * 2
    ) {
      return StreamHealth.FAILED
    }

    // Check unhealthy thresholds
    if (
      metrics.latency > (thresholds.maxLatency || 1000) ||
      metrics.queueSize > (thresholds.maxQueueSize || 100) ||
      metrics.memoryUsage > (thresholds.maxMemoryUsage || 100) ||
      metrics.errorRate > 0.5
    ) {
      return StreamHealth.UNHEALTHY
    }

    // Check degraded thresholds
    if (
      metrics.latency > (thresholds.maxLatency || 1000) * 0.7 ||
      metrics.queueSize > (thresholds.maxQueueSize || 100) * 0.7 ||
      metrics.errorRate > 0.2
    ) {
      return StreamHealth.DEGRADED
    }

    return StreamHealth.HEALTHY
  }

  /**
   * Update monitoring data with new metrics
   */
  private updateMonitoringData(metrics: any, newHealth: StreamHealth): void {
    this.monitoringData.performance = {
      averageLatency: this.calculateAverageLatency(),
      queueSize: metrics.queueSize,
      memoryUsage: metrics.memoryUsage,
      operationsPerSecond: metrics.operationsPerSecond
    }

    // Update failure/success counters
    if (newHealth === StreamHealth.HEALTHY) {
      this.monitoringData.consecutiveSuccesses++
      this.monitoringData.consecutiveFailures = 0
    } else if (newHealth === StreamHealth.FAILED || newHealth === StreamHealth.UNHEALTHY) {
      this.monitoringData.consecutiveFailures++
      this.monitoringData.consecutiveSuccesses = 0

      // Update circuit breaker
      this.updateCircuitBreaker(true)
    }
  }

  /**
   * Calculate average latency from performance history
   */
  private calculateAverageLatency(): number {
    if (this.performanceHistory.length === 0) {
      return 0
    }

    const sum = this.performanceHistory.reduce((acc, entry) => acc + entry.latency, 0)
    return sum / this.performanceHistory.length
  }

  /**
   * Update circuit breaker status
   */
  private updateCircuitBreaker(failure: boolean): void {
    if (!this.recoveryConfig.enableCircuitBreaker) {
      return
    }

    if (failure) {
      this.monitoringData.circuitBreaker.failureCount++
      this.monitoringData.circuitBreaker.lastFailureTime = Date.now()

      if (
        this.monitoringData.circuitBreaker.failureCount >=
        this.recoveryConfig.circuitBreakerThreshold
      ) {
        if (!this.monitoringData.circuitBreaker.isOpen) {
          this.monitoringData.circuitBreaker.isOpen = true
          this.debug(
            'Circuit breaker opened due to %d failures',
            this.monitoringData.circuitBreaker.failureCount
          )
          this.emit(StreamRecoveryEvent.CIRCUIT_BREAKER_OPENED)
        }
      }
    } else {
      // Reset failure count on success
      this.monitoringData.circuitBreaker.failureCount = 0

      // Close circuit breaker if it was open and timeout has passed
      if (this.monitoringData.circuitBreaker.isOpen) {
        const lastFailureTime = this.monitoringData.circuitBreaker.lastFailureTime
        if (lastFailureTime) {
          const timeSinceLastFailure = Date.now() - lastFailureTime
          if (timeSinceLastFailure > this.recoveryConfig.circuitBreakerTimeout) {
            this.monitoringData.circuitBreaker.isOpen = false
            this.debug('Circuit breaker closed after timeout')
            this.emit(StreamRecoveryEvent.CIRCUIT_BREAKER_CLOSED)
          }
        }
      }
    }
  }

  /**
   * Handle health status changes
   */
  private async handleHealthStatusChange(
    oldHealth: StreamHealth,
    newHealth: StreamHealth
  ): Promise<void> {
    this.debug('Health status change: %s → %s', oldHealth, newHealth)

    this.emit(StreamRecoveryEvent.HEALTH_STATUS_CHANGED, {
      oldHealth,
      newHealth,
      timestamp: Date.now()
    })

    // Trigger recovery if needed
    if (newHealth === StreamHealth.FAILED || newHealth === StreamHealth.UNHEALTHY) {
      if (this.recoveryConfig.enableAutoRecovery) {
        await this.triggerRecovery(this.determineFailureType(newHealth))
      }
    }
  }

  /**
   * Determine the type of failure based on metrics and health
   */
  private determineFailureType(health: StreamHealth): StreamFailureType {
    const metrics = this.monitoringData.performance

    if (this.monitoringData.circuitBreaker.isOpen) {
      return StreamFailureType.EXTERNAL_FAILURE
    }

    if (metrics.queueSize > (this.healthConfig.performanceThresholds?.maxQueueSize || 100)) {
      return StreamFailureType.QUEUE_OVERFLOW
    }

    if (metrics.averageLatency > (this.healthConfig.performanceThresholds?.maxLatency || 1000)) {
      return StreamFailureType.PERFORMANCE
    }

    if (metrics.memoryUsage > (this.healthConfig.performanceThresholds?.maxMemoryUsage || 100)) {
      return StreamFailureType.RESOURCE_EXHAUSTION
    }

    return StreamFailureType.EXTERNAL_FAILURE
  }

  /**
   * Trigger recovery process
   */
  private async triggerRecovery(failureType: StreamFailureType): Promise<void> {
    if (this.monitoringData.recovery) {
      this.debug('Recovery already in progress, skipping')
      return
    }

    const recoveryStrategy = this.determineRecoveryStrategy(failureType)

    this.monitoringData.recovery = {
      mode: RecoveryMode.AUTOMATIC,
      attempt: 1,
      startTime: Date.now(),
      strategy: recoveryStrategy
    }

    this.debug(
      'Starting recovery for failure type: %s with strategy: %s',
      failureType,
      recoveryStrategy
    )

    this.emit(StreamRecoveryEvent.RECOVERY_STARTED, {
      failureType,
      strategy: recoveryStrategy,
      attempt: 1
    })

    try {
      const result = await this.executeRecovery(failureType, recoveryStrategy)

      if (result.success) {
        this.debug('Recovery completed successfully')
        this.monitoringData.recovery = undefined
        this.monitoringData.health = StreamHealth.RECOVERING
        this.emit(StreamRecoveryEvent.RECOVERY_COMPLETED, result)
      } else {
        await this.handleRecoveryFailure(failureType, result.error)
      }
    } catch (error) {
      await this.handleRecoveryFailure(
        failureType,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Determine recovery strategy based on failure type
   */
  private determineRecoveryStrategy(failureType: StreamFailureType): RecoveryStrategy {
    switch (failureType) {
      case StreamFailureType.CONNECTION_LOSS:
        return RecoveryStrategy.RETRY
      case StreamFailureType.QUEUE_OVERFLOW:
        return RecoveryStrategy.DEGRADE
      case StreamFailureType.DEADLOCK:
        return RecoveryStrategy.RETRY
      case StreamFailureType.PERFORMANCE:
        return RecoveryStrategy.DEGRADE
      case StreamFailureType.RESOURCE_EXHAUSTION:
        return RecoveryStrategy.FALLBACK_FILE
      case StreamFailureType.CONFIGURATION_ERROR:
        return RecoveryStrategy.ABORT
      case StreamFailureType.EXTERNAL_FAILURE:
        return RecoveryStrategy.FALLBACK_CONSOLE
      default:
        return RecoveryStrategy.RETRY
    }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecovery(
    failureType: StreamFailureType,
    strategy: RecoveryStrategy
  ): Promise<any> {
    // Use the error handler to execute the recovery
    const mockError = new Error(`Stream failure: ${failureType}`)
    const operationContext = {
      operation: 'stream_recovery',
      priority: OutputPriority.CRITICAL,
      source: OutputSource.SYSTEM,
      metadata: { failureType, strategy }
    }

    return await this.errorHandler.handleError(mockError, operationContext)
  }

  /**
   * Handle recovery failure
   */
  private async handleRecoveryFailure(failureType: StreamFailureType, error: Error): Promise<void> {
    const recovery = this.monitoringData.recovery
    if (!recovery) {
      return
    }

    this.debugError('Recovery attempt %d failed: %O', recovery.attempt, error)

    if (recovery.attempt < this.recoveryConfig.maxRecoveryAttempts) {
      // Try again with delay
      recovery.attempt++

      this.debug(
        'Retrying recovery (attempt %d/%d) after delay',
        recovery.attempt,
        this.recoveryConfig.maxRecoveryAttempts
      )

      setTimeout(() => {
        this.triggerRecovery(failureType).catch((retryError) => {
          this.debugError('Recovery retry failed: %O', retryError)
        })
      }, this.recoveryConfig.recoveryDelay * recovery.attempt)
    } else {
      // Recovery failed completely
      this.debugError('Recovery failed after %d attempts', recovery.attempt)

      this.monitoringData.recovery = undefined
      this.monitoringData.health = StreamHealth.FAILED

      this.emit(StreamRecoveryEvent.RECOVERY_FAILED, {
        failureType,
        attempts: recovery.attempt,
        duration: Date.now() - recovery.startTime,
        lastError: error
      })
    }
  }

  /**
   * Get current monitoring data
   */
  getMonitoringData(): StreamMonitoringData {
    return { ...this.monitoringData }
  }

  /**
   * Get stream health status
   */
  getHealth(): StreamHealth {
    return this.monitoringData.health
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    return this.monitoringData.circuitBreaker.isOpen
  }

  /**
   * Manually trigger recovery
   */
  async manualRecovery(failureType: StreamFailureType): Promise<void> {
    this.debug('Manual recovery triggered for failure type: %s', failureType)
    await this.triggerRecovery(failureType)
  }

  /**
   * Force reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.monitoringData.circuitBreaker.isOpen = false
    this.monitoringData.circuitBreaker.failureCount = 0
    this.debug('Circuit breaker manually reset')
    this.emit(StreamRecoveryEvent.CIRCUIT_BREAKER_CLOSED)
  }

  /**
   * Update configuration
   */
  updateConfig(
    healthConfig?: Partial<HealthCheckConfig>,
    recoveryConfig?: Partial<RecoveryConfig>
  ): void {
    if (healthConfig) {
      this.healthConfig = { ...this.healthConfig, ...healthConfig }
    }
    if (recoveryConfig) {
      this.recoveryConfig = { ...this.recoveryConfig, ...recoveryConfig }
    }
    this.debug('Stream recovery configuration updated')
  }
}
