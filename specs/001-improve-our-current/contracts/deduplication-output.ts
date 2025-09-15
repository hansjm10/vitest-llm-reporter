/**
 * Contract: Deduplication Output Format
 * Defines the output structure for deduplicated logs
 */

export interface DeduplicationMetadata {
  /**
   * Number of times this log appeared
   */
  count: number;

  /**
   * ISO timestamp of first occurrence
   */
  firstSeen: string;

  /**
   * ISO timestamp of last occurrence
   */
  lastSeen?: string;

  /**
   * Test IDs that generated this log (if configured)
   */
  sources?: string[];

  /**
   * Flag indicating this entry was deduplicated
   */
  deduplicated: boolean;
}

export interface ConsoleOutputWithDeduplication {
  /**
   * The log message content
   */
  message: string;

  /**
   * Log severity level
   */
  level: string;

  /**
   * Standard timestamp
   */
  timestamp: string;

  /**
   * Deduplication metadata (if applicable)
   */
  deduplication?: DeduplicationMetadata;
}

export interface TestResultWithDeduplication {
  /**
   * Test identification
   */
  testId: string;
  testName: string;
  
  /**
   * Test outcome
   */
  status: 'passed' | 'failed' | 'skipped';
  
  /**
   * Console output with deduplication
   */
  console?: ConsoleOutputWithDeduplication[];
  
  /**
   * Summary of deduplication for this test
   */
  deduplicationSummary?: {
    totalLogs: number;
    uniqueLogs: number;
    duplicatesRemoved: number;
  };
}