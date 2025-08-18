const { writeFileSync } = require('fs')
const { execSync } = require('child_process')

// Create test file
const testContent = `
import { describe, it, expect } from 'vitest'

describe('Debug', () => {
  it('should fail with context', () => {
    const result = 4
    expect(result).toBe(20) // Line 7
  })
})
`
writeFileSync('debug-fixture.test.ts', testContent)

// Run with our reporter
const configContent = `
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './src/reporter/reporter'

export default defineConfig({
  test: {
    reporters: [
      new LLMReporter({
        outputFile: 'debug-reporter-output.json',
        verbose: false
      })
    ],
    silent: true
  }
})
`
writeFileSync('debug-reporter.config.ts', configContent)

try {
  execSync('npx vitest run --config debug-reporter.config.ts debug-fixture.test.ts', { stdio: 'ignore' })
} catch {
  // Expected to fail
}

// Check output
const output = JSON.parse(require('fs').readFileSync('debug-reporter-output.json', 'utf-8'))
console.log('=== REPORTER OUTPUT ===')
console.log('Failure:', JSON.stringify(output.failures?.[0], null, 2))

// Clean up
const fs = require('fs')
fs.unlinkSync('debug-fixture.test.ts')
fs.unlinkSync('debug-reporter.config.ts')
fs.unlinkSync('debug-reporter-output.json')
