/**
 * Output Determinism Tests
 *
 * Verifies that the LLM reporter produces deterministic output when given
 * the same input data across multiple runs. This is critical for:
 * - Reproducible test results
 * - Reliable CI/CD pipelines
 * - Consistent LLM parsing behavior
 * - Debugging and troubleshooting
 *
 * The tests normalize time-dependent fields (timestamps, durations) before
 * comparison to focus on structural and content determinism.
 */

import { describe, it, expect } from 'vitest'
import { LLMReporter } from '../../src/reporter/reporter.js'
import type { BuildOptions } from '../../src/output/types.js'
import type {
  TestFailure,
  TestResult,
  ConsoleEvent,
  TestSuccessLog,
  RetryAttempt
} from '../../src/types/schema.js'
import {
  normalizeOutput,
  areOutputsDeterministic,
  NON_DETERMINISTIC_FIELDS
} from '../utils/output-normalizer.js'

/**
 * Helper to build output from a reporter
 */
function buildOutput(reporter: LLMReporter, opts: BuildOptions) {
  const builder = (reporter as any).outputBuilder as { build: (opts: BuildOptions) => any }
  return builder.build(opts)
}

describe('Output Determinism', () => {
  describe('normalizeOutput utility', () => {
    it('should remove all time-dependent fields from summary', () => {
      const reporter = new LLMReporter({})
      const opts: BuildOptions = {
        testResults: { passed: [], failed: [], skipped: [], successLogs: [] },
        duration: 1234,
        startTime: Date.now()
      }

      const output1 = buildOutput(reporter, opts)
      const output2 = buildOutput(reporter, {
        ...opts,
        duration: 5678,
        startTime: Date.now() + 1000
      })

      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)

      // Timestamps should be normalized
      expect(normalized1.summary.timestamp).toBe('2024-01-01T00:00:00.000Z')
      expect(normalized2.summary.timestamp).toBe('2024-01-01T00:00:00.000Z')

      // Durations should be normalized
      expect(normalized1.summary.duration).toBe(0)
      expect(normalized2.summary.duration).toBe(0)

      // Original outputs should have different values
      expect(output1.summary.duration).not.toBe(output2.summary.duration)
    })

    it('should remove console event timestamps', () => {
      const reporter = new LLMReporter({})

      const consoleEvent1: ConsoleEvent = {
        level: 'log',
        message: 'test message',
        timestamp: 100,
        timestampMs: 100
      }

      const consoleEvent2: ConsoleEvent = {
        level: 'log',
        message: 'test message',
        timestamp: 200,
        timestampMs: 200
      }

      const failure1: TestFailure = {
        test: 'failing test',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        error: { message: 'error', type: 'Error' },
        consoleEvents: [consoleEvent1]
      }

      const failure2: TestFailure = {
        test: 'failing test',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        error: { message: 'error', type: 'Error' },
        consoleEvents: [consoleEvent2]
      }

      const opts1: BuildOptions = {
        testResults: { passed: [], failed: [failure1], skipped: [], successLogs: [] },
        duration: 1000
      }

      const opts2: BuildOptions = {
        testResults: { passed: [], failed: [failure2], skipped: [], successLogs: [] },
        duration: 1000
      }

      const output1 = buildOutput(reporter, opts1)
      const output2 = buildOutput(reporter, opts2)

      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)

      // Console events should have no timestamp fields after normalization
      expect(normalized1.failures?.[0].consoleEvents?.[0].timestamp).toBeUndefined()
      expect(normalized1.failures?.[0].consoleEvents?.[0].timestampMs).toBeUndefined()
      expect(normalized2.failures?.[0].consoleEvents?.[0].timestamp).toBeUndefined()
      expect(normalized2.failures?.[0].consoleEvents?.[0].timestampMs).toBeUndefined()

      // Normalized outputs should be identical
      expect(normalized1).toEqual(normalized2)
    })

    it('should remove test durations from passed tests', () => {
      const reporter = new LLMReporter({ verbose: true })

      const passed1: TestResult = {
        test: 'test 1',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        status: 'passed',
        duration: 123
      }

      const passed2: TestResult = {
        test: 'test 1',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        status: 'passed',
        duration: 456
      }

      const opts1: BuildOptions = {
        testResults: { passed: [passed1], failed: [], skipped: [], successLogs: [] },
        duration: 1000
      }

      const opts2: BuildOptions = {
        testResults: { passed: [passed2], failed: [], skipped: [], successLogs: [] },
        duration: 1000
      }

      const output1 = buildOutput(reporter, opts1)
      const output2 = buildOutput(reporter, opts2)

      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)

      // Durations should be normalized to 0
      expect(normalized1.passed?.[0].duration).toBe(0)
      expect(normalized2.passed?.[0].duration).toBe(0)

      // Normalized outputs should be identical
      expect(normalized1).toEqual(normalized2)
    })

    it('should normalize retry attempt timestamps and durations', () => {
      const reporter = new LLMReporter({})

      const attempt1: RetryAttempt = {
        attemptNumber: 1,
        status: 'failed',
        duration: 100,
        timestamp: '2024-01-01T10:00:00.000Z',
        error: { message: 'failed', type: 'Error' }
      }

      const attempt2: RetryAttempt = {
        attemptNumber: 1,
        status: 'failed',
        duration: 200,
        timestamp: '2024-01-01T11:00:00.000Z',
        error: { message: 'failed', type: 'Error' }
      }

      const failure1: TestFailure = {
        test: 'flaky test',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        error: { message: 'error', type: 'Error' },
        retryInfo: {
          attempts: [attempt1],
          flakiness: {
            isFlaky: true,
            totalAttempts: 2,
            failedAttempts: 1,
            successAttempt: 2
          }
        }
      }

      const failure2: TestFailure = {
        test: 'flaky test',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        error: { message: 'error', type: 'Error' },
        retryInfo: {
          attempts: [attempt2],
          flakiness: {
            isFlaky: true,
            totalAttempts: 2,
            failedAttempts: 1,
            successAttempt: 2
          }
        }
      }

      const opts1: BuildOptions = {
        testResults: { passed: [], failed: [failure1], skipped: [], successLogs: [] },
        duration: 1000
      }

      const opts2: BuildOptions = {
        testResults: { passed: [], failed: [failure2], skipped: [], successLogs: [] },
        duration: 1000
      }

      const output1 = buildOutput(reporter, opts1)
      const output2 = buildOutput(reporter, opts2)

      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)

      // Retry timestamps and durations should be normalized
      const normalizedAttempt1 = normalized1.failures?.[0].retryInfo?.attempts[0]
      const normalizedAttempt2 = normalized2.failures?.[0].retryInfo?.attempts[0]

      expect(normalizedAttempt1?.timestamp).toBe('2024-01-01T00:00:00.000Z')
      expect(normalizedAttempt1?.duration).toBe(0)
      expect(normalizedAttempt2?.timestamp).toBe('2024-01-01T00:00:00.000Z')
      expect(normalizedAttempt2?.duration).toBe(0)

      // Normalized outputs should be identical
      expect(normalized1).toEqual(normalized2)
    })

    it('should preserve deduplication info while normalizing timestamps', () => {
      const reporter = new LLMReporter({})

      const consoleEvent: ConsoleEvent = {
        level: 'log',
        message: 'test message',
        deduplication: {
          count: 5,
          deduplicated: true,
          firstSeen: '2024-01-01T10:00:00.000Z',
          lastSeen: '2024-01-01T10:05:00.000Z',
          sources: ['test1', 'test2']
        }
      }

      const successLog: TestSuccessLog = {
        test: 'test with dedup',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 5,
        status: 'passed',
        consoleEvents: [consoleEvent]
      }

      const opts: BuildOptions = {
        testResults: { passed: [], failed: [], skipped: [], successLogs: [successLog] },
        duration: 1000
      }

      const output = buildOutput(reporter, opts)
      const normalized = normalizeOutput(output)

      const normalizedEvent = normalized.successLogs?.[0].consoleEvents?.[0]

      // Deduplication data should be preserved
      expect(normalizedEvent?.deduplication?.count).toBe(5)
      expect(normalizedEvent?.deduplication?.deduplicated).toBe(true)
      expect(normalizedEvent?.deduplication?.sources).toEqual(['test1', 'test2'])

      // But timestamps should be normalized
      expect(normalizedEvent?.deduplication?.firstSeen).toBe('2024-01-01T00:00:00.000Z')
      expect(normalizedEvent?.deduplication?.lastSeen).toBe('2024-01-01T00:00:00.000Z')
    })
  })

  describe('multiple runs with identical input', () => {
    it('should produce identical normalized output across multiple runs', () => {
      const testData: BuildOptions = {
        testResults: {
          passed: [
            {
              test: 'passing test',
              fileRelative: 'test.ts',
              startLine: 1,
              endLine: 5,
              status: 'passed',
              duration: Math.random() * 1000 // Random duration
            }
          ],
          failed: [
            {
              test: 'failing test',
              fileRelative: 'test.ts',
              startLine: 10,
              endLine: 15,
              error: {
                message: 'Expected 1 to equal 2',
                type: 'AssertionError'
              }
            }
          ],
          skipped: [
            {
              test: 'skipped test',
              fileRelative: 'test.ts',
              startLine: 20,
              endLine: 25,
              status: 'skipped'
            }
          ],
          successLogs: []
        },
        duration: Math.random() * 5000, // Random duration
        startTime: Date.now()
      }

      const reporter1 = new LLMReporter({ verbose: true })
      const reporter2 = new LLMReporter({ verbose: true })
      const reporter3 = new LLMReporter({ verbose: true })

      const output1 = buildOutput(reporter1, testData)
      const output2 = buildOutput(reporter2, testData)
      const output3 = buildOutput(reporter3, testData)

      // Raw outputs should differ in timestamps/durations
      expect(output1.summary.timestamp).toBeDefined()
      expect(output2.summary.timestamp).toBeDefined()
      expect(output3.summary.timestamp).toBeDefined()

      // Normalized outputs should be identical
      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)
      const normalized3 = normalizeOutput(output3)

      expect(normalized1).toEqual(normalized2)
      expect(normalized2).toEqual(normalized3)
      expect(areOutputsDeterministic(output1, output2)).toBe(true)
      expect(areOutputsDeterministic(output2, output3)).toBe(true)
    })

    it('should produce deterministic output for complex test scenarios', () => {
      const complexTestData: BuildOptions = {
        testResults: {
          passed: [],
          failed: [
            {
              test: 'test with console output',
              fileRelative: 'complex.test.ts',
              startLine: 1,
              endLine: 10,
              error: {
                message: 'Assertion failed',
                type: 'AssertionError',
                stack: 'Error: Assertion failed\n  at complex.test.ts:5:10'
              },
              consoleEvents: [
                {
                  level: 'log',
                  message: 'Debug message',
                  timestamp: Date.now(),
                  timestampMs: Date.now()
                },
                {
                  level: 'error',
                  message: 'Error message',
                  timestamp: Date.now() + 100,
                  timestampMs: Date.now() + 100
                }
              ]
            },
            {
              test: 'test with retry info',
              fileRelative: 'complex.test.ts',
              startLine: 15,
              endLine: 20,
              error: {
                message: 'Flaky test failed',
                type: 'Error'
              },
              retryInfo: {
                attempts: [
                  {
                    attemptNumber: 1,
                    status: 'failed',
                    duration: Math.random() * 100,
                    timestamp: new Date().toISOString(),
                    error: { message: 'First attempt failed', type: 'Error' }
                  },
                  {
                    attemptNumber: 2,
                    status: 'failed',
                    duration: Math.random() * 100,
                    timestamp: new Date().toISOString(),
                    error: { message: 'Second attempt failed', type: 'Error' }
                  }
                ],
                flakiness: {
                  isFlaky: true,
                  totalAttempts: 2,
                  failedAttempts: 2
                }
              }
            }
          ],
          skipped: [],
          successLogs: [
            {
              test: 'successful test with logs',
              fileRelative: 'complex.test.ts',
              startLine: 25,
              endLine: 30,
              status: 'passed',
              duration: Math.random() * 50,
              consoleEvents: [
                {
                  level: 'info',
                  message: 'Info message',
                  timestamp: Date.now(),
                  timestampMs: Date.now(),
                  deduplication: {
                    count: 3,
                    deduplicated: true,
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    sources: ['test1', 'test2', 'test3']
                  }
                }
              ]
            }
          ]
        },
        duration: Math.random() * 10000,
        startTime: Date.now()
      }

      // Run multiple times
      const outputs = Array.from({ length: 5 }, () => {
        const reporter = new LLMReporter({ verbose: true })
        return buildOutput(reporter, complexTestData)
      })

      // Normalize all outputs
      const normalizedOutputs = outputs.map(normalizeOutput)

      // All normalized outputs should be identical
      for (let i = 1; i < normalizedOutputs.length; i++) {
        expect(normalizedOutputs[i]).toEqual(normalizedOutputs[0])
        expect(areOutputsDeterministic(outputs[i], outputs[0])).toBe(true)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle empty test results deterministically', () => {
      const emptyData: BuildOptions = {
        testResults: { passed: [], failed: [], skipped: [], successLogs: [] },
        duration: 0
      }

      const reporter1 = new LLMReporter({})
      const reporter2 = new LLMReporter({})

      const output1 = buildOutput(reporter1, emptyData)
      const output2 = buildOutput(reporter2, emptyData)

      expect(areOutputsDeterministic(output1, output2)).toBe(true)
    })

    it('should handle tests without optional fields deterministically', () => {
      const minimalData: BuildOptions = {
        testResults: {
          passed: [],
          failed: [
            {
              test: 'minimal failure',
              fileRelative: 'test.ts',
              startLine: 1,
              endLine: 1,
              error: { message: 'error', type: 'Error' }
              // No console events, no retry info
            }
          ],
          skipped: [],
          successLogs: []
        },
        duration: 1000
      }

      const reporter1 = new LLMReporter({})
      const reporter2 = new LLMReporter({})

      const output1 = buildOutput(reporter1, minimalData)
      const output2 = buildOutput(reporter2, minimalData)

      expect(areOutputsDeterministic(output1, output2)).toBe(true)
    })

    it('should handle tests with undefined optional timestamps deterministically', () => {
      const reporter = new LLMReporter({})

      const consoleEvent: ConsoleEvent = {
        level: 'log',
        message: 'message without timestamp'
        // No timestamp or timestampMs
      }

      const failure: TestFailure = {
        test: 'test',
        fileRelative: 'test.ts',
        startLine: 1,
        endLine: 1,
        error: { message: 'error', type: 'Error' },
        consoleEvents: [consoleEvent]
      }

      const opts: BuildOptions = {
        testResults: { passed: [], failed: [failure], skipped: [], successLogs: [] },
        duration: 1000
      }

      const output1 = buildOutput(reporter, opts)
      const output2 = buildOutput(reporter, opts)

      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)

      expect(normalized1).toEqual(normalized2)
    })

    it('should preserve test ordering deterministically', () => {
      const testData: BuildOptions = {
        testResults: {
          passed: [
            { test: 'test A', fileRelative: 'a.ts', startLine: 1, endLine: 1, status: 'passed' },
            { test: 'test B', fileRelative: 'b.ts', startLine: 1, endLine: 1, status: 'passed' },
            { test: 'test C', fileRelative: 'c.ts', startLine: 1, endLine: 1, status: 'passed' }
          ],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000
      }

      const reporter1 = new LLMReporter({ verbose: true })
      const reporter2 = new LLMReporter({ verbose: true })

      const output1 = buildOutput(reporter1, testData)
      const output2 = buildOutput(reporter2, testData)

      const normalized1 = normalizeOutput(output1)
      const normalized2 = normalizeOutput(output2)

      // Test order should be preserved
      expect(normalized1.passed?.map((t) => t.test)).toEqual(['test A', 'test B', 'test C'])
      expect(normalized2.passed?.map((t) => t.test)).toEqual(['test A', 'test B', 'test C'])

      expect(normalized1).toEqual(normalized2)
    })
  })

  describe('non-deterministic field documentation', () => {
    it('should document all non-deterministic fields', () => {
      // Verify all documented fields exist in the constant
      const documentedFields = Object.values(NON_DETERMINISTIC_FIELDS)

      expect(documentedFields).toContain('summary.timestamp')
      expect(documentedFields).toContain('summary.duration')
      expect(documentedFields).toContain('consoleEvents[].timestamp')
      expect(documentedFields).toContain('consoleEvents[].timestampMs')
      expect(documentedFields).toContain('retryInfo.attempts[].timestamp')
      expect(documentedFields).toContain('retryInfo.attempts[].duration')
      expect(documentedFields).toContain('duration')
      expect(documentedFields).toContain('deduplication.firstSeen')
      expect(documentedFields).toContain('deduplication.lastSeen')

      // Ensure we haven't missed any fields
      expect(Object.keys(NON_DETERMINISTIC_FIELDS)).toHaveLength(9)
    })
  })
})
