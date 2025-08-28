import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  estimateTokensBatch,
  estimateTotalTokens,
  exceedsTokenLimit,
  getCharacterLimit
} from './estimator.js'

describe('Token Estimator', () => {
  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0)
      expect(estimateTokens('   ')).toBe(1) // Whitespace counts
    })

    it('estimates tokens with default 4 chars per token', () => {
      expect(estimateTokens('test')).toBe(1) // 4 chars / 4 = 1
      expect(estimateTokens('hello')).toBe(2) // 5 chars / 4 = 1.25 -> 2
      expect(estimateTokens('hello world')).toBe(3) // 11 chars / 4 = 2.75 -> 3
      expect(estimateTokens('a')).toBe(1) // 1 char / 4 = 0.25 -> 1
    })

    it('estimates tokens with custom chars per token', () => {
      expect(estimateTokens('test', { charsPerToken: 2 })).toBe(2) // 4 / 2 = 2
      expect(estimateTokens('hello', { charsPerToken: 3 })).toBe(2) // 5 / 3 = 1.67 -> 2
      expect(estimateTokens('hello world', { charsPerToken: 5 })).toBe(3) // 11 / 5 = 2.2 -> 3
    })

    it('handles long text', () => {
      const longText = 'a'.repeat(1000)
      expect(estimateTokens(longText)).toBe(250) // 1000 / 4 = 250
      expect(estimateTokens(longText, { charsPerToken: 10 })).toBe(100) // 1000 / 10 = 100
    })

    it('throws error for invalid charsPerToken', () => {
      expect(() => estimateTokens('test', { charsPerToken: 0 })).toThrow(
        'charsPerToken must be a positive number'
      )
      expect(() => estimateTokens('test', { charsPerToken: -1 })).toThrow(
        'charsPerToken must be a positive number'
      )
    })
  })

  describe('estimateTokensBatch', () => {
    it('returns empty array for empty input', () => {
      expect(estimateTokensBatch([])).toEqual([])
    })

    it('estimates tokens for multiple texts', () => {
      const texts = ['hello', 'world', 'test']
      expect(estimateTokensBatch(texts)).toEqual([2, 2, 1])
    })

    it('handles empty strings in batch', () => {
      const texts = ['', 'test', '', 'hello world']
      expect(estimateTokensBatch(texts)).toEqual([0, 1, 0, 3])
    })

    it('uses custom chars per token for all texts', () => {
      const texts = ['ab', 'cd', 'efgh']
      expect(estimateTokensBatch(texts, { charsPerToken: 2 })).toEqual([1, 1, 2])
    })
  })

  describe('estimateTotalTokens', () => {
    it('returns 0 for empty array', () => {
      expect(estimateTotalTokens([])).toBe(0)
    })

    it('sums tokens across all texts', () => {
      const texts = ['hello', 'world', 'test'] // 2 + 2 + 1 = 5
      expect(estimateTotalTokens(texts)).toBe(5)
    })

    it('handles mixed content', () => {
      const texts = ['', 'a', 'test test', 'hello world'] // 0 + 1 + 3 + 3 = 7
      expect(estimateTotalTokens(texts)).toBe(7)
    })
  })

  describe('exceedsTokenLimit', () => {
    it('returns false when under limit', () => {
      expect(exceedsTokenLimit('test', 10)).toBe(false) // 1 token < 10
      expect(exceedsTokenLimit('hello world', 5)).toBe(false) // 3 tokens < 5
    })

    it('returns true when over limit', () => {
      expect(exceedsTokenLimit('hello world', 2)).toBe(true) // 3 tokens > 2
      expect(exceedsTokenLimit('test', 0)).toBe(true) // 1 token > 0
    })

    it('returns false when exactly at limit', () => {
      expect(exceedsTokenLimit('test', 1)).toBe(false) // 1 token = 1 (not exceeding)
      expect(exceedsTokenLimit('hello world', 3)).toBe(false) // 3 tokens = 3
    })

    it('uses custom chars per token', () => {
      expect(exceedsTokenLimit('test', 1, { charsPerToken: 2 })).toBe(true) // 2 tokens > 1
      expect(exceedsTokenLimit('test', 2, { charsPerToken: 2 })).toBe(false) // 2 tokens = 2
    })
  })

  describe('getCharacterLimit', () => {
    it('calculates character limit from token limit', () => {
      expect(getCharacterLimit(100)).toBe(400) // 100 * 4 = 400
      expect(getCharacterLimit(50)).toBe(200) // 50 * 4 = 200
    })

    it('uses custom chars per token', () => {
      expect(getCharacterLimit(100, { charsPerToken: 3 })).toBe(300) // 100 * 3 = 300
      expect(getCharacterLimit(50, { charsPerToken: 5 })).toBe(250) // 50 * 5 = 250
    })

    it('handles zero token limit', () => {
      expect(getCharacterLimit(0)).toBe(0)
    })
  })

  describe('deterministic behavior', () => {
    it('produces consistent results for same input', () => {
      const text = 'This is a test string for consistent tokenization'
      const result1 = estimateTokens(text)
      const result2 = estimateTokens(text)
      const result3 = estimateTokens(text)

      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('produces predictable results based on formula', () => {
      // Test exact formula: ceil(length / charsPerToken)
      expect(estimateTokens('12345678')).toBe(2) // ceil(8/4) = 2
      expect(estimateTokens('123456789')).toBe(3) // ceil(9/4) = 3
      expect(estimateTokens('1234567890AB')).toBe(3) // ceil(12/4) = 3
      expect(estimateTokens('1234567890ABC')).toBe(4) // ceil(13/4) = 4
    })
  })
})
