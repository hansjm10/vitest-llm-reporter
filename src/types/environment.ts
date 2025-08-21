/**
 * Environment Detection Type Definitions
 *
 * This file contains type definitions for environment detection capabilities,
 * including TTY detection and CI environment identification.
 *
 * @module environment-types
 */

/**
 * Information about detected CI environment
 */
export interface CIEnvironmentInfo {
  /** Whether we're running in a CI environment */
  isCI: boolean
  /** Name of the detected CI provider (if any) */
  provider?: string
  /** CI-specific environment details */
  details?: {
    /** Build/Job ID */
    buildId?: string
    /** Branch name */
    branch?: string
    /** Commit SHA */
    commit?: string
    /** Pull request number */
    pullRequest?: string
    /** Repository name */
    repository?: string
  }
}

/**
 * TTY (Terminal) capabilities information
 */
export interface TTYInfo {
  /** Whether stdout is connected to a TTY */
  stdout: boolean
  /** Whether stderr is connected to a TTY */
  stderr: boolean
  /** Whether any output stream is connected to a TTY */
  hasAnyTTY: boolean
  /** Whether both output streams are connected to TTY */
  hasFullTTY: boolean
}

/**
 * Complete environment information
 */
export interface EnvironmentInfo {
  /** TTY detection results */
  tty: TTYInfo
  /** CI environment detection results */
  ci: CIEnvironmentInfo
  /** Platform information */
  platform: {
    /** Operating system platform */
    os: string
    /** Node.js version */
    nodeVersion: string
    /** Whether we're in a headless environment */
    isHeadless: boolean
  }
  /** Detected capabilities */
  capabilities: {
    /** Can use ANSI color codes */
    supportsColor: boolean
    /** Can use interactive features */
    supportsInteractive: boolean
    /** Has access to terminal features */
    supportsTerminal: boolean
  }
}

/**
 * Environment detection options
 */
export interface EnvironmentDetectionOptions {
  /** Force specific TTY behavior (for testing) */
  forceTTY?: {
    stdout?: boolean
    stderr?: boolean
  }
  /** Force specific CI behavior (for testing) */
  forceCI?: boolean
  /** Additional environment variables to check */
  additionalEnvVars?: Record<string, string>
}
