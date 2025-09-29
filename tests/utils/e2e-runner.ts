/**
 * E2E test runner utilities for integration matrix testing
 *
 * Provides helper functions to run Vitest with the LLM reporter
 * and capture/parse the output for validation.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { LLMReporterConfig } from '../../src/types/reporter.js'
import type { LLMReporterOutput } from '../../src/types/schema.js'

const execAsync = promisify(exec)

export interface E2ERunnerOptions {
  /** Reporter configuration to test */
  config: LLMReporterConfig
  /** Optional custom test file content (defaults to standard test fixture) */
  testContent?: string
  /** Timeout for test execution in milliseconds (default: 30000) */
  timeout?: number
  /** Whether to build the project before running (default: false, assumes already built) */
  rebuild?: boolean
}

export interface E2ERunnerResult {
  /** Parsed JSON output from the reporter */
  output: LLMReporterOutput
  /** Raw JSON string */
  rawOutput: string
  /** Exit code from vitest command */
  exitCode: number
  /** Standard output from vitest */
  stdout: string
  /** Standard error from vitest */
  stderr: string
}

/**
 * Default test fixture with intentional failures for E2E testing
 */
const DEFAULT_TEST_CONTENT = `
import { describe, it, expect } from 'vitest'

function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  // Bug: always returns first number
  return a
}

describe('E2E Matrix Tests', () => {
  describe('Passing Tests', () => {
    it('should pass - addition works', () => {
      expect(add(2, 3)).toBe(5)
    })

    it('should pass - another addition', () => {
      expect(add(10, 20)).toBe(30)
    })
  })

  describe('Failing Tests', () => {
    it('should fail - multiplication bug', () => {
      console.log('Testing multiplication')
      const result = multiply(4, 5)
      console.warn('Result:', result)
      console.error('This will fail due to bug')
      expect(result).toBe(20)
    })

    it('should fail - object comparison', () => {
      const user = { name: 'Alice', age: 30 }
      console.log('User object:', user)
      expect(user).toEqual({ name: 'Alice', age: 25 })
    })
  })

  describe('Skipped Tests', () => {
    it.skip('should be skipped', () => {
      expect(true).toBe(false)
    })
  })
})
`

/**
 * Run the LLM reporter with a given configuration in an E2E test
 *
 * @param options - Configuration and test content options
 * @returns Test results including parsed output
 */
export async function runReporterE2E(options: E2ERunnerOptions): Promise<E2ERunnerResult> {
  const { config, testContent = DEFAULT_TEST_CONTENT, timeout = 30000, rebuild = false } = options

  const uniqueId = randomUUID()
  const testFile = join(process.cwd(), `.tmp-e2e-matrix-${uniqueId}.test.ts`)
  const outputFile = join(process.cwd(), `.tmp-e2e-matrix-output-${uniqueId}.json`)
  const configFile = join(process.cwd(), `.tmp-e2e-matrix-config-${uniqueId}.ts`)

  try {
    // Create test file
    writeFileSync(testFile, testContent)

    // Create config file with the reporter
    const configContent = `
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './dist/reporter/reporter.js'

export default defineConfig({
  test: {
    includeTaskLocation: true,
    disableConsoleIntercept: false,
    reporters: [
      new LLMReporter(${JSON.stringify({ ...config, outputFile }, null, 2)})
    ]
  }
})
`
    writeFileSync(configFile, configContent)

    // Build if requested
    if (rebuild) {
      await execAsync('node ./node_modules/typescript/bin/tsc -p tsconfig.json')
    }

    // Run vitest with the configuration
    let exitCode = 0
    let stdout = ''
    let stderr = ''

    try {
      const command = `npx vitest run --config ${JSON.stringify(configFile)} ${JSON.stringify(testFile)}`
      const result = await execAsync(command, { timeout })
      stdout = result.stdout
      stderr = result.stderr
    } catch (error: any) {
      // Tests are expected to fail, capture output
      exitCode = error.code || 1
      stdout = error.stdout || ''
      stderr = error.stderr || ''
    }

    // Read the output file
    if (!existsSync(outputFile)) {
      throw new Error(`Output file not created: ${outputFile}`)
    }

    const rawOutput = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(rawOutput) as LLMReporterOutput

    return {
      output,
      rawOutput,
      exitCode,
      stdout,
      stderr
    }
  } finally {
    // Clean up temporary files
    try {
      if (existsSync(testFile)) unlinkSync(testFile)
      if (existsSync(outputFile)) unlinkSync(outputFile)
      if (existsSync(configFile)) unlinkSync(configFile)
    } catch (e) {
      // Ignore cleanup errors
      console.warn('Cleanup warning:', e)
    }
  }
}

/**
 * Validate that the reporter output has the expected structure
 */
export function validateOutputStructure(output: LLMReporterOutput): void {
  if (!output.summary) {
    throw new Error('Output missing summary')
  }

  if (!Array.isArray(output.failures)) {
    throw new Error('Output missing failures array')
  }

  // Validate summary structure
  const summary = output.summary
  if (typeof summary.total !== 'number') {
    throw new Error('Summary missing total count')
  }
  if (typeof summary.passed !== 'number') {
    throw new Error('Summary missing passed count')
  }
  if (typeof summary.failed !== 'number') {
    throw new Error('Summary missing failed count')
  }
  if (typeof summary.skipped !== 'number') {
    throw new Error('Summary missing skipped count')
  }

  // Validate failure structure
  output.failures.forEach((failure, index) => {
    if (!failure.test) {
      throw new Error(`Failure ${index} missing test name`)
    }
    if (!failure.suite) {
      throw new Error(`Failure ${index} missing suite name`)
    }
    if (!failure.error) {
      throw new Error(`Failure ${index} missing error`)
    }
  })
}
