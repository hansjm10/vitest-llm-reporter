/**
 * Token Metrics Data Structures
 * 
 * Defines the hierarchical structure for token metrics collection
 * and tracking throughout the testing process.
 */

import type { SupportedModel } from '../types.js';

/**
 * Section identifiers for different parts of test output
 */
export type MetricSection = 
  | 'summary'
  | 'testCases' 
  | 'failures'
  | 'context'
  | 'console'
  | 'metadata'
  | 'total';

/**
 * Token count data for a specific section
 */
export interface SectionTokens {
  /** Number of tokens in this section */
  count: number;
  /** Model used for counting */
  model: SupportedModel;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Timestamp of measurement */
  timestamp: number;
  /** Optional details about the content */
  details?: {
    /** Size of content in characters */
    characterCount?: number;
    /** Number of lines */
    lineCount?: number;
    /** Content type description */
    contentType?: string;
  };
}

/**
 * Token metrics for a single test case
 */
export interface TestTokenMetrics {
  /** Test identifier */
  testId: string;
  /** Test name/title */
  testName: string;
  /** Test file path */
  filePath: string;
  /** Test status */
  status: 'passed' | 'failed' | 'skipped';
  /** Token counts by section */
  sections: Record<MetricSection, SectionTokens>;
  /** Total tokens for this test */
  totalTokens: number;
  /** Test execution duration in ms */
  duration: number;
  /** Collection timestamp */
  collectedAt: number;
}

/**
 * Token metrics for a test file
 */
export interface FileTokenMetrics {
  /** File path */
  filePath: string;
  /** All test metrics in this file */
  tests: TestTokenMetrics[];
  /** Aggregated section totals for file */
  sections: Record<MetricSection, SectionTokens>;
  /** Total tokens for entire file */
  totalTokens: number;
  /** Number of tests in file by status */
  testCounts: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** File processing duration in ms */
  duration: number;
  /** Collection timestamp */
  collectedAt: number;
}

/**
 * Overall token metrics summary
 */
export interface TokenMetricsSummary {
  /** Total tokens across all tests */
  totalTokens: number;
  /** Tokens by section across all tests */
  sections: Record<MetricSection, SectionTokens>;
  /** Test counts by status */
  testCounts: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** File counts */
  fileCounts: {
    total: number;
    withFailures: number;
    withSkipped: number;
  };
  /** Model used for counting */
  model: SupportedModel;
  /** Collection start time */
  startTime: number;
  /** Collection end time */
  endTime: number;
  /** Total collection duration in ms */
  duration: number;
  /** Average tokens per test */
  averageTokensPerTest: number;
  /** Average tokens per failed test */
  averageTokensPerFailure: number;
  /** Largest test by token count */
  largestTest?: {
    testId: string;
    testName: string;
    filePath: string;
    tokenCount: number;
  };
  /** Most token-heavy section */
  heaviestSection?: {
    section: MetricSection;
    tokenCount: number;
    percentage: number;
  };
}

/**
 * Complete token metrics collection
 */
export interface TokenMetrics {
  /** Overall summary */
  summary: TokenMetricsSummary;
  /** Metrics by file */
  files: FileTokenMetrics[];
  /** Collection metadata */
  metadata: {
    /** Version of metrics collector */
    version: string;
    /** Configuration used */
    config: TokenMetricsConfig;
    /** Collection environment */
    environment: {
      nodeVersion: string;
      platform: string;
      timestamp: string;
    };
  };
}

/**
 * Configuration for token metrics collection
 */
export interface TokenMetricsConfig {
  /** Whether metrics collection is enabled */
  enabled: boolean;
  /** Model to use for token counting */
  model: SupportedModel;
  /** Whether to track per-section metrics */
  trackSections: boolean;
  /** Whether to include passed tests in metrics */
  includePassedTests: boolean;
  /** Whether to include skipped tests in metrics */
  includeSkippedTests: boolean;
  /** Maximum content size to tokenize (bytes) */
  maxContentSize: number;
  /** Whether to use batch processing */
  enableBatching: boolean;
  /** Warning thresholds */
  thresholds: {
    /** Warn if total tokens exceed this */
    totalTokens?: number;
    /** Warn if any test exceeds this */
    perTestTokens?: number;
    /** Warn if any file exceeds this */
    perFileTokens?: number;
    /** Warn if any section exceeds this percentage */
    sectionPercentage?: number;
  };
}

/**
 * Metric collection context
 */
export interface MetricsContext {
  /** Test run identifier */
  runId: string;
  /** Start time of test run */
  startTime: number;
  /** Configuration being used */
  config: TokenMetricsConfig;
  /** Current state */
  state: 'initializing' | 'collecting' | 'aggregating' | 'complete' | 'error';
  /** Error information if state is 'error' */
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Real-time metrics update event
 */
export interface MetricsUpdateEvent {
  /** Event type */
  type: 'test-complete' | 'file-complete' | 'collection-complete' | 'warning' | 'error';
  /** Event timestamp */
  timestamp: number;
  /** Event data specific to type */
  data: TestTokenMetrics | FileTokenMetrics | TokenMetricsSummary | MetricsWarning | MetricsError;
}

/**
 * Warning issued by metrics system
 */
export interface MetricsWarning {
  /** Warning type */
  type: 'threshold-exceeded' | 'content-truncated' | 'tokenization-failed' | 'performance';
  /** Warning message */
  message: string;
  /** Warning severity */
  severity: 'low' | 'medium' | 'high';
  /** Context data */
  context: {
    /** Associated test ID if applicable */
    testId?: string;
    /** Associated file path if applicable */
    filePath?: string;
    /** Metric section if applicable */
    section?: MetricSection;
    /** Threshold value if applicable */
    threshold?: number;
    /** Actual value if applicable */
    actual?: number;
  };
  /** Warning timestamp */
  timestamp: number;
}

/**
 * Error in metrics collection
 */
export interface MetricsError {
  /** Error type */
  type: 'tokenization-error' | 'aggregation-error' | 'config-error' | 'system-error';
  /** Error message */
  message: string;
  /** Error stack trace */
  stack?: string;
  /** Error code */
  code?: string;
  /** Context data */
  context: {
    /** Associated test ID if applicable */
    testId?: string;
    /** Associated file path if applicable */
    filePath?: string;
    /** Operation being performed */
    operation?: string;
    /** Input data size if applicable */
    inputSize?: number;
  };
  /** Error timestamp */
  timestamp: number;
}

/**
 * Metrics collection statistics
 */
export interface MetricsStats {
  /** Number of tests processed */
  testsProcessed: number;
  /** Number of files processed */
  filesProcessed: number;
  /** Number of tokenization operations */
  tokenizationOperations: number;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Total processing time in ms */
  processingTime: number;
  /** Average processing time per test in ms */
  averageProcessingTime: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Warnings issued */
  warningsCount: number;
  /** Errors encountered */
  errorsCount: number;
}

/**
 * Metrics export options
 */
export interface MetricsExportOptions {
  /** Include individual test metrics */
  includeTests: boolean;
  /** Include file-level aggregations */
  includeFiles: boolean;
  /** Include summary data */
  includeSummary: boolean;
  /** Include metadata */
  includeMetadata: boolean;
  /** Include collection statistics */
  includeStats: boolean;
  /** Include warnings and errors */
  includeIssues: boolean;
  /** Format for export */
  format: 'json' | 'jsonl' | 'csv' | 'markdown';
  /** Pretty print JSON */
  prettyPrint: boolean;
}