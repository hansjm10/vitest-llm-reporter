/**
 * Tests for Diff Formatter
 */

import { describe, it, expect } from 'vitest'
import { formatJsonDiff, deepEqual, shouldGenerateDiff } from '../../src/utils/diff-formatter.js'

describe('formatJsonDiff', () => {
  describe('primitive values', () => {
    it('should format string diff', () => {
      const result = formatJsonDiff('hello', 'world')

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
      expect(result.formatted).toContain('- "hello"')
      expect(result.formatted).toContain('+ "world"')
    })

    it('should format number diff', () => {
      const result = formatJsonDiff(42, 100)

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- 42')
      expect(result.formatted).toContain('+ 100')
    })

    it('should format boolean diff', () => {
      const result = formatJsonDiff(true, false)

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- true')
      expect(result.formatted).toContain('+ false')
    })

    it('should format null diff', () => {
      const result = formatJsonDiff(null, 'value')

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- null')
      expect(result.formatted).toContain('+ "value"')
    })

    it('should format undefined diff', () => {
      const result = formatJsonDiff(undefined, 'value')

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- undefined')
      expect(result.formatted).toContain('+ "value"')
    })

    it('should show types when showTypes option is true', () => {
      const result = formatJsonDiff(42, '42', { showTypes: true })

      expect(result.formatted).toContain('Expected type:')
      expect(result.formatted).toContain('Actual type:')
    })
  })

  describe('object diffs', () => {
    it('should format simple object diff', () => {
      const expected = { name: 'John', age: 30 }
      const actual = { name: 'Jane', age: 30 }
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
      expect(result.formatted).toContain('"name"')
    })

    it('should format nested object diff', () => {
      const expected = {
        user: { name: 'John', address: { city: 'NYC' } }
      }
      const actual = {
        user: { name: 'John', address: { city: 'LA' } }
      }
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
      expect(result.formatted).toContain('"city"')
    })

    it('should format object with missing keys', () => {
      const expected = { name: 'John', age: 30 }
      const actual = { name: 'John' }
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should format object with extra keys', () => {
      const expected = { name: 'John' }
      const actual = { name: 'John', age: 30 }
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should handle empty objects', () => {
      const result = formatJsonDiff({}, { name: 'John' })

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })
  })

  describe('array diffs', () => {
    it('should format simple array diff', () => {
      const expected = [1, 2, 3]
      const actual = [1, 2, 4]
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should format array with different lengths', () => {
      const expected = [1, 2, 3]
      const actual = [1, 2]
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should format nested array diff', () => {
      const expected = [
        [1, 2],
        [3, 4]
      ]
      const actual = [
        [1, 2],
        [3, 5]
      ]
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should format array of objects', () => {
      const expected = [{ id: 1 }, { id: 2 }]
      const actual = [{ id: 1 }, { id: 3 }]
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should handle empty arrays', () => {
      const result = formatJsonDiff([], [1, 2, 3])

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })
  })

  describe('edge cases', () => {
    it('should handle circular references', () => {
      const expected: Record<string, unknown> = { a: 1 }
      expected.self = expected

      const actual = { a: 1, self: '[Circular]' }

      const result = formatJsonDiff(expected, actual)

      expect(result.formatted).toBeDefined()
      expect(result.formatted).toContain('[Circular]')
    })

    it('should handle mixed type comparisons', () => {
      const result = formatJsonDiff({ name: 'John' }, 'not an object')

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should handle null vs object', () => {
      const result = formatJsonDiff(null, { name: 'John' })

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- null')
    })

    it('should handle undefined vs object', () => {
      const result = formatJsonDiff(undefined, { name: 'John' })

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('- undefined')
    })

    it('should respect indent option', () => {
      const expected = { name: 'John' }
      const actual = { name: 'Jane' }
      const result = formatJsonDiff(expected, actual, { indent: 4 })

      expect(result.formatted).toBeDefined()
      // JSON with 4 spaces should have more indentation
      expect(result.formatted.length).toBeGreaterThan(0)
    })

    it('should handle complex nested structures', () => {
      const expected = {
        users: [
          { id: 1, profile: { name: 'John', tags: ['admin', 'user'] } },
          { id: 2, profile: { name: 'Jane', tags: ['user'] } }
        ]
      }
      const actual = {
        users: [
          { id: 1, profile: { name: 'John', tags: ['admin', 'user'] } },
          { id: 2, profile: { name: 'Jane', tags: ['guest'] } }
        ]
      }
      const result = formatJsonDiff(expected, actual)

      expect(result.format).toBe('json')
      expect(result.formatted).toContain('- expected')
      expect(result.formatted).toContain('+ actual')
    })

    it('should handle special string characters', () => {
      const result = formatJsonDiff('hello\nworld', 'hello\tworld')

      expect(result.format).toBe('string')
      expect(result.formatted).toContain('\\n')
      expect(result.formatted).toContain('\\t')
    })
  })

  describe('formatting options', () => {
    it('should use default options when none provided', () => {
      const result = formatJsonDiff({ a: 1 }, { a: 2 })

      expect(result.formatted).toBeDefined()
      expect(result.format).toBe('json')
    })

    it('should apply custom indent', () => {
      const result1 = formatJsonDiff({ a: 1 }, { a: 2 }, { indent: 2 })
      const result2 = formatJsonDiff({ a: 1 }, { a: 2 }, { indent: 4 })

      // More indentation should result in longer output
      expect(result2.formatted.length).toBeGreaterThanOrEqual(result1.formatted.length)
    })
  })
})

describe('deepEqual', () => {
  it('should return true for identical primitives', () => {
    expect(deepEqual(42, 42)).toBe(true)
    expect(deepEqual('hello', 'hello')).toBe(true)
    expect(deepEqual(true, true)).toBe(true)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(undefined, undefined)).toBe(true)
  })

  it('should return false for different primitives', () => {
    expect(deepEqual(42, 43)).toBe(false)
    expect(deepEqual('hello', 'world')).toBe(false)
    expect(deepEqual(true, false)).toBe(false)
    expect(deepEqual(null, undefined)).toBe(false)
  })

  it('should return true for equal objects', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  })

  it('should return false for different objects', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false)
  })

  it('should return true for equal arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  })

  it('should return false for different arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  it('should handle nested structures', () => {
    const obj1 = { a: { b: { c: 1 } } }
    const obj2 = { a: { b: { c: 1 } } }
    const obj3 = { a: { b: { c: 2 } } }

    expect(deepEqual(obj1, obj2)).toBe(true)
    expect(deepEqual(obj1, obj3)).toBe(false)
  })

  it('should handle mixed types', () => {
    expect(deepEqual(42, '42')).toBe(false)
    expect(deepEqual([], {})).toBe(false)
    expect(deepEqual(null, 0)).toBe(false)
  })

  it('should safely compare circular references', () => {
    const obj1: Record<string, unknown> = { name: 'circular' }
    obj1.self = obj1

    const obj2: Record<string, unknown> = { name: 'circular' }
    obj2.self = obj2

    const obj3: Record<string, unknown> = { name: 'circular', extra: true }
    obj3.self = obj3

    expect(deepEqual(obj1, obj2)).toBe(true)
    expect(deepEqual(obj1, obj3)).toBe(false)
  })
})

describe('shouldGenerateDiff', () => {
  it('should return true for different values', () => {
    expect(shouldGenerateDiff('a', 'b')).toBe(true)
    expect(shouldGenerateDiff(1, 2)).toBe(true)
    expect(shouldGenerateDiff({ a: 1 }, { a: 2 })).toBe(true)
  })

  it('should return false for equal values', () => {
    expect(shouldGenerateDiff('a', 'a')).toBe(false)
    expect(shouldGenerateDiff(42, 42)).toBe(false)
    expect(shouldGenerateDiff({ a: 1 }, { a: 1 })).toBe(false)
  })

  it('should return false for both undefined', () => {
    expect(shouldGenerateDiff(undefined, undefined)).toBe(false)
  })

  it('should return true when one is undefined', () => {
    expect(shouldGenerateDiff(undefined, 'value')).toBe(true)
    expect(shouldGenerateDiff('value', undefined)).toBe(true)
  })
})
