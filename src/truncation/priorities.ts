/**
 * Content priority definitions and priority management
 *
 * This module provides utilities for determining content priorities,
 * configuring priority rules, and managing truncation order based on content importance.
 */

import type { ContentTypeConfig } from './types.js'
import { ContentPriority, ContentType } from './types.js'

/**
 * Default priority configurations for different content types
 */
export const DEFAULT_CONTENT_TYPE_PRIORITIES: Record<ContentType, ContentTypeConfig> = {
  [ContentType.TEXT]: {
    type: ContentType.TEXT,
    defaultPriority: ContentPriority.MEDIUM,
    preserveStructure: false,
    maxTruncationPercent: 0.7
  },

  [ContentType.JSON]: {
    type: ContentType.JSON,
    defaultPriority: ContentPriority.HIGH,
    preserveStructure: true,
    preferredStrategies: ['json-smart', 'json-field-removal'],
    maxTruncationPercent: 0.5
  },

  [ContentType.CODE]: {
    type: ContentType.CODE,
    defaultPriority: ContentPriority.HIGH,
    preserveStructure: true,
    preferredStrategies: ['code-smart', 'comment-removal'],
    maxTruncationPercent: 0.4
  },

  [ContentType.ERROR]: {
    type: ContentType.ERROR,
    defaultPriority: ContentPriority.CRITICAL,
    preserveStructure: true,
    preferredStrategies: ['error-smart', 'stack-trace-truncation'],
    maxTruncationPercent: 0.2
  },

  [ContentType.TEST]: {
    type: ContentType.TEST,
    defaultPriority: ContentPriority.HIGH,
    preserveStructure: false,
    preferredStrategies: ['test-summary', 'test-details-removal'],
    maxTruncationPercent: 0.6
  },

  [ContentType.LOG]: {
    type: ContentType.LOG,
    defaultPriority: ContentPriority.LOW,
    preserveStructure: false,
    preferredStrategies: ['log-deduplication', 'log-level-filtering'],
    maxTruncationPercent: 0.8
  },

  [ContentType.MARKDOWN]: {
    type: ContentType.MARKDOWN,
    defaultPriority: ContentPriority.MEDIUM,
    preserveStructure: true,
    preferredStrategies: ['markdown-section-removal', 'markdown-smart'],
    maxTruncationPercent: 0.6
  }
}

/**
 * Priority weights for different types of content sections
 * Higher values = higher priority = less likely to be truncated
 */
export const SECTION_PRIORITY_WEIGHTS = {
  // Error and failure information
  error_messages: 100,
  stack_traces: 95,
  assertion_failures: 90,

  // Test structure and outcomes
  test_names: 85,
  test_results: 80,
  test_metadata: 70,

  // Code and implementation details
  source_code: 75,
  function_signatures: 85,
  import_statements: 60,
  comments: 30,

  // Logging and debugging
  error_logs: 80,
  warning_logs: 60,
  info_logs: 40,
  debug_logs: 20,

  // Documentation and descriptions
  summaries: 70,
  descriptions: 50,
  examples: 45,

  // Metadata and auxiliary information
  timestamps: 25,
  file_paths: 55,
  line_numbers: 40,
  configuration: 35
} as const

/**
 * Priority rules for content based on patterns and keywords
 */
export interface PriorityRule {
  /** Pattern to match content */
  pattern: RegExp | string
  /** Priority to assign if pattern matches */
  priority: ContentPriority
  /** Optional content type specificity */
  contentType?: ContentType
  /** Optional description of the rule */
  description?: string
}

/**
 * Default priority rules based on content patterns
 */
export const DEFAULT_PRIORITY_RULES: PriorityRule[] = [
  // Critical error patterns
  {
    pattern: /\b(error|exception|failed|failure|crash|panic)\b/i,
    priority: ContentPriority.CRITICAL,
    description: 'Error-related content'
  },

  // Test failure patterns
  {
    pattern: /\b(test.*failed|assertion.*failed|expect.*to)\b/i,
    priority: ContentPriority.CRITICAL,
    contentType: ContentType.TEST,
    description: 'Test failure information'
  },

  // Important code patterns
  {
    pattern: /\b(function|class|interface|type|export|import)\b/i,
    priority: ContentPriority.HIGH,
    contentType: ContentType.CODE,
    description: 'Important code structures'
  },

  // Warning patterns
  {
    pattern: /\b(warning|warn|deprecated|todo|fixme)\b/i,
    priority: ContentPriority.MEDIUM,
    description: 'Warning and maintenance notices'
  },

  // Debug and verbose patterns (lower priority)
  {
    pattern: /\b(debug|trace|verbose|log)\b/i,
    priority: ContentPriority.LOW,
    description: 'Debug and logging information'
  },

  // Timestamps and metadata (disposable)
  {
    pattern: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,
    priority: ContentPriority.DISPOSABLE,
    description: 'Timestamp information'
  }
]

/**
 * Priority manager for content evaluation and assignment
 */
export class PriorityManager {
  private contentTypeConfigs: Record<ContentType, ContentTypeConfig>
  private priorityRules: PriorityRule[]

  constructor(
    contentTypeConfigs?: Partial<Record<ContentType, ContentTypeConfig>>,
    priorityRules?: PriorityRule[]
  ) {
    this.contentTypeConfigs = {
      ...DEFAULT_CONTENT_TYPE_PRIORITIES,
      ...contentTypeConfigs
    }
    this.priorityRules = priorityRules || DEFAULT_PRIORITY_RULES
  }

  /**
   * Determine priority for content based on type and content analysis
   */
  determinePriority(content: string, contentType: ContentType): ContentPriority {
    // Start with default priority for content type
    let priority = this.contentTypeConfigs[contentType]?.defaultPriority || ContentPriority.MEDIUM

    // Apply priority rules to potentially upgrade priority
    for (const rule of this.priorityRules) {
      // Skip if rule is content-type specific and doesn't match
      if (rule.contentType && rule.contentType !== contentType) {
        continue
      }

      // Check if pattern matches
      const pattern = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern, 'i')

      if (pattern.test(content)) {
        // Use highest priority found
        if (rule.priority < priority) {
          priority = rule.priority
        }
      }
    }

    return priority
  }

  /**
   * Get content type configuration
   */
  getContentTypeConfig(contentType: ContentType): ContentTypeConfig {
    return this.contentTypeConfigs[contentType] || this.contentTypeConfigs[ContentType.TEXT]
  }

  /**
   * Calculate section priority weight
   */
  getSectionWeight(sectionType: keyof typeof SECTION_PRIORITY_WEIGHTS): number {
    return SECTION_PRIORITY_WEIGHTS[sectionType] || 50 // Default medium weight
  }

  /**
   * Add or update a priority rule
   */
  addPriorityRule(rule: PriorityRule): void {
    this.priorityRules.push(rule)
  }

  /**
   * Update content type configuration
   */
  updateContentTypeConfig(contentType: ContentType, config: Partial<ContentTypeConfig>): void {
    this.contentTypeConfigs[contentType] = {
      ...this.contentTypeConfigs[contentType],
      ...config
    }
  }

  /**
   * Get all priority rules
   */
  getPriorityRules(): PriorityRule[] {
    return [...this.priorityRules]
  }

  /**
   * Score content importance based on multiple factors
   */
  scoreContentImportance(
    content: string,
    contentType: ContentType,
    additionalFactors?: {
      fileImportance?: number // 0-1 scale
      contextRelevance?: number // 0-1 scale
      userSpecified?: boolean
    }
  ): number {
    const priority = this.determinePriority(content, contentType)
    const config = this.getContentTypeConfig(contentType)

    // Base score from priority (inverted since lower enum values = higher priority)
    let score = (6 - priority) * 20 // Scale 20-100

    // Adjust based on content type defaults
    if (config.defaultPriority === ContentPriority.CRITICAL) {
      score += 10
    }

    // Apply additional factors if provided
    if (additionalFactors) {
      if (additionalFactors.fileImportance) {
        score += additionalFactors.fileImportance * 20
      }

      if (additionalFactors.contextRelevance) {
        score += additionalFactors.contextRelevance * 15
      }

      if (additionalFactors.userSpecified) {
        score += 25 // Bonus for user-specified content
      }
    }

    return Math.min(100, Math.max(0, score))
  }
}

/**
 * Default priority manager instance
 */
export const defaultPriorityManager = new PriorityManager()

/**
 * Utility function to get content priority using default manager
 */
export function getContentPriority(content: string, contentType: ContentType): ContentPriority {
  return defaultPriorityManager.determinePriority(content, contentType)
}

/**
 * Utility function to check if content should be preserved based on priority
 */
export function shouldPreserveContent(
  priority: ContentPriority,
  truncationPressure: number
): boolean {
  // truncationPressure: 0 = no pressure, 1 = maximum pressure
  const preservationThreshold = {
    [ContentPriority.CRITICAL]: 0.95, // Preserve unless extreme pressure
    [ContentPriority.HIGH]: 0.8, // Preserve under moderate pressure
    [ContentPriority.MEDIUM]: 0.6, // Preserve under light pressure
    [ContentPriority.LOW]: 0.3, // Only preserve under minimal pressure
    [ContentPriority.DISPOSABLE]: 0.0 // Never preserve under pressure
  }

  return truncationPressure < preservationThreshold[priority]
}
