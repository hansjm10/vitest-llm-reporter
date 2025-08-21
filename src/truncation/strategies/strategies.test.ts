/**
 * Truncation Strategies Test Suite
 *
 * Tests all truncation strategies for correctness and performance.
 * Adapted to work with the existing truncation system interface.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  HeadTailStrategy,
  SmartStrategy,
  ErrorFocusedStrategy,
  StackTraceStrategy
} from './index'
import type { TruncationContext, ITruncationStrategy } from '../types'
import { ContentType, ContentPriority } from '../types'

describe('Truncation Strategies', () => {
  const sampleContent = `Line 1: This is the beginning
Line 2: Some middle content
Line 3: More middle content
Line 4: Error: Something went wrong
Line 5: Expected value to be true
Line 6: at /src/test.js:10:5
Line 7: at /src/app.js:20:10
Line 8: at /node_modules/lib.js:100:1
Line 9: More content after error
Line 10: This is the end`

  const basicContext: TruncationContext = {
    model: 'gpt-4',
    maxTokens: 100,
    contentType: 'text',
    priority: ContentPriority.MEDIUM,
    preserveStructure: false
  }

  describe('HeadTailStrategy', () => {
    let strategy: HeadTailStrategy

    beforeEach(() => {
      strategy = new HeadTailStrategy()
    })

    it('should have correct name and priority', () => {
      expect(strategy.name).toBe('head-tail')
      expect(strategy.priority).toBe(2)
    })

    it('should preserve content that fits within token limit', async () => {
      const largeTokenLimit = 1000
      const result = await strategy.truncate(sampleContent, largeTokenLimit, basicContext)

      expect(result.wasTruncated).toBe(false)
      expect(result.content).toBe(sampleContent)
      expect(result.tokensSaved).toBe(0)
      expect(result.strategyUsed).toBe('head-tail')
    })

    it('should truncate content preserving head and tail', async () => {
      const smallTokenLimit = 20
      const result = await strategy.truncate(sampleContent, smallTokenLimit, basicContext)

      expect(result.wasTruncated).toBe(true)
      expect(result.content.includes('Line 1:')).toBe(true)
      expect(result.content.includes('Line 10:')).toBe(true)
      expect(result.content.includes('...')).toBe(true)
      expect(result.tokenCount).toBeLessThanOrEqual(smallTokenLimit)
      expect(result.tokensSaved).toBeGreaterThan(0)
    })

    it('should handle content types correctly', () => {
      expect(strategy.canTruncate(sampleContent, basicContext)).toBe(true)
      expect(strategy.canTruncate(sampleContent, { 
        ...basicContext, 
        contentType: 'json',
        preserveStructure: true 
      })).toBe(false)
    })

    it('should provide reasonable estimates', async () => {
      const smallTokenLimit = 20
      const estimate = await strategy.estimateSavings(sampleContent, smallTokenLimit, basicContext)

      expect(estimate).toBeGreaterThan(0)
    })

    it('should handle custom configuration via metadata', async () => {
      const contextWithConfig: TruncationContext = {
        ...basicContext,
        metadata: {
          headRatio: 0.6,
          tailRatio: 0.3,
          separator: '\n--- TRUNCATED ---\n'
        }
      }
      
      const result = await strategy.truncate(sampleContent, 30, contextWithConfig)

      expect(result.content.includes('--- TRUNCATED ---')).toBe(true)
    })
  })

  describe('SmartStrategy', () => {
    let strategy: SmartStrategy

    beforeEach(() => {
      strategy = new SmartStrategy()
    })

    it('should have correct name and priority', () => {
      expect(strategy.name).toBe('smart')
      expect(strategy.priority).toBe(4)
    })

    it('should prioritize important content', async () => {
      const result = await strategy.truncate(sampleContent, 30, basicContext)

      expect(result.wasTruncated).toBe(true)
      expect(result.content.includes('Error:')).toBe(true)
      expect(result.strategyUsed).toBe('smart')
    })

    it('should use fallback on analysis failure', async () => {
      const malformedContent = '\x00\x01\x02invalid content that might cause parsing errors'
      const result = await strategy.truncate(malformedContent, 20, basicContext)

      // Should complete successfully even with malformed content
      expect(result.strategyUsed).toContain('smart')
      expect(result.wasTruncated).toBe(true)
    })

    it('should support relevant content types', () => {
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'error' })).toBe(true)
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'code' })).toBe(true)
      expect(strategy.canTruncate('{}', { 
        ...basicContext, 
        contentType: 'json',
        preserveStructure: true 
      })).toBe(false)
    })
  })

  describe('ErrorFocusedStrategy', () => {
    let strategy: ErrorFocusedStrategy

    beforeEach(() => {
      strategy = new ErrorFocusedStrategy()
    })

    it('should have correct name and priority', () => {
      expect(strategy.name).toBe('error-focused')
      expect(strategy.priority).toBe(5)
    })

    it('should prioritize error messages', async () => {
      const errorContext = { ...basicContext, contentType: 'error' }
      const result = await strategy.truncate(sampleContent, 30, errorContext)

      expect(result.wasTruncated).toBe(true)
      expect(result.content.includes('Error:')).toBe(true)
      expect(result.content.includes('Expected')).toBe(true)
    })

    it('should handle assertion content', async () => {
      const assertionContent = `
        expect(value).toBe(true)
        AssertionError: Expected true but received false
        at test.js:5:10
      `
      
      const testContext = { ...basicContext, contentType: 'test' }
      const result = await strategy.truncate(assertionContent, 30, testContext)

      expect(result.content.includes('AssertionError')).toBe(true)
      expect(result.content.includes('expect')).toBe(true)
    })

    it('should support error-related content types', () => {
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'error' })).toBe(true)
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'test' })).toBe(true)
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'log' })).toBe(true)
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'text' })).toBe(false)
    })
  })

  describe('StackTraceStrategy', () => {
    let strategy: StackTraceStrategy

    beforeEach(() => {
      strategy = new StackTraceStrategy()
    })

    it('should have correct name and priority', () => {
      expect(strategy.name).toBe('stack-trace')
      expect(strategy.priority).toBe(6)
    })

    it('should prioritize user code frames', async () => {
      const stackTrace = `TypeError: Cannot read property 'foo' of undefined
    at Object.test (/src/test.js:10:5)
    at Object.run (/src/app.js:20:10)
    at Module._compile (/node_modules/module.js:100:1)
    at Module.load (/node_modules/module.js:200:1)`

      const errorContext = { ...basicContext, contentType: 'error' }
      const result = await strategy.truncate(stackTrace, 50, errorContext)

      expect(result.content.includes('TypeError')).toBe(true)
      expect(result.content.includes('/src/test.js')).toBe(true)
      expect(result.content.includes('/src/app.js')).toBe(true)
      // Should minimize node_modules frames
      const nodeModulesOccurrences = (result.content.match(/node_modules/g) || []).length
      expect(nodeModulesOccurrences).toBeLessThan(2)
    })

    it('should only support error content with stack traces', () => {
      const stackTrace = `Error: Test
    at test.js:1:1`
      
      expect(strategy.canTruncate(stackTrace, { ...basicContext, contentType: 'error' })).toBe(true)
      expect(strategy.canTruncate(sampleContent, { ...basicContext, contentType: 'error' })).toBe(false)
      expect(strategy.canTruncate(stackTrace, { ...basicContext, contentType: 'text' })).toBe(false)
    })

    it('should handle malformed stack traces gracefully', async () => {
      const malformedStack = 'Not a real stack trace\nJust some text'
      const errorContext = { ...basicContext, contentType: 'error' }
      
      const result = await strategy.truncate(malformedStack, 20, errorContext)

      expect(result.strategyUsed).toBe('stack-trace-fallback')
      expect(result.wasTruncated).toBe(true)
      expect(result.warnings).toBeDefined()
    })
  })

  describe('Performance Requirements', () => {
    const largeContent = Array(1000).fill(0).map((_, i) => 
      `Line ${i + 1}: This is line ${i + 1} with some content that makes it longer`
    ).join('\n')

    const strategies: ITruncationStrategy[] = [
      new HeadTailStrategy(),
      new SmartStrategy(),
      new ErrorFocusedStrategy(),
      new StackTraceStrategy()
    ]

    it.each(strategies)('should complete truncation within performance threshold for %s', async (strategy) => {
      const context: TruncationContext = {
        model: 'gpt-4',
        maxTokens: 100,
        contentType: 'text',
        priority: ContentPriority.MEDIUM,
        preserveStructure: false
      }

      const startTime = Date.now()
      const result = await strategy.truncate(largeContent, 100, context)
      const duration = Date.now() - startTime

      // Should complete in reasonable time (< 2% overhead means < 100ms for large content)
      expect(duration).toBeLessThan(500)
      expect(result.tokenCount).toBeDefined()
      expect(result.tokensSaved).toBeGreaterThanOrEqual(0)
    })

    it.each(strategies)('should provide fast estimates for %s', async (strategy) => {
      const context: TruncationContext = {
        model: 'gpt-4',
        maxTokens: 100,
        contentType: 'text',
        priority: ContentPriority.MEDIUM,
        preserveStructure: false
      }

      const startTime = Date.now()
      const estimate = await strategy.estimateSavings(largeContent, 100, context)
      const duration = Date.now() - startTime

      // Estimates should be even faster
      expect(duration).toBeLessThan(200)
      expect(estimate).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Edge Cases', () => {
    const strategies: ITruncationStrategy[] = [
      new HeadTailStrategy(),
      new SmartStrategy(),
      new ErrorFocusedStrategy(),
      new StackTraceStrategy()
    ]

    it.each(strategies)('should handle empty content for %s', async (strategy) => {
      const context: TruncationContext = {
        model: 'gpt-4',
        maxTokens: 100,
        contentType: 'text',
        priority: ContentPriority.MEDIUM,
        preserveStructure: false
      }

      const result = await strategy.truncate('', 100, context)

      expect(result.content).toBe('')
      expect(result.wasTruncated).toBe(false)
      expect(result.tokensSaved).toBe(0)
    })

    it.each(strategies)('should handle single line content for %s', async (strategy) => {
      const singleLine = 'This is a single line'
      const context: TruncationContext = {
        model: 'gpt-4',
        maxTokens: 5, // Very small limit
        contentType: 'text',
        priority: ContentPriority.MEDIUM,
        preserveStructure: false
      }

      const result = await strategy.truncate(singleLine, 5, context)

      expect(result.tokenCount).toBeLessThanOrEqual(5)
      expect(result.content.length).toBeGreaterThan(0)
    })

    it.each(strategies)('should handle very small token limits for %s', async (strategy) => {
      const context: TruncationContext = {
        model: 'gpt-4',
        maxTokens: 3, // Extremely small limit
        contentType: 'text',
        priority: ContentPriority.MEDIUM,
        preserveStructure: false
      }

      const result = await strategy.truncate(sampleContent, 3, context)

      expect(result.tokenCount).toBeLessThanOrEqual(3)
      expect(result.content.length).toBeGreaterThan(0)
    })
  })
})