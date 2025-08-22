/**
 * Tests for TruncationEngine
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  TruncationEngine,
  getTruncationEngine,
  resetTruncationEngine,
  createTruncationEngine,
  type ITruncationEngine
} from './TruncationEngine'
import type {
  ITruncationStrategy,
  TruncationContext,
  TruncationResult,
  TruncationEngineConfig,
  TruncationStats
} from './types'
import { ContentType, ContentPriority } from './types'
import type { SupportedModel } from '../tokenization/types'
import type { TruncationConfig } from '../types/reporter'

// Mock TokenCounter - define outside of vi.mock to avoid hoisting issues
const mockTokenCounter = {
  count: vi.fn(),
  estimate: vi.fn()
}

// Initialize mock return values
mockTokenCounter.count.mockResolvedValue(1000)
mockTokenCounter.estimate.mockReturnValue(1000)

vi.mock('../tokenization/TokenCounter.js', () => ({
  getTokenCounter: () => mockTokenCounter
}))

// Mock context utilities
vi.mock('./context.js', () => ({
  createTruncationContext: (model: string, contentType: string, options: any = {}) => ({
    model,
    contentType,
    maxTokens: options.maxTokens || 8000,
    priority: options.priority || 'high',
    preserveStructure: options.preserveStructure || false,
    metadata: options.metadata || {}
  }),
  getEffectiveMaxTokens: (model: string) => 8000,
  wouldExceedContext: (tokenCount: number, model: string, maxTokens?: number) => {
    const limit = maxTokens || 8000
    return tokenCount > limit
  },
  calculateTruncationTarget: (model: string) => 6000
}))

// Mock priority utilities
vi.mock('./priorities.js', () => ({
  defaultPriorityManager: {},
  getContentPriority: () => 'HIGH'
}))

describe('TruncationEngine', () => {
  let engine: TruncationEngine
  let mockStrategy: ITruncationStrategy

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up mock strategy
    mockStrategy = {
      name: 'test-strategy',
      priority: 100,
      canTruncate: vi.fn().mockReturnValue(true),
      truncate: vi.fn().mockResolvedValue({
        content: 'truncated content',
        tokenCount: 500,
        tokensSaved: 500,
        wasTruncated: true,
        strategyUsed: 'test-strategy'
      }),
      estimateSavings: vi.fn().mockResolvedValue(500)
    }

    engine = new TruncationEngine()
    engine.registerStrategy(mockStrategy)
  })

  afterEach(() => {
    resetTruncationEngine()
  })

  describe('constructor', () => {
    it('should create engine with default config', () => {
      const defaultEngine = new TruncationEngine()
      const config = defaultEngine.getConfig()

      expect(config.defaultModel).toBe('gpt-4')
      expect(config.maxAttempts).toBe(3)
      expect(config.enableAggressiveFallback).toBe(true)
      expect(config.strategyConfigs).toEqual({})
    })

    it('should apply custom configuration', () => {
      const customConfig: TruncationEngineConfig = {
        defaultModel: 'gpt-3.5-turbo',
        maxAttempts: 5,
        enableAggressiveFallback: false,
        strategyConfigs: {
          'test-strategy': { priority: 200 }
        }
      }

      const customEngine = new TruncationEngine(customConfig)
      const config = customEngine.getConfig()

      expect(config.defaultModel).toBe('gpt-3.5-turbo')
      expect(config.maxAttempts).toBe(5)
      expect(config.enableAggressiveFallback).toBe(false)
      expect(config.strategyConfigs).toEqual({ 'test-strategy': { priority: 200 } })
    })

    it('should initialize with default stats', () => {
      const stats = engine.getStats()

      expect(stats.totalTruncations).toBe(0)
      expect(stats.totalTokensSaved).toBe(0)
      expect(stats.averageTokensSaved).toBe(0)
      expect(stats.strategyUsage).toEqual({})
      expect(stats.contentTypeBreakdown).toEqual({})
    })
  })

  describe('strategy management', () => {
    it('should register strategies', () => {
      const newStrategy: ITruncationStrategy = {
        name: 'new-strategy',
        priority: 50,
        canTruncate: vi.fn().mockReturnValue(true),
        truncate: vi.fn(),
        estimateSavings: vi.fn()
      }

      engine.registerStrategy(newStrategy)

      expect(engine.getStrategy('new-strategy')).toBe(newStrategy)
      expect(engine.getStrategies()).toContain(newStrategy)
    })

    it('should unregister strategies', () => {
      engine.unregisterStrategy('test-strategy')

      expect(engine.getStrategy('test-strategy')).toBeUndefined()
      expect(engine.getStrategies()).not.toContain(mockStrategy)
    })

    it('should return all registered strategies', () => {
      const strategies = engine.getStrategies()

      expect(strategies).toContain(mockStrategy)
      expect(strategies).toHaveLength(1)
    })

    it('should get strategy by name', () => {
      expect(engine.getStrategy('test-strategy')).toBe(mockStrategy)
      expect(engine.getStrategy('nonexistent')).toBeUndefined()
    })

    it('should handle duplicate strategy registration', () => {
      const duplicateStrategy: ITruncationStrategy = {
        name: 'test-strategy', // Same name
        priority: 200,
        canTruncate: vi.fn(),
        truncate: vi.fn(),
        estimateSavings: vi.fn()
      }

      engine.registerStrategy(duplicateStrategy)

      expect(engine.getStrategy('test-strategy')).toBe(duplicateStrategy) // Latest wins
    })
  })

  describe('truncate', () => {
    it('should return empty result for empty content', async () => {
      const result = await engine.truncate('', 'gpt-4', ContentType.ERROR)

      expect(result.content).toBe('')
      expect(result.tokenCount).toBe(0)
      expect(result.wasTruncated).toBe(false)
      expect(result.strategyUsed).toBe('empty-content')
    })

    it('should return original content when no truncation needed', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(500) // Below limit

      const content = 'short content'
      const result = await engine.truncate(content, 'gpt-4', ContentType.ERROR)

      expect(result.content).toBe(content)
      expect(result.tokenCount).toBe(500)
      expect(result.wasTruncated).toBe(false)
      expect(result.strategyUsed).toBe('none')
      expect(result.tokensSaved).toBe(0)
    })

    it('should successfully truncate content with available strategy', async () => {
      mockTokenCounter.count
        .mockResolvedValueOnce(10000) // Initial count (exceeds limit)
        .mockResolvedValueOnce(400) // After truncation (within limit)

      const content = 'long content that needs truncation'
      const result = await engine.truncate(content, 'gpt-4', ContentType.ERROR)

      expect(result.content).toBe('truncated content')
      expect(result.tokenCount).toBe(400)
      expect(result.wasTruncated).toBe(true)
      expect(result.strategyUsed).toBe('test-strategy')
      expect(result.tokensSaved).toBe(9600) // 10000 - 400

      expect(mockStrategy.truncate).toHaveBeenCalledWith(content, 8000, expect.any(Object))
    })

    it('should try multiple strategies if first fails', async () => {
      const failingStrategy: ITruncationStrategy = {
        name: 'failing-strategy',
        priority: 200, // Higher priority
        canTruncate: vi.fn().mockReturnValue(true),
        truncate: vi.fn().mockRejectedValue(new Error('Strategy failed')),
        estimateSavings: vi.fn()
      }

      engine.registerStrategy(failingStrategy)

      mockTokenCounter.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(400)

      const content = 'content to truncate'
      const result = await engine.truncate(content, 'gpt-4', ContentType.ERROR)

      expect(failingStrategy.truncate).toHaveBeenCalled()
      expect(mockStrategy.truncate).toHaveBeenCalled()
      expect(result.strategyUsed).toBe('test-strategy')
    })

    it('should respect maxAttempts configuration', async () => {
      const limitedEngine = new TruncationEngine({ maxAttempts: 1 })

      const failingStrategy: ITruncationStrategy = {
        name: 'failing-strategy',
        priority: 200,
        canTruncate: vi.fn().mockReturnValue(true),
        truncate: vi.fn().mockRejectedValue(new Error('Failed')),
        estimateSavings: vi.fn()
      }

      limitedEngine.registerStrategy(failingStrategy)
      limitedEngine.registerStrategy(mockStrategy)

      mockTokenCounter.count.mockResolvedValue(10000)

      const content = 'content to truncate'
      const result = await limitedEngine.truncate(content, 'gpt-4', ContentType.ERROR)

      expect(failingStrategy.truncate).toHaveBeenCalledTimes(1)
      expect(mockStrategy.truncate).not.toHaveBeenCalled() // Should stop after max attempts
    })

    it('should use preferred strategies when specified', async () => {
      const lowPriorityStrategy: ITruncationStrategy = {
        name: 'low-priority',
        priority: 10, // Lower than test-strategy
        canTruncate: vi.fn().mockReturnValue(true),
        truncate: vi.fn().mockResolvedValue({
          content: 'low priority result',
          tokenCount: 400,
          tokensSaved: 600,
          wasTruncated: true,
          strategyUsed: 'low-priority'
        }),
        estimateSavings: vi.fn()
      }

      engine.registerStrategy(lowPriorityStrategy)

      mockTokenCounter.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(400)

      const result = await engine.truncate('content', 'gpt-4', ContentType.ERROR, {
        preferredStrategies: ['low-priority']
      })

      expect(lowPriorityStrategy.truncate).toHaveBeenCalled()
      expect(result.strategyUsed).toBe('low-priority')
    })

    it('should use aggressive fallback when no strategies available', async () => {
      engine.unregisterStrategy('test-strategy') // Remove all strategies

      mockTokenCounter.count.mockResolvedValue(10000)

      const content = 'very long content that needs aggressive truncation'
      const result = await engine.truncate(content, 'gpt-4', ContentType.ERROR)

      expect(result.content).toContain('[Content truncated by aggressive fallback]')
      expect(result.strategyUsed).toBe('aggressive-fallback')
      expect(result.wasTruncated).toBe(true)
      expect(result.warnings).toContain(
        'Used aggressive fallback truncation - content may be incomplete'
      )
    })

    it('should disable aggressive fallback when configured', async () => {
      const noFallbackEngine = new TruncationEngine({ enableAggressiveFallback: false })

      mockTokenCounter.count.mockResolvedValue(10000)

      const content = 'content that needs truncation'
      const result = await noFallbackEngine.truncate(content, 'gpt-4', ContentType.ERROR)

      expect(result.content).toBe(content) // Original content returned
      expect(result.strategyUsed).toBe('no-strategies')
      expect(result.wasTruncated).toBe(false)
      expect(result.warnings).toContain('Truncation failed - content exceeds token limits')
    })

    it("should handle strategy that doesn't achieve target", async () => {
      mockStrategy.truncate.mockResolvedValue({
        content: 'partially truncated',
        tokenCount: 9000, // Still too high (over 8000 limit)
        tokensSaved: 1000,
        wasTruncated: true,
        strategyUsed: 'test-strategy',
        warnings: []  // Include warnings array in mock result
      })

      mockTokenCounter.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(9000) // Still exceeds 8000 limit

      const result = await engine.truncate('content', 'gpt-4', ContentType.ERROR)

      expect(result.warnings).toBeDefined()
      expect(result.warnings).toContain('Strategy test-strategy did not achieve target token count')
      expect(result.tokenCount).toBe(9000)
      expect(result.wasTruncated).toBe(true)
    })

    it('should update statistics on successful truncation', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(400)

      await engine.truncate('content', 'gpt-4', ContentType.ERROR)

      const stats = engine.getStats()
      expect(stats.totalTruncations).toBe(1)
      expect(stats.totalTokensSaved).toBe(9600)
      expect(stats.averageTokensSaved).toBe(9600)
      expect(stats.strategyUsage['test-strategy']).toBe(1)
      expect(stats.contentTypeBreakdown[ContentType.ERROR]).toBe(1)
    })

    it('should handle custom options', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(5000).mockResolvedValueOnce(300)

      const options = {
        maxTokens: 4000,
        priority: ContentPriority.MEDIUM,
        preserveStructure: true,
        metadata: { source: 'test' }
      }

      await engine.truncate('content', 'gpt-4', ContentType.ERROR, options)

      expect(mockStrategy.truncate).toHaveBeenCalledWith(
        'content',
        4000, // Custom maxTokens
        expect.objectContaining({
          model: 'gpt-4',
          contentType: ContentType.ERROR,
          maxTokens: 4000,
          priority: ContentPriority.MEDIUM,
          preserveStructure: true,
          metadata: { source: 'test' }
        })
      )
    })
  })

  describe('estimateSavings', () => {
    it("should return 0 for content that doesn't need truncation", async () => {
      mockTokenCounter.count.mockResolvedValueOnce(500) // Below limit

      const savings = await engine.estimateSavings('short content', 'gpt-4', ContentType.ERROR)

      expect(savings).toBe(0)
    })

    it('should estimate savings using best strategy', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(10000)

      const highSavingsStrategy: ITruncationStrategy = {
        name: 'high-savings',
        priority: 100,
        canTruncate: vi.fn().mockReturnValue(true),
        truncate: vi.fn(),
        estimateSavings: vi.fn().mockResolvedValue(8000)
      }

      engine.registerStrategy(highSavingsStrategy)

      const savings = await engine.estimateSavings('long content', 'gpt-4', ContentType.ERROR)

      expect(savings).toBe(8000) // Best estimate from strategies
    })

    it('should handle strategy estimation failures', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(10000)
      mockStrategy.estimateSavings.mockRejectedValue(new Error('Estimation failed'))

      const savings = await engine.estimateSavings('content', 'gpt-4', ContentType.ERROR)

      expect(savings).toBe(0) // Falls back to 0 when all estimates fail
    })

    it('should use fallback estimation when no strategies available', async () => {
      engine.unregisterStrategy('test-strategy')
      mockTokenCounter.count.mockResolvedValueOnce(10000)

      const savings = await engine.estimateSavings('content', 'gpt-4', ContentType.ERROR)

      expect(savings).toBe(2000) // 10000 - 8000 (effective max)
    })
  })

  describe('needsTruncation', () => {
    it('should return true when content exceeds limits', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(10000)

      const needsTruncation = await engine.needsTruncation('long content', 'gpt-4')

      expect(needsTruncation).toBe(true)
    })

    it('should return false when content is within limits', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(500)

      const needsTruncation = await engine.needsTruncation('short content', 'gpt-4')

      expect(needsTruncation).toBe(false)
    })

    it('should respect custom maxTokens', async () => {
      mockTokenCounter.count.mockResolvedValueOnce(3000)

      const needsTruncation = await engine.needsTruncation('content', 'gpt-4', 2000)

      expect(needsTruncation).toBe(true)
    })
  })

  describe('statistics management', () => {
    it('should return copy of stats', () => {
      const stats1 = engine.getStats()
      const stats2 = engine.getStats()

      expect(stats1).not.toBe(stats2) // Different objects
      expect(stats1).toEqual(stats2) // Same content
    })

    it('should reset statistics', () => {
      // First add some stats
      engine['updateStats'](
        {
          content: 'test',
          tokenCount: 500,
          tokensSaved: 100,
          wasTruncated: true,
          strategyUsed: 'test-strategy'
        },
        'error-message'
      )

      expect(engine.getStats().totalTruncations).toBe(1)

      // Reset
      engine.resetStats()

      const stats = engine.getStats()
      expect(stats.totalTruncations).toBe(0)
      expect(stats.totalTokensSaved).toBe(0)
      expect(stats.averageTokensSaved).toBe(0)
      expect(stats.strategyUsage).toEqual({})
      expect(stats.contentTypeBreakdown).toEqual({})
    })

    it('should calculate average tokens saved correctly', () => {
      engine['updateStats'](
        {
          content: 'test1',
          tokenCount: 500,
          tokensSaved: 100,
          wasTruncated: true,
          strategyUsed: 'test-strategy'
        },
        'error-message'
      )

      engine['updateStats'](
        {
          content: 'test2',
          tokenCount: 600,
          tokensSaved: 200,
          wasTruncated: true,
          strategyUsed: 'test-strategy'
        },
        'error-message'
      )

      const stats = engine.getStats()
      expect(stats.totalTruncations).toBe(2)
      expect(stats.totalTokensSaved).toBe(300)
      expect(stats.averageTokensSaved).toBe(150) // 300 / 2
    })

    it('should track strategy usage', () => {
      engine['updateStats'](
        {
          content: 'test1',
          tokenCount: 500,
          tokensSaved: 100,
          wasTruncated: true,
          strategyUsed: 'strategy-a'
        },
        'error-message'
      )

      engine['updateStats'](
        {
          content: 'test2',
          tokenCount: 600,
          tokensSaved: 200,
          wasTruncated: true,
          strategyUsed: 'strategy-a'
        },
        'error-message'
      )

      engine['updateStats'](
        {
          content: 'test3',
          tokenCount: 700,
          tokensSaved: 300,
          wasTruncated: true,
          strategyUsed: 'strategy-b'
        },
        'error-message'
      )

      const stats = engine.getStats()
      expect(stats.strategyUsage['strategy-a']).toBe(2)
      expect(stats.strategyUsage['strategy-b']).toBe(1)
    })

    it('should track content type breakdown', () => {
      engine['updateStats'](
        {
          content: 'test1',
          tokenCount: 500,
          tokensSaved: 100,
          wasTruncated: true,
          strategyUsed: 'test-strategy'
        },
        'error-message'
      )

      engine['updateStats'](
        {
          content: 'test2',
          tokenCount: 600,
          tokensSaved: 200,
          wasTruncated: true,
          strategyUsed: 'test-strategy'
        },
        'stack-trace'
      )

      const stats = engine.getStats()
      expect(stats.contentTypeBreakdown['error-message']).toBe(1)
      expect(stats.contentTypeBreakdown['stack-trace']).toBe(1)
    })
  })

  describe('strategy selection', () => {
    it('should filter strategies that cannot handle content', async () => {
      const incompatibleStrategy: ITruncationStrategy = {
        name: 'incompatible',
        priority: 200,
        canTruncate: vi.fn().mockReturnValue(false), // Cannot handle
        truncate: vi.fn(),
        estimateSavings: vi.fn()
      }

      engine.registerStrategy(incompatibleStrategy)

      mockTokenCounter.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(400)

      await engine.truncate('content', 'gpt-4', ContentType.ERROR)

      expect(incompatibleStrategy.truncate).not.toHaveBeenCalled()
      expect(mockStrategy.truncate).toHaveBeenCalled()
    })

    it('should sort strategies by priority', async () => {
      const highPriorityStrategy: ITruncationStrategy = {
        name: 'high-priority',
        priority: 300,
        canTruncate: vi.fn().mockReturnValue(true),
        truncate: vi.fn().mockResolvedValue({
          content: 'high priority result',
          tokenCount: 400,
          tokensSaved: 600,
          wasTruncated: true,
          strategyUsed: 'high-priority'
        }),
        estimateSavings: vi.fn()
      }

      engine.registerStrategy(highPriorityStrategy)

      mockTokenCounter.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(400)

      const result = await engine.truncate('content', 'gpt-4', ContentType.ERROR)

      expect(highPriorityStrategy.truncate).toHaveBeenCalled()
      expect(result.strategyUsed).toBe('high-priority')
    })
  })
})

describe('factory functions', () => {
  afterEach(() => {
    resetTruncationEngine()
  })

  describe('getTruncationEngine', () => {
    it('should return singleton instance', () => {
      const engine1 = getTruncationEngine()
      const engine2 = getTruncationEngine()

      expect(engine1).toBe(engine2)
    })

    it('should create with custom config on first call', () => {
      const config: TruncationEngineConfig = {
        defaultModel: 'gpt-3.5-turbo',
        maxAttempts: 5
      }

      const engine = getTruncationEngine(config)
      expect(engine.getConfig().defaultModel).toBe('gpt-3.5-turbo')
      expect(engine.getConfig().maxAttempts).toBe(5)
    })

    it('should ignore config on subsequent calls', () => {
      getTruncationEngine({ defaultModel: 'gpt-4' })
      const engine = getTruncationEngine({ defaultModel: 'gpt-3.5-turbo' })

      expect(engine.getConfig().defaultModel).toBe('gpt-4') // First call wins
    })
  })

  describe('resetTruncationEngine', () => {
    it('should reset singleton instance', () => {
      const engine1 = getTruncationEngine()
      resetTruncationEngine()
      const engine2 = getTruncationEngine()

      expect(engine1).not.toBe(engine2)
    })
  })
})

describe('legacy compatibility layer', () => {
  describe('createTruncationEngine', () => {
    let legacyEngine: ITruncationEngine

    beforeEach(() => {
      const config: TruncationConfig = {
        model: 'gpt-4',
        maxTokens: 8000
      }
      legacyEngine = createTruncationEngine(config)
    })

    it('should create legacy-compatible engine', () => {
      expect(legacyEngine).toBeDefined()
      expect(typeof legacyEngine.needsTruncation).toBe('function')
      expect(typeof legacyEngine.truncate).toBe('function')
      expect(typeof legacyEngine.getMetrics).toBe('function')
      expect(typeof legacyEngine.updateConfig).toBe('function')
    })

    it('should check if content needs truncation', () => {
      mockTokenCounter.estimate.mockReturnValueOnce(10000) // Exceeds limit

      const needsTruncation = legacyEngine.needsTruncation('long content')
      expect(needsTruncation).toBe(true)

      mockTokenCounter.estimate.mockReturnValueOnce(500) // Within limit
      const needsTruncation2 = legacyEngine.needsTruncation('short content')
      expect(needsTruncation2).toBe(false)
    })

    it('should truncate content synchronously', () => {
      mockTokenCounter.estimate
        .mockReturnValueOnce(10000) // Initial estimate
        .mockReturnValueOnce(7000) // After truncation

      const result = legacyEngine.truncate('very long content that needs truncation')

      expect(result.content).toBeDefined()
      expect(result.content.length).toBeLessThan('very long content that needs truncation'.length)
      expect(result.metrics.originalTokens).toBe(10000)
      expect(result.metrics.truncatedTokens).toBe(7000)
      expect(result.metrics.tokensRemoved).toBe(3000)
    })

    it('should return original content when no truncation needed', () => {
      mockTokenCounter.estimate.mockReturnValue(500) // Within limit

      const content = 'short content'
      const result = legacyEngine.truncate(content)

      expect(result.content).toBe(content)
      expect(result.metrics.originalTokens).toBe(500)
      expect(result.metrics.truncatedTokens).toBe(500)
      expect(result.metrics.tokensRemoved).toBe(0)
    })

    it('should maintain metrics history', () => {
      // Reset mock to clear any previous setup
      mockTokenCounter.estimate.mockReset()
      
      // Mock first truncation (content 1) - needs truncation
      mockTokenCounter.estimate
        .mockReturnValueOnce(10000)  // Initial estimate for content 1 (over limit)
        .mockReturnValueOnce(7000)   // After truncation estimate for content 1
        // Mock second truncation (content 2) - needs truncation
        .mockReturnValueOnce(8001)   // Initial estimate for content 2 (over limit, needs truncation)
        .mockReturnValueOnce(6000)   // After truncation estimate for content 2

      legacyEngine.truncate('content 1 that is very long and needs truncation')
      legacyEngine.truncate('content 2 also long')

      const metrics = legacyEngine.getMetrics()

      expect(metrics).toHaveLength(2)
      expect(metrics[0].originalTokens).toBe(10000)
      expect(metrics[0].truncatedTokens).toBe(7000)
      expect(metrics[0].strategy).toBe('legacy-character-based')
      expect(metrics[0].timestamp).toBeGreaterThan(0)
    })

    it('should limit metrics history size', () => {
      // Reset mock to clear any previous setup
      mockTokenCounter.estimate.mockReset()
      
      // Mock many truncations - each truncate call needs 2 estimate calls
      const mockValues: number[] = []
      for (let i = 0; i < 150; i++) {
        mockValues.push(10000, 8000) // Each truncation needs 2 values, both showing truncation happened
      }
      
      // Apply all mock values at once
      mockValues.forEach(value => {
        mockTokenCounter.estimate.mockReturnValueOnce(value)
      })
      
      // Perform 150 truncations with long content to ensure truncation happens
      for (let i = 0; i < 150; i++) {
        legacyEngine.truncate(`This is a very long content string number ${i} that needs to be truncated`)
      }

      const metrics = legacyEngine.getMetrics()
      expect(metrics).toHaveLength(100) // Limited to 100
    })

    it('should update configuration', () => {
      // Clear any previous mock setups
      mockTokenCounter.estimate.mockReset()
      
      legacyEngine.updateConfig({
        maxTokens: 4000,
        model: 'gpt-3.5-turbo'
      })

      // Configuration update is internal, verify by behavior
      mockTokenCounter.estimate.mockReturnValue(5000) // Above new limit of 4000

      const needsTruncation = legacyEngine.needsTruncation('content')
      expect(needsTruncation).toBe(true)
    })

    it('should handle boundary detection in truncation', () => {
      mockTokenCounter.estimate.mockReturnValueOnce(10000).mockReturnValueOnce(6000)

      const content =
        'This is a sentence. This is another sentence.\nThis is a new line. Final sentence.'
      const result = legacyEngine.truncate(content)

      // Should try to end at a reasonable boundary
      expect(result.content).toBeDefined()
      expect(result.content.length).toBeLessThan(content.length)
    })

    it('should handle very short content that needs slight truncation', () => {
      mockTokenCounter.estimate
        .mockReturnValueOnce(9000) // Slightly over limit
        .mockReturnValueOnce(7500)

      const content = 'Short content'
      const result = legacyEngine.truncate(content)

      expect(result.content).toBeDefined()
      expect(result.metrics.tokensRemoved).toBeGreaterThan(0)
    })
  })
})
