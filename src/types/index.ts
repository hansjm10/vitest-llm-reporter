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
