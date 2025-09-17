import type { FrameworkPresetName, StdioConfig, StdioFilter } from '../types/reporter.js'
import { getFrameworkPresetPatterns } from './framework-log-presets.js'

/**
 * Helper that evaluates whether stdout/stderr lines should be suppressed
 * based on configured framework presets and user supplied filters.
 */
export class StdioFilterEvaluator {
  private readonly predicates: ((line: string) => boolean)[] | null

  constructor(
    filterPattern: StdioConfig['filterPattern'],
    frameworkPresets: FrameworkPresetName[]
  ) {
    this.predicates = this.compileFilterPredicates(filterPattern, frameworkPresets)
  }

  /** Determine if a line should be suppressed */
  shouldSuppress(line: string): boolean {
    if (this.predicates === null) {
      return true
    }

    if (this.predicates.length === 0) {
      return false
    }

    for (const predicate of this.predicates) {
      try {
        if (predicate(line)) {
          return true
        }
      } catch {
        // Ignore predicate errors to avoid breaking stdout
      }
    }

    return false
  }

  private compileFilterPredicates(
    filterPattern: StdioConfig['filterPattern'],
    frameworkPresets: FrameworkPresetName[]
  ): ((line: string) => boolean)[] | null {
    if (filterPattern === null) {
      return null
    }

    const predicates: ((line: string) => boolean)[] = []
    const seen = new Set<StdioFilter>()

    const registerPattern = (pattern: StdioFilter): void => {
      if (seen.has(pattern)) {
        return
      }
      seen.add(pattern)
      predicates.push(this.toPredicate(pattern))
    }

    for (const presetPattern of getFrameworkPresetPatterns(frameworkPresets)) {
      registerPattern(presetPattern)
    }

    if (filterPattern !== undefined) {
      const patterns = Array.isArray(filterPattern) ? filterPattern : [filterPattern]
      for (const pattern of patterns) {
        registerPattern(pattern)
      }
    }

    return predicates
  }

  private toPredicate(pattern: StdioFilter): (line: string) => boolean {
    if (typeof pattern === 'function') {
      return pattern
    }

    if (pattern instanceof RegExp) {
      return (line: string) => {
        if (pattern.global || pattern.sticky) {
          pattern.lastIndex = 0
        }
        return pattern.test(line)
      }
    }

    // Fallback for unexpected inputs from untyped consumers
    return () => false
  }
}
