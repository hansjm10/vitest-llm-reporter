import { describe, expect, it } from 'vitest'
import {
  getDefaultBufferedTailPolicy,
  mergeResolvedStdioPlan,
  resolveStdioPlan,
  shouldFilterSuccessLogs
} from './stdio-plan.js'

describe('stdio-plan', () => {
  it('resolves the default clean-stdout plan', () => {
    const plan = resolveStdioPlan({})

    expect(plan).toMatchObject({
      suppressStdout: true,
      suppressStderr: false,
      filterPattern: undefined,
      frameworkPresets: ['nest'],
      autoDetectFrameworks: false,
      redirectToStderr: false
    })
    expect(getDefaultBufferedTailPolicy(plan)).toBe('emit')
  })

  it('drops default presets when a custom filter is explicitly provided', () => {
    const plan = resolveStdioPlan({
      stdio: {
        filterPattern: /^Custom:/,
        redirectToStderr: true
      }
    })

    expect(plan.frameworkPresets).toEqual([])
    expect(plan.redirectToStderr).toBe(true)
  })

  it('resolves pure stdout mode to suppress-all filtering', () => {
    const plan = resolveStdioPlan({
      pureStdout: true,
      stdio: {
        suppressStderr: true,
        frameworkPresets: ['next']
      }
    })

    expect(plan).toMatchObject({
      suppressStdout: true,
      suppressStderr: false,
      filterPattern: null,
      frameworkPresets: []
    })
    expect(getDefaultBufferedTailPolicy(plan)).toBe('filter')
  })

  it('merges partial updates without dropping previously resolved defaults', () => {
    const initial = resolveStdioPlan({})
    const merged = mergeResolvedStdioPlan(initial, {
      filterPattern: [/^Foo/],
      autoDetectFrameworks: true
    })

    expect(merged.suppressStdout).toBe(true)
    expect(merged.frameworkPresets).toEqual(['nest'])
    expect(merged.filterPattern).toEqual([/^Foo/])
    expect(merged.autoDetectFrameworks).toBe(true)
    expect(shouldFilterSuccessLogs(true, merged)).toBe(true)
  })

  it('recomputes the normal defaults when leaving pure stdout mode', () => {
    const pureStdoutPlan = resolveStdioPlan({ pureStdout: true })
    const merged = mergeResolvedStdioPlan(
      pureStdoutPlan,
      { suppressStdout: false },
      { recomputeFromDefaults: true }
    )

    expect(merged).toMatchObject({
      suppressStdout: false,
      suppressStderr: false,
      filterPattern: undefined,
      frameworkPresets: ['nest'],
      autoDetectFrameworks: false,
      redirectToStderr: false
    })
  })
})
