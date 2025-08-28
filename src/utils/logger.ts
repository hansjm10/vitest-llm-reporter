import createDebug from 'debug'

/**
 * Internal Debug Logger for vitest-llm-reporter
 *
 * This logger is exclusively for internal debugging of the reporter itself.
 * It does NOT process or log user test data, console.log outputs, or test results.
 *
 * Usage:
 * - Enable with: DEBUG=vitest:llm-reporter:* npm test
 * - Logs internal reporter operations like initialization, context extraction, etc.
 * - User test output is handled separately by ConsoleCapture/ConsoleBuffer
 *
 * Note: No redaction is needed since this logger never touches user data,
 * only internal reporter metadata (file paths, line numbers, options).
 */

/**
 * Factory for creating debug loggers with consistent namespacing
 */
export class LoggerFactory {
  private static debuggers = new Map<string, ReturnType<typeof createDebug>>()

  /**
   * Creates a debug logger with the specified namespace
   * @param namespace - The namespace for the logger (will be prefixed with vitest:llm-reporter:)
   * @returns A debug function
   */
  static create(namespace: string): ReturnType<typeof createDebug> {
    const fullNamespace = `vitest:llm-reporter:${namespace}`

    if (!this.debuggers.has(fullNamespace)) {
      this.debuggers.set(fullNamespace, createDebug(fullNamespace))
    }

    return this.debuggers.get(fullNamespace)!
  }

  /**
   * Clears all cached debuggers
   */
  static clear(): void {
    this.debuggers.clear()
  }
}

// Export convenience functions for common namespaces
export const createLogger = (namespace: string): ReturnType<typeof createDebug> =>
  LoggerFactory.create(namespace)

// Pre-defined loggers for common namespaces
export const coreLogger = (): ReturnType<typeof createDebug> => LoggerFactory.create('core')
export const extractionLogger = (): ReturnType<typeof createDebug> =>
  LoggerFactory.create('extraction')
export const securityLogger = (): ReturnType<typeof createDebug> => LoggerFactory.create('security')
export const errorLogger = (): ReturnType<typeof createDebug> => LoggerFactory.create('error')
