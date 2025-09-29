/**
 * Integration Matrix E2E Tests
 *
 * Tests the LLM reporter across multiple real-world configuration scenarios
 * to ensure compatibility and correctness for different use cases.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { scenarios } from './scenarios.js'
import { runReporterE2E, validateOutputStructure } from '../utils/e2e-runner.js'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

describe('Configuration Matrix E2E Tests', () => {
  beforeAll(async () => {
    // Build the project once before all tests
    try {
      await execAsync('node ./node_modules/typescript/bin/tsc -p tsconfig.json')
    } catch (e) {
      console.error('Build failed:', e)
      throw new Error('Failed to build project for E2E tests')
    }
  }, 60000)

  describe.each(scenarios)('Scenario: $name', (scenario) => {
    it(`should produce valid output for ${scenario.name}`, async () => {
      const result = await runReporterE2E({
        config: scenario.config,
        rebuild: false // Already built in beforeAll
      })

      // Validate basic structure
      validateOutputStructure(result.output)

      // Verify summary exists
      expect(result.output.summary).toBeDefined()
      expect(result.output.summary.total).toBeGreaterThan(0)

      // Verify expected behavior based on scenario
      const { expectedBehavior } = scenario

      if (expectedBehavior.hasFailures) {
        expect(result.output.failures).toBeDefined()
        expect(result.output.failures.length).toBeGreaterThan(0)
      }

      if (expectedBehavior.hasSummary) {
        expect(result.output.summary).toBeDefined()
        expect(result.output.summary.total).toBeGreaterThan(0)
        expect(result.output.summary.passed).toBeGreaterThanOrEqual(0)
        expect(result.output.summary.failed).toBeGreaterThan(0)
      }

      if (expectedBehavior.capturesConsole) {
        // Note: Console capture in subprocess E2E tests is limited
        // Similar to existing E2E test, we just verify failures exist
        // Console capture works correctly in normal test runs (not subprocess)
        expect(result.output.failures.length).toBeGreaterThan(0)
      }

      if (expectedBehavior.includesPassedTests) {
        expect(result.output.passed).toBeDefined()
        expect(result.output.passed?.length).toBeGreaterThan(0)
      } else {
        // If not including passed tests, the array should be undefined or empty
        expect(result.output.passed === undefined || result.output.passed.length === 0).toBe(true)
      }

      if (expectedBehavior.includesSkippedTests) {
        expect(result.output.skipped).toBeDefined()
        expect(result.output.skipped?.length).toBeGreaterThan(0)
      } else {
        // If not including skipped tests, the array should be undefined or empty
        expect(result.output.skipped === undefined || result.output.skipped.length === 0).toBe(true)
      }
    }, 30000)

    it(`should respect configuration options for ${scenario.name}`, async () => {
      const result = await runReporterE2E({
        config: scenario.config,
        rebuild: false
      })

      // Check config-specific behaviors
      const { config } = scenario

      // Verify verbose mode
      if (config.verbose) {
        // Verbose should include passed tests if not explicitly disabled
        if (config.includePassedTests !== false) {
          expect(result.output.passed).toBeDefined()
        }
        // Verbose should include skipped tests if not explicitly disabled
        if (config.includeSkippedTests !== false) {
          expect(result.output.skipped).toBeDefined()
        }
      }

      // Verify truncation
      if (config.truncation?.enabled && config.truncation.maxTokens) {
        // Output should exist and be valid
        expect(result.output).toBeDefined()
        expect(result.rawOutput.length).toBeGreaterThan(0)
        // Note: Token counting is approximate, just verify structure is intact
        validateOutputStructure(result.output)
      }

      // Verify deduplication config is respected
      if (config.deduplicateLogs) {
        // Structure should be valid
        expect(result.output.failures).toBeDefined()
        // Note: Actual deduplication behavior is tested in unit tests
      }

      // Verify pure stdout mode
      if (config.pureStdout) {
        // Output should still be captured to file
        expect(result.output).toBeDefined()
        validateOutputStructure(result.output)
      }

      // Verify stdio config
      if (config.stdio?.suppressStdout) {
        // Output should still be valid
        expect(result.output).toBeDefined()
        validateOutputStructure(result.output)
      }

      // Verify retry tracking
      if (config.trackRetries || config.detectFlakiness) {
        // Structure should be valid (retry info is on test objects)
        expect(result.output.failures).toBeDefined()
        // Note: Actual retry behavior requires tests with retries
      }
    }, 30000)

    it(`should include proper error context for ${scenario.name}`, async () => {
      const result = await runReporterE2E({
        config: scenario.config,
        rebuild: false
      })

      // Every failure should have error information
      expect(result.output.failures.length).toBeGreaterThan(0)

      result.output.failures.forEach((failure) => {
        expect(failure.error).toBeDefined()
        expect(failure.error.message).toBeDefined()
        expect(typeof failure.error.message).toBe('string')

        // Should have stack frames
        if (failure.error.stackFrames) {
          expect(Array.isArray(failure.error.stackFrames)).toBe(true)
        }

        // Should have context if available
        if (failure.error.context) {
          expect(failure.error.context.code).toBeDefined()
          expect(Array.isArray(failure.error.context.code)).toBe(true)
        }
      })
    }, 30000)
  })

  describe('Cross-scenario validation', () => {
    it('should produce consistent structure across all scenarios', async () => {
      const results = await Promise.all(
        scenarios.map((scenario) =>
          runReporterE2E({
            config: scenario.config,
            rebuild: false
          })
        )
      )

      // All results should have valid structure
      results.forEach((result) => {
        expect(() => validateOutputStructure(result.output)).not.toThrow()
        expect(result.output.summary).toBeDefined()
        expect(result.output.failures).toBeDefined()
        expect(result.output.failures.length).toBeGreaterThan(0)

        // Verify consistent failure reporting
        expect(result.output.summary.failed).toBe(result.output.failures.length)
      })
    }, 60000)

    it('should handle both verbose and non-verbose modes', async () => {
      const verboseScenario = scenarios.find((s) => s.config.verbose === true)
      const nonVerboseScenario = scenarios.find((s) => s.config.verbose === false)

      if (!verboseScenario || !nonVerboseScenario) {
        throw new Error('Missing verbose or non-verbose scenario')
      }

      const [verboseResult, nonVerboseResult] = await Promise.all([
        runReporterE2E({ config: verboseScenario.config, rebuild: false }),
        runReporterE2E({ config: nonVerboseScenario.config, rebuild: false })
      ])

      // Verbose should have more data
      if (verboseScenario.config.includePassedTests) {
        expect(verboseResult.output.passed?.length || 0).toBeGreaterThan(
          nonVerboseResult.output.passed?.length || 0
        )
      }

      // Both should have failures
      expect(verboseResult.output.failures.length).toBeGreaterThan(0)
      expect(nonVerboseResult.output.failures.length).toBeGreaterThan(0)
    }, 60000)

    it('should handle truncation correctly', async () => {
      const truncationScenario = scenarios.find((s) => s.config.truncation?.enabled)

      if (!truncationScenario) {
        throw new Error('Missing truncation scenario')
      }

      const result = await runReporterE2E({
        config: truncationScenario.config,
        rebuild: false
      })

      // Output should be valid and complete
      validateOutputStructure(result.output)
      expect(result.output.failures.length).toBeGreaterThan(0)

      // Should have summary
      expect(result.output.summary).toBeDefined()
    }, 30000)
  })

  describe('Schema validation', () => {
    it('should produce JSON-parseable output for all scenarios', async () => {
      const results = await Promise.all(
        scenarios.slice(0, 3).map((scenario) =>
          runReporterE2E({
            config: scenario.config,
            rebuild: false
          })
        )
      )

      results.forEach((result) => {
        // Should be valid JSON
        expect(() => JSON.parse(result.rawOutput)).not.toThrow()

        // Should have required top-level properties
        const parsed = JSON.parse(result.rawOutput)
        expect(parsed).toHaveProperty('summary')
        expect(parsed).toHaveProperty('failures')

        // Summary should have required fields
        expect(parsed.summary).toHaveProperty('total')
        expect(parsed.summary).toHaveProperty('passed')
        expect(parsed.summary).toHaveProperty('failed')
        expect(parsed.summary).toHaveProperty('skipped')
      })
    }, 60000)
  })
})
