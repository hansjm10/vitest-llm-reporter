/**
 * Deduplication Module
 *
 * Main exports for the deduplication system
 *
 * @module deduplication
 */

// Core service
export { DeduplicationService, createDeduplicationService } from './DeduplicationService.js'

// Re-export types
export type {
  // Core interfaces
  IDeduplicationService,
  IPatternMatcher,
  IPatternExtractor,

  // Configuration
  DeduplicationConfig,
  DeduplicationStrategy,

  // Pattern types
  PatternType,
  SimilarityLevel,
  SimilarityScore,
  ExtractedPattern,
  PatternComponent,

  // Groups and references
  DeduplicationGroup,
  DeduplicationReference,
  DuplicateEntry,

  // Templates and compression
  FailureTemplate,
  TemplateVariable,
  CompressedOutput,
  CompressedGroup,
  CompressedReference,

  // Results and stats
  DeduplicationResult,
  DeduplicationStats,

  // Cache
  CacheEntry
} from '../types/deduplication.js'
