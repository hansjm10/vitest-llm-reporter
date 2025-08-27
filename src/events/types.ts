import type { TruncationConfig } from '../types/reporter.js'

/**
 * Event orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Whether to handle errors gracefully */
  gracefulErrorHandling?: boolean
  /** Whether to log errors to console */
  logErrors?: boolean
  /** Whether to capture console output for failing tests */
  captureConsoleOnFailure?: boolean
  /** Maximum bytes of console output to capture per test */
  maxConsoleBytes?: number
  /** Maximum lines of console output to capture per test */
  maxConsoleLines?: number
  /** Include debug/trace console output */
  includeDebugOutput?: boolean
  // Streaming removed - simplified implementation
  /** Truncation configuration */
  truncationConfig?: TruncationConfig
}
