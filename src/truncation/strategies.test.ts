/**
 * Truncation Strategies Test Suite
 *
 * Tests all truncation strategies for correctness and performance.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  HeadTailStrategy,
  SmartStrategy,
  ErrorFocusedStrategy,
  StackTraceStrategy,
  createTruncationStrategy,
  getBestStrategyForContentType,
  type TruncationContext,
  type ITruncationStrategy
} from './index.js'

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
    contentType: 'generic',
    originalSize: sampleContent.length,
    targetSize: 150,
    testId: 'test-1',
    filePath: '/src/test.js'
  }

  describe('HeadTailStrategy', () => {
    let strategy: HeadTailStrategy

    beforeEach(() => {
      strategy = new HeadTailStrategy()
    })

    it('should preserve content that fits within target size', async () => {
      const context = { ...basicContext, targetSize: 1000 }
      const result = await strategy.truncate(sampleContent, context)

      expect(result.wasTruncated).toBe(false)
      expect(result.content).toBe(sampleContent)
      expect(result.ratio).toBe(1)
      expect(result.strategy).toBe('head-tail')
    })

    it('should truncate content preserving head and tail', async () => {
      const result = await strategy.truncate(sampleContent, basicContext)

      expect(result.wasTruncated).toBe(true)
      expect(result.content.includes('Line 1:')).toBe(true)
      expect(result.content.includes('Line 10:')).toBe(true)
      expect(result.content.includes('...')).toBe(true)
      expect(result.finalSize).toBeLessThan(basicContext.targetSize)
      expect(result.performance?.duration).toBeGreaterThan(0)
    })

    it('should support different content types', () => {
      expect(strategy.supports('generic')).toBe(true)
      expect(strategy.supports('error-message')).toBe(true)
      expect(strategy.supports('stack-trace')).toBe(false)
    })

    it('should provide accurate estimates', async () => {
      const estimate = await strategy.estimate(sampleContent, basicContext)

      expect(estimate.wasTruncated).toBe(true)
      expect(estimate.ratio).toBeLessThan(1)
      expect(estimate.finalSize).toBeLessThan(basicContext.originalSize)
    })

    it('should handle custom configuration', async () => {
      const config = {
        headRatio: 0.6,
        tailRatio: 0.3,
        separator: '\n--- TRUNCATED ---\n'
      }
      
      const result = await strategy.truncate(sampleContent, basicContext, config)

      expect(result.content.includes('--- TRUNCATED ---')).toBe(true)
    })
  })

  describe('SmartStrategy', () => {
    let strategy: SmartStrategy

    beforeEach(() => {
      strategy = new SmartStrategy()
    })

    it('should prioritize important content', async () => {
      const result = await strategy.truncate(sampleContent, basicContext)

      expect(result.wasTruncated).toBe(true)
      expect(result.content.includes('Error:')).toBe(true)
      expect(result.strategy).toBe('smart')
    })

    it('should use fallback on analysis failure', async () => {
      const malformedContent = '\x00\x01\x02invalid content'
      const context = { ...basicContext, originalSize: malformedContent.length }
      
      const result = await strategy.truncate(malformedContent, context)

      expect(result.strategy).toBe('smart-fallback')
    })

    it('should support relevant content types', () => {
      expect(strategy.supports('error-message')).toBe(true)
      expect(strategy.supports('code-context')).toBe(true)
      expect(strategy.supports('stack-trace')).toBe(false)
    })

    it('should handle priority keywords', async () => {
      const config = {
        priorityKeywords: ['custom-error', 'important']
      }

      const contentWithKeywords = 'Normal line\ncustom-error: This is important\nAnother line'
      const context = {
        ...basicContext,
        originalSize: contentWithKeywords.length,
        targetSize: 50
      }

      const result = await strategy.truncate(contentWithKeywords, context, config)

      expect(result.content.includes('custom-error')).toBe(true)
    })
  })

  describe('ErrorFocusedStrategy', () => {
    let strategy: ErrorFocusedStrategy

    beforeEach(() => {
      strategy = new ErrorFocusedStrategy()
    })

    it('should prioritize error messages', async () => {
      const context = { ...basicContext, contentType: 'error-message' }
      const result = await strategy.truncate(sampleContent, context)

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
      
      const context = {
        ...basicContext,
        contentType: 'assertion' as const,
        originalSize: assertionContent.length
      }

      const result = await strategy.truncate(assertionContent, context)

      expect(result.content.includes('AssertionError')).toBe(true)
      expect(result.content.includes('expect')).toBe(true)
    })

    it('should support error-related content types', () => {
      expect(strategy.supports('error-message')).toBe(true)
      expect(strategy.supports('assertion')).toBe(true)
      expect(strategy.supports('stack-trace')).toBe(true)
      expect(strategy.supports('metadata')).toBe(false)
    })
  })

  describe('StackTraceStrategy', () => {
    let strategy: StackTraceStrategy

    beforeEach(() => {
      strategy = new StackTraceStrategy()
    })

    it('should prioritize user code frames', async () => {
      const stackTrace = `TypeError: Cannot read property 'foo' of undefined
    at Object.test (/src/test.js:10:5)
    at Object.run (/src/app.js:20:10)
    at Module._compile (/node_modules/module.js:100:1)
    at Module.load (/node_modules/module.js:200:1)`

      const context = {
        ...basicContext,
        contentType: 'stack-trace' as const,
        originalSize: stackTrace.length,
        targetSize: 200
      }

      const result = await strategy.truncate(stackTrace, context)

      expect(result.content.includes('TypeError')).toBe(true)
      expect(result.content.includes('/src/test.js')).toBe(true)
      expect(result.content.includes('/src/app.js')).toBe(true)
      // Should minimize node_modules frames
      expect(result.content.split('/node_modules/').length).toBeLessThan(3)
    })

    it('should only support stack trace content', () => {
      expect(strategy.supports('stack-trace')).toBe(true)
      expect(strategy.supports('error-message')).toBe(false)
      expect(strategy.supports('generic')).toBe(false)
    })

    it('should handle malformed stack traces gracefully', async () => {
      const malformedStack = 'Not a real stack trace\nJust some text'
      const context = {
        ...basicContext,
        contentType: 'stack-trace' as const,
        originalSize: malformedStack.length
      }

      const result = await strategy.truncate(malformedStack, context)

      expect(result.strategy).toBe('stack-trace-fallback')
      expect(result.wasTruncated).toBe(true)
    })
  })

  describe('Strategy Factory', () => {
    it('should create strategy instances', () => {
      const headTail = createTruncationStrategy('head-tail')
      const smart = createTruncationStrategy('smart')
      const errorFocused = createTruncationStrategy('error-focused')
      const stackTrace = createTruncationStrategy('stack-trace')

      expect(headTail).toBeInstanceOf(HeadTailStrategy)
      expect(smart).toBeInstanceOf(SmartStrategy)
      expect(errorFocused).toBeInstanceOf(ErrorFocusedStrategy)
      expect(stackTrace).toBeInstanceOf(StackTraceStrategy)
    })

    it('should recommend best strategy for content type', () => {
      expect(getBestStrategyForContentType('stack-trace')).toBe('stack-trace')
      expect(getBestStrategyForContentType('error-message')).toBe('error-focused')
      expect(getBestStrategyForContentType('assertion')).toBe('error-focused')
      expect(getBestStrategyForContentType('code-context')).toBe('smart')
      expect(getBestStrategyForContentType('console-output')).toBe('smart')
      expect(getBestStrategyForContentType('generic')).toBe('head-tail')
      expect(getBestStrategyForContentType('metadata')).toBe('head-tail')
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
        contentType: 'generic',
        originalSize: largeContent.length,
        targetSize: 1000
      }

      const startTime = Date.now()
      const result = await strategy.truncate(largeContent, context)
      const duration = Date.now() - startTime

      // Should complete in reasonable time (< 2% overhead means < 20ms for typical content)
      expect(duration).toBeLessThan(100)
      expect(result.performance?.duration).toBeDefined()
      expect(result.performance?.duration).toBeGreaterThan(0)
    })

    it.each(strategies)('should provide fast estimates for %s', async (strategy) => {
      const context: TruncationContext = {
        contentType: 'generic',
        originalSize: largeContent.length,
        targetSize: 1000
      }

      const startTime = Date.now()
      const estimate = await strategy.estimate(largeContent, context)
      const duration = Date.now() - startTime

      // Estimates should be even faster
      expect(duration).toBeLessThan(50)
      expect(estimate.finalSize).toBeGreaterThan(0)
      expect(estimate.ratio).toBeGreaterThan(0)
      expect(estimate.ratio).toBeLessThanOrEqual(1)
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
        contentType: 'generic',
        originalSize: 0,
        targetSize: 100
      }

      const result = await strategy.truncate('', context)

      expect(result.content).toBe('')
      expect(result.wasTruncated).toBe(false)
      expect(result.ratio).toBe(1)
    })

    it.each(strategies)('should handle single line content for %s', async (strategy) => {
      const singleLine = 'This is a single line'
      const context: TruncationContext = {
        contentType: 'generic',
        originalSize: singleLine.length,
        targetSize: 10
      }

      const result = await strategy.truncate(singleLine, context)

      expect(result.finalSize).toBeLessThanOrEqual(context.targetSize)
      expect(result.content.length).toBeGreaterThan(0)
    })

    it.each(strategies)('should handle very small target sizes for %s', async (strategy) => {
      const context: TruncationContext = {
        contentType: 'generic',
        originalSize: sampleContent.length,
        targetSize: 20
      }

      const result = await strategy.truncate(sampleContent, context)

      expect(result.finalSize).toBeLessThanOrEqual(context.targetSize)
      expect(result.content.length).toBeGreaterThan(0)
    })
  })
})