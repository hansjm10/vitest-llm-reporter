/**
 * Deduplication Service
 *
 * Core service that identifies and groups similar test failures
 * to reduce redundancy in test output.
 *
 * @module DeduplicationService
 */

import type {
  IDeduplicationService,
  DeduplicationConfig,
  DeduplicationResult,
  DeduplicationStats,
  DeduplicationGroup,
  DeduplicationReference,
  DuplicateEntry,
  IPatternMatcher,
  PatternType,
  SimilarityScore,
  SimilarityLevel,
  CompressedOutput,
  CompressedGroup,
  CompressedReference
} from '../types/deduplication'

/**
 * Default configuration for deduplication
 */
const DEFAULT_CONFIG: DeduplicationConfig = {
  enabled: true,
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
 * Main deduplication service implementation
 */
export class DeduplicationService implements IDeduplicationService {
  private config: DeduplicationConfig
  private patternMatchers: Map<PatternType, IPatternMatcher>
  private cache: Map<string, string> // Cache for signatures
  private stats: DeduplicationStats
  private groups: Map<string, DeduplicationGroup>

  constructor(config?: Partial<DeduplicationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.patternMatchers = new Map()
    this.cache = new Map()
    this.groups = new Map()
    this.stats = this.initializeStats()
  }

  /**
   * Configure the deduplication service
   */
  configure(config: Partial<DeduplicationConfig>): void {
    this.config = { ...this.config, ...config }
    this.reset()
  }

  /**
   * Process failures and identify duplicates
   */
  process(failures: DuplicateEntry[]): DeduplicationResult {
    const startTime = Date.now()
    this.stats.totalFailures = failures.length

    // Group failures by similarity
    const groups = this.groupFailures(failures)
    
    // Create references for each failure
    const references = this.createReferences(failures, groups)
    
    // Update statistics
    this.updateStats(groups, references, startTime)
    
    // Generate compressed output if enabled
    const compressedOutput = this.config.compression.enabled
      ? this.generateCompressedOutput(groups, references)
      : undefined

    return {
      groups: Array.from(groups.values()),
      references,
      stats: { ...this.stats },
      compressedOutput
    }
  }

  /**
   * Add a pattern matcher for a specific pattern type
   */
  addPattern(matcher: IPatternMatcher): void {
    this.patternMatchers.set(matcher.type, matcher)
  }

  /**
   * Get current statistics
   */
  getStats(): DeduplicationStats {
    return { ...this.stats }
  }

  /**
   * Reset the service state
   */
  reset(): void {
    this.cache.clear()
    this.groups.clear()
    this.stats = this.initializeStats()
  }

  /**
   * Group failures by similarity
   */
  private groupFailures(failures: DuplicateEntry[]): Map<string, DeduplicationGroup> {
    const groups = new Map<string, DeduplicationGroup>()
    const processed = new Set<string>()

    for (let i = 0; i < failures.length; i++) {
      const failure = failures[i]
      
      if (processed.has(failure.testId)) {
        continue
      }

      // Find similar failures
      const similarFailures = this.findSimilarFailures(failure, failures.slice(i + 1), processed)
      
      if (similarFailures.length >= this.config.compression.minGroupSize - 1) {
        // Create a new group
        const group = this.createGroup([failure, ...similarFailures])
        groups.set(group.id, group)
        
        // Mark all as processed
        processed.add(failure.testId)
        similarFailures.forEach(f => processed.add(f.testId))
      }
    }

    return groups
  }

  /**
   * Find failures similar to the given failure
   */
  private findSimilarFailures(
    target: DuplicateEntry,
    candidates: DuplicateEntry[],
    processed: Set<string>
  ): DuplicateEntry[] {
    const similar: DuplicateEntry[] = []
    const threshold = this.getThreshold()

    for (const candidate of candidates) {
      if (processed.has(candidate.testId)) {
        continue
      }

      const similarity = this.calculateSimilarity(target, candidate)
      if (similarity.score >= threshold) {
        similar.push(candidate)
      }
    }

    return similar
  }

  /**
   * Calculate similarity between two failures
   */
  private calculateSimilarity(a: DuplicateEntry, b: DuplicateEntry): SimilarityScore {
    const scores: SimilarityScore[] = []

    // Compare stack traces
    if (this.config.patterns.stackTrace && a.stackTrace && b.stackTrace) {
      const matcher = this.patternMatchers.get('stack-trace')
      if (matcher) {
        scores.push(matcher.match(a.stackTrace, b.stackTrace))
      }
    }

    // Compare error messages
    if (this.config.patterns.errorMessage && a.errorMessage && b.errorMessage) {
      const matcher = this.patternMatchers.get('error-message')
      if (matcher) {
        scores.push(matcher.match(a.errorMessage, b.errorMessage))
      }
    }

    // Compare console output
    if (this.config.patterns.consoleOutput && a.consoleOutput && b.consoleOutput) {
      const matcher = this.patternMatchers.get('console-output')
      if (matcher) {
        const aOutput = a.consoleOutput.join('\n')
        const bOutput = b.consoleOutput.join('\n')
        scores.push(matcher.match(aOutput, bOutput))
      }
    }

    // If no scores, return low similarity
    if (scores.length === 0) {
      return {
        score: 0,
        level: 'low',
        confidence: 0
      }
    }

    // Calculate weighted average
    const totalScore = scores.reduce((sum, s) => sum + s.score * s.confidence, 0)
    const totalConfidence = scores.reduce((sum, s) => sum + s.confidence, 0)
    const avgScore = totalConfidence > 0 ? totalScore / totalConfidence : 0

    return {
      score: avgScore,
      level: this.getLevel(avgScore),
      confidence: totalConfidence / scores.length
    }
  }

  /**
   * Create a deduplication group from similar failures
   */
  private createGroup(failures: DuplicateEntry[]): DeduplicationGroup {
    const id = this.generateGroupId(failures)
    const signature = this.generateSignature(failures[0])
    const pattern = this.detectPattern(failures[0])

    return {
      id,
      signature,
      pattern,
      count: failures.length,
      firstSeen: new Date(Math.min(...failures.map(f => f.timestamp.getTime()))),
      lastSeen: new Date(Math.max(...failures.map(f => f.timestamp.getTime()))),
      examples: failures.slice(0, this.config.compression.preserveExamples),
      references: failures.map(f => f.testId)
    }
  }

  /**
   * Create references for each failure to its group
   */
  private createReferences(
    failures: DuplicateEntry[],
    groups: Map<string, DeduplicationGroup>
  ): Map<string, DeduplicationReference> {
    const references = new Map<string, DeduplicationReference>()

    for (const group of groups.values()) {
      for (const testId of group.references) {
        const failure = failures.find(f => f.testId === testId)
        if (failure) {
          const similarity = this.calculateSimilarity(failure, group.examples[0])
          references.set(testId, {
            groupId: group.id,
            similarity
          })
        }
      }
    }

    return references
  }

  /**
   * Generate compressed output
   */
  private generateCompressedOutput(
    groups: Map<string, DeduplicationGroup>,
    references: Map<string, DeduplicationReference>
  ): CompressedOutput {
    const compressedGroups: CompressedGroup[] = []
    const compressedRefs: CompressedReference[] = []

    for (const group of groups.values()) {
      compressedGroups.push({
        id: group.id,
        pattern: group.pattern,
        template: group.signature,
        count: group.count,
        examples: group.examples.slice(0, 2).map(e => ({
          id: e.testId,
          vars: {}
        }))
      })
    }

    for (const [testId, ref] of references) {
      compressedRefs.push({
        testId,
        groupId: ref.groupId,
        vars: ref.variables
      })
    }

    const originalSize = JSON.stringify(groups).length + JSON.stringify(references).length
    const compressedSize = JSON.stringify(compressedGroups).length + JSON.stringify(compressedRefs).length

    return {
      version: '1.0.0',
      timestamp: new Date(),
      groups: compressedGroups,
      references: compressedRefs,
      metadata: {
        originalSize,
        compressedSize,
        compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1
      }
    }
  }

  /**
   * Update statistics
   */
  private updateStats(
    groups: Map<string, DeduplicationGroup>,
    references: Map<string, DeduplicationReference>,
    startTime: number
  ): void {
    this.stats.uniqueFailures = this.stats.totalFailures - references.size
    this.stats.duplicateGroups = groups.size
    this.stats.processingTime = Date.now() - startTime

    // Calculate compression ratio
    if (this.stats.totalFailures > 0) {
      this.stats.compressionRatio = 1 - (this.stats.uniqueFailures / this.stats.totalFailures)
    }

    // Update pattern distribution
    for (const group of groups.values()) {
      this.stats.patternDistribution[group.pattern] = 
        (this.stats.patternDistribution[group.pattern] || 0) + group.count
    }

    // Update similarity distribution
    for (const ref of references.values()) {
      this.stats.similarityDistribution[ref.similarity.level] = 
        (this.stats.similarityDistribution[ref.similarity.level] || 0) + 1
    }
  }

  /**
   * Get threshold based on strategy
   */
  private getThreshold(): number {
    switch (this.config.strategy) {
      case 'aggressive':
        return this.config.thresholds.low
      case 'conservative':
        return this.config.thresholds.high
      case 'moderate':
      default:
        return this.config.thresholds.medium
    }
  }

  /**
   * Get similarity level from score
   */
  private getLevel(score: number): SimilarityLevel {
    if (score >= this.config.thresholds.exact) return 'exact'
    if (score >= this.config.thresholds.high) return 'high'
    if (score >= this.config.thresholds.medium) return 'medium'
    return 'low'
  }

  /**
   * Generate a unique group ID
   */
  private generateGroupId(failures: DuplicateEntry[]): string {
    const signature = this.generateSignature(failures[0])
    return `group-${this.hashString(signature)}-${Date.now()}`
  }

  /**
   * Generate a signature for a failure
   */
  private generateSignature(failure: DuplicateEntry): string {
    const parts = []
    
    if (failure.errorMessage) {
      parts.push(this.normalizeText(failure.errorMessage))
    }
    
    if (failure.stackTrace) {
      const lines = failure.stackTrace.split('\n').slice(0, 3)
      parts.push(lines.map(l => this.normalizeText(l)).join('|'))
    }

    return parts.join(':')
  }

  /**
   * Detect the primary pattern type for a failure
   */
  private detectPattern(failure: DuplicateEntry): PatternType {
    if (failure.stackTrace) return 'stack-trace'
    if (failure.errorMessage) return 'error-message'
    if (failure.consoleOutput && failure.consoleOutput.length > 0) return 'console-output'
    return 'assertion'
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase()
  }

  /**
   * Simple hash function for strings
   */
  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): DeduplicationStats {
    return {
      totalFailures: 0,
      uniqueFailures: 0,
      duplicateGroups: 0,
      compressionRatio: 0,
      patternDistribution: {},
      similarityDistribution: {},
      processingTime: 0,
      memoryUsed: 0
    }
  }
}

/**
 * Factory function to create a deduplication service
 */
export function createDeduplicationService(
  config?: Partial<DeduplicationConfig>
): IDeduplicationService {
  return new DeduplicationService(config)
}