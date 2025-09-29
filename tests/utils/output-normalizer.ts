/**
 * Output Normalizer for Determinism Testing
 *
 * This utility normalizes LLM reporter output by removing time-dependent fields
 * to enable deterministic comparisons across multiple test runs.
 *
 * @module output-normalizer
 */

import type { LLMReporterOutput, ConsoleEvent, RetryAttempt } from '../../src/types/schema.js'

/**
 * Fields that are non-deterministic and should be normalized
 */
export const NON_DETERMINISTIC_FIELDS = {
  /** ISO 8601 timestamp in summary */
  SUMMARY_TIMESTAMP: 'summary.timestamp',
  /** Test run duration in milliseconds */
  SUMMARY_DURATION: 'summary.duration',
  /** Console event timestamps */
  CONSOLE_TIMESTAMP: 'consoleEvents[].timestamp',
  /** Console event timestampMs */
  CONSOLE_TIMESTAMP_MS: 'consoleEvents[].timestampMs',
  /** Retry attempt timestamps */
  RETRY_TIMESTAMP: 'retryInfo.attempts[].timestamp',
  /** Retry attempt durations */
  RETRY_DURATION: 'retryInfo.attempts[].duration',
  /** Test durations in passed/skipped tests */
  TEST_DURATION: 'duration',
  /** Deduplication first/last seen timestamps */
  DEDUP_FIRST_SEEN: 'deduplication.firstSeen',
  DEDUP_LAST_SEEN: 'deduplication.lastSeen'
} as const

/**
 * Normalized values for deterministic comparison
 */
const NORMALIZED_VALUES = {
  TIMESTAMP: '2024-01-01T00:00:00.000Z',
  DURATION: 0,
  TIMESTAMP_MS: 0
} as const

/**
 * Normalizes console events by removing timestamps
 */
function normalizeConsoleEvents(events?: ConsoleEvent[]): ConsoleEvent[] | undefined {
  if (!events) return undefined

  return events.map((event) => {
    const normalized: ConsoleEvent = {
      level: event.level,
      message: event.message
    }

    if (event.args) normalized.args = event.args
    if (event.origin) normalized.origin = event.origin
    if (event.testId) normalized.testId = event.testId

    // Remove timestamp and timestampMs
    // Keep deduplication info but normalize timestamps
    if (event.deduplication) {
      normalized.deduplication = {
        ...event.deduplication,
        firstSeen: NORMALIZED_VALUES.TIMESTAMP,
        lastSeen: NORMALIZED_VALUES.TIMESTAMP
      }
    }

    return normalized
  })
}

/**
 * Normalizes retry attempts by removing timestamps and durations
 */
function normalizeRetryAttempts(attempts?: RetryAttempt[]): RetryAttempt[] | undefined {
  if (!attempts) return undefined

  return attempts.map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    duration: NORMALIZED_VALUES.DURATION,
    error: attempt.error,
    timestamp: NORMALIZED_VALUES.TIMESTAMP
  }))
}

/**
 * Normalizes LLM reporter output by removing time-dependent fields
 *
 * This function creates a deep copy of the output and removes:
 * - summary.timestamp
 * - summary.duration
 * - test.duration (for passed/skipped tests)
 * - consoleEvents[].timestamp
 * - consoleEvents[].timestampMs
 * - retryInfo.attempts[].timestamp
 * - retryInfo.attempts[].duration
 * - deduplication.firstSeen
 * - deduplication.lastSeen
 *
 * All other fields are preserved to ensure structural comparisons remain meaningful.
 *
 * @param output - The LLM reporter output to normalize
 * @returns A normalized copy of the output suitable for deterministic comparison
 *
 * @example
 * ```typescript
 * const output1 = await runReporter(testData)
 * const output2 = await runReporter(testData)
 *
 * const normalized1 = normalizeOutput(output1)
 * const normalized2 = normalizeOutput(output2)
 *
 * expect(normalized1).toEqual(normalized2) // Should pass
 * ```
 */
export function normalizeOutput(output: LLMReporterOutput): LLMReporterOutput {
  // Deep clone to avoid mutating the original
  const normalized = structuredClone(output)

  // Normalize summary
  normalized.summary.timestamp = NORMALIZED_VALUES.TIMESTAMP
  normalized.summary.duration = NORMALIZED_VALUES.DURATION

  // Normalize failures
  if (normalized.failures) {
    normalized.failures = normalized.failures.map((failure) => ({
      ...failure,
      consoleEvents: normalizeConsoleEvents(failure.consoleEvents),
      retryInfo: failure.retryInfo
        ? {
            ...failure.retryInfo,
            attempts: normalizeRetryAttempts(failure.retryInfo.attempts)
          }
        : undefined
    }))
  }

  // Normalize passed tests
  if (normalized.passed) {
    normalized.passed = normalized.passed.map((test) => ({
      ...test,
      duration: NORMALIZED_VALUES.DURATION,
      retryInfo: test.retryInfo
        ? {
            ...test.retryInfo,
            attempts: normalizeRetryAttempts(test.retryInfo.attempts)
          }
        : undefined
    }))
  }

  // Normalize skipped tests
  if (normalized.skipped) {
    normalized.skipped = normalized.skipped.map((test) => ({
      ...test,
      duration: NORMALIZED_VALUES.DURATION,
      retryInfo: test.retryInfo
        ? {
            ...test.retryInfo,
            attempts: normalizeRetryAttempts(test.retryInfo.attempts)
          }
        : undefined
    }))
  }

  // Normalize success logs
  if (normalized.successLogs) {
    normalized.successLogs = normalized.successLogs.map((log) => ({
      ...log,
      duration: NORMALIZED_VALUES.DURATION,
      consoleEvents: normalizeConsoleEvents(log.consoleEvents)
    }))
  }

  return normalized
}

/**
 * Validates that two normalized outputs are structurally identical
 *
 * This is a convenience function that normalizes both outputs and performs
 * a deep equality check. It's useful for testing determinism.
 *
 * @param output1 - First output to compare
 * @param output2 - Second output to compare
 * @returns true if the normalized outputs are identical
 */
export function areOutputsDeterministic(
  output1: LLMReporterOutput,
  output2: LLMReporterOutput
): boolean {
  const normalized1 = normalizeOutput(output1)
  const normalized2 = normalizeOutput(output2)

  try {
    // Use JSON.stringify for deep comparison
    return JSON.stringify(normalized1) === JSON.stringify(normalized2)
  } catch {
    return false
  }
}

/**
 * Extracts all non-deterministic field values from output
 *
 * Useful for debugging and documentation purposes to see what varies between runs.
 *
 * @param output - The output to extract non-deterministic values from
 * @returns Object containing all non-deterministic values found
 */
export function extractNonDeterministicValues(output: LLMReporterOutput): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  // Summary fields
  values['summary.timestamp'] = output.summary.timestamp
  values['summary.duration'] = output.summary.duration

  // Collect test durations
  const durations: number[] = []
  if (output.passed) {
    durations.push(
      ...output.passed.map((t) => t.duration).filter((d): d is number => d !== undefined)
    )
  }
  if (output.skipped) {
    durations.push(
      ...output.skipped.map((t) => t.duration).filter((d): d is number => d !== undefined)
    )
  }
  if (durations.length > 0) {
    values['test.duration'] = durations
  }

  // Collect console timestamps
  const consoleTimestamps: number[] = []
  const processConsoleEvents = (events?: ConsoleEvent[]) => {
    if (!events) return
    events.forEach((event) => {
      if (event.timestamp !== undefined) consoleTimestamps.push(event.timestamp)
      if (event.timestampMs !== undefined) consoleTimestamps.push(event.timestampMs)
    })
  }

  if (output.failures) {
    output.failures.forEach((f) => processConsoleEvents(f.consoleEvents))
  }
  if (output.successLogs) {
    output.successLogs.forEach((l) => processConsoleEvents(l.consoleEvents))
  }

  if (consoleTimestamps.length > 0) {
    values['consoleEvents.timestamps'] = consoleTimestamps
  }

  // Collect retry timestamps and durations
  const retryTimestamps: string[] = []
  const retryDurations: number[] = []
  const processRetryInfo = (retryInfo?: { attempts?: RetryAttempt[] }) => {
    if (!retryInfo?.attempts) return
    retryInfo.attempts.forEach((attempt) => {
      retryTimestamps.push(attempt.timestamp)
      retryDurations.push(attempt.duration)
    })
  }

  if (output.failures) {
    output.failures.forEach((f) => processRetryInfo(f.retryInfo))
  }
  if (output.passed) {
    output.passed.forEach((t) => processRetryInfo(t.retryInfo))
  }
  if (output.skipped) {
    output.skipped.forEach((t) => processRetryInfo(t.retryInfo))
  }

  if (retryTimestamps.length > 0) {
    values['retryInfo.attempts.timestamp'] = retryTimestamps
  }
  if (retryDurations.length > 0) {
    values['retryInfo.attempts.duration'] = retryDurations
  }

  return values
}
