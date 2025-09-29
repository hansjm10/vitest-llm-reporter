/**
 * Test scenario configurations for integration matrix testing
 *
 * These scenarios represent real-world usage patterns and ensure
 * the reporter works correctly across different configuration combinations.
 */

import type { LLMReporterConfig } from '../../src/types/reporter.js'

export interface TestScenario {
  name: string
  description: string
  config: LLMReporterConfig
  expectedBehavior: {
    hasFailures: boolean
    hasSummary: boolean
    capturesConsole: boolean
    includesPassedTests: boolean
    includesSkippedTests: boolean
  }
}

export const scenarios: TestScenario[] = [
  {
    name: 'CI Mode',
    description: 'Optimized for CI/CD pipelines with pure stdout and minimal output',
    config: {
      pureStdout: true,
      verbose: false,
      includePassedTests: false,
      includeSkippedTests: false,
      captureConsoleOnFailure: true,
      deduplicateLogs: true,
      fileJsonSpacing: 0,
      consoleJsonSpacing: 0
    },
    expectedBehavior: {
      hasFailures: true,
      hasSummary: true,
      capturesConsole: true,
      includesPassedTests: false,
      includesSkippedTests: false
    }
  },
  {
    name: 'Local Development',
    description: 'Developer-friendly with verbose output and readable formatting',
    config: {
      verbose: true,
      includePassedTests: true,
      includeSkippedTests: true,
      captureConsoleOnFailure: true,
      captureConsoleOnSuccess: true,
      enableConsoleOutput: true,
      fileJsonSpacing: 2,
      consoleJsonSpacing: 2,
      deduplicateLogs: false
    },
    expectedBehavior: {
      hasFailures: true,
      hasSummary: true,
      capturesConsole: true,
      includesPassedTests: true,
      includesSkippedTests: true
    }
  },
  {
    name: 'Production with Truncation',
    description: 'Token-limited output for LLM context windows with deduplication',
    config: {
      truncation: {
        enabled: true,
        maxTokens: 50000,
        strategy: 'proportional'
      },
      deduplicateLogs: true,
      verbose: false,
      includePassedTests: false,
      includeSkippedTests: false,
      captureConsoleOnFailure: true,
      maxConsoleBytes: 10000,
      maxConsoleLines: 50
    },
    expectedBehavior: {
      hasFailures: true,
      hasSummary: true,
      capturesConsole: true,
      includesPassedTests: false,
      includesSkippedTests: false
    }
  },
  {
    name: 'Minimal (Defaults)',
    description: 'Default configuration with no overrides',
    config: {},
    expectedBehavior: {
      hasFailures: true,
      hasSummary: true,
      capturesConsole: true,
      includesPassedTests: false,
      includesSkippedTests: false
    }
  },
  {
    name: 'Flakiness Detection',
    description: 'Track retries and detect flaky tests',
    config: {
      verbose: true,
      includePassedTests: true,
      includeSkippedTests: false,
      trackRetries: true,
      detectFlakiness: true,
      includeAllAttempts: true,
      reportFlakyAsWarnings: true,
      captureConsoleOnFailure: true
    },
    expectedBehavior: {
      hasFailures: true,
      hasSummary: true,
      capturesConsole: true,
      includesPassedTests: true,
      includesSkippedTests: true // verbose: true includes skipped tests automatically
    }
  },
  {
    name: 'Framework Preset (NestJS)',
    description: 'Suppress framework logs with NestJS preset',
    config: {
      verbose: false,
      captureConsoleOnFailure: true,
      stdio: {
        suppressStdout: true,
        frameworkPresets: ['nest']
      },
      deduplicateLogs: true
    },
    expectedBehavior: {
      hasFailures: true,
      hasSummary: true,
      capturesConsole: true,
      includesPassedTests: false,
      includesSkippedTests: false
    }
  }
]
