/**
 * Output Mode Type Definitions
 *
 * This file contains type definitions for output mode selection and configuration.
 * The OutputModeSelector uses these types to coordinate between different output strategies.
 *
 * @module output-mode-types
 */

import type { FileOutputConfig } from '../output/strategies/FileOutputStrategy.js'
import type { ConsoleOutputConfig } from '../output/strategies/ConsoleOutputStrategy.js'
import type { DualOutputConfig } from '../output/strategies/DualOutputStrategy.js'

/**
 * Available output modes for the reporter
 */
export type OutputMode = 'file' | 'console' | 'dual' | 'stream'

/**
 * Output mode selection priorities
 */
export type OutputModeSelectionPriority = 'config' | 'environment' | 'fallback'

/**
 * Configuration source information
 */
export interface ConfigurationSource {
  /** How the configuration was determined */
  source: OutputModeSelectionPriority
  /** Reason for the selection */
  reason: string
  /** Whether this was a fallback decision */
  isFallback: boolean
}

/**
 * Output mode selection result
 */
export interface OutputModeSelection {
  /** Selected output mode */
  mode: OutputMode
  /** Configuration source information */
  source: ConfigurationSource
  /** Strategy-specific configuration based on selected mode */
  config: OutputModeConfig
}

/**
 * Union type for different output mode configurations
 */
export type OutputModeConfig = 
  | { mode: 'file'; config: FileOutputConfig }
  | { mode: 'console'; config: ConsoleOutputConfig }
  | { mode: 'dual'; config: DualOutputConfig }
  | { mode: 'stream'; config: StreamOutputConfig }

/**
 * Stream output configuration (placeholder for streaming functionality)
 */
export interface StreamOutputConfig {
  /** Enable real-time streaming */
  realTime?: boolean
  /** Buffer size for stream output */
  bufferSize?: number
  /** Stream target (console or file) */
  target?: 'console' | 'file'
  /** Additional stream-specific options */
  options?: {
    /** Flush interval in milliseconds */
    flushInterval?: number
    /** Maximum concurrent streams */
    maxConcurrentStreams?: number
  }
}

/**
 * Environment-based output preferences
 */
export interface EnvironmentOutputPreferences {
  /** Preferred mode in CI environments */
  ciMode: OutputMode
  /** Preferred mode with TTY available */
  ttyMode: OutputMode
  /** Preferred mode for headless environments */
  headlessMode: OutputMode
  /** Default fallback mode */
  fallbackMode: OutputMode
}

/**
 * Configuration for output mode selection behavior
 */
export interface OutputModeSelectionConfig {
  /** Override automatic mode selection */
  forcedMode?: OutputMode
  /** Custom environment preferences */
  environmentPreferences?: Partial<EnvironmentOutputPreferences>
  /** File output configuration */
  fileConfig?: FileOutputConfig
  /** Console output configuration */
  consoleConfig?: ConsoleOutputConfig
  /** Dual output configuration */
  dualConfig?: Omit<DualOutputConfig, 'file' | 'console'>
  /** Stream output configuration */
  streamConfig?: StreamOutputConfig
  /** Enable strict mode (fail if preferred mode unavailable) */
  strictMode?: boolean
  /** Enable fallback chain on failures */
  enableFallbackChain?: boolean
}

/**
 * Default environment preferences
 */
export const DEFAULT_ENVIRONMENT_PREFERENCES: EnvironmentOutputPreferences = {
  ciMode: 'file',
  ttyMode: 'console',
  headlessMode: 'file',
  fallbackMode: 'console'
}