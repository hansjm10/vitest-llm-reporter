/**
 * Terminal Capability Detection Utilities
 *
 * This module provides utilities for detecting terminal capabilities,
 * including color support, terminal dimensions, and Unicode support.
 *
 * @module terminal-utils
 */

import { createLogger } from './logger.js'

const logger = createLogger('terminal')

/**
 * Terminal color support levels
 */
export enum ColorLevel {
  None = 0,      // No color support
  Basic = 1,     // 16 colors
  Extended = 2,  // 256 colors  
  TrueColor = 3  // 16M colors (24-bit)
}

/**
 * Terminal size information
 */
export interface TerminalSize {
  /** Terminal width in columns */
  width: number
  /** Terminal height in rows */
  height: number
  /** Whether size was detected from actual terminal */
  isDetected: boolean
}

/**
 * Unicode support information
 */
export interface UnicodeSupport {
  /** Basic Unicode character support */
  basic: boolean
  /** Extended Unicode support (emojis, symbols) */
  extended: boolean
  /** Whether locale supports Unicode */
  locale: boolean
}

/**
 * Complete terminal capabilities information
 */
export interface TerminalCapabilities {
  /** Whether running in a TTY environment */
  isTTY: boolean
  /** Color support level */
  colorLevel: ColorLevel
  /** Whether color output is supported */
  supportsColor: boolean
  /** Terminal dimensions */
  size: TerminalSize
  /** Unicode support capabilities */
  unicode: UnicodeSupport
  /** Terminal type/emulator information */
  terminalType?: string
}

/**
 * Options for terminal capability detection
 */
export interface TerminalDetectionOptions {
  /** Force specific color level (for testing) */
  forceColorLevel?: ColorLevel
  /** Force specific TTY behavior (for testing) */
  forceTTY?: boolean
  /** Force specific terminal size (for testing) */
  forceSize?: { width: number; height: number }
  /** Additional environment variables to check */
  additionalEnvVars?: Record<string, string>
}

/**
 * Default terminal size for non-TTY environments
 */
const DEFAULT_TERMINAL_SIZE: TerminalSize = {
  width: 80,
  height: 24,
  isDetected: false
}

/**
 * Detects color support level based on environment variables and capabilities
 */
export function detectColorLevel(options?: TerminalDetectionOptions): ColorLevel {
  logger('Detecting color support level')

  const env = { ...process.env, ...options?.additionalEnvVars }

  // Allow forced color level for testing
  if (options?.forceColorLevel !== undefined) {
    logger('Using forced color level: %d', options.forceColorLevel)
    return options.forceColorLevel
  }

  // Check for explicit color disabling
  if (env.NO_COLOR !== undefined || env.NODE_DISABLE_COLORS === '1') {
    logger('Color explicitly disabled via NO_COLOR or NODE_DISABLE_COLORS')
    return ColorLevel.None
  }

  // Check for explicit color forcing
  if (env.FORCE_COLOR !== undefined) {
    const forceLevel = parseInt(env.FORCE_COLOR, 10)
    if (forceLevel >= 0 && forceLevel <= 3) {
      logger('Color forced via FORCE_COLOR: %d', forceLevel)
      return forceLevel as ColorLevel
    }
  }

  // Check if stdout is TTY
  const isTTY = options?.forceTTY ?? (process.stdout?.isTTY === true)
  if (!isTTY) {
    logger('Not a TTY, no color support')
    return ColorLevel.None
  }

  // Use Node.js built-in color detection if available
  if (typeof process.stdout.hasColors === 'function') {
    try {
      if (process.stdout.hasColors(16777216)) {
        logger('Detected true color support via hasColors()')
        return ColorLevel.TrueColor
      }
      if (process.stdout.hasColors(256)) {
        logger('Detected 256 color support via hasColors()')
        return ColorLevel.Extended
      }
      if (process.stdout.hasColors(16)) {
        logger('Detected basic color support via hasColors()')
        return ColorLevel.Basic
      }
    } catch (error) {
      logger('Error checking hasColors(): %s', error)
    }
  }

  // Fallback to TERM environment variable analysis
  const term = env.TERM?.toLowerCase() || ''
  
  // True color support
  if (term.includes('truecolor') || term.includes('24bit')) {
    logger('Detected true color support via TERM')
    return ColorLevel.TrueColor
  }

  // 256 color support
  if (term.includes('256') || term.includes('xterm-') || 
      term === 'screen' || term === 'tmux') {
    logger('Detected 256 color support via TERM')
    return ColorLevel.Extended
  }

  // Basic color support
  if (term.includes('color') || term === 'xterm' || 
      term === 'vt100' || term === 'ansi') {
    logger('Detected basic color support via TERM')
    return ColorLevel.Basic
  }

  // Check for known color-supporting terminals
  const colorTerm = env.COLORTERM?.toLowerCase()
  if (colorTerm === 'truecolor' || colorTerm === '24bit') {
    logger('Detected true color support via COLORTERM')
    return ColorLevel.TrueColor
  }

  // Default to basic if TTY but no clear indicators
  if (isTTY) {
    logger('TTY detected but unclear color support, defaulting to basic')
    return ColorLevel.Basic
  }

  logger('No color support detected')
  return ColorLevel.None
}

/**
 * Detects terminal dimensions
 */
export function detectTerminalSize(options?: TerminalDetectionOptions): TerminalSize {
  logger('Detecting terminal size')

  // Allow forced size for testing
  if (options?.forceSize) {
    logger('Using forced terminal size: %dx%d', options.forceSize.width, options.forceSize.height)
    return {
      width: options.forceSize.width,
      height: options.forceSize.height,
      isDetected: false
    }
  }

  // Try to get size from process.stdout
  try {
    const width = process.stdout.columns
    const height = process.stdout.rows

    if (typeof width === 'number' && width > 0 && 
        typeof height === 'number' && height > 0) {
      logger('Detected terminal size: %dx%d', width, height)
      return {
        width,
        height,
        isDetected: true
      }
    }
  } catch (error) {
    logger('Error detecting terminal size: %s', error)
  }

  // Fallback to environment variables
  const env = { ...process.env, ...options?.additionalEnvVars }
  const envColumns = parseInt(env.COLUMNS || '', 10)
  const envLines = parseInt(env.LINES || '', 10)

  if (envColumns > 0 && envLines > 0) {
    logger('Using terminal size from environment: %dx%d', envColumns, envLines)
    return {
      width: envColumns,
      height: envLines,
      isDetected: true
    }
  }

  // Return defaults for non-TTY environments
  logger('Using default terminal size: %dx%d', DEFAULT_TERMINAL_SIZE.width, DEFAULT_TERMINAL_SIZE.height)
  return { ...DEFAULT_TERMINAL_SIZE }
}

/**
 * Detects Unicode support capabilities
 */
export function detectUnicodeSupport(options?: TerminalDetectionOptions): UnicodeSupport {
  logger('Detecting Unicode support')

  const env = { ...process.env, ...options?.additionalEnvVars }

  // Check locale for Unicode support
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || ''
  const localeSupportsUnicode = /utf-?8/i.test(locale)

  // Platform-specific Unicode support detection
  const platform = process.platform
  let basicSupport = false
  let extendedSupport = false

  // Modern platforms generally support Unicode
  if (platform === 'darwin' || platform === 'linux') {
    basicSupport = true
    // Extended support depends on terminal capabilities
    extendedSupport = localeSupportsUnicode
  } else if (platform === 'win32') {
    // Windows 10+ has good Unicode support
    basicSupport = true
    extendedSupport = localeSupportsUnicode
  } else {
    // Conservative defaults for other platforms
    basicSupport = localeSupportsUnicode
    extendedSupport = false
  }

  // Check terminal type for Unicode hints
  const term = env.TERM?.toLowerCase() || ''
  if (term.includes('utf') || term.includes('unicode')) {
    basicSupport = true
    extendedSupport = true
  }

  const result: UnicodeSupport = {
    basic: basicSupport,
    extended: extendedSupport,
    locale: localeSupportsUnicode
  }

  logger('Unicode support detection result: %o', result)
  return result
}

/**
 * Detects complete terminal capabilities
 */
export function detectTerminalCapabilities(options?: TerminalDetectionOptions): TerminalCapabilities {
  logger('Starting terminal capabilities detection')

  const env = { ...process.env, ...options?.additionalEnvVars }
  const isTTY = options?.forceTTY ?? (process.stdout?.isTTY === true)
  
  const colorLevel = detectColorLevel(options)
  const size = detectTerminalSize(options)
  const unicode = detectUnicodeSupport(options)

  const result: TerminalCapabilities = {
    isTTY,
    colorLevel,
    supportsColor: colorLevel > ColorLevel.None,
    size,
    unicode,
    terminalType: env.TERM
  }

  logger('Terminal capabilities detection complete: %o', result)
  return result
}

/**
 * Checks if the current terminal supports color output
 */
export function supportsColor(capabilities?: TerminalCapabilities): boolean {
  const caps = capabilities ?? detectTerminalCapabilities()
  return caps.supportsColor
}

/**
 * Gets the color support level
 */
export function getColorLevel(capabilities?: TerminalCapabilities): ColorLevel {
  const caps = capabilities ?? detectTerminalCapabilities()
  return caps.colorLevel
}

/**
 * Checks if the current terminal supports Unicode
 */
export function supportsUnicode(capabilities?: TerminalCapabilities): boolean {
  const caps = capabilities ?? detectTerminalCapabilities()
  return caps.unicode.basic
}

/**
 * Checks if the current terminal supports extended Unicode (emojis, symbols)
 */
export function supportsExtendedUnicode(capabilities?: TerminalCapabilities): boolean {
  const caps = capabilities ?? detectTerminalCapabilities()
  return caps.unicode.extended
}

/**
 * Gets the terminal dimensions
 */
export function getTerminalSize(capabilities?: TerminalCapabilities): TerminalSize {
  const caps = capabilities ?? detectTerminalCapabilities()
  return caps.size
}