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
export type {
  LLMReporterConfig,
  StreamingConfig,
  TruncationConfig
} from './reporter'

// Console types
export type {
  ConsoleMessage,
  ConsoleLevel,
  ConsoleCapture,
  ConsoleCaptureConfig
} from './console'

// Environment types
export type {
  EnvironmentInfo,
  SystemInfo,
  RuntimeInfo
} from './environment'

// Extraction types
export type {
  ExtractedContext,
  ExtractedError,
  ExtractedTestCase,
  ExtractionOptions
} from './extraction'

// Output mode types
export type {
  OutputMode,
  OutputModeConfig,
  OutputModeSelection
} from './output-modes'

// Internal reporter types
export type {
  InternalState,
  InternalConfig,
  InternalMetrics
} from './reporter-internal'

// State types
export type {
  ReporterState,
  TestState,
  SuiteState,
  FileState
} from './state'

// Vitest object types
export type {
  VitestFile,
  VitestSuite,
  VitestTask,
  VitestTest,
  VitestError
} from './vitest-objects'

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