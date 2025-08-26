/**
 * Mock Implementations for Integration Tests
 *
 * Provides mock implementations of core interfaces for testing
 */

import type { LLMReporterOutput } from '../../src/types/schema'

/**
 * Creates mock test fixtures
 */
export function createMockFixtures() {
  const mockOutput: LLMReporterOutput = {
    summary: {
      total: 10,
      passed: 5,
      failed: 3,
      skipped: 2,
      duration: 1500,
      timestamp: new Date().toISOString()
    },
    failures: [
      {
        test: 'test failure 1',
        file: 'src/test.spec.ts',
        startLine: 10,
        endLine: 20,
        error: {
          message: 'Test failed',
          type: 'AssertionError'
        }
      }
    ]
  }

  return {
    mockOutput
  }
}
