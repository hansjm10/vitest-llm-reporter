/**
 * Tests for Assertion Diff Analyzer
 */

import { describe, it, expect } from 'vitest'
import { analyzeAssertionDiff } from '../../src/utils/assertion-diff.js'

describe('analyzeAssertionDiff', () => {
  describe('primitive values', () => {
    it('should return undefined for primitive comparisons', () => {
      expect(analyzeAssertionDiff(1, 2)).toBeUndefined()
      expect(analyzeAssertionDiff('hello', 'world')).toBeUndefined()
      expect(analyzeAssertionDiff(true, false)).toBeUndefined()
      expect(analyzeAssertionDiff(null, undefined)).toBeUndefined()
    })
  })

  describe('object comparisons', () => {
    it('should identify changed fields in simple objects', () => {
      const expected = { name: 'John', age: 30 }
      const actual = { name: 'Jane', age: 30 }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.summary).toContain('name')
      expect(result?.changedPaths).toHaveLength(1)
      expect(result?.changedPaths?.[0]).toEqual({
        path: 'name',
        expected: 'John',
        actual: 'Jane'
      })
    })

    it('should identify multiple changed fields', () => {
      const expected = { name: 'John', age: 30, city: 'NYC' }
      const actual = { name: 'Jane', age: 25, city: 'LA' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toHaveLength(3)
      expect(result?.summary).toContain('3 fields differ')
    })

    it('should identify missing keys', () => {
      const expected = { name: 'John', age: 30, city: 'NYC' }
      const actual = { name: 'John' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.missingKeys).toEqual(['age', 'city'])
      expect(result?.summary).toContain('2 missing')
    })

    it('should identify extra keys', () => {
      const expected = { name: 'John' }
      const actual = { name: 'John', age: 30, city: 'NYC' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.extraKeys).toEqual(['age', 'city'])
      expect(result?.summary).toContain('2 extra')
    })

    it('should handle nested objects', () => {
      const expected = {
        user: {
          name: 'John',
          profile: {
            email: 'john@example.com'
          }
        }
      }
      const actual = {
        user: {
          name: 'John',
          profile: {
            email: 'jane@example.com'
          }
        }
      }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toHaveLength(1)
      expect(result?.changedPaths?.[0]?.path).toBe('user.profile.email')
    })

    it('should handle deeply nested structures', () => {
      const expected = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      }
      const actual = {
        level1: {
          level2: {
            level3: {
              value: 'changed'
            }
          }
        }
      }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths?.[0]?.path).toBe('level1.level2.level3.value')
    })
  })

  describe('array comparisons', () => {
    it('should identify changed array elements', () => {
      const expected = [1, 2, 3]
      const actual = [1, 2, 4]

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toHaveLength(1)
      expect(result?.changedPaths?.[0]).toEqual({
        path: '[2]',
        expected: 3,
        actual: 4
      })
    })

    it('should identify array length mismatches', () => {
      const expected = [1, 2, 3, 4, 5]
      const actual = [1, 2, 3]

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.lengthMismatch).toEqual({
        expected: 5,
        actual: 3
      })
      expect(result?.summary).toContain('array length 5 → 3')
    })

    it('should handle missing array elements', () => {
      const expected = ['a', 'b', 'c']
      const actual = ['a', 'b']

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.missingKeys).toContain('[2]')
    })

    it('should handle extra array elements', () => {
      const expected = ['a', 'b']
      const actual = ['a', 'b', 'c']

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.extraKeys).toContain('[2]')
    })

    it('should handle arrays of objects', () => {
      const expected = [{ id: 1 }, { id: 2 }]
      const actual = [{ id: 1 }, { id: 3 }]

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths?.[0]?.path).toBe('[1].id')
    })

    it('should handle nested arrays', () => {
      const expected = [
        [1, 2],
        [3, 4]
      ]
      const actual = [
        [1, 2],
        [3, 5]
      ]

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths?.[0]?.path).toBe('[1][1]')
    })
  })

  describe('JSON string parsing', () => {
    it('should parse and compare valid JSON strings', () => {
      const expected = '{"name":"John","age":30}'
      const actual = '{"name":"Jane","age":30}'

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toHaveLength(1)
      expect(result?.changedPaths?.[0]?.path).toBe('name')
    })

    it('should handle JSON arrays', () => {
      const expected = '[1,2,3]'
      const actual = '[1,2,4]'

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toHaveLength(1)
    })

    it('should handle nested JSON', () => {
      const expected = '{"user":{"name":"John"}}'
      const actual = '{"user":{"name":"Jane"}}'

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths?.[0]?.path).toBe('user.name')
    })
  })

  describe('string comparisons (fallback)', () => {
    it('should analyze non-JSON strings', () => {
      const expected = 'hello world'
      const actual = 'hello earth'

      const result = analyzeAssertionDiff(expected, actual)

      // Should return undefined for primitive strings
      expect(result).toBeUndefined()
    })

    it('should handle Vitest pretty-printed format', () => {
      const expected = 'Object {\n  "name": "John"\n}'
      const actual = 'Object {\n  "name": "Jane"\n}'

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.summary).toContain('differ')
    })
  })

  describe('edge cases', () => {
    it('should handle null vs object', () => {
      const expected = null
      const actual = { name: 'John' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toBeDefined()
    })

    it('should handle undefined vs object', () => {
      const expected = undefined
      const actual = { name: 'John' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
    })

    it('should handle empty objects', () => {
      const expected = {}
      const actual = { name: 'John' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.extraKeys).toEqual(['name'])
    })

    it('should handle empty arrays', () => {
      const expected: unknown[] = []
      const actual = [1, 2, 3]

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.lengthMismatch).toEqual({
        expected: 0,
        actual: 3
      })
    })

    it('should limit the number of reported diffs', () => {
      // Create objects with many differences
      const expected: Record<string, number> = {}
      const actual: Record<string, number> = {}

      for (let i = 0; i < 100; i++) {
        expected[`key${i}`] = i
        actual[`key${i}`] = i + 1
      }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      // Should be limited to MAX_DIFF_PATHS (20)
      expect(result?.changedPaths?.length).toBeLessThanOrEqual(20)
      expect(result?.summary).toContain('(truncated)')
    })

    it('should handle type mismatches', () => {
      const expected = { value: 42 }
      const actual = { value: '42' }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.changedPaths).toHaveLength(1)
      expect(result?.changedPaths?.[0]).toEqual({
        path: 'value',
        expected: 42,
        actual: '42'
      })
    })

    it('should handle functions in objects', () => {
      const expected = { fn: () => {} }
      const actual = { fn: () => {} }

      const result = analyzeAssertionDiff(expected, actual)

      // Functions should be normalized to '[Function]'
      expect(result).toBeDefined()
    })
  })

  describe('complex real-world scenarios', () => {
    it('should handle complex nested structure with multiple changes', () => {
      const expected = {
        user: {
          id: 123,
          name: 'John Doe',
          profile: {
            email: 'john@example.com',
            settings: {
              theme: 'dark',
              notifications: ['email', 'sms', 'push']
            }
          }
        },
        metadata: {
          lastLogin: '2024-01-15T10:30:00Z',
          loginCount: 42
        }
      }

      const actual = {
        user: {
          id: 123,
          name: 'Jane Smith',
          profile: {
            email: 'jane@example.com',
            settings: {
              theme: 'light',
              notifications: ['email', 'push']
            }
          }
        },
        metadata: {
          lastLogin: '2024-01-15T10:30:00Z',
          loginCount: 43
        }
      }

      const result = analyzeAssertionDiff(expected, actual)

      expect(result).toBeDefined()
      expect(result?.summary).toContain('user.name')
      expect(result?.summary).toContain('user.profile.email')
      expect(result?.summary).toContain('user.profile.settings.theme')
      expect(result?.summary).toContain('metadata.loginCount')

      // Should report 4 changed fields + 1 missing array element
      expect(result?.changedPaths?.length).toBeGreaterThanOrEqual(4)
    })
  })
})
