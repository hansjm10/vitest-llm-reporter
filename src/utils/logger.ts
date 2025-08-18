import createDebug from 'debug'
import { format } from 'node:util'

/**
 * Factory for creating debug loggers with consistent namespacing and 
 * sensitive data sanitization
 */
export class LoggerFactory {
  private static debuggers = new Map<string, ReturnType<typeof createDebug>>()
  
  // Patterns for sensitive data that should be redacted
  private static sensitivePatterns = [
    // Passwords in various formats
    /password["\s]*[:=]\s*["']([^"']+)["']/gi,
    /pwd["\s]*[:=]\s*["']([^"']+)["']/gi,
    /pass["\s]*[:=]\s*["']([^"']+)["']/gi,
    
    // API keys and tokens
    /api[_-]?key["\s]*[:=]\s*["']([^"']+)["']/gi,
    /token["\s]*[:=]\s*["']([^"']+)["']/gi,
    /bearer\s+([A-Za-z0-9\-._~+\/]+=*)/gi,
    
    // Secret keys
    /secret["\s]*[:=]\s*["']([^"']+)["']/gi,
    /private[_-]?key["\s]*[:=]\s*["']([^"']+)["']/gi,
    
    // AWS credentials
    /aws[_-]?access[_-]?key[_-]?id["\s]*[:=]\s*["']([^"']+)["']/gi,
    /aws[_-]?secret[_-]?access[_-]?key["\s]*[:=]\s*["']([^"']+)["']/gi,
    
    // Database connection strings
    /(?:mongodb|postgres|mysql|redis):\/\/[^@]+@[^\s]+/gi,
  ]

  /**
   * Creates a debug logger with the specified namespace
   * @param namespace - The namespace for the logger (will be prefixed with vitest:llm-reporter:)
   * @returns A debug function that sanitizes sensitive data
   */
  static create(namespace: string): ReturnType<typeof createDebug> {
    const fullNamespace = `vitest:llm-reporter:${namespace}`
    
    if (!this.debuggers.has(fullNamespace)) {
      const debug = createDebug(fullNamespace)
      
      // Wrap the debug function with sanitization
      const secureDebug = (...args: unknown[]) => {
        const sanitized = args.map(arg => this.sanitize(arg))
        return debug(...sanitized as [any, ...any[]])
      }
      
      // Copy over debug properties
      Object.setPrototypeOf(secureDebug, debug)
      Object.assign(secureDebug, debug)
      
      this.debuggers.set(fullNamespace, secureDebug as ReturnType<typeof createDebug>)
    }
    
    return this.debuggers.get(fullNamespace)!
  }

  /**
   * Sanitizes a value by redacting sensitive information
   */
  private static sanitize(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value)
    }
    
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value)
    }
    
    return value
  }

  /**
   * Sanitizes a string by redacting sensitive patterns
   */
  private static sanitizeString(str: string): string {
    let result = str
    
    for (const pattern of this.sensitivePatterns) {
      result = result.replace(pattern, (match) => {
        // Keep the key part but redact the value
        const keyMatch = match.match(/^[^:=]+[:=]/)
        if (keyMatch) {
          return keyMatch[0] + '[REDACTED]'
        }
        return '[REDACTED]'
      })
    }
    
    return result
  }

  /**
   * Sanitizes an object by redacting sensitive keys and values
   */
  private static sanitizeObject(obj: unknown, visited = new WeakSet()): unknown {
    // Handle circular references
    if (visited.has(obj as object)) {
      return '[Circular]'
    }
    
    visited.add(obj as object)
    
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item))
    }
    
    // Handle errors specially to preserve stack traces
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: this.sanitizeString(obj.message),
        stack: obj.stack ? this.sanitizeString(obj.stack) : undefined
      }
    }
    
    // Handle plain objects
    if (obj?.constructor === Object) {
      const result: Record<string, unknown> = {}
      
      for (const [key, value] of Object.entries(obj)) {
        // Check if the key itself suggests sensitive data
        const lowerKey = key.toLowerCase()
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('api_key')
        ) {
          result[key] = '[REDACTED]'
        } else {
          result[key] = this.sanitize(value)
        }
      }
      
      return result
    }
    
    // Return other objects as-is (Date, RegExp, etc.)
    return obj
  }

  /**
   * Clears all cached debuggers
   */
  static clear(): void {
    this.debuggers.clear()
  }
}

// Export convenience functions for common namespaces
export const createLogger = (namespace: string) => LoggerFactory.create(namespace)

// Pre-defined loggers for common namespaces
export const coreLogger = () => LoggerFactory.create('core')
export const extractionLogger = () => LoggerFactory.create('extraction')
export const processorLogger = () => LoggerFactory.create('processor')
export const builderLogger = () => LoggerFactory.create('builder')
export const outputLogger = () => LoggerFactory.create('output')
export const stateLogger = () => LoggerFactory.create('state')
export const validationLogger = () => LoggerFactory.create('validation')
export const securityLogger = () => LoggerFactory.create('security')
export const errorLogger = () => LoggerFactory.create('error')
export const perfLogger = () => LoggerFactory.create('perf')