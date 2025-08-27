/**
 * Error context builder configuration
 */
export interface ErrorContextConfig {
  /** Maximum number of code lines to include */
  maxCodeLines?: number
  /** Whether to include line numbers in context */
  includeLineNumbers?: boolean
}

/**
 * Builder configuration
 */
export interface BuilderConfig {
  /** Whether to include suite information in results */
  includeSuite?: boolean
  /** Whether to include duration in passed/skipped tests */
  includeDuration?: boolean
  /** Root directory for repo-relative path conversion */
  rootDir?: string
  /** Whether to include absolute paths in output */
  includeAbsolutePaths?: boolean
}