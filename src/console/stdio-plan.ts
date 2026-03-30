import type { FrameworkPresetName, LLMReporterConfig, StdioConfig } from '../types/reporter.js'

export interface ResolvedStdioPlan {
  suppressStdout: boolean
  suppressStderr: boolean
  filterPattern: StdioConfig['filterPattern']
  frameworkPresets: FrameworkPresetName[]
  autoDetectFrameworks: boolean
  redirectToStderr: boolean
  flushWithFiltering: boolean
}

export type BufferedTailPolicy = 'emit' | 'filter' | 'discard'

const DEFAULT_FRAMEWORK_PRESETS: readonly FrameworkPresetName[] = ['nest']

function copyFrameworkPresets(presets: Iterable<FrameworkPresetName>): FrameworkPresetName[] {
  return Array.from(presets)
}

export function cloneResolvedStdioPlan(plan: ResolvedStdioPlan): ResolvedStdioPlan {
  return {
    ...plan,
    frameworkPresets: copyFrameworkPresets(plan.frameworkPresets)
  }
}

export function isResolvedStdioPlan(value: unknown): value is ResolvedStdioPlan {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ResolvedStdioPlan>
  return (
    typeof candidate.suppressStdout === 'boolean' &&
    typeof candidate.suppressStderr === 'boolean' &&
    Array.isArray(candidate.frameworkPresets) &&
    typeof candidate.autoDetectFrameworks === 'boolean' &&
    typeof candidate.redirectToStderr === 'boolean' &&
    typeof candidate.flushWithFiltering === 'boolean'
  )
}

export function resolveStdioPlan(
  config: Pick<LLMReporterConfig, 'pureStdout' | 'stdio'>
): ResolvedStdioPlan {
  if (config.pureStdout) {
    return {
      suppressStdout: true,
      suppressStderr: false,
      filterPattern: null,
      frameworkPresets: [],
      autoDetectFrameworks: false,
      redirectToStderr: false,
      flushWithFiltering: false
    }
  }

  const stdioOptions = config.stdio ?? {}
  const hasFilterPatternProperty = Object.hasOwn(stdioOptions, 'filterPattern')
  const hasFrameworkPresets = Object.hasOwn(stdioOptions, 'frameworkPresets')
  const filterPatternValue = hasFilterPatternProperty ? stdioOptions.filterPattern : undefined
  const filterPatternProvided = hasFilterPatternProperty && filterPatternValue !== undefined
  const frameworkPresets = hasFrameworkPresets
    ? copyFrameworkPresets(stdioOptions.frameworkPresets ?? [])
    : filterPatternProvided
      ? []
      : copyFrameworkPresets(DEFAULT_FRAMEWORK_PRESETS)

  return {
    suppressStdout: stdioOptions.suppressStdout ?? true,
    suppressStderr: stdioOptions.suppressStderr ?? false,
    filterPattern: filterPatternProvided ? filterPatternValue : undefined,
    frameworkPresets,
    autoDetectFrameworks: stdioOptions.autoDetectFrameworks ?? false,
    redirectToStderr: stdioOptions.redirectToStderr ?? false,
    flushWithFiltering: stdioOptions.flushWithFiltering ?? false
  }
}

export function mergeResolvedStdioPlan(
  current: ResolvedStdioPlan,
  update?: StdioConfig,
  options: { pureStdout?: boolean; recomputeFromDefaults?: boolean } = {}
): ResolvedStdioPlan {
  if (options.pureStdout) {
    return resolveStdioPlan({ pureStdout: true, stdio: update })
  }

  if (options.recomputeFromDefaults) {
    return resolveStdioPlan({ pureStdout: false, stdio: update })
  }

  const merged = cloneResolvedStdioPlan(current)
  if (!update) {
    return merged
  }

  if (Object.hasOwn(update, 'suppressStdout')) {
    merged.suppressStdout = update.suppressStdout ?? merged.suppressStdout
  }
  if (Object.hasOwn(update, 'suppressStderr')) {
    merged.suppressStderr = update.suppressStderr ?? merged.suppressStderr
  }
  if (Object.hasOwn(update, 'filterPattern')) {
    merged.filterPattern = update.filterPattern
  }
  if (Object.hasOwn(update, 'frameworkPresets')) {
    merged.frameworkPresets = copyFrameworkPresets(update.frameworkPresets ?? [])
  }
  if (Object.hasOwn(update, 'autoDetectFrameworks')) {
    merged.autoDetectFrameworks = update.autoDetectFrameworks ?? merged.autoDetectFrameworks
  }
  if (Object.hasOwn(update, 'redirectToStderr')) {
    merged.redirectToStderr = update.redirectToStderr ?? merged.redirectToStderr
  }
  if (Object.hasOwn(update, 'flushWithFiltering')) {
    merged.flushWithFiltering = update.flushWithFiltering ?? merged.flushWithFiltering
  }

  return merged
}

export function withFrameworkPresets(
  current: ResolvedStdioPlan,
  frameworkPresets: Iterable<FrameworkPresetName>
): ResolvedStdioPlan {
  return {
    ...current,
    frameworkPresets: copyFrameworkPresets(frameworkPresets)
  }
}

export function shouldInterceptStdio(plan: ResolvedStdioPlan): boolean {
  return plan.suppressStdout || plan.suppressStderr
}

export function shouldFilterSuccessLogs(
  captureConsoleOnSuccess: boolean,
  plan: ResolvedStdioPlan
): boolean {
  return (
    captureConsoleOnSuccess &&
    (plan.suppressStdout || plan.filterPattern !== undefined || plan.frameworkPresets.length > 0)
  )
}

export function getDefaultBufferedTailPolicy(
  plan: ResolvedStdioPlan
): Exclude<BufferedTailPolicy, 'discard'> {
  return plan.filterPattern === null || plan.flushWithFiltering ? 'filter' : 'emit'
}
