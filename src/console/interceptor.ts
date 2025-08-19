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
 * Handles the patching and restoration of console methods
 */
export class ConsoleInterceptor {
  private originalMethods = new Map<ConsoleMethod, ConsoleFunction>()
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
    if (this.originalMethods.has(method)) {
      this.debug('Method %s already patched', method)
      return
    }

    const original = this.target[method]

    if (typeof original !== 'function') {
      this.debug('Console method %s is not a function; skipping patch', method)
      return
    }

    this.originalMethods.set(method, original)

    // Create wrapped interceptor with error boundary
    const wrapper = (...args: unknown[]): void => {
      // Interceptor must NEVER break console functionality
      try {
        interceptor(method, args)
      } catch (error) {
        // Log interception errors but don't throw
        try {
          this.debug('Console interception error for %s: %s', method, error)
        } catch {
          // Even debug logging failed - silently continue
        }
      }

      // Always call the original method with preserved binding
      const originalFn: (...a: unknown[]) => unknown = original
      Reflect.apply(originalFn as (...a: unknown[]) => unknown, this.target, args)
    }

    // Assign the wrapper to the target console (mutates the real console object)
    this.target[method] = wrapper as ConsoleFunction

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
    const original = this.originalMethods.get(method)
    if (original) {
      this.target[method] = original
      this.originalMethods.delete(method)
      this.debug('Unpatched console.%s', method)
    }
  }

  /**
   * Unpatch all console methods
   */
  unpatchAll(): void {
    for (const [method, original] of this.originalMethods) {
      this.target[method] = original
    }
    this.originalMethods.clear()
    this.isPatched = false
    this.debug('Unpatched all console methods')
  }

  /**
   * Get the original (unpatched) console method
   */
  getOriginal(method: ConsoleMethod): ConsoleFunction | undefined {
    return this.originalMethods.get(method)
  }

  /**
   * Check if a specific method is patched
   */
  isMethodPatched(method: ConsoleMethod): boolean {
    return this.originalMethods.has(method)
  }
}
