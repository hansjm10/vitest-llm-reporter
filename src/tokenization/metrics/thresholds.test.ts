/**
 * Tests for threshold configuration and management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ThresholdManager,
  getThresholdManager,
  resetThresholdManager,
  createModelAwareThresholds,
  type ThresholdSettings,
  type ThresholdConfig
} from './thresholds'
import type { SupportedModel, TokenMetricsConfig, MetricSection } from './types'

describe('ThresholdManager', () => {
  let manager: ThresholdManager

  beforeEach(() => {
    manager = new ThresholdManager()
  })

  afterEach(() => {
    resetThresholdManager()
  })

  describe('constructor', () => {
    it('should create manager with default settings', () => {
      expect(manager).toBeDefined()

      const settings = manager.getSettings()
      expect(settings.totalTokens.enabled).toBe(true)
      expect(settings.totalTokens.warning).toBe(25000)
      expect(settings.perTestTokens.warning).toBe(1000)
    })

    it('should merge custom settings with defaults', () => {
      const customSettings = {
        totalTokens: {
          warning: 30000,
          critical: 60000,
          enabled: true
        }
      }

      const customManager = new ThresholdManager(customSettings)
      const settings = customManager.getSettings()

      expect(settings.totalTokens.warning).toBe(30000)
      expect(settings.totalTokens.critical).toBe(60000)
      expect(settings.totalTokens.info).toBe(10000) // Default preserved
    })

    it('should preserve all default section configurations', () => {
      const settings = manager.getSettings()

      expect(settings.sectionPercentage.summary).toBeDefined()
      expect(settings.sectionPercentage.testCases).toBeDefined()
      expect(settings.sectionPercentage.failures).toBeDefined()
      expect(settings.sectionPercentage.context).toBeDefined()
      expect(settings.sectionPercentage.console).toBeDefined()
      expect(settings.sectionPercentage.metadata).toBeDefined()
      expect(settings.sectionPercentage.total).toBeDefined()
    })
  })

  describe('checkThreshold', () => {
    it('should return null when threshold is disabled', () => {
      const disabledSettings = {
        totalTokens: { enabled: false, warning: 1000, critical: 2000 }
      }
      const disabledManager = new ThresholdManager(disabledSettings)

      const result = disabledManager.checkThreshold('totalTokens', 1500)
      expect(result).toBeNull()
    })

    it('should return correct threshold levels for ascending metrics', () => {
      // Test total tokens (higher is worse)
      // Default thresholds: info=10000, warning=25000, critical=50000
      expect(manager.checkThreshold('totalTokens', 12000)).toBe('info') // Above 10000
      expect(manager.checkThreshold('totalTokens', 30000)).toBe('warning') // Above 25000
      expect(manager.checkThreshold('totalTokens', 60000)).toBe('critical') // Above 50000
      expect(manager.checkThreshold('totalTokens', 8000)).toBeNull() // Below info threshold
    })

    it('should return correct threshold levels for cache hit rate (lower is worse)', () => {
      expect(manager.checkThreshold('cacheHitRate', 75)).toBe('info') // Below 80%
      expect(manager.checkThreshold('cacheHitRate', 55)).toBe('warning') // Below 60%
      expect(manager.checkThreshold('cacheHitRate', 35)).toBe('critical') // Below 40%
      expect(manager.checkThreshold('cacheHitRate', 85)).toBeNull() // Above 80%
    })

    it('should handle per-test token thresholds', () => {
      expect(manager.checkThreshold('perTestTokens', 600)).toBe('info')
      expect(manager.checkThreshold('perTestTokens', 1200)).toBe('warning')
      expect(manager.checkThreshold('perTestTokens', 2500)).toBe('critical')
    })

    it('should handle per-file token thresholds', () => {
      expect(manager.checkThreshold('perFileTokens', 2500)).toBe('info')
      expect(manager.checkThreshold('perFileTokens', 6000)).toBe('warning')
      expect(manager.checkThreshold('perFileTokens', 12000)).toBe('critical')
    })

    it('should handle processing time thresholds', () => {
      expect(manager.checkThreshold('processingTime', 1500)).toBe('info')
      expect(manager.checkThreshold('processingTime', 7000)).toBe('warning')
      expect(manager.checkThreshold('processingTime', 20000)).toBe('critical')
    })

    it('should handle memory usage thresholds', () => {
      const mb50 = 50 * 1024 * 1024
      const mb120 = 120 * 1024 * 1024
      const mb300 = 300 * 1024 * 1024

      expect(manager.checkThreshold('memoryUsage', mb50 + 1)).toBe('info')
      expect(manager.checkThreshold('memoryUsage', mb120)).toBe('warning')
      expect(manager.checkThreshold('memoryUsage', mb300)).toBe('critical')
    })

    it('should handle undefined threshold values', () => {
      const partialSettings = {
        totalTokens: { enabled: true, warning: 1000 } // No critical or info
      }
      const partialManager = new ThresholdManager(partialSettings)

      expect(partialManager.checkThreshold('totalTokens', 1500)).toBe('warning')
      expect(partialManager.checkThreshold('totalTokens', 2500)).toBe('warning') // No critical defined
    })
  })

  describe('checkSectionThreshold', () => {
    it('should check section percentage thresholds', () => {
      expect(manager.checkSectionThreshold('failures', 25)).toBe('info')
      expect(manager.checkSectionThreshold('failures', 45)).toBe('warning')
      expect(manager.checkSectionThreshold('failures', 65)).toBe('critical')
      expect(manager.checkSectionThreshold('failures', 15)).toBeNull()
    })

    it('should handle different sections with different thresholds', () => {
      // Test cases have higher thresholds than failures
      expect(manager.checkSectionThreshold('testCases', 45)).toBe('info')
      expect(manager.checkSectionThreshold('testCases', 65)).toBe('warning')
      expect(manager.checkSectionThreshold('testCases', 85)).toBe('critical')

      // Console has lower thresholds
      expect(manager.checkSectionThreshold('console', 15)).toBe('info')
      expect(manager.checkSectionThreshold('console', 25)).toBe('warning')
      expect(manager.checkSectionThreshold('console', 40)).toBe('critical')
    })

    it('should return null for disabled sections', () => {
      const settings = manager.getSettings()
      settings.sectionPercentage.total.enabled = false

      const disabledManager = new ThresholdManager(settings)
      expect(disabledManager.checkSectionThreshold('total', 100)).toBeNull()
    })

    it('should handle all metric sections', () => {
      const sections = [
        'summary',
        'testCases',
        'failures',
        'context',
        'console',
        'metadata',
        'total'
      ] as const

      sections.forEach((section) => {
        if (section !== 'total') {
          // Total is disabled by default
          const result = manager.checkSectionThreshold(section, 50)
          expect(result).not.toBeNull()
        }
      })
    })
  })

  describe('model limits', () => {
    it('should return correct model limits for all supported models', () => {
      const models: SupportedModel[] = [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-3.5-turbo',
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'claude-3-5-sonnet',
        'claude-3-5-haiku'
      ]

      models.forEach((model) => {
        const limits = manager.getModelLimits(model)
        expect(limits).toBeDefined()
        expect(limits.contextWindow).toBeGreaterThan(0)
        expect(limits.recommendedMax).toBeGreaterThan(0)
        expect(limits.conservativeThreshold).toBeGreaterThan(0)
        expect(limits.conservativeThreshold).toBeLessThan(limits.recommendedMax)
        expect(limits.recommendedMax).toBeLessThan(limits.contextWindow)
      })
    })

    it('should have correct limits for GPT models', () => {
      const gpt4Limits = manager.getModelLimits('gpt-4')
      expect(gpt4Limits.contextWindow).toBe(8192)
      expect(gpt4Limits.recommendedMax).toBe(6000)
      expect(gpt4Limits.conservativeThreshold).toBe(4000)

      const gpt4TurboLimits = manager.getModelLimits('gpt-4-turbo')
      expect(gpt4TurboLimits.contextWindow).toBe(128000)
      expect(gpt4TurboLimits.recommendedMax).toBe(100000)

      const gpt35Limits = manager.getModelLimits('gpt-3.5-turbo')
      expect(gpt35Limits.contextWindow).toBe(4096)
      expect(gpt35Limits.recommendedMax).toBe(3000)
    })

    it('should have correct limits for Claude models', () => {
      const claudeModels: SupportedModel[] = [
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'claude-3-5-sonnet',
        'claude-3-5-haiku'
      ]

      claudeModels.forEach((model) => {
        const limits = manager.getModelLimits(model)
        expect(limits.contextWindow).toBe(200000)
        expect(limits.recommendedMax).toBe(150000)
        expect(limits.conservativeThreshold).toBe(120000)
      })
    })
  })

  describe('checkModelLimit', () => {
    it('should return correct threshold levels for model limits', () => {
      // Test with GPT-4 limits
      expect(manager.checkModelLimit('gpt-4', 4500)).toBe('info') // Above conservative
      expect(manager.checkModelLimit('gpt-4', 6500)).toBe('warning') // Above recommended
      expect(manager.checkModelLimit('gpt-4', 8500)).toBe('critical') // Above context window
      expect(manager.checkModelLimit('gpt-4', 3000)).toBeNull() // Below all thresholds
    })

    it('should work with different models', () => {
      // Test with Claude model (higher limits)
      expect(manager.checkModelLimit('claude-3-opus', 125000)).toBe('info')
      expect(manager.checkModelLimit('claude-3-opus', 160000)).toBe('warning')
      expect(manager.checkModelLimit('claude-3-opus', 210000)).toBe('critical')

      // Test with GPT-3.5 (lower limits)
      expect(manager.checkModelLimit('gpt-3.5-turbo', 2200)).toBe('info')
      expect(manager.checkModelLimit('gpt-3.5-turbo', 3200)).toBe('warning')
      expect(manager.checkModelLimit('gpt-3.5-turbo', 4200)).toBe('critical')
    })
  })

  describe('settings management', () => {
    it('should return deep copy of settings', () => {
      const settings1 = manager.getSettings()
      const settings2 = manager.getSettings()

      expect(settings1).not.toBe(settings2) // Different objects
      expect(settings1).toEqual(settings2) // Same content

      // Modifying one shouldn't affect the other
      settings1.totalTokens.warning = 99999
      expect(settings2.totalTokens.warning).not.toBe(99999)
    })

    it('should update settings correctly', () => {
      const updates = {
        totalTokens: {
          warning: 35000,
          critical: 70000,
          enabled: true
        },
        perTestTokens: {
          warning: 1500,
          enabled: true
        }
      }

      manager.updateSettings(updates)
      const settings = manager.getSettings()

      expect(settings.totalTokens.warning).toBe(35000)
      expect(settings.totalTokens.critical).toBe(70000)
      expect(settings.totalTokens.info).toBe(10000) // Unchanged
      expect(settings.perTestTokens.warning).toBe(1500)
      expect(settings.perTestTokens.critical).toBe(2000) // Unchanged
    })

    it('should update section percentage settings', () => {
      const updates = {
        sectionPercentage: {
          failures: {
            warning: 50,
            critical: 75,
            enabled: true
          }
        } as Partial<Record<MetricSection, ThresholdConfig>>
      } as Partial<ThresholdSettings>

      manager.updateSettings(updates)
      const settings = manager.getSettings()

      expect(settings.sectionPercentage.failures.warning).toBe(50)
      expect(settings.sectionPercentage.failures.critical).toBe(75)
      expect(settings.sectionPercentage.failures.info).toBe(20) // Unchanged
    })

    it('should reset to defaults', () => {
      // Modify settings
      manager.updateSettings({
        totalTokens: { warning: 99999, enabled: true }
      })

      // Verify change
      expect(manager.getSettings().totalTokens.warning).toBe(99999)

      // Reset
      manager.resetToDefaults()

      // Verify reset
      expect(manager.getSettings().totalTokens.warning).toBe(25000)
    })
  })

  describe('fromReporterConfig', () => {
    it('should create settings from reporter config', () => {
      const config: TokenMetricsConfig = {
        enabled: true,
        model: 'gpt-4',
        trackSections: true,
        includePassedTests: false,
        includeSkippedTests: false,
        maxContentSize: 50000,
        enableBatching: true,
        thresholds: {
          totalTokens: 30000,
          perTestTokens: 1500,
          perFileTokens: 8000,
          sectionPercentage: 40
        }
      }

      const settings = ThresholdManager.fromReporterConfig(config)

      expect(settings.totalTokens.warning).toBe(30000)
      expect(settings.totalTokens.critical).toBe(60000) // Double
      expect(settings.perTestTokens.warning).toBe(1500)
      expect(settings.perTestTokens.critical).toBe(3000)
      expect(settings.perFileTokens.warning).toBe(8000)
      expect(settings.perFileTokens.critical).toBe(16000)

      // Section percentages should be applied to all enabled sections
      expect(settings.sectionPercentage.failures.warning).toBe(40)
      expect(settings.sectionPercentage.failures.critical).toBe(60) // 1.5x
      expect(settings.sectionPercentage.context.warning).toBe(40)
      expect(settings.sectionPercentage.context.critical).toBe(60)
    })

    it('should handle partial threshold config', () => {
      const config: TokenMetricsConfig = {
        enabled: true,
        model: 'gpt-4',
        trackSections: true,
        includePassedTests: false,
        includeSkippedTests: false,
        maxContentSize: 50000,
        enableBatching: true,
        thresholds: {
          totalTokens: 20000
          // Only total tokens specified
        }
      }

      const settings = ThresholdManager.fromReporterConfig(config)

      expect(settings.totalTokens.warning).toBe(20000)
      expect(settings.totalTokens.critical).toBe(40000)
      expect(settings.perTestTokens.warning).toBe(1000) // Default
      expect(settings.perFileTokens.warning).toBe(5000) // Default
    })

    it('should handle config without thresholds', () => {
      const config: TokenMetricsConfig = {
        enabled: true,
        model: 'gpt-4',
        trackSections: true,
        includePassedTests: false,
        includeSkippedTests: false,
        maxContentSize: 50000,
        enableBatching: true,
        thresholds: {}
      }

      const settings = ThresholdManager.fromReporterConfig(config)

      // Should use all defaults
      expect(settings.totalTokens.warning).toBe(25000)
      expect(settings.perTestTokens.warning).toBe(1000)
      expect(settings.perFileTokens.warning).toBe(5000)
    })
  })

  describe('getThresholdDescription', () => {
    it('should return descriptions for standard metrics', () => {
      expect(manager.getThresholdDescription('totalTokens')).toBe(
        'Total tokens across all test results'
      )
      expect(manager.getThresholdDescription('perTestTokens')).toBe('Tokens per individual test')
      expect(manager.getThresholdDescription('processingTime')).toBe(
        'Processing time per test in milliseconds'
      )
      expect(manager.getThresholdDescription('memoryUsage')).toBe('Memory usage in bytes')
      expect(manager.getThresholdDescription('cacheHitRate')).toBe(
        'Cache hit rate percentage (lower is worse)'
      )
    })

    it('should return descriptions for section percentages', () => {
      expect(manager.getThresholdDescription('sectionPercentage', 'failures')).toBe(
        'Failures section as percentage of total'
      )
      expect(manager.getThresholdDescription('sectionPercentage', 'context')).toBe(
        'Context section as percentage of total'
      )
      expect(manager.getThresholdDescription('sectionPercentage', 'console')).toBe(
        'Console output section as percentage of total'
      )
    })

    it('should handle missing descriptions', () => {
      const noDescSettings = {
        totalTokens: { enabled: true, warning: 1000 } // No description
      }
      const noDescManager = new ThresholdManager(noDescSettings)

      // When merged with defaults, it should have the default description
      expect(noDescManager.getThresholdDescription('totalTokens')).toBe(
        'Total tokens across all test results'
      )
    })
  })

  describe('mergeSettings', () => {
    it('should merge settings correctly', () => {
      const base = manager.getSettings()
      const updates = {
        totalTokens: {
          warning: 30000,
          enabled: true
        },
        sectionPercentage: {
          failures: {
            warning: 45,
            enabled: true
          }
        } as Partial<Record<MetricSection, ThresholdConfig>>
      } as Partial<ThresholdSettings>

      const merged = manager.mergeSettings(base, updates)

      expect(merged.totalTokens.warning).toBe(30000)
      expect(merged.totalTokens.critical).toBe(50000) // Preserved from base
      expect(merged.sectionPercentage.failures.warning).toBe(45)
      expect(merged.sectionPercentage.failures.critical).toBe(60) // Preserved from base
      expect(merged.sectionPercentage.context.warning).toBe(25) // Unchanged
    })

    it('should handle undefined updates', () => {
      const base = manager.getSettings()
      const merged = manager.mergeSettings(base, undefined)

      expect(merged).toEqual(base)
    })

    it('should create deep copies', () => {
      const base = manager.getSettings()
      const updates = {
        totalTokens: { warning: 30000, enabled: true }
      }

      const merged = manager.mergeSettings(base, updates)

      expect(merged).not.toBe(base)
      expect(merged.totalTokens).not.toBe(base.totalTokens)
    })
  })
})

describe('threshold manager factory functions', () => {
  afterEach(() => {
    resetThresholdManager()
  })

  describe('getThresholdManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getThresholdManager()
      const manager2 = getThresholdManager()

      expect(manager1).toBe(manager2)
    })

    it('should create with custom settings on first call', () => {
      const customSettings = {
        totalTokens: { warning: 35000, enabled: true }
      }

      const manager = getThresholdManager(customSettings)
      expect(manager.getSettings().totalTokens.warning).toBe(35000)
    })

    it('should ignore settings on subsequent calls', () => {
      getThresholdManager({ totalTokens: { warning: 30000, enabled: true } })
      const manager = getThresholdManager({ totalTokens: { warning: 40000, enabled: true } })

      expect(manager.getSettings().totalTokens.warning).toBe(30000) // First call wins
    })
  })

  describe('resetThresholdManager', () => {
    it('should reset singleton instance', () => {
      const manager1 = getThresholdManager()
      resetThresholdManager()
      const manager2 = getThresholdManager()

      expect(manager1).not.toBe(manager2)
    })
  })
})

describe('createModelAwareThresholds', () => {
  it('should create thresholds based on model limits', () => {
    const gpt4Thresholds = createModelAwareThresholds('gpt-4')

    // GPT-4 conservative threshold is 4000
    expect(gpt4Thresholds.totalTokens.info).toBe(1000) // 25% of 4000
    expect(gpt4Thresholds.totalTokens.warning).toBe(2000) // 50% of 4000
    expect(gpt4Thresholds.totalTokens.critical).toBe(4000) // 100% of 4000

    expect(gpt4Thresholds.perTestTokens.info).toBe(200) // 5% of 4000
    expect(gpt4Thresholds.perTestTokens.warning).toBe(400) // 10% of 4000
    expect(gpt4Thresholds.perTestTokens.critical).toBe(800) // 20% of 4000
  })

  it('should create different thresholds for different models', () => {
    const gpt4Thresholds = createModelAwareThresholds('gpt-4')
    const claudeThresholds = createModelAwareThresholds('claude-3-opus')

    // Claude has much higher limits (120000 conservative)
    expect(claudeThresholds.totalTokens.critical).toBe(120000)
    expect(claudeThresholds.totalTokens.critical).toBeGreaterThan(
      gpt4Thresholds.totalTokens.critical ?? 0
    )

    expect(claudeThresholds.perTestTokens.critical).toBe(24000)
    expect(claudeThresholds.perTestTokens.critical).toBeGreaterThan(
      gpt4Thresholds.perTestTokens.critical ?? 0
    )
  })

  it('should handle small model limits correctly', () => {
    const gpt35Thresholds = createModelAwareThresholds('gpt-3.5-turbo')

    // GPT-3.5 conservative threshold is 2000
    expect(gpt35Thresholds.totalTokens.info).toBe(500)
    expect(gpt35Thresholds.totalTokens.warning).toBe(1000)
    expect(gpt35Thresholds.totalTokens.critical).toBe(2000)

    expect(gpt35Thresholds.perTestTokens.info).toBe(100)
    expect(gpt35Thresholds.perTestTokens.warning).toBe(200)
    expect(gpt35Thresholds.perTestTokens.critical).toBe(400)
  })

  it('should merge with base settings when provided', () => {
    const baseSettings = {
      processingTime: {
        warning: 8000,
        critical: 20000,
        enabled: true
      }
    }

    const thresholds = createModelAwareThresholds('gpt-4', baseSettings)

    // Model-aware settings should be applied
    expect(thresholds.totalTokens.critical).toBe(4000)

    // Base settings should be merged
    expect(thresholds.processingTime.warning).toBe(8000)
    expect(thresholds.processingTime.critical).toBe(20000)
  })

  it('should handle all supported models', () => {
    const models: SupportedModel[] = [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-3-5-sonnet',
      'claude-3-5-haiku'
    ]

    models.forEach((model) => {
      const thresholds = createModelAwareThresholds(model)

      expect(thresholds.totalTokens.info).toBeGreaterThan(0)
      expect(thresholds.totalTokens.warning).toBeGreaterThan(thresholds.totalTokens.info!)
      expect(thresholds.totalTokens.critical).toBeGreaterThan(thresholds.totalTokens.warning!)

      expect(thresholds.perTestTokens.critical).toBeGreaterThan(0)
      expect(thresholds.perFileTokens.critical).toBeGreaterThan(0)
    })
  })

  it('should calculate percentages correctly', () => {
    const thresholds = createModelAwareThresholds('gpt-4') // Conservative: 4000

    // Verify percentage calculations
    expect(thresholds.totalTokens.info).toBe(Math.floor(4000 * 0.25))
    expect(thresholds.totalTokens.warning).toBe(Math.floor(4000 * 0.5))
    expect(thresholds.totalTokens.critical).toBe(4000)

    expect(thresholds.perTestTokens.info).toBe(Math.floor(4000 * 0.05))
    expect(thresholds.perTestTokens.warning).toBe(Math.floor(4000 * 0.1))
    expect(thresholds.perTestTokens.critical).toBe(Math.floor(4000 * 0.2))

    expect(thresholds.perFileTokens.info).toBe(Math.floor(4000 * 0.15))
    expect(thresholds.perFileTokens.warning).toBe(Math.floor(4000 * 0.3))
    expect(thresholds.perFileTokens.critical).toBe(Math.floor(4000 * 0.6))
  })
})
