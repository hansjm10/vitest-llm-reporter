/**
 * Token Metrics Threshold Configuration
 *
 * Provides configurable thresholds for token usage warnings
 * and validation of token limits.
 */

import type { SupportedModel } from '../types.js'
import type { MetricSection, TokenMetricsConfig } from './types.js'

/**
 * Threshold levels for warnings
 */
export type ThresholdLevel = 'info' | 'warning' | 'critical'

/**
 * Threshold configuration for a specific metric
 */
export interface ThresholdConfig {
  /** Info level threshold */
  info?: number
  /** Warning level threshold */
  warning?: number
  /** Critical level threshold */
  critical?: number
  /** Whether threshold is enabled */
  enabled: boolean
  /** Optional description */
  description?: string
}

/**
 * Complete threshold configuration
 */
export interface ThresholdSettings {
  /** Total tokens across all tests */
  totalTokens: ThresholdConfig
  /** Tokens per individual test */
  perTestTokens: ThresholdConfig
  /** Tokens per file */
  perFileTokens: ThresholdConfig
  /** Tokens per section as percentage of total */
  sectionPercentage: Record<MetricSection, ThresholdConfig>
  /** Test processing time in milliseconds */
  processingTime: ThresholdConfig
  /** Memory usage in bytes */
  memoryUsage: ThresholdConfig
  /** Cache hit rate as percentage */
  cacheHitRate: ThresholdConfig
}

/**
 * Model-specific token limits
 */
export interface ModelLimits {
  /** Maximum context window size */
  contextWindow: number
  /** Recommended maximum for single request */
  recommendedMax: number
  /** Conservative threshold for warnings */
  conservativeThreshold: number
}

/**
 * Known token limits for supported models
 */
const MODEL_LIMITS: Record<SupportedModel, ModelLimits> = {
  'gpt-4': {
    contextWindow: 8192,
    recommendedMax: 6000,
    conservativeThreshold: 4000
  },
  'gpt-4-turbo': {
    contextWindow: 128000,
    recommendedMax: 100000,
    conservativeThreshold: 80000
  },
  'gpt-4o': {
    contextWindow: 128000,
    recommendedMax: 100000,
    conservativeThreshold: 80000
  },
  'gpt-4o-mini': {
    contextWindow: 128000,
    recommendedMax: 100000,
    conservativeThreshold: 80000
  },
  'gpt-3.5-turbo': {
    contextWindow: 4096,
    recommendedMax: 3000,
    conservativeThreshold: 2000
  },
  'claude-3-opus': {
    contextWindow: 200000,
    recommendedMax: 150000,
    conservativeThreshold: 120000
  },
  'claude-3-sonnet': {
    contextWindow: 200000,
    recommendedMax: 150000,
    conservativeThreshold: 120000
  },
  'claude-3-haiku': {
    contextWindow: 200000,
    recommendedMax: 150000,
    conservativeThreshold: 120000
  },
  'claude-3-5-sonnet': {
    contextWindow: 200000,
    recommendedMax: 150000,
    conservativeThreshold: 120000
  },
  'claude-3-5-haiku': {
    contextWindow: 200000,
    recommendedMax: 150000,
    conservativeThreshold: 120000
  }
}

/**
 * Default threshold configurations
 */
const DEFAULT_THRESHOLDS: ThresholdSettings = {
  totalTokens: {
    info: 10000,
    warning: 25000,
    critical: 50000,
    enabled: true,
    description: 'Total tokens across all test results'
  },
  perTestTokens: {
    info: 500,
    warning: 1000,
    critical: 2000,
    enabled: true,
    description: 'Tokens per individual test'
  },
  perFileTokens: {
    info: 2000,
    warning: 5000,
    critical: 10000,
    enabled: true,
    description: 'Tokens per test file'
  },
  sectionPercentage: {
    summary: {
      info: 5,
      warning: 10,
      critical: 20,
      enabled: true,
      description: 'Summary section as percentage of total'
    },
    testCases: {
      info: 40,
      warning: 60,
      critical: 80,
      enabled: true,
      description: 'Test cases section as percentage of total'
    },
    failures: {
      info: 20,
      warning: 40,
      critical: 60,
      enabled: true,
      description: 'Failures section as percentage of total'
    },
    context: {
      info: 15,
      warning: 25,
      critical: 40,
      enabled: true,
      description: 'Context section as percentage of total'
    },
    console: {
      info: 10,
      warning: 20,
      critical: 35,
      enabled: true,
      description: 'Console output section as percentage of total'
    },
    metadata: {
      info: 5,
      warning: 10,
      critical: 15,
      enabled: true,
      description: 'Metadata section as percentage of total'
    },
    total: {
      enabled: false,
      description: 'Total section (calculated, not monitored)'
    }
  },
  processingTime: {
    info: 1000, // 1 second
    warning: 5000, // 5 seconds
    critical: 15000, // 15 seconds
    enabled: true,
    description: 'Processing time per test in milliseconds'
  },
  memoryUsage: {
    info: 50 * 1024 * 1024, // 50 MB
    warning: 100 * 1024 * 1024, // 100 MB
    critical: 250 * 1024 * 1024, // 250 MB
    enabled: true,
    description: 'Memory usage in bytes'
  },
  cacheHitRate: {
    info: 80, // 80%
    warning: 60, // 60%
    critical: 40, // 40%
    enabled: true,
    description: 'Cache hit rate percentage (lower is worse)'
  }
}

/**
 * Threshold manager for token metrics
 */
export class ThresholdManager {
  private settings: ThresholdSettings
  private modelLimits: Record<SupportedModel, ModelLimits>

  constructor(customSettings?: Partial<ThresholdSettings>) {
    this.settings = this.mergeSettings(DEFAULT_THRESHOLDS, customSettings)
    this.modelLimits = { ...MODEL_LIMITS }
  }

  /**
   * Check threshold level for a given metric
   */
  checkThreshold(
    metricType: keyof Omit<ThresholdSettings, 'sectionPercentage'>,
    value: number
  ): ThresholdLevel | null {
    const config = this.settings[metricType]

    if (!config.enabled) {
      return null
    }

    // For cache hit rate, lower values are worse
    if (metricType === 'cacheHitRate') {
      if (config.critical !== undefined && value <= config.critical) {
        return 'critical'
      }
      if (config.warning !== undefined && value <= config.warning) {
        return 'warning'
      }
      if (config.info !== undefined && value <= config.info) {
        return 'info'
      }
    } else {
      // For other metrics, higher values are worse
      if (config.critical !== undefined && value >= config.critical) {
        return 'critical'
      }
      if (config.warning !== undefined && value >= config.warning) {
        return 'warning'
      }
      if (config.info !== undefined && value >= config.info) {
        return 'info'
      }
    }

    return null
  }

  /**
   * Check section percentage threshold
   */
  checkSectionThreshold(section: MetricSection, percentage: number): ThresholdLevel | null {
    const config = this.settings.sectionPercentage[section]

    if (!config.enabled) {
      return null
    }

    if (config.critical !== undefined && percentage >= config.critical) {
      return 'critical'
    }
    if (config.warning !== undefined && percentage >= config.warning) {
      return 'warning'
    }
    if (config.info !== undefined && percentage >= config.info) {
      return 'info'
    }

    return null
  }

  /**
   * Get model-specific limits
   */
  getModelLimits(model: SupportedModel): ModelLimits {
    return this.modelLimits[model]
  }

  /**
   * Check if token count exceeds model limits
   */
  checkModelLimit(model: SupportedModel, tokenCount: number): ThresholdLevel | null {
    const limits = this.getModelLimits(model)

    if (tokenCount >= limits.contextWindow) {
      return 'critical' // Exceeds context window
    }
    if (tokenCount >= limits.recommendedMax) {
      return 'warning' // Exceeds recommended maximum
    }
    if (tokenCount >= limits.conservativeThreshold) {
      return 'info' // Exceeds conservative threshold
    }

    return null
  }

  /**
   * Get all current threshold settings
   */
  getSettings(): ThresholdSettings {
    return JSON.parse(JSON.stringify(this.settings))
  }

  /**
   * Update threshold settings
   */
  updateSettings(updates: Partial<ThresholdSettings>): void {
    this.settings = this.mergeSettings(this.settings, updates)
  }

  /**
   * Reset to default settings
   */
  resetToDefaults(): void {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS))
  }

  /**
   * Create threshold settings from reporter config
   */
  static fromReporterConfig(config: TokenMetricsConfig): ThresholdSettings {
    const settings = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS))

    if (config.thresholds) {
      if (config.thresholds.totalTokens) {
        settings.totalTokens.warning = config.thresholds.totalTokens
        settings.totalTokens.critical = config.thresholds.totalTokens * 2
      }

      if (config.thresholds.perTestTokens) {
        settings.perTestTokens.warning = config.thresholds.perTestTokens
        settings.perTestTokens.critical = config.thresholds.perTestTokens * 2
      }

      if (config.thresholds.perFileTokens) {
        settings.perFileTokens.warning = config.thresholds.perFileTokens
        settings.perFileTokens.critical = config.thresholds.perFileTokens * 2
      }

      if (config.thresholds.sectionPercentage) {
        // Apply section percentage threshold to all sections
        const percentage = config.thresholds.sectionPercentage
        Object.keys(settings.sectionPercentage).forEach((section) => {
          const sectionKey = section as MetricSection
          if (settings.sectionPercentage[sectionKey].enabled) {
            settings.sectionPercentage[sectionKey].warning = percentage
            settings.sectionPercentage[sectionKey].critical = percentage * 1.5
          }
        })
      }
    }

    return settings
  }

  /**
   * Get human-readable threshold description
   */
  getThresholdDescription(metricType: keyof ThresholdSettings, section?: MetricSection): string {
    if (metricType === 'sectionPercentage' && section) {
      return this.settings.sectionPercentage[section].description || `${section} section percentage`
    }

    const config = this.settings[metricType as keyof Omit<ThresholdSettings, 'sectionPercentage'>]
    return config.description || metricType
  }

  /**
   * Merge threshold settings with defaults
   */
  public mergeSettings(
    base: ThresholdSettings,
    updates?: Partial<ThresholdSettings>
  ): ThresholdSettings {
    if (!updates) return base

    const result = JSON.parse(JSON.stringify(base))

    Object.keys(updates).forEach((key) => {
      const typedKey = key as keyof ThresholdSettings
      if (updates[typedKey] !== undefined) {
        if (typedKey === 'sectionPercentage') {
          Object.assign(result.sectionPercentage, updates.sectionPercentage)
        } else {
          Object.assign(result[typedKey], updates[typedKey])
        }
      }
    })

    return result
  }
}

/**
 * Default threshold manager instance
 */
let defaultManager: ThresholdManager | null = null

/**
 * Get or create default threshold manager
 */
export function getThresholdManager(customSettings?: Partial<ThresholdSettings>): ThresholdManager {
  if (!defaultManager) {
    defaultManager = new ThresholdManager(customSettings)
  }
  return defaultManager
}

/**
 * Reset default threshold manager (useful for testing)
 */
export function resetThresholdManager(): void {
  defaultManager = null
}

/**
 * Create model-aware thresholds based on model limits
 */
export function createModelAwareThresholds(
  model: SupportedModel,
  baseSettings?: Partial<ThresholdSettings>
): ThresholdSettings {
  const limits = MODEL_LIMITS[model]
  const settings = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS))

  // Adjust total tokens based on model limits
  settings.totalTokens.info = Math.floor(limits.conservativeThreshold * 0.25)
  settings.totalTokens.warning = Math.floor(limits.conservativeThreshold * 0.5)
  settings.totalTokens.critical = limits.conservativeThreshold

  // Adjust per-test tokens based on model limits
  settings.perTestTokens.info = Math.floor(limits.conservativeThreshold * 0.05)
  settings.perTestTokens.warning = Math.floor(limits.conservativeThreshold * 0.1)
  settings.perTestTokens.critical = Math.floor(limits.conservativeThreshold * 0.2)

  // Adjust per-file tokens based on model limits
  settings.perFileTokens.info = Math.floor(limits.conservativeThreshold * 0.15)
  settings.perFileTokens.warning = Math.floor(limits.conservativeThreshold * 0.3)
  settings.perFileTokens.critical = Math.floor(limits.conservativeThreshold * 0.6)

  if (baseSettings) {
    return new ThresholdManager().mergeSettings(settings, baseSettings)
  }

  return settings
}
