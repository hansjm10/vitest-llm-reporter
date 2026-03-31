import type { FrameworkPresetName, StdioConfig, StdioFilter } from '../types/reporter.js'
import type { ResolvedStdioPlan } from './stdio-plan.js'
import { getFrameworkPresetPatterns } from './framework-log-presets.js'

const LEADING_FILTER_CONTROL_PREFIX = new RegExp(
  String.raw`^(?:(?:\u001b\[[0-?]*[ -/]*[@-~])|\r)+`,
  'u'
)

export interface CapturedConsoleFilterResult {
  message?: string
  totalLines: number
  suppressedLines: number
}

/**
 * Shared suppression policy for live stdio interception and captured console output.
 */
export class StdioSuppressionPolicy {
  private readonly suppressAll: boolean
  private readonly frameworkPredicates: ((line: string) => boolean)[]
  private readonly userPredicates: ((line: string) => boolean)[]

  constructor(plan: ResolvedStdioPlan)
  constructor(filterPattern: StdioConfig['filterPattern'], frameworkPresets: FrameworkPresetName[])
  constructor(
    planOrFilterPattern: ResolvedStdioPlan | StdioConfig['filterPattern'],
    frameworkPresets: FrameworkPresetName[] = []
  ) {
    const compiled = this.compileFilterPredicates(
      typeof planOrFilterPattern === 'object' &&
        planOrFilterPattern !== null &&
        'frameworkPresets' in planOrFilterPattern
        ? planOrFilterPattern.filterPattern
        : planOrFilterPattern,
      typeof planOrFilterPattern === 'object' &&
        planOrFilterPattern !== null &&
        'frameworkPresets' in planOrFilterPattern
        ? planOrFilterPattern.frameworkPresets
        : frameworkPresets
    )

    this.suppressAll = compiled === null
    this.frameworkPredicates = compiled?.frameworkPredicates ?? []
    this.userPredicates = compiled?.userPredicates ?? []
  }

  /**
   * Determine whether a raw line/chunk should be suppressed.
   * The optional second argument is ignored and only kept for compatibility.
   */
  shouldSuppress(line: string, _normalizedLine = line): boolean {
    if (this.suppressAll) {
      return true
    }

    const normalizedFrameworkLine = this.normalizeFrameworkLine(line)
    const normalizedUserLine = this.normalizeUserLine(line)
    return (
      this.matchesFrameworkPredicates(line, normalizedFrameworkLine) ||
      this.matchesPredicatesOnce(this.userPredicates, normalizedUserLine || line)
    )
  }

  filterCapturedConsoleMessage(message: string): CapturedConsoleFilterResult {
    if (!message) {
      return { message: undefined, totalLines: 0, suppressedLines: 0 }
    }

    const hadTrailingNewline = message.endsWith('\n')
    const segments = message.split('\n')
    if (hadTrailingNewline && segments[segments.length - 1] === '') {
      segments.pop()
    }

    const kept: string[] = []
    let totalLines = 0
    let suppressedLines = 0

    for (const segment of segments) {
      if (!this.normalizeFrameworkLine(segment)) {
        continue
      }

      totalLines += 1
      if (!this.shouldSuppress(segment)) {
        kept.push(segment)
      } else {
        suppressedLines += 1
      }
    }

    if (kept.length === 0) {
      return { message: undefined, totalLines, suppressedLines }
    }

    let filteredMessage = kept.join('\n')
    if (hadTrailingNewline) {
      filteredMessage += '\n'
    }

    return {
      message: filteredMessage,
      totalLines,
      suppressedLines
    }
  }

  /**
   * Remove cursor-control prefixes and trailing carriage returns before
   * applying framework preset rules.
   */
  normalizeFrameworkLine(line: string): string {
    return line.replace(/\r+$/, '').replace(LEADING_FILTER_CONTROL_PREFIX, '')
  }

  /**
   * Trim line-ending carriage returns for user filters without stripping
   * inline control prefixes that custom filters may intentionally inspect.
   */
  normalizeUserLine(line: string): string {
    return line.replace(/\r+$/, '')
  }

  private matchesFrameworkPredicates(line: string, normalizedLine: string): boolean {
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

    return () => false
  }
}

/**
 * Backward-compatible alias retained for existing imports.
 */
export class StdioFilterEvaluator extends StdioSuppressionPolicy {
  constructor(
    filterPattern: StdioConfig['filterPattern'],
    frameworkPresets: FrameworkPresetName[]
  ) {
    super(filterPattern, frameworkPresets)
  }
}
