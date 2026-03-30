import type { FrameworkPresetName, StdioConfig, StdioFilter } from '../types/reporter.js'
import { getFrameworkPresetPatterns } from './framework-log-presets.js'

/**
 * Helper that evaluates whether stdout/stderr lines should be suppressed
 * based on configured framework presets and user supplied filters.
 */
export class StdioFilterEvaluator {
  private readonly suppressAll: boolean
  private readonly frameworkPredicates: ((line: string) => boolean)[]
  private readonly userPredicates: ((line: string) => boolean)[]

  constructor(
    filterPattern: StdioConfig['filterPattern'],
    frameworkPresets: FrameworkPresetName[]
  ) {
    const compiled = this.compileFilterPredicates(filterPattern, frameworkPresets)
    this.suppressAll = compiled === null
    this.frameworkPredicates = compiled?.frameworkPredicates ?? []
    this.userPredicates = compiled?.userPredicates ?? []
  }

  /** Determine if a line should be suppressed */
  shouldSuppress(line: string, normalizedLine = line): boolean {
    if (this.suppressAll) {
      return true
    }

    return (
      this.matchesFrameworkPredicates(line, normalizedLine) ||
      this.matchesPredicatesOnce(this.userPredicates, line)
    )
  }

  private matchesFrameworkPredicates(
    line: string,
    normalizedLine = line
  ): boolean {
    if (this.matchesPredicatesOnce(this.frameworkPredicates, line)) {
      return true
    }

    return (
      normalizedLine !== line &&
      this.matchesPredicatesOnce(this.frameworkPredicates, normalizedLine)
    )
  }

  private matchesPredicatesOnce(
    predicates: readonly ((line: string) => boolean)[],
    line: string
  ): boolean {
    for (const predicate of predicates) {
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
  ): {
    frameworkPredicates: ((line: string) => boolean)[]
    userPredicates: ((line: string) => boolean)[]
  } | null {
    if (filterPattern === null) {
      return null
    }

    const frameworkPredicates: ((line: string) => boolean)[] = []
    const userPredicates: ((line: string) => boolean)[] = []
    const seen = new Set<StdioFilter>()

    const registerPattern = (bucket: ((line: string) => boolean)[], pattern: StdioFilter): void => {
      if (seen.has(pattern)) {
        return
      }
      seen.add(pattern)
      bucket.push(this.toPredicate(pattern))
    }

    for (const presetPattern of getFrameworkPresetPatterns(frameworkPresets)) {
      registerPattern(frameworkPredicates, presetPattern)
    }

    if (filterPattern !== undefined) {
      const patterns = Array.isArray(filterPattern) ? filterPattern : [filterPattern]
      for (const pattern of patterns) {
        registerPattern(userPredicates, pattern)
      }
    }

    return { frameworkPredicates, userPredicates }
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
