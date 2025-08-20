import type { ConsoleMethod } from '../types/console'
import { createLogger } from '../utils/logger'

/**
 * Console Interceptor
 *
 * Manages the low-level patching and unpatching of console methods.
 * Provides error boundaries to ensure console methods never break.
 *
 * @module utils/console-interceptor
 */

export type ConsoleInterceptHandler = (method: ConsoleMethod, args: unknown[]) => void
export type ConsoleFunction = (...args: unknown[]) => void

// Console target is the actual console object implementing our subset of methods
// Using globalThis.Console for the type definition to match the global interface
type ConsoleTarget = Pick<typeof globalThis.console, ConsoleMethod>

/**
 * Handles the patching and restoration of console methods using Vitest spies
 */
export class ConsoleInterceptor {
  private originals = new Map<ConsoleMethod, ConsoleFunction>()
  private isPatched = false
  private debug = createLogger('console-interceptor')
  private readonly target: ConsoleTarget

  constructor(target?: ConsoleTarget) {
    // Default to the real global console so patching affects actual runtime behavior
    this.target = target ?? (globalThis.console as ConsoleTarget)
  }

  /**
   * Check if console is currently patched
   */
  get patched(): boolean {
    return this.isPatched
  }

  /**
   * Patch a specific console method with an interceptor
   */
  patch(method: ConsoleMethod, interceptor: ConsoleInterceptHandler): void {
    if (this.originals.has(method)) {
      this.debug('Method %s already patched', method)
      return
    }

    const original = this.target[method]

    if (typeof original !== 'function') {
      this.debug('Console method %s is not a function; skipping patch', method)
      return
    }

    // Wrap the original method
    const wrapped: ConsoleFunction = (...args: unknown[]) => {
      // First, try to run the interceptor
      try {
        interceptor(method, args)
      } catch (error) {
        // Log interception errors silently
        try {
          this.debug('Console interception error for %s: %s', method, error)
        } catch {
          // Ignore debug logging errors
        }
      }

      // Also wrap the original method call to prevent test crashes
      try {
        return Reflect.apply(original as ConsoleFunction, this.target, args)
      } catch (originalError) {
        // If original console fails (e.g., closed stream), silently continue
        // This prevents test crashes from console issues
        try {
          this.debug('Original console.%s failed: %s', method, originalError)
        } catch {
          // Ignore debug logging errors
        }
        // Return undefined to match console method behavior
        return undefined
      }
    }

    // Save original and replace
    this.originals.set(method, original as ConsoleFunction)
    ;(this.target as Record<ConsoleMethod, ConsoleFunction>)[method] = wrapped
    this.debug('Patched console.%s', method)
  }

  /**
   * Patch multiple console methods at once
   */
  patchAll(methods: ConsoleMethod[], interceptor: ConsoleInterceptHandler): void {
    for (const method of methods) {
      this.patch(method, interceptor)
    }
    this.isPatched = true
  }

  /**
   * Unpatch a specific console method
   */
  unpatch(method: ConsoleMethod): void {
    const original = this.originals.get(method)
    if (original) {
      ;(this.target as Record<ConsoleMethod, ConsoleFunction>)[method] = original
      this.originals.delete(method)
      this.debug('Unpatched console.%s', method)
    }
  }

  /**
   * Unpatch all console methods
   */
  unpatchAll(): void {
    for (const [method, original] of this.originals) {
      ;(this.target as Record<ConsoleMethod, ConsoleFunction>)[method] = original
    }
    this.originals.clear()
    this.isPatched = false
    this.debug('Unpatched all console methods')
  }

  /**
   * Check if a specific method is patched
   *
   * @param method - The console method to check
   * @returns True if the method is currently patched, false otherwise
   */
  isMethodPatched(method: ConsoleMethod): boolean {
    return this.originals.has(method)
  }
}
