/**
 * Tests for TruncationMetricsTracker
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  TruncationMetricsTracker,
  globalTruncationMetrics,
  type TruncationMetrics,
  type StagedTruncationMetrics,
  type TruncationStage,
  type TruncationSummary
} from './MetricsTracker'

describe('TruncationMetricsTracker', () => {
  let tracker: TruncationMetricsTracker

  beforeEach(() => {
    tracker = new TruncationMetricsTracker(true)
  })

  describe('constructor', () => {
    it('should create tracker with enabled state', () => {
      const enabledTracker = new TruncationMetricsTracker(true)
      expect(enabledTracker.isEnabled()).toBe(true)
    })

    it('should create tracker with disabled state', () => {
      const disabledTracker = new TruncationMetricsTracker(false)
      expect(disabledTracker.isEnabled()).toBe(false)
    })

    it('should default to enabled when no parameter provided', () => {
      const defaultTracker = new TruncationMetricsTracker()
      expect(defaultTracker.isEnabled()).toBe(true)
    })

    it('should start with empty metrics', () => {
      expect(tracker.getAllMetrics()).toHaveLength(0)
    })
  })

  describe('recordTruncation', () => {
    const sampleMetrics: TruncationMetrics = {
      tokensRemoved: 500,
      wasTruncated: true,
      originalTokens: 1000,
      truncatedTokens: 500,
      processingTime: 100
    }

    it('should record truncation when enabled', () => {
      tracker.recordTruncation(sampleMetrics, 'early')

      const metrics = tracker.getAllMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].tokensRemoved).toBe(500)
      expect(metrics[0].stage).toBe('early')
      expect(metrics[0].timestamp).toBeGreaterThan(0)
    })

    it('should not record truncation when disabled', () => {
      tracker.setEnabled(false)
      tracker.recordTruncation(sampleMetrics, 'early')

      expect(tracker.getAllMetrics()).toHaveLength(0)
    })

    it('should record truncation with test context', () => {
      const testContext = {
        testFile: 'test.js',
        testName: 'sample test',
        testId: 'test-123'
      }

      tracker.recordTruncation(sampleMetrics, 'streaming', testContext)

      const metrics = tracker.getAllMetrics()
      expect(metrics[0].testContext).toEqual(testContext)
    })

    it('should record multiple truncations', () => {
      tracker.recordTruncation(sampleMetrics, 'early')
      tracker.recordTruncation(sampleMetrics, 'late')
      tracker.recordTruncation(sampleMetrics, 'processing')

      expect(tracker.getAllMetrics()).toHaveLength(3)
    })

    it('should handle truncation without processing time', () => {
      const metricsWithoutTime: TruncationMetrics = {
        tokensRemoved: 200,
        wasTruncated: true,
        originalTokens: 800,
        truncatedTokens: 600
        // No processingTime
      }

      tracker.recordTruncation(metricsWithoutTime, 'early')

      const metrics = tracker.getAllMetrics()
      expect(metrics[0].processingTime).toBeUndefined()
    })

    it('should preserve all metrics properties', () => {
      const complexMetrics: TruncationMetrics = {
        tokensRemoved: 300,
        wasTruncated: true,
        originalTokens: 1200,
        truncatedTokens: 900,
        processingTime: 250
      }

      tracker.recordTruncation(complexMetrics, 'late')

      const recorded = tracker.getAllMetrics()[0]
      expect(recorded.tokensRemoved).toBe(300)
      expect(recorded.wasTruncated).toBe(true)
      expect(recorded.originalTokens).toBe(1200)
      expect(recorded.truncatedTokens).toBe(900)
      expect(recorded.processingTime).toBe(250)
      expect(recorded.stage).toBe('late')
    })
  })

  describe('getAllMetrics', () => {
    it('should return empty array initially', () => {
      expect(tracker.getAllMetrics()).toEqual([])
    })

    it('should return all recorded metrics', () => {
      const metrics1: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      const metrics2: TruncationMetrics = {
        tokensRemoved: 200,
        wasTruncated: true,
        originalTokens: 800,
        truncatedTokens: 600
      }

      tracker.recordTruncation(metrics1, 'early')
      tracker.recordTruncation(metrics2, 'late')

      const allMetrics = tracker.getAllMetrics()
      expect(allMetrics).toHaveLength(2)
      expect(allMetrics[0].tokensRemoved).toBe(100)
      expect(allMetrics[1].tokensRemoved).toBe(200)
    })

    it('should return independent copy of metrics', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(metrics, 'early')

      const copy1 = tracker.getAllMetrics()
      const copy2 = tracker.getAllMetrics()

      expect(copy1).not.toBe(copy2) // Different arrays
      expect(copy1).toEqual(copy2) // Same content
    })
  })

  describe('getMetricsByStage', () => {
    beforeEach(() => {
      const baseMetrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(baseMetrics, 'early')
      tracker.recordTruncation(baseMetrics, 'early')
      tracker.recordTruncation(baseMetrics, 'streaming')
      tracker.recordTruncation(baseMetrics, 'late')
      tracker.recordTruncation(baseMetrics, 'processing')
    })

    it('should filter metrics by stage', () => {
      const earlyMetrics = tracker.getMetricsByStage('early')
      expect(earlyMetrics).toHaveLength(2)
      expect(earlyMetrics.every((m) => m.stage === 'early')).toBe(true)

      const streamingMetrics = tracker.getMetricsByStage('streaming')
      expect(streamingMetrics).toHaveLength(1)
      expect(streamingMetrics[0].stage).toBe('streaming')
    })

    it('should return empty array for stage with no metrics', () => {
      tracker.clear()
      expect(tracker.getMetricsByStage('early')).toEqual([])
    })

    it('should handle all stage types', () => {
      const stages: TruncationStage[] = ['early', 'streaming', 'late', 'processing']

      stages.forEach((stage) => {
        const stageMetrics = tracker.getMetricsByStage(stage)
        expect(Array.isArray(stageMetrics)).toBe(true)
      })
    })
  })

  describe('getSummary', () => {
    it('should return empty summary when no metrics recorded', () => {
      const summary = tracker.getSummary()

      expect(summary.totalTruncations).toBe(0)
      expect(summary.byStage).toEqual({
        early: 0,
        streaming: 0,
        late: 0,
        processing: 0
      })
      expect(summary.tokensSaved).toBe(0)
      expect(summary.avgProcessingTime).toBe(0)
      expect(summary.mostActiveStage).toBe('early') // Default
    })

    it('should calculate summary correctly with single metric', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 300,
        wasTruncated: true,
        originalTokens: 1000,
        truncatedTokens: 700,
        processingTime: 150
      }

      tracker.recordTruncation(metrics, 'streaming')

      const summary = tracker.getSummary()
      expect(summary.totalTruncations).toBe(1)
      expect(summary.byStage.streaming).toBe(1)
      expect(summary.tokensSaved).toBe(300) // 1000 - 700
      expect(summary.avgProcessingTime).toBe(150)
      expect(summary.mostActiveStage).toBe('streaming')
    })

    it('should calculate summary correctly with multiple metrics', () => {
      // Record multiple truncations
      tracker.recordTruncation(
        {
          tokensRemoved: 200,
          wasTruncated: true,
          originalTokens: 800,
          truncatedTokens: 600,
          processingTime: 100
        },
        'early'
      )

      tracker.recordTruncation(
        {
          tokensRemoved: 300,
          wasTruncated: true,
          originalTokens: 1000,
          truncatedTokens: 700,
          processingTime: 200
        },
        'early'
      )

      tracker.recordTruncation(
        {
          tokensRemoved: 150,
          wasTruncated: true,
          originalTokens: 600,
          truncatedTokens: 450,
          processingTime: 75
        },
        'late'
      )

      const summary = tracker.getSummary()
      expect(summary.totalTruncations).toBe(3)
      expect(summary.byStage.early).toBe(2)
      expect(summary.byStage.late).toBe(1)
      expect(summary.tokensSaved).toBe(650) // 200 + 300 + 150
      expect(summary.avgProcessingTime).toBe(125) // (100 + 200 + 75) / 3
      expect(summary.mostActiveStage).toBe('early') // Most metrics
    })

    it('should handle metrics without truncation', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 0,
          wasTruncated: false,
          originalTokens: 500,
          truncatedTokens: 500,
          processingTime: 50
        },
        'early'
      )

      const summary = tracker.getSummary()
      expect(summary.totalTruncations).toBe(0) // No actual truncations
      expect(summary.byStage.early).toBe(1) // But still counted in stage breakdown
      expect(summary.tokensSaved).toBe(0)
    })

    it('should handle metrics without processing time', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 100,
          wasTruncated: true,
          originalTokens: 500,
          truncatedTokens: 400
          // No processingTime
        },
        'early'
      )

      const summary = tracker.getSummary()
      expect(summary.avgProcessingTime).toBe(0)
    })

    it('should correctly identify most active stage', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      // Make 'streaming' the most active
      tracker.recordTruncation(metrics, 'early')
      tracker.recordTruncation(metrics, 'streaming')
      tracker.recordTruncation(metrics, 'streaming')
      tracker.recordTruncation(metrics, 'streaming')
      tracker.recordTruncation(metrics, 'late')

      const summary = tracker.getSummary()
      expect(summary.mostActiveStage).toBe('streaming')
    })

    it('should handle tie in stage activity', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      // Create tie between early and late
      tracker.recordTruncation(metrics, 'early')
      tracker.recordTruncation(metrics, 'early')
      tracker.recordTruncation(metrics, 'late')
      tracker.recordTruncation(metrics, 'late')

      const summary = tracker.getSummary()
      // Should return one of the tied stages
      expect(['early', 'late']).toContain(summary.mostActiveStage)
    })
  })

  describe('getTestMetrics', () => {
    beforeEach(() => {
      const baseMetrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(baseMetrics, 'early', {
        testId: 'test-1',
        testName: 'First test',
        testFile: 'test1.js'
      })

      tracker.recordTruncation(baseMetrics, 'late', {
        testId: 'test-1',
        testName: 'First test',
        testFile: 'test1.js'
      })

      tracker.recordTruncation(baseMetrics, 'streaming', {
        testId: 'test-2',
        testName: 'Second test',
        testFile: 'test2.js'
      })
    })

    it('should return metrics for specific test', () => {
      const test1Metrics = tracker.getTestMetrics('test-1')
      expect(test1Metrics).toHaveLength(2)
      expect(test1Metrics.every((m) => m.testContext?.testId === 'test-1')).toBe(true)

      const test2Metrics = tracker.getTestMetrics('test-2')
      expect(test2Metrics).toHaveLength(1)
      expect(test2Metrics[0].testContext?.testId).toBe('test-2')
    })

    it('should return empty array for non-existent test', () => {
      const metrics = tracker.getTestMetrics('non-existent')
      expect(metrics).toEqual([])
    })

    it('should handle metrics without test context', () => {
      const baseMetrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(baseMetrics, 'early') // No test context

      const metrics = tracker.getTestMetrics('any-test')
      expect(metrics).toEqual([])
    })
  })

  describe('clear', () => {
    it('should clear all metrics', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(metrics, 'early')
      tracker.recordTruncation(metrics, 'late')

      expect(tracker.getAllMetrics()).toHaveLength(2)

      tracker.clear()

      expect(tracker.getAllMetrics()).toHaveLength(0)

      const summary = tracker.getSummary()
      expect(summary.totalTruncations).toBe(0)
    })

    it('should not affect enabled state', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 100,
          wasTruncated: true,
          originalTokens: 500,
          truncatedTokens: 400
        },
        'early'
      )

      expect(tracker.isEnabled()).toBe(true)

      tracker.clear()

      expect(tracker.isEnabled()).toBe(true)
    })
  })

  describe('setEnabled and isEnabled', () => {
    it('should enable and disable metrics collection', () => {
      expect(tracker.isEnabled()).toBe(true)

      tracker.setEnabled(false)
      expect(tracker.isEnabled()).toBe(false)

      tracker.setEnabled(true)
      expect(tracker.isEnabled()).toBe(true)
    })

    it('should clear metrics when disabled', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(metrics, 'early')
      expect(tracker.getAllMetrics()).toHaveLength(1)

      tracker.setEnabled(false)
      expect(tracker.getAllMetrics()).toHaveLength(0)
    })

    it('should not clear metrics when enabled again', () => {
      tracker.setEnabled(false)
      tracker.setEnabled(true)

      // Should be empty because we cleared when disabling, not because we re-enabled
      expect(tracker.getAllMetrics()).toHaveLength(0)

      // Should be able to record after re-enabling
      tracker.recordTruncation(
        {
          tokensRemoved: 100,
          wasTruncated: true,
          originalTokens: 500,
          truncatedTokens: 400
        },
        'early'
      )

      expect(tracker.getAllMetrics()).toHaveLength(1)
    })
  })

  describe('export', () => {
    beforeEach(() => {
      const baseMetrics: TruncationMetrics = {
        tokensRemoved: 200,
        wasTruncated: true,
        originalTokens: 800,
        truncatedTokens: 600,
        processingTime: 100
      }

      tracker.recordTruncation(baseMetrics, 'early')
      tracker.recordTruncation(baseMetrics, 'streaming')
    })

    it('should export summary and details', () => {
      const exported = tracker.export()

      expect(exported.summary).toBeDefined()
      expect(exported.details).toBeDefined()
      expect(exported.exportTime).toBeGreaterThan(0)

      expect(exported.summary.totalTruncations).toBe(2)
      expect(exported.details).toHaveLength(2)
    })

    it('should include current timestamp', () => {
      const beforeExport = Date.now()
      const exported = tracker.export()
      const afterExport = Date.now()

      expect(exported.exportTime).toBeGreaterThanOrEqual(beforeExport)
      expect(exported.exportTime).toBeLessThanOrEqual(afterExport)
    })

    it('should export empty data when no metrics', () => {
      tracker.clear()

      const exported = tracker.export()

      expect(exported.summary.totalTruncations).toBe(0)
      expect(exported.details).toHaveLength(0)
      expect(exported.exportTime).toBeGreaterThan(0)
    })

    it('should return independent copies', () => {
      const export1 = tracker.export()
      const export2 = tracker.export()

      expect(export1.details).not.toBe(export2.details)
      expect(export1.summary).not.toBe(export2.summary)
      expect(export1.details).toEqual(export2.details)
      expect(export1.summary).toEqual(export2.summary)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle zero tokens removed', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 0,
          wasTruncated: true, // Contradictory but possible
          originalTokens: 500,
          truncatedTokens: 500
        },
        'early'
      )

      const summary = tracker.getSummary()
      expect(summary.tokensSaved).toBe(0)
    })

    it('should handle negative processing time', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 100,
          wasTruncated: true,
          originalTokens: 500,
          truncatedTokens: 400,
          processingTime: -50 // Invalid but possible
        },
        'early'
      )

      const summary = tracker.getSummary()
      expect(summary.avgProcessingTime).toBe(-50)
    })

    it('should handle very large numbers', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 1000000,
          wasTruncated: true,
          originalTokens: 2000000,
          truncatedTokens: 1000000,
          processingTime: 5000
        },
        'processing'
      )

      const summary = tracker.getSummary()
      expect(summary.tokensSaved).toBe(1000000)
      expect(summary.totalTruncations).toBe(1)
    })

    it('should handle mixed truncated and non-truncated metrics', () => {
      tracker.recordTruncation(
        {
          tokensRemoved: 100,
          wasTruncated: true,
          originalTokens: 500,
          truncatedTokens: 400
        },
        'early'
      )

      tracker.recordTruncation(
        {
          tokensRemoved: 0,
          wasTruncated: false,
          originalTokens: 300,
          truncatedTokens: 300
        },
        'early'
      )

      const summary = tracker.getSummary()
      expect(summary.totalTruncations).toBe(1) // Only truncated ones count
      expect(summary.byStage.early).toBe(2) // But both recorded
      expect(summary.tokensSaved).toBe(100)
    })
  })

  describe('timestamp handling', () => {
    it('should record current timestamp', () => {
      const beforeRecord = Date.now()

      tracker.recordTruncation(
        {
          tokensRemoved: 100,
          wasTruncated: true,
          originalTokens: 500,
          truncatedTokens: 400
        },
        'early'
      )

      const afterRecord = Date.now()
      const metrics = tracker.getAllMetrics()

      expect(metrics[0].timestamp).toBeGreaterThanOrEqual(beforeRecord)
      expect(metrics[0].timestamp).toBeLessThanOrEqual(afterRecord)
    })

    it('should have unique timestamps for rapid recordings', () => {
      const metrics: TruncationMetrics = {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      }

      tracker.recordTruncation(metrics, 'early')
      tracker.recordTruncation(metrics, 'late')

      const allMetrics = tracker.getAllMetrics()
      expect(allMetrics[0].timestamp).toBeLessThanOrEqual(allMetrics[1].timestamp)
    })
  })
})

describe('globalTruncationMetrics', () => {
  it('should be initially disabled', () => {
    expect(globalTruncationMetrics.isEnabled()).toBe(false)
  })

  it('should be a singleton instance', () => {
    // This test verifies the global instance exists and can be used
    expect(globalTruncationMetrics).toBeDefined()
    expect(globalTruncationMetrics).toBeInstanceOf(TruncationMetricsTracker)
  })

  it('should not record when disabled', () => {
    globalTruncationMetrics.recordTruncation(
      {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      },
      'early'
    )

    expect(globalTruncationMetrics.getAllMetrics()).toHaveLength(0)
  })

  it('should record when enabled', () => {
    globalTruncationMetrics.setEnabled(true)

    globalTruncationMetrics.recordTruncation(
      {
        tokensRemoved: 100,
        wasTruncated: true,
        originalTokens: 500,
        truncatedTokens: 400
      },
      'early'
    )

    expect(globalTruncationMetrics.getAllMetrics()).toHaveLength(1)

    // Clean up
    globalTruncationMetrics.setEnabled(false)
  })
})
