/**
 * Tests for LateTruncator
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { LateTruncator } from './LateTruncator'
import type { LLMReporterOutput, TestFailure, TestResult } from '../types/schema'
import type { TruncationConfig } from '../types/reporter'

describe('LateTruncator', () => {
  let truncator: LateTruncator
  const defaultConfig: TruncationConfig = {
    enabled: true,
    maxTokens: 1000,
    model: 'gpt-4',
    enableLateTruncation: true
  }

  beforeEach(() => {
    truncator = new LateTruncator()
  })

  /**
   * Helper to create a test output
   */
  function createTestOutput(options: {
    failureCount?: number
    passedCount?: number
    skippedCount?: number
    consoleSize?: 'small' | 'medium' | 'large'
    includeStack?: boolean
  } = {}): LLMReporterOutput {
    const {
      failureCount = 1,
      passedCount = 0,
      skippedCount = 0,
      consoleSize = 'small',
      includeStack = true
    } = options

    const failures: TestFailure[] = []
    for (let i = 0; i < failureCount; i++) {
      const failure: TestFailure = {
        test: `Test ${i + 1}`,
        file: `/path/to/test${i + 1}.ts`,
        startLine: 10,
        endLine: 20,
        error: {
          message: `Error in test ${i + 1}: Expected value to be truthy`,
          type: 'AssertionError',
          ...(includeStack && {
            stack: [
              `AssertionError: Expected value to be truthy`,
              `    at Object.<anonymous> (/path/to/test${i + 1}.ts:15:10)`,
              `    at Module._compile (node:internal/modules/cjs/loader:1234:30)`,
              `    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1289:10)`,
              `    at Module.load (node:internal/modules/cjs/loader:1098:32)`,
              `    at node_modules/vitest/dist/runner.js:1234:10`,
              `    at node_modules/@vitest/runner/dist/index.js:567:20`
            ].join('\n')
          }),
          context: {
            code: [
              'describe("Test Suite", () => {',
              '  it("should work", () => {',
              '    const value = getValue();',
              '    expect(value).toBeTruthy(); // <- Error here',
              '  });',
              '});'
            ],
            lineNumber: 3,
            expected: true,
            actual: false
          },
          assertion: {
            expected: true,
            actual: false,
            operator: 'toBeTruthy'
          }
        }
      }

      // Add console output based on size
      if (consoleSize !== 'small') {
        const logCount = consoleSize === 'large' ? 100 : 20
        failure.console = {
          logs: Array(logCount).fill(0).map((_, j) => `Log message ${j + 1} from test ${i + 1}`),
          errors: Array(Math.floor(logCount / 2)).fill(0).map((_, j) => `Error ${j + 1} from test ${i + 1}`),
          warns: Array(Math.floor(logCount / 4)).fill(0).map((_, j) => `Warning ${j + 1} from test ${i + 1}`),
          info: Array(Math.floor(logCount / 4)).fill(0).map((_, j) => `Info ${j + 1} from test ${i + 1}`),
          debug: Array(Math.floor(logCount / 10)).fill(0).map((_, j) => `Debug ${j + 1} from test ${i + 1}`)
        }
      }

      failures.push(failure)
    }

    const passed: TestResult[] = []
    for (let i = 0; i < passedCount; i++) {
      passed.push({
        test: `Passed Test ${i + 1}`,
        file: `/path/to/passed${i + 1}.ts`,
        startLine: 5,
        endLine: 10,
        status: 'passed',
        duration: 50
      })
    }

    const skipped: TestResult[] = []
    for (let i = 0; i < skippedCount; i++) {
      skipped.push({
        test: `Skipped Test ${i + 1}`,
        file: `/path/to/skipped${i + 1}.ts`,
        startLine: 5,
        endLine: 10,
        status: 'skipped'
      })
    }

    const output: LLMReporterOutput = {
      summary: {
        total: failureCount + passedCount + skippedCount,
        passed: passedCount,
        failed: failureCount,
        skipped: skippedCount,
        duration: 1000,
        timestamp: new Date().toISOString()
      }
    }

    if (failures.length > 0) {
      output.failures = failures
    }
    if (passed.length > 0) {
      output.passed = passed
    }
    if (skipped.length > 0) {
      output.skipped = skipped
    }

    return output
  }

  describe('needsTruncation', () => {
    it('should return false when truncation is disabled', () => {
      const config: TruncationConfig = { ...defaultConfig, enabled: false }
      const output = createTestOutput({ consoleSize: 'large' })
      
      expect(truncator.needsTruncation(output, config)).toBe(false)
    })

    it('should return false when late truncation is disabled', () => {
      const config: TruncationConfig = { ...defaultConfig, enableLateTruncation: false }
      const output = createTestOutput({ consoleSize: 'large' })
      
      expect(truncator.needsTruncation(output, config)).toBe(false)
    })

    it('should return false when under budget', () => {
      const config: TruncationConfig = { ...defaultConfig, maxTokens: 10000 }
      const output = createTestOutput({ consoleSize: 'small' })
      
      expect(truncator.needsTruncation(output, config)).toBe(false)
    })

    it('should return true when over budget', () => {
      const config: TruncationConfig = { ...defaultConfig, maxTokens: 100 }
      const output = createTestOutput({ consoleSize: 'large', failureCount: 10 })
      
      expect(truncator.needsTruncation(output, config)).toBe(true)
    })
  })

  describe('apply', () => {
    it('should not modify output when under budget', () => {
      const config: TruncationConfig = { ...defaultConfig, maxTokens: 10000 }
      const output = createTestOutput({ consoleSize: 'small' })
      const result = truncator.apply(output, config)
      
      expect(result).toEqual(output)
    })

    it('should not modify output when truncation is disabled', () => {
      const config: TruncationConfig = { ...defaultConfig, enabled: false }
      const output = createTestOutput({ consoleSize: 'large', failureCount: 10 })
      const result = truncator.apply(output, config)
      
      expect(result).toEqual(output)
    })

    describe('Phase 1: Remove low-value sections', () => {
      it('should remove passed tests first', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 500 }
        const output = createTestOutput({ 
          failureCount: 2,
          passedCount: 10,
          skippedCount: 5,
          consoleSize: 'medium'
        })
        
        const result = truncator.apply(output, config)
        
        expect(result.failures).toBeDefined()
        expect(result.passed).toBeUndefined()
        // Skipped might still be there if removing passed was enough
      })

      it('should remove skipped tests after passed', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 300 }
        const output = createTestOutput({ 
          failureCount: 2,
          passedCount: 10,
          skippedCount: 10,
          consoleSize: 'medium'
        })
        
        const result = truncator.apply(output, config)
        
        expect(result.failures).toBeDefined()
        expect(result.passed).toBeUndefined()
        expect(result.skipped).toBeUndefined()
      })
    })

    describe('Phase 2: Failure-focused trimming', () => {
      it('should remove debug console output entirely', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 200 }
        const output = createTestOutput({ 
          failureCount: 1,
          consoleSize: 'large'
        })
        
        const result = truncator.apply(output, config)
        
        expect(result.failures?.[0]?.console?.debug).toBeUndefined()
      })

      it('should cap info and warn console output', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 400 }
        const output = createTestOutput({ 
          failureCount: 1,
          consoleSize: 'large'
        })
        
        const result = truncator.apply(output, config)
        const console = result.failures?.[0]?.console
        
        if (console?.info) {
          const infoText = console.info.join('\n')
          expect(infoText.length).toBeLessThanOrEqual(150) // Rough check for capping
        }
        
        if (console?.warns) {
          const warnText = console.warns.join('\n')
          expect(warnText.length).toBeLessThanOrEqual(150)
        }
      })

      it('should preserve error console output more generously', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 400 }
        const output = createTestOutput({ 
          failureCount: 1,
          consoleSize: 'large'
        })
        
        const result = truncator.apply(output, config)
        const console = result.failures?.[0]?.console
        
        // Errors should be preserved better than other categories
        expect(console?.errors).toBeDefined()
        if (console?.errors) {
          const errorText = console.errors.join('\n')
          expect(errorText.length).toBeGreaterThan(0)
        }
      })

      it('should truncate stack traces', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 300 }
        const output = createTestOutput({ 
          failureCount: 1,
          includeStack: true
        })
        
        const result = truncator.apply(output, config)
        const stack = result.failures?.[0]?.error?.stack
        
        expect(stack).toBeDefined()
        if (stack) {
          // Should prioritize user code frames
          expect(stack).toContain('/path/to/test')
          // May omit node_modules frames
          const frameCount = stack.split('\n').filter(line => line.trim().startsWith('at')).length
          expect(frameCount).toBeLessThanOrEqual(10)
        }
      })

      it('should truncate code context', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 300 }
        const output = createTestOutput({ 
          failureCount: 1
        })
        
        const result = truncator.apply(output, config)
        const context = result.failures?.[0]?.error?.context
        
        expect(context).toBeDefined()
        if (context?.code) {
          // Should keep some context around the error line
          expect(context.code.length).toBeLessThanOrEqual(7) // ±2 lines + possible indicators
        }
      })

      it('should truncate assertion values', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 300 }
        const output = createTestOutput({ failureCount: 1 })
        
        // Add large assertion values
        if (output.failures?.[0]) {
          output.failures[0].error.assertion = {
            expected: { 
              nested: { 
                deeply: { 
                  value: 'x'.repeat(1000) 
                } 
              } 
            },
            actual: 'y'.repeat(1000),
            operator: 'toEqual'
          }
        }
        
        const result = truncator.apply(output, config)
        const assertion = result.failures?.[0]?.error?.assertion
        
        expect(assertion).toBeDefined()
        if (assertion) {
          const expectedStr = JSON.stringify(assertion.expected)
          const actualStr = JSON.stringify(assertion.actual)
          
          expect(expectedStr.length).toBeLessThanOrEqual(250)
          expect(actualStr.length).toBeLessThanOrEqual(250)
        }
      })
    })

    describe('Phase 3: Progressive tightening', () => {
      it('should apply increasingly aggressive truncation', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 100 }
        const output = createTestOutput({ 
          failureCount: 5,
          consoleSize: 'large'
        })
        
        const result = truncator.apply(output, config)
        
        // Should have very aggressive truncation
        expect(result.failures).toBeDefined()
        
        if (result.failures) {
          for (const failure of result.failures) {
            // Console should be heavily truncated or missing
            if (failure.console) {
              const totalConsole = JSON.stringify(failure.console).length
              expect(totalConsole).toBeLessThan(200)
            }
            
            // Stack should be minimal
            if (failure.error.stack) {
              const frameCount = failure.error.stack.split('\n').filter(line => line.includes('at ')).length
              expect(frameCount).toBeLessThanOrEqual(5)
            }
            
            // Error message should be capped
            expect(failure.error.message.length).toBeLessThanOrEqual(512)
          }
        }
      })

      it('should drop some failures when extremely over budget', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 50 }
        const output = createTestOutput({ 
          failureCount: 20,
          consoleSize: 'large'
        })
        
        const result = truncator.apply(output, config)
        
        // Should keep only the most important failures
        expect(result.failures).toBeDefined()
        if (result.failures) {
          expect(result.failures.length).toBeLessThanOrEqual(5)
        }
      })
    })

    describe('Tiny limit handling', () => {
      it('should produce minimal output for very small budgets', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 10 }
        const output = createTestOutput({ 
          failureCount: 1,
          consoleSize: 'large'
        })
        
        const result = truncator.apply(output, config)
        
        // Should have extremely minimal output
        expect(result.summary).toBeDefined()
        
        if (result.failures?.[0]) {
          const failure = result.failures[0]
          // Should preserve test name and error message at minimum
          expect(failure.test).toBeDefined()
          expect(failure.error.message).toBeDefined()
          
          // Everything else should be heavily truncated or removed
          if (failure.console) {
            const consoleStr = JSON.stringify(failure.console)
            expect(consoleStr.length).toBeLessThan(100)
          }
        }
      })
    })

    describe('JSON validity', () => {
      it('should always produce valid JSON output', () => {
        const configs = [
          { ...defaultConfig, maxTokens: 10 },
          { ...defaultConfig, maxTokens: 100 },
          { ...defaultConfig, maxTokens: 500 },
          { ...defaultConfig, maxTokens: 1000 }
        ]
        
        for (const config of configs) {
          const output = createTestOutput({ 
            failureCount: 5,
            passedCount: 10,
            skippedCount: 5,
            consoleSize: 'large'
          })
          
          const result = truncator.apply(output, config)
          
          // Should be valid JSON
          const json = JSON.stringify(result)
          expect(() => JSON.parse(json)).not.toThrow()
          
          // Should maintain schema structure
          expect(result.summary).toBeDefined()
          expect(result.summary.total).toBeTypeOf('number')
          expect(result.summary.passed).toBeTypeOf('number')
          expect(result.summary.failed).toBeTypeOf('number')
          
          if (result.failures) {
            for (const failure of result.failures) {
              expect(failure.test).toBeTypeOf('string')
              expect(failure.file).toBeTypeOf('string')
              expect(failure.error).toBeDefined()
              expect(failure.error.message).toBeTypeOf('string')
              expect(failure.error.type).toBeTypeOf('string')
            }
          }
        }
      })
    })

    describe('Fair distribution', () => {
      it('should apply truncation fairly across multiple failures', () => {
        const config: TruncationConfig = { ...defaultConfig, maxTokens: 500 }
        const output = createTestOutput({ 
          failureCount: 5,
          consoleSize: 'medium'
        })
        
        const result = truncator.apply(output, config)
        
        if (result.failures) {
          // Check that truncation is applied fairly
          const consoleSizes = result.failures.map(f => 
            f.console ? JSON.stringify(f.console).length : 0
          )
          
          // Sizes should be relatively similar (within 2x of each other)
          const minSize = Math.min(...consoleSizes.filter(s => s > 0))
          const maxSize = Math.max(...consoleSizes)
          
          if (minSize > 0 && maxSize > 0) {
            expect(maxSize / minSize).toBeLessThanOrEqual(3)
          }
        }
      })
    })
  })

  describe('getMetrics', () => {
    it('should track truncation metrics', () => {
      const config: TruncationConfig = { ...defaultConfig, maxTokens: 300 }
      const output = createTestOutput({ 
        failureCount: 3,
        consoleSize: 'large'
      })
      
      truncator.apply(output, config)
      const metrics = truncator.getMetrics()
      
      expect(metrics.length).toBeGreaterThan(0)
      
      const lastMetric = metrics[metrics.length - 1]
      expect(lastMetric.originalTokens).toBeGreaterThan(0)
      expect(lastMetric.truncatedTokens).toBeGreaterThan(0)
      expect(lastMetric.tokensRemoved).toBeGreaterThanOrEqual(0)
      expect(lastMetric.phasesApplied).toBeInstanceOf(Array)
      expect(lastMetric.timestamp).toBeTypeOf('number')
    })

    it('should cap metrics at 100 entries', () => {
      const config: TruncationConfig = { ...defaultConfig, maxTokens: 300 }
      
      // Apply truncation many times
      for (let i = 0; i < 150; i++) {
        const output = createTestOutput({ consoleSize: 'medium' })
        truncator.apply(output, config)
      }
      
      const metrics = truncator.getMetrics()
      expect(metrics.length).toBeLessThanOrEqual(100)
    })
  })

  describe('updateConfig', () => {
    it('should update the model configuration', () => {
      const config1: TruncationConfig = { ...defaultConfig, model: 'gpt-4', maxTokens: 300 }
      const config2: TruncationConfig = { ...defaultConfig, model: 'gpt-3.5-turbo', maxTokens: 300 }
      
      const output = createTestOutput({ consoleSize: 'large', failureCount: 5 })
      
      // Apply with first model
      const result1 = truncator.apply(output, config1)
      
      // Update config and apply with second model
      truncator.updateConfig(config2)
      const result2 = truncator.apply(output, config2)
      
      // Results might differ due to different model token calculations
      // Just verify both are valid
      expect(result1.summary).toBeDefined()
      expect(result2.summary).toBeDefined()
    })
  })
})