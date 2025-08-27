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
} from './schema.js'

// Reporter configuration types
export type { LLMReporterConfig, TruncationConfig } from './reporter.js'

// Console types
export type {
  ConsoleMethod,
  ConsoleEntry,
  ConsoleBufferConfig,
  ConsoleCaptureConfig
} from './console.js'

// Extraction types
export type {
  NormalizedError,
  ErrorExtractionConfig,
  ExtractedTestCase,
  ExtractionConfig,
  ContextExtractionOptions
} from './extraction.js'

// Shared stack/asserion types now live in schema
export type { StackFrame, AssertionDetails } from './schema.js'

// Monitoring types
export type {
  MonitoringConfig,
  MonitoringMetrics,
  CacheStats,
  MemoryInfo,
  OperationRecord
} from './monitoring.js'

// Tokenization types
export type {
  TokenizationConfig,
  TokenizationResult,
  TokenEstimatorOptions
} from './tokenization.js'

// Internal reporter types
export type {
  CollectedTest,
  InternalState,
  TestBase,
  VitestSuite,
  TestCaseData
} from './reporter-internal.js'

// State types
export type { StateConfig, TestResults, ModuleTiming, StateSnapshot, TestStatistics } from './state.js'

// Vitest object types
export type { ExtractedError, VitestErrorContext } from './vitest-objects.js'
