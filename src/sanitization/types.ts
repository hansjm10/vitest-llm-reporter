/**
 * JSON sanitization configuration
 */
export interface JsonSanitizerConfig {
  /** Whether to sanitize file paths to remove user information */
  sanitizeFilePaths?: boolean
  /** Maximum depth for nested object sanitization */
  maxDepth?: number
}