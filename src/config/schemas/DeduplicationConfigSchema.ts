/**
 * Deduplication Configuration Schema
 *
 * Schema definitions and validation for deduplication configuration
 *
 * @module DeduplicationConfigSchema
 */

import type {
  DeduplicationConfig,
  DeduplicationStrategy,
  PatternType
} from '../../types/deduplication'

/**
 * Default deduplication configuration
 */
export const DEFAULT_DEDUPLICATION_CONFIG: DeduplicationConfig = {
  enabled: false,
  strategy: 'moderate',
  thresholds: {
    exact: 1.0,
    high: 0.9,
    medium: 0.7,
    low: 0.5
  },
  patterns: {
    stackTrace: true,
    errorMessage: true,
    consoleOutput: true,
    assertion: true
  },
  compression: {
    enabled: true,
    minGroupSize: 2,
    maxTemplateVariables: 10,
    preserveExamples: 3
  },
  performance: {
    maxConcurrent: 10,
    cacheSize: 1000,
    timeout: 5000
  }
}

/**
 * Configuration validation rules
 */
export interface ValidationRule {
  field: string
  validate: (value: unknown) => boolean
  message: string
}

/**
 * Deduplication configuration validator
 */
export class DeduplicationConfigValidator {
  private rules: ValidationRule[] = [
    {
      field: 'strategy',
      validate: (value) => ['aggressive', 'moderate', 'conservative'].includes(value as string),
      message: 'Strategy must be one of: aggressive, moderate, conservative'
    },
    {
      field: 'thresholds.exact',
      validate: (value) => typeof value === 'number' && value === 1.0,
      message: 'Exact threshold must be 1.0'
    },
    {
      field: 'thresholds.high',
      validate: (value) => typeof value === 'number' && value >= 0.8 && value < 1.0,
      message: 'High threshold must be between 0.8 and 1.0'
    },
    {
      field: 'thresholds.medium',
      validate: (value) => typeof value === 'number' && value >= 0.5 && value < 0.8,
      message: 'Medium threshold must be between 0.5 and 0.8'
    },
    {
      field: 'thresholds.low',
      validate: (value) => typeof value === 'number' && value >= 0.0 && value < 0.5,
      message: 'Low threshold must be between 0.0 and 0.5'
    },
    {
      field: 'compression.minGroupSize',
      validate: (value) => typeof value === 'number' && value >= 2,
      message: 'Minimum group size must be at least 2'
    },
    {
      field: 'compression.maxTemplateVariables',
      validate: (value) => typeof value === 'number' && value > 0 && value <= 50,
      message: 'Max template variables must be between 1 and 50'
    },
    {
      field: 'compression.preserveExamples',
      validate: (value) => typeof value === 'number' && value >= 1 && value <= 10,
      message: 'Preserve examples must be between 1 and 10'
    },
    {
      field: 'performance.maxConcurrent',
      validate: (value) => typeof value === 'number' && value > 0 && value <= 100,
      message: 'Max concurrent must be between 1 and 100'
    },
    {
      field: 'performance.cacheSize',
      validate: (value) => typeof value === 'number' && value >= 0 && value <= 10000,
      message: 'Cache size must be between 0 and 10000'
    },
    {
      field: 'performance.timeout',
      validate: (value) => typeof value === 'number' && value >= 100 && value <= 60000,
      message: 'Timeout must be between 100ms and 60000ms'
    }
  ]

  /**
   * Validate a configuration object
   */
  validate(config: Partial<DeduplicationConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const rule of this.rules) {
      const value = this.getNestedValue(config, rule.field)
      if (value !== undefined && !rule.validate(value)) {
        errors.push(rule.message)
      }
    }

    // Validate threshold ordering
    if (config.thresholds) {
      const { high, medium, low } = config.thresholds
      if (high !== undefined && medium !== undefined && high <= medium) {
        errors.push('High threshold must be greater than medium threshold')
      }
      if (medium !== undefined && low !== undefined && medium <= low) {
        errors.push('Medium threshold must be greater than low threshold')
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): unknown {
    const keys = path.split('.')
    let value = obj

    for (const key of keys) {
      if (value === undefined || value === null) {
        return undefined
      }
      value = value[key]
    }

    return value
  }

  /**
   * Merge configuration with defaults
   */
  static mergeWithDefaults(config?: Partial<DeduplicationConfig>): DeduplicationConfig {
    if (!config) {
      return { ...DEFAULT_DEDUPLICATION_CONFIG }
    }

    return {
      enabled: config.enabled ?? DEFAULT_DEDUPLICATION_CONFIG.enabled,
      strategy: config.strategy ?? DEFAULT_DEDUPLICATION_CONFIG.strategy,
      thresholds: {
        ...DEFAULT_DEDUPLICATION_CONFIG.thresholds,
        ...config.thresholds
      },
      patterns: {
        ...DEFAULT_DEDUPLICATION_CONFIG.patterns,
        ...config.patterns
      },
      compression: {
        ...DEFAULT_DEDUPLICATION_CONFIG.compression,
        ...config.compression
      },
      performance: {
        ...DEFAULT_DEDUPLICATION_CONFIG.performance,
        ...config.performance
      }
    }
  }

  /**
   * Create configuration from environment variables
   */
  static fromEnv(): Partial<DeduplicationConfig> {
    const config: Partial<DeduplicationConfig> = {}

    // Check for deduplication enabled
    if (process.env.VITEST_DEDUP_ENABLED) {
      config.enabled = process.env.VITEST_DEDUP_ENABLED === 'true'
    }

    // Check for strategy
    if (process.env.VITEST_DEDUP_STRATEGY) {
      config.strategy = process.env.VITEST_DEDUP_STRATEGY as DeduplicationStrategy
    }

    // Check for thresholds
    if (process.env.VITEST_DEDUP_THRESHOLD_HIGH) {
      config.thresholds = config.thresholds || { ...DEFAULT_DEDUPLICATION_CONFIG.thresholds }
      config.thresholds.high = parseFloat(process.env.VITEST_DEDUP_THRESHOLD_HIGH)
    }

    if (process.env.VITEST_DEDUP_THRESHOLD_MEDIUM) {
      config.thresholds = config.thresholds || { ...DEFAULT_DEDUPLICATION_CONFIG.thresholds }
      config.thresholds.medium = parseFloat(process.env.VITEST_DEDUP_THRESHOLD_MEDIUM)
    }

    if (process.env.VITEST_DEDUP_THRESHOLD_LOW) {
      config.thresholds = config.thresholds || { ...DEFAULT_DEDUPLICATION_CONFIG.thresholds }
      config.thresholds.low = parseFloat(process.env.VITEST_DEDUP_THRESHOLD_LOW)
    }

    // Check for compression settings
    if (process.env.VITEST_DEDUP_COMPRESSION_ENABLED) {
      config.compression = config.compression || { ...DEFAULT_DEDUPLICATION_CONFIG.compression }
      config.compression.enabled = process.env.VITEST_DEDUP_COMPRESSION_ENABLED === 'true'
    }

    if (process.env.VITEST_DEDUP_MIN_GROUP_SIZE) {
      config.compression = config.compression || { ...DEFAULT_DEDUPLICATION_CONFIG.compression }
      config.compression.minGroupSize = parseInt(process.env.VITEST_DEDUP_MIN_GROUP_SIZE, 10)
    }

    // Check for performance settings
    if (process.env.VITEST_DEDUP_CACHE_SIZE) {
      config.performance = config.performance || { ...DEFAULT_DEDUPLICATION_CONFIG.performance }
      config.performance.cacheSize = parseInt(process.env.VITEST_DEDUP_CACHE_SIZE, 10)
    }

    if (process.env.VITEST_DEDUP_TIMEOUT) {
      config.performance = config.performance || { ...DEFAULT_DEDUPLICATION_CONFIG.performance }
      config.performance.timeout = parseInt(process.env.VITEST_DEDUP_TIMEOUT, 10)
    }

    return config
  }
}

/**
 * Configuration presets for common use cases
 */
export const DEDUPLICATION_PRESETS = {
  /**
   * Aggressive deduplication - finds more duplicates with lower thresholds
   */
  aggressive: {
    strategy: 'aggressive' as DeduplicationStrategy,
    thresholds: {
      exact: 1.0,
      high: 0.85,
      medium: 0.6,
      low: 0.4
    },
    compression: {
      enabled: true,
      minGroupSize: 2,
      maxTemplateVariables: 15,
      preserveExamples: 2
    }
  },

  /**
   * Conservative deduplication - only groups very similar failures
   */
  conservative: {
    strategy: 'conservative' as DeduplicationStrategy,
    thresholds: {
      exact: 1.0,
      high: 0.95,
      medium: 0.8,
      low: 0.6
    },
    compression: {
      enabled: true,
      minGroupSize: 3,
      maxTemplateVariables: 5,
      preserveExamples: 5
    }
  },

  /**
   * Performance optimized - balanced for speed
   */
  performance: {
    strategy: 'moderate' as DeduplicationStrategy,
    patterns: {
      stackTrace: true,
      errorMessage: true,
      consoleOutput: false, // Disable console output matching for speed
      assertion: true
    },
    performance: {
      maxConcurrent: 20,
      cacheSize: 2000,
      timeout: 2000
    }
  },

  /**
   * Maximum compression - aggressive grouping and minimal examples
   */
  maxCompression: {
    strategy: 'aggressive' as DeduplicationStrategy,
    thresholds: {
      exact: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.3
    },
    compression: {
      enabled: true,
      minGroupSize: 2,
      maxTemplateVariables: 20,
      preserveExamples: 1
    }
  }
}

/**
 * Get a preset configuration
 */
export function getPreset(name: keyof typeof DEDUPLICATION_PRESETS): Partial<DeduplicationConfig> {
  return DEDUPLICATION_PRESETS[name] || {}
}
