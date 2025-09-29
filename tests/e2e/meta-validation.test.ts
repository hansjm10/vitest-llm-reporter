/**
 * End-to-End test for Meta-Reporter Output Validation
 *
 * Tests that the LLM reporter can validate its own output against
 * the schema when validateOutput is enabled.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import type { LLMReporterOutput } from '../../src/types/schema.js'

const execAsync = promisify(exec)

describe('Meta-Reporter Output Validation E2E', () => {
  const testFile = join(process.cwd(), '.tmp-e2e-meta-validation-fixture.test.ts')
  const outputFile = join(process.cwd(), '.tmp-e2e-meta-validation-output.json')
  const configFile = join(process.cwd(), '.tmp-vitest.e2e-meta-validation.config.ts')

  beforeAll(async () => {
    // Clean up any leftover files from previous runs
    try {
      if (existsSync(testFile)) unlinkSync(testFile)
      if (existsSync(outputFile)) unlinkSync(outputFile)
      if (existsSync(configFile)) unlinkSync(configFile)
    } catch (_e) {
      // Ignore cleanup errors from previous runs
    }

    // Create a simple test file with both passing and failing tests
    const testContent = `import { describe, it, expect } from 'vitest'

describe('Meta-Validation Test Suite', () => {
  it('should pass successfully', () => {
    expect(1 + 1).toBe(2)
  })

  it('should fail with error', () => {
    expect(2 + 2).toBe(5)
  })
})
`
    writeFileSync(testFile, testContent)

    // Create a config file that uses our reporter with validateOutput enabled
    const configContent = `
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './src/index.js'

export default defineConfig({
  test: {
    include: ['${testFile.replace(/\\/g, '/')}'],
    includeTaskLocation: true,
    reporters: [
      new LLMReporter({
        outputFile: '${outputFile.replace(/\\/g, '/')}',
        verbose: true,
        includePassedTests: true,
        validateOutput: true
      })
    ]
  }
})
`
    writeFileSync(configFile, configContent)

    // Run vitest with the custom config
    const vitestCmd = `npx vitest run --config ${configFile} --no-coverage`
    try {
      await execAsync(vitestCmd, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test'
        }
      })
    } catch (_error) {
      // Vitest will exit with non-zero code due to test failures
      // This is expected - we still want to check the output
    }
  })

  afterAll(() => {
    // Clean up temporary files
    try {
      if (existsSync(testFile)) unlinkSync(testFile)
      if (existsSync(outputFile)) unlinkSync(outputFile)
      if (existsSync(configFile)) unlinkSync(configFile)
    } catch (_e) {
      // Ignore cleanup errors
    }
  })

  it('should generate valid JSON output', () => {
    expect(existsSync(outputFile)).toBe(true)
    const content = readFileSync(outputFile, 'utf-8')
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('should have valid output structure', () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    // Validate basic structure
    expect(output).toHaveProperty('summary')
    expect(output.summary).toHaveProperty('total')
    expect(output.summary).toHaveProperty('passed')
    expect(output.summary).toHaveProperty('failed')
    expect(output.summary).toHaveProperty('skipped')
    expect(output.summary).toHaveProperty('duration')
    expect(output.summary).toHaveProperty('timestamp')
  })

  it('should pass schema validation', async () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    // Import and use the validator to check output
    const { SchemaValidator } = await import('../../src/validation/validator.js')
    const validator = new SchemaValidator()
    const result = validator.validate(output)

    // If validation fails, print the errors for debugging
    if (!result.valid) {
      console.error('Validation errors:', JSON.stringify(result.errors, null, 2))
    }

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should have correct test counts', () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    // We expect 2 total tests: 1 passed, 1 failed
    expect(output.summary.total).toBe(2)
    expect(output.summary.passed).toBe(1)
    expect(output.summary.failed).toBe(1)
    expect(output.summary.skipped).toBe(0)
  })

  it('should include passed tests when verbose is true', () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    expect(output.passed).toBeDefined()
    expect(Array.isArray(output.passed)).toBe(true)
    expect(output.passed?.length).toBe(1)
  })

  it('should include failed tests with error details', () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    expect(output.failures).toBeDefined()
    expect(Array.isArray(output.failures)).toBe(true)
    expect(output.failures?.length).toBe(1)

    const failure = output.failures![0]
    expect(failure).toHaveProperty('test')
    expect(failure).toHaveProperty('error')
    expect(failure.error).toHaveProperty('message')
    expect(failure.error).toHaveProperty('type')
  })

  it('should have valid ISO 8601 timestamp', () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    // Validate timestamp format
    const timestamp = output.summary.timestamp
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/)

    // Validate it's a valid date
    const date = new Date(timestamp)
    expect(date.getTime()).not.toBeNaN()
  })

  it('should have non-negative duration', () => {
    const content = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(content) as LLMReporterOutput

    expect(output.summary.duration).toBeGreaterThanOrEqual(0)
  })
})
