/**
 * Validation configuration options
 * All values are optional and will use defaults if not specified
 */
export interface ValidationConfig {
  maxCodeLines?: number
  maxTotalCodeSize?: number
  maxStringLength?: number
  maxFailures?: number
  maxPassed?: number
  maxSkipped?: number
  minLineNumber?: number
  minColumnNumber?: number
  minDuration?: number
}

/**
 * Detailed validation error with path information
 */
export interface ValidationError {
  path: string
  message: string
  value?: unknown
}

import type { LLMReporterOutput } from '../types/schema.js'

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  data?: LLMReporterOutput
}