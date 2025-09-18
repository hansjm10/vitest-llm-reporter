/**
 * Late Truncator - Global truncation applied to final output
 *
 * This module implements the primary global token budget enforcement
 * on the complete LLMReporterOutput. It uses a phase-based approach
 * to progressively reduce content while preserving essential information.
 */

import type {
  LLMReporterOutput,
  TestFailure,
  ConsoleEvent,
  TestError,
  AssertionValue
} from '../types/schema.js'
import type { TruncationConfig } from '../types/reporter.js'
import type { LateTruncationMetrics } from './types.js'
import { estimateTokens } from '../tokenization/estimator.js'
import {
  truncateStackTrace,
  truncateCodeContext,
  truncateAssertionValue,
  safeTrimToChars
} from './utils.js'

/**
 * Console event limits for different phases
 */
interface ConsoleEventLimits {
  maxDebug: number
  maxInfo: number
  maxWarn: number
  maxLog: number
  maxError: number
  maxTotal: number
}

/**
 * Late truncator for global output enforcement
 */
export class LateTruncator {
  private metrics: LateTruncationMetrics[] = []

  constructor() {}

  /**
   * Apply late truncation to the complete output
   */
  apply(output: LLMReporterOutput, config: TruncationConfig): LLMReporterOutput {
    // Check if truncation is enabled
    if (!config.enabled || !config.enableLateTruncation) {
      return output
    }

    // Calculate budget and check if truncation is needed
    const budget = this.calculateBudget(config)
    const originalTokens = this.estimateOutputTokens(output)

    if (originalTokens <= budget) {
      return output // No truncation needed
    }

    // Apply phased truncation (metrics are recorded inside applyPhasedTruncation)
    const truncated = this.applyPhasedTruncation(output, budget)

    return truncated
  }

  /**
   * Check if output needs truncation
   */
  needsTruncation(output: LLMReporterOutput, config: TruncationConfig): boolean {
    if (!config.enabled || !config.enableLateTruncation) {
      return false
    }

    const budget = this.calculateBudget(config)
    const currentTokens = this.estimateOutputTokens(output)

    return currentTokens > budget
  }

  /**
   * Calculate the token budget
   */
  private calculateBudget(config: TruncationConfig): number {
    const DEFAULT_MAX_TOKENS = 100_000
    return config.maxTokens ?? DEFAULT_MAX_TOKENS
  }

  /**
   * Estimate tokens for the entire output
   */
  private estimateOutputTokens(output: LLMReporterOutput): number {
    const json = JSON.stringify(output, null, 2)
    return estimateTokens(json)
  }

  /**
   * Apply phased truncation to progressively reduce content
   */
  private applyPhasedTruncation(output: LLMReporterOutput, budget: number): LLMReporterOutput {
    let current = { ...output }
    const phasesApplied: string[] = []

    // Phase 1: Remove low-value sections
    if (this.estimateOutputTokens(current) > budget) {
      current = this.phase1RemoveLowValueSections(current)
      phasesApplied.push('remove-low-value')

      if (this.estimateOutputTokens(current) <= budget) {
        this.recordMetrics(
          this.estimateOutputTokens(output),
          this.estimateOutputTokens(current),
          phasesApplied
        )
        return current
      }
    }

    // Phase 2: Failure-focused trimming
    if (this.estimateOutputTokens(current) > budget) {
      current = this.phase2TrimFailures(current)
      phasesApplied.push('trim-failures')

      if (this.estimateOutputTokens(current) <= budget) {
        this.recordMetrics(
          this.estimateOutputTokens(output),
          this.estimateOutputTokens(current),
          phasesApplied
        )
        return current
      }
    }

    // Phase 3: Progressive tightening
    if (this.estimateOutputTokens(current) > budget) {
      current = this.phase3ProgressiveTightening(current, budget)
      phasesApplied.push('progressive-tightening')
    }

    this.recordMetrics(
      this.estimateOutputTokens(output),
      this.estimateOutputTokens(current),
      phasesApplied
    )
    return current
  }

  /**
   * Phase 1: Remove low-value top-level sections
   */
  private phase1RemoveLowValueSections(output: LLMReporterOutput): LLMReporterOutput {
    const result = { ...output }

    // Remove passed tests first
    if (result.passed && result.passed.length > 0) {
      delete result.passed
    }

    // Then remove skipped tests
    if (result.skipped && result.skipped.length > 0) {
      delete result.skipped
    }

    return result
  }

  /**
   * Phase 2: Failure-focused trimming
   */
  private phase2TrimFailures(output: LLMReporterOutput): LLMReporterOutput {
    const result = { ...output }

    if (!result.failures || result.failures.length === 0) {
      return result
    }

    // Define console event limits for this phase
    const consoleLimits: ConsoleEventLimits = {
      maxDebug: 0, // Remove debug entirely
      maxInfo: 10, // Limit info events
      maxWarn: 10, // Limit warn events
      maxLog: 20, // Limit log events
      maxError: 40, // Preserve more error events
      maxTotal: 80 // Total event limit
    }

    // Apply truncation to each failure
    result.failures = result.failures.map((failure) => this.truncateFailure(failure, consoleLimits))

    return result
  }

  /**
   * Phase 3: Progressive tightening
   */
  private phase3ProgressiveTightening(
    output: LLMReporterOutput,
    budget: number
  ): LLMReporterOutput {
    let result = { ...output }
    let iteration = 0
    const maxIterations = 5

    while (this.estimateOutputTokens(result) > budget && iteration < maxIterations) {
      iteration++

      if (!result.failures || result.failures.length === 0) {
        break
      }

      // Progressively tighter limits each iteration
      const tightnessRatio = 1 - iteration * 0.2 // 80%, 60%, 40%, 20%, 0%

      const consoleLimits: ConsoleEventLimits = {
        maxDebug: 0,
        maxInfo: Math.floor(5 * tightnessRatio),
        maxWarn: Math.floor(5 * tightnessRatio),
        maxLog: Math.floor(10 * tightnessRatio),
        maxError: Math.floor(20 * tightnessRatio), // Keep errors longer
        maxTotal: Math.floor(40 * tightnessRatio)
      }

      // Apply increasingly aggressive truncation
      result.failures = result.failures.map((failure) => {
        let truncated = this.truncateFailure(failure, consoleLimits)

        // Additional aggressive measures in later iterations
        if (iteration >= 2) {
          // Reduce stack frames further
          if (truncated.error.stack) {
            truncated.error.stack = truncateStackTrace(
              truncated.error.stack,
              Math.max(3, 10 - iteration * 2)
            )
          }

          // Shrink error message
          if (truncated.error.message && truncated.error.message.length > 512) {
            truncated.error.message =
              safeTrimToChars(truncated.error.message, 512 - iteration * 100) + '...'
          }

          // Collapse code context
          if (truncated.error.context?.code && truncated.error.context.code.length > 1) {
            truncated.error.context.code = ['[code context truncated]']
          }
        }

        return truncated
      })

      // If still over budget and many failures, consider dropping some
      if (iteration >= 4 && result.failures.length > 5) {
        // Keep most important failures (first 5)
        result.failures = result.failures.slice(0, 5)
      }
    }

    return result
  }

  /**
   * Truncate a single failure
   */
  private truncateFailure(failure: TestFailure, consoleLimits: ConsoleEventLimits): TestFailure {
    const result: TestFailure = { ...failure }

    // Truncate console events
    if (result.consoleEvents) {
      result.consoleEvents = this.truncateConsoleEvents(result.consoleEvents, consoleLimits)
    }

    // Truncate error details
    if (result.error) {
      result.error = this.truncateErrorDetails(result.error)
    }

    return result
  }

  /**
   * Truncate console events for a failure
   */
  private truncateConsoleEvents(
    events: ConsoleEvent[],
    limits: ConsoleEventLimits
  ): ConsoleEvent[] {
    const result: ConsoleEvent[] = []
    const counts = {
      debug: 0,
      trace: 0,
      info: 0,
      warn: 0,
      log: 0,
      error: 0
    }

    for (const event of events) {
      // Skip debug/trace entirely if limit is 0
      if ((event.level === 'debug' || event.level === 'trace') && limits.maxDebug === 0) {
        continue
      }

      // Check level-specific limits
      const levelKey = event.level === 'trace' ? 'debug' : event.level
      if (levelKey === 'debug' && counts.debug >= limits.maxDebug) continue
      if (levelKey === 'info' && counts.info >= limits.maxInfo) continue
      if (levelKey === 'warn' && counts.warn >= limits.maxWarn) continue
      if (levelKey === 'log' && counts.log >= limits.maxLog) continue
      if (levelKey === 'error' && counts.error >= limits.maxError) continue

      // Check total limit
      if (result.length >= limits.maxTotal) {
        // Add truncation event if we're cutting off
        if (result.length === limits.maxTotal) {
          result.push({
            level: 'warn',
            message: '[Console output truncated - limit reached]'
          })
        }
        break
      }

      result.push(event)
      counts[levelKey]++
    }

    return result
  }

  /**
   * Truncate error details
   */
  private truncateErrorDetails(error: TestError): TestError {
    const result: TestError = { ...error }

    // Truncate stack trace (keep important frames)
    if (result.stack) {
      result.stack = truncateStackTrace(result.stack, 10, true)
    }

    // Truncate code context
    if (result.context) {
      if (result.context.code) {
        result.context.code = truncateCodeContext(result.context.code, result.context.lineNumber, 2)
      }
    }

    // Similar for assertion details
    if (result.assertion) {
      if (result.assertion.expected !== undefined) {
        result.assertion.expected = truncateAssertionValue(
          result.assertion.expected,
          200
        ) as AssertionValue
      }

      if (result.assertion.actual !== undefined) {
        result.assertion.actual = truncateAssertionValue(
          result.assertion.actual,
          200
        ) as AssertionValue
      }

      // Type metadata should already be set by ErrorExtractor
      // but if we need to update it after truncation for complex values:
      if (result.assertion.expectedType === undefined && result.assertion.expected !== undefined) {
        result.assertion.expectedType = this.getValueType(result.assertion.expected)
      }
      if (result.assertion.actualType === undefined && result.assertion.actual !== undefined) {
        result.assertion.actualType = this.getValueType(result.assertion.actual)
      }
    }

    return result
  }

  /**
   * Determines the type of a value for metadata
   */
  private getValueType(
    value: unknown
  ): 'string' | 'number' | 'boolean' | 'null' | 'Record<string, unknown>' | 'array' {
    if (value === null) return 'null'
    if (typeof value === 'string') return 'string'
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (Array.isArray(value)) return 'array'
    if (typeof value === 'object') return 'Record<string, unknown>'
    return 'string'
  }

  /**
   * Record truncation metrics
   */
  private recordMetrics(
    originalTokens: number,
    truncatedTokens: number,
    phasesApplied: string[]
  ): void {
    const metrics: LateTruncationMetrics = {
      originalTokens,
      truncatedTokens,
      tokensRemoved: originalTokens - truncatedTokens,
      phasesApplied,
      timestamp: Date.now()
    }

    this.metrics.push(metrics)

    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100)
    }
  }

  /**
   * Get truncation metrics
   */
  getMetrics(): LateTruncationMetrics[] {
    return [...this.metrics]
  }

  /**
   * Update configuration (model)
   */
  updateConfig(_config: TruncationConfig): void {
    // No-op for now; kept for future extension
  }
}
