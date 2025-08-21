/**
 * Deduplication Type Definitions
 *
 * This file contains type definitions for the deduplication system
 * that identifies and compresses similar test failures.
 *
 * @module deduplication-types
 */

/**
 * Pattern type for identifying similar failures
 */
export type PatternType = 'stack-trace' | 'error-message' | 'console-output' | 'assertion'

/**
 * Similarity threshold levels
 */
export type SimilarityLevel = 'exact' | 'high' | 'medium' | 'low'

/**
 * Deduplication strategy types
 */
export type DeduplicationStrategy = 'aggressive' | 'moderate' | 'conservative'

/**
 * Pattern matcher interface
 */
export interface IPatternMatcher {
  type: PatternType
  match(a: string, b: string): SimilarityScore
  extractSignature(text: string): string
  normalize(text: string): string
}

/**
 * Similarity score result
 */
export interface SimilarityScore {
  score: number // 0-1 where 1 is identical
  level: SimilarityLevel
  confidence: number // 0-1 confidence in the score
  details?: Record<string, unknown>
}

/**
 * Deduplication group representing similar failures
 */
export interface DeduplicationGroup {
  id: string
  signature: string
  pattern: PatternType
  count: number
  firstSeen: Date
  lastSeen: Date
  examples: DuplicateEntry[]
  template?: FailureTemplate
  references: string[] // Test IDs
}

/**
 * Individual duplicate entry
 */
export interface DuplicateEntry {
  testId: string
  testName: string
  filePath: string
  timestamp: Date
  errorMessage?: string
  stackTrace?: string
  consoleOutput?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Failure template for compression
 */
export interface FailureTemplate {
  id: string
  pattern: string
  variables: TemplateVariable[]
  commonElements: string[]
  differingElements: string[]
}

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string
  type: 'string' | 'number' | 'path' | 'line-number' | 'variable-name'
  examples: unknown[]
  position: number
}

/**
 * Reference to a deduplicated entry
 */
export interface DeduplicationReference {
  groupId: string
  templateId?: string
  variables?: Record<string, unknown>
  similarity: SimilarityScore
}

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  totalFailures: number
  uniqueFailures: number
  duplicateGroups: number
  compressionRatio: number
  patternDistribution: Record<PatternType, number>
  similarityDistribution: Record<SimilarityLevel, number>
  processingTime: number
  memoryUsed: number
}

/**
 * Deduplication configuration
 */
export interface DeduplicationConfig {
  enabled: boolean
  strategy: DeduplicationStrategy
  thresholds: {
    exact: number // Default: 1.0
    high: number // Default: 0.9
    medium: number // Default: 0.7
    low: number // Default: 0.5
  }
  patterns: {
    stackTrace: boolean
    errorMessage: boolean
    consoleOutput: boolean
    assertion: boolean
  }
  compression: {
    enabled: boolean
    minGroupSize: number // Minimum failures to create a group
    maxTemplateVariables: number
    preserveExamples: number // Number of examples to keep
  }
  performance: {
    maxConcurrent: number
    cacheSize: number
    timeout: number
  }
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  groups: DeduplicationGroup[]
  references: Map<string, DeduplicationReference>
  stats: DeduplicationStats
  compressedOutput?: CompressedOutput
}

/**
 * Compressed output format
 */
export interface CompressedOutput {
  version: string
  timestamp: Date
  groups: CompressedGroup[]
  references: CompressedReference[]
  metadata: {
    originalSize: number
    compressedSize: number
    compressionRatio: number
  }
}

/**
 * Compressed group representation
 */
export interface CompressedGroup {
  id: string
  pattern: PatternType
  template: string
  count: number
  examples: Array<{
    id: string
    vars: Record<string, unknown>
  }>
}

/**
 * Compressed reference
 */
export interface CompressedReference {
  testId: string
  groupId: string
  vars?: Record<string, unknown>
}

/**
 * Pattern extractor interface
 */
export interface IPatternExtractor {
  extract(text: string): ExtractedPattern
  compare(a: ExtractedPattern, b: ExtractedPattern): SimilarityScore
}

/**
 * Extracted pattern
 */
export interface ExtractedPattern {
  signature: string
  components: PatternComponent[]
  metadata: Record<string, unknown>
}

/**
 * Pattern component
 */
export interface PatternComponent {
  type: 'static' | 'dynamic'
  value: string
  weight: number
  position: number
}

/**
 * Deduplication cache entry
 */
export interface CacheEntry {
  key: string
  signature: string
  pattern: ExtractedPattern
  timestamp: number
}

/**
 * Deduplication service interface
 */
export interface IDeduplicationService {
  configure(config: Partial<DeduplicationConfig>): void
  process(failures: DuplicateEntry[]): DeduplicationResult
  addPattern(matcher: IPatternMatcher): void
  getStats(): DeduplicationStats
  reset(): void
}