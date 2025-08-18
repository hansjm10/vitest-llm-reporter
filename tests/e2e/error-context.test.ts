/**
 * End-to-End test for Error Context Extraction feature
 * 
 * Tests that the LLM reporter correctly extracts and includes
 * code context around test failures.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'

const execAsync = promisify(exec)

describe('Error Context Extraction E2E', () => {
  const testFile = join(process.cwd(), 'test-fixture.test.ts')
  const outputFile = join(process.cwd(), 'test-output.json')
  const configFile = join(process.cwd(), 'vitest.e2e.config.ts')

  beforeAll(() => {
    // Create a test file with intentional failures
    const testContent = `
import { describe, it, expect } from 'vitest'

function multiply(a: number, b: number): number {
  // Bug: always returns first number
  return a
}

describe('Math Operations', () => {
  describe('Multiplication', () => {
    it('should multiply two numbers correctly', () => {
      const x = 4
      const y = 5
      const result = multiply(x, y)
      // This will fail: multiply has a bug and returns 4 instead of 20
      expect(result).toBe(20)
    })

    it('should handle multiplication by zero', () => {
      const result = multiply(10, 0)
      // This will also fail: returns 10 instead of 0
      expect(result).toBe(0)
    })
  })

  describe('Complex Assertions', () => {
    it('should match object structure', () => {
      const user = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      }
      
      // This will fail: age mismatch
      expect(user).toEqual({
        name: 'John Doe',
        age: 25,
        email: 'john@example.com'
      })
    })
  })
})
`
    writeFileSync(testFile, testContent)

    // Create a config file that uses our reporter
    const configContent = `
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './src/reporter/reporter'

export default defineConfig({
  test: {
    reporters: [
      new LLMReporter({
        outputFile: '${outputFile}',
        verbose: false,
        includePassedTests: false,
        includeSkippedTests: false
      })
    ],
    silent: true
  }
})
`
    writeFileSync(configFile, configContent)
  })

  afterAll(() => {
    // Clean up test files
    if (existsSync(testFile)) unlinkSync(testFile)
    if (existsSync(outputFile)) unlinkSync(outputFile)
    if (existsSync(configFile)) unlinkSync(configFile)
  })

  it('should extract code context for failing tests', async () => {
    // Run the test with our reporter
    try {
      await execAsync(`npx vitest run --config ${configFile} ${testFile}`)
    } catch {
      // Tests are expected to fail
    }

    // Read the output file
    const outputContent = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(outputContent)

    // Verify the structure
    expect(output).toHaveProperty('summary')
    expect(output).toHaveProperty('failures')
    expect(output.failures).toHaveLength(3)

    // Check the first failure has proper context
    const firstFailure = output.failures[0]
    expect(firstFailure.test).toBe('should multiply two numbers correctly')
    expect(firstFailure.error).toHaveProperty('context')
    
    const context = firstFailure.error.context
    expect(context).toHaveProperty('code')
    expect(context.code).toBeInstanceOf(Array)
    expect(context.code.length).toBeGreaterThan(0)
    
    // Verify the code contains the actual failure line
    const codeString = context.code.join('\n')
    expect(codeString).toContain('expect(result).toBe(20)')
    expect(codeString).toContain('// <- failure')
    
    // Verify line numbers are included
    expect(context.code[0]).toMatch(/^\s*\d+:/)
    
    // Check stack frames
    expect(firstFailure.error).toHaveProperty('stackFrames')
    expect(firstFailure.error.stackFrames).toBeInstanceOf(Array)
    expect(firstFailure.error.stackFrames.length).toBeGreaterThan(0)
    
    const firstFrame = firstFailure.error.stackFrames[0]
    expect(firstFrame).toHaveProperty('file')
    expect(firstFrame).toHaveProperty('line')
    expect(firstFrame).toHaveProperty('column')
    expect(firstFrame.file).toContain('test-fixture.test.ts')
    
    // Check assertion details
    expect(firstFailure.error).toHaveProperty('assertion')
    expect(firstFailure.error.assertion).toHaveProperty('expected')
    expect(firstFailure.error.assertion).toHaveProperty('actual')
    expect(firstFailure.error.assertion.expected).toBe('20')
    expect(firstFailure.error.assertion.actual).toBe('4')
  })

  it('should extract context for object comparison failures', async () => {
    // The test should have already run, so just check the output
    const outputContent = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(outputContent)

    // Find the object comparison failure
    const objectFailure = output.failures.find(f => 
      f.test === 'should match object structure'
    )
    
    expect(objectFailure).toBeDefined()
    expect(objectFailure.error.context).toBeDefined()
    expect(objectFailure.error.context.code).toBeInstanceOf(Array)
    
    // Verify the context includes the expect statement
    const codeString = objectFailure.error.context.code.join('\n')
    expect(codeString).toContain('expect(user).toEqual')
    
    // Check that assertion details include the objects
    expect(objectFailure.error.assertion).toBeDefined()
    expect(objectFailure.error.assertion.expected).toContain('age')
    expect(objectFailure.error.assertion.actual).toContain('age')
  })

  it('should include proper line and column numbers', async () => {
    const outputContent = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(outputContent)

    output.failures.forEach(failure => {
      const context = failure.error.context
      expect(context).toHaveProperty('lineNumber')
      expect(typeof context.lineNumber).toBe('number')
      expect(context.lineNumber).toBeGreaterThan(0)
      
      // Column number should be present for most failures
      if (context.columnNumber !== undefined) {
        expect(typeof context.columnNumber).toBe('number')
        expect(context.columnNumber).toBeGreaterThan(0)
      }
    })
  })

  it('should have configurable context window size', async () => {
    const outputContent = readFileSync(outputFile, 'utf-8')
    const output = JSON.parse(outputContent)

    // Default context should be 3 lines before and after (7 total)
    output.failures.forEach(failure => {
      const codeLines = failure.error.context.code
      expect(codeLines.length).toBeLessThanOrEqual(7)
      expect(codeLines.length).toBeGreaterThanOrEqual(1)
    })
  })
})