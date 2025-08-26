/**
 * Type Definitions Index
 *
 * Central export point for all type definitions
 *
 * @module types
 */

// Schema types
export type {
  LLMReporterOutput,
  TestSummary,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext,
  AssertionValue
} from './schema'

// Reporter configuration types
export type { LLMReporterConfig, TruncationConfig } from './reporter'

// Console types
export type {
  ConsoleMethod,
  ConsoleEntry,
  ConsoleBufferConfig,
  ConsoleCaptureConfig
} from './console'

// Environment types
export type {
  CIEnvironmentInfo,
  TTYInfo,
  EnvironmentInfo,
  EnvironmentDetectionOptions
} from './environment'

// Extraction types
export type {
  NormalizedError,
  ErrorExtractionConfig,
  StackFrame,
  AssertionDetails,
  ExtractedTestCase,
  ExtractionConfig,
  ContextExtractionOptions
} from './extraction'

// Output mode types
export type { OutputMode, OutputModeConfig, OutputModeSelection } from './output-modes'

// Internal reporter types
export type {
  CollectedTest,
  InternalState,
  TestBase,
  VitestSuite,
  TestCaseData
} from './reporter-internal'

// State types
export type { StateConfig, TestResults, ModuleTiming, StateSnapshot, TestStatistics } from './state'

// Vitest object types
export type { ExtractedError, VitestErrorContext } from './vitest-objects'

// Deduplication types
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
} from './deduplication'
