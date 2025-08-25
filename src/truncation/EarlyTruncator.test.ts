/**
 * Tests for EarlyTruncator
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EarlyTruncator } from './EarlyTruncator'
import type { TruncationConfig } from '../types/reporter'

describe('EarlyTruncator', () => {
  let truncator: EarlyTruncator
  const defaultConfig: TruncationConfig = {
    enabled: true,
    maxTokens: 100,
    model: 'gpt-4',
    strategy: 'smart'
  }

  beforeEach(() => {
    truncator = new EarlyTruncator(defaultConfig)
  })

  describe('needsTruncation', () => {
    it('should return false for empty content', () => {
      expect(truncator.needsTruncation('')).toBe(false)
      expect(truncator.needsTruncation('   ')).toBe(false)
    })

    it('should return false for content under limit', () => {
      const shortContent = 'This is a short message.'
      expect(truncator.needsTruncation(shortContent)).toBe(false)
    })

    it('should return true for content over limit', () => {
      const longContent = 'x'.repeat(10000) // Much longer than token limit
      expect(truncator.needsTruncation(longContent)).toBe(true)
    })
  })

  describe('truncate', () => {
    it('should not truncate content under limit', () => {
      const content = 'Short content that fits.'
      const result = truncator.truncate(content)
      
      expect(result.content).toBe(content)
      expect(result.metrics.tokensRemoved).toBe(0)
      expect(result.metrics.strategy).toBe('none')
    })

    it('should truncate long content', () => {
      const longContent = 'Very long content. '.repeat(500)
      const result = truncator.truncate(longContent)
      
      expect(result.content.length).toBeLessThan(longContent.length)
      expect(result.metrics.tokensRemoved).toBeGreaterThan(0)
      expect(result.metrics.originalTokens).toBeGreaterThan(result.metrics.truncatedTokens)
    })

    describe('simple strategy', () => {
      beforeEach(() => {
        truncator = new EarlyTruncator({ ...defaultConfig, strategy: 'simple' })
      })

      it('should preserve head and tail', () => {
        const content = [
          'First line',
          ...Array(100).fill('Middle content'),
          'Last line'
        ].join('\n')
        
        const result = truncator.truncate(content)
        
        console.log('Simple strategy test - Content lines:', content.split('\n').length)
        console.log('Simple strategy test - Result:', result.content)
        console.log('Simple strategy test - Result lines:', result.content.split('\n'))
        
        expect(result.content).toContain('First line')
        expect(result.content).toContain('...')
        expect(result.content).toContain('Last line')
        expect(result.metrics.strategy).toBe('simple')
      })
    })

    describe('smart strategy', () => {
      it('should preserve lines with error keywords', () => {
        const content = [
          'Some normal log',
          'Error: Something went wrong',
          'More normal content',
          'Failed assertion: expected true',
          'Even more content',
          ...Array(200).fill('Filler content to make it long enough to trigger truncation')
        ].join('\n')
        
        const result = truncator.truncate(content)
        
        expect(result.content).toContain('Error: Something went wrong')
        expect(result.content).toContain('Failed assertion')
        expect(result.metrics.strategy).toBe('smart')
      })

      it('should include context lines', () => {
        const content = [
          'Line before error',
          'Error: Critical failure',
          'Line after error',
          ...Array(100).fill('Filler content')
        ].join('\n')
        
        const result = truncator.truncate(content)
        
        expect(result.content).toContain('Line before error')
        expect(result.content).toContain('Error: Critical failure')
        expect(result.content).toContain('Line after error')
      })
    })

    describe('priority strategy', () => {
      beforeEach(() => {
        truncator = new EarlyTruncator({ ...defaultConfig, strategy: 'priority' })
      })

      it('should preserve more content for high priority', () => {
        // Create realistic content with different priorities
        const errorContent = [
          'Error: Critical system failure',
          'Stack trace:',
          '  at critical.function() line 10',
          '  at important.process() line 25',
          ...Array(100).fill('Additional error context and details')
        ].join('\n')
        
        const debugContent = [
          'Debug: Verbose logging output',
          'Variable x = 123',
          'Variable y = 456',
          ...Array(100).fill('Debug trace information')
        ].join('\n')
        
        const criticalResult = truncator.truncate(errorContent, 'errors')
        const lowResult = truncator.truncate(debugContent, 'debug')
        
        // Both should be truncated
        expect(criticalResult.metrics.tokensRemoved).toBeGreaterThan(0)
        expect(lowResult.metrics.tokensRemoved).toBeGreaterThan(0)
        
        // Critical content should preserve more (have larger result)
        expect(criticalResult.content.length).toBeGreaterThan(lowResult.content.length)
      })
    })

    describe('error category handling', () => {
      it('should handle stack traces specially', () => {
        // Make the stack trace long enough to trigger truncation
        const stackTrace = [
          'Error: Test failed',
          '    at TestSuite.run (/home/user/project/test.js:10:5)',
          '    at Runner.execute (node_modules/test-runner/runner.js:50:10)',
          '    at async Promise.all',
          '    at UserCode.test (/home/user/project/mytest.js:25:3)',
          '    at Framework.internal (node_modules/framework/index.js:100:10)',
          ...Array(100).fill('    at SomeLongFunction (some/very/long/path/to/file.js:123:45)')
        ].join('\n')
        
        const result = truncator.truncate(stackTrace, 'errors')
        
        console.log('Error strategy test - Input length:', stackTrace.length)
        console.log('Error strategy test - Result:', result.content)
        console.log('Error strategy test - Strategy used:', result.metrics.strategy)
        console.log('Error strategy test - Contains node_modules?:', result.content.includes('node_modules'))
        console.log('Error strategy test - Contains omitted message?:', result.content.includes('omitted'))
        
        // Should keep error message
        expect(result.content).toContain('Error: Test failed')
        // Should keep user code frames
        expect(result.content).toContain('/home/user/project/test.js')
        expect(result.content).toContain('/home/user/project/mytest.js')
        // Should filter node_modules or indicate they were omitted
        const hasNodeModulesOmitted = result.content.includes('node_modules frames omitted')
        const hasNodeModulesPath = result.content.includes('node_modules/test-runner')
        expect(hasNodeModulesOmitted || !hasNodeModulesPath).toBe(true)
      })
    })

    describe('tiny limits', () => {
      it('should handle very small token limits', () => {
        truncator = new EarlyTruncator({ ...defaultConfig, maxTokens: 5 })
        
        const content = 'This is a long error message with lots of detail'
        const result = truncator.truncate(content)
        
        expect(result.content).toBe('...')
        expect(result.metrics.strategy).toBe('tiny-limit')
      })

      it('should extract error message for small limits', () => {
        truncator = new EarlyTruncator({ ...defaultConfig, maxTokens: 8 })
        
        const content = 'Error: Critical\nLots of other content here'
        const result = truncator.truncate(content)
        
        expect(result.content).toContain('Error')
        expect(result.content).toContain('...')
      })
    })
  })

  describe('metrics', () => {
    it('should record metrics only when tokens are removed', () => {
      // Short content - no truncation
      truncator.truncate('Short')
      expect(truncator.getMetrics()).toHaveLength(0)
      
      // Long content - truncation occurs
      const longContent = 'x'.repeat(10000)
      truncator.truncate(longContent)
      const metrics = truncator.getMetrics()
      
      expect(metrics).toHaveLength(1)
      expect(metrics[0].tokensRemoved).toBeGreaterThan(0)
      expect(metrics[0].timestamp).toBeDefined()
    })

    it('should limit metrics buffer to 100 entries', () => {
      const longContent = 'x'.repeat(10000)
      
      // Create 105 truncations
      for (let i = 0; i < 105; i++) {
        truncator.truncate(longContent + i) // Vary content slightly
      }
      
      const metrics = truncator.getMetrics()
      expect(metrics).toHaveLength(100)
    })
  })

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: TruncationConfig = {
        enabled: true,
        maxTokens: 200,
        strategy: 'simple'
      }
      
      truncator.updateConfig(newConfig)
      
      // Test that new config is applied
      const content = 'x'.repeat(1000)
      const result = truncator.truncate(content)
      expect(result.metrics.strategy).toBe('simple')
    })

    it('should update model', () => {
      const newConfig: TruncationConfig = {
        enabled: true,
        model: 'gpt-3.5-turbo'
      }
      
      truncator.updateConfig(newConfig)
      
      // Should use new model for token counting
      const content = 'Test content'
      const result = truncator.truncate(content)
      expect(result).toBeDefined()
    })
  })
})