import { describe, it, expect } from 'vitest'
import {
  detectFrameworkPresets,
  getFrameworkPresetPatterns,
  listFrameworkPresets
} from './framework-log-presets.js'

describe('framework log presets', () => {
  it('exposes patterns for every registered preset', () => {
    for (const preset of listFrameworkPresets()) {
      const patterns = getFrameworkPresetPatterns([preset])
      expect(patterns.length).toBeGreaterThan(0)
      const matcher = patterns[0]
      if (matcher instanceof RegExp) {
        expect(matcher.test('test line')).toBeTypeOf('boolean')
      } else {
        expect(typeof matcher).toBe('function')
      }
    }
  })

  it('provides concrete matchers for known frameworks', () => {
    const [nextMatcher] = getFrameworkPresetPatterns(['next'])
    expect(typeof nextMatcher).not.toBe('undefined')
    const line = 'info  - Loaded env from .env.local'
    if (nextMatcher instanceof RegExp) {
      expect(nextMatcher.test(line)).toBe(true)
    } else {
      expect(nextMatcher(line)).toBe(true)
    }
  })

  it('detects frameworks from package dependencies', () => {
    const detected = detectFrameworkPresets({
      packageJson: {
        dependencies: {
          next: '13.0.0',
          '@nestjs/core': '10.0.0'
        }
      }
    })

    expect(detected).toContain('next')
    expect(detected).toContain('nest')
  })

  it('detects frameworks using environment hints', () => {
    const detected = detectFrameworkPresets({
      env: {
        NEXT_TELEMETRY_DISABLED: '1'
      }
    })

    expect(detected).toContain('next')
  })
})
