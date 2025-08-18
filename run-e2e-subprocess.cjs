const { writeFileSync, readFileSync } = require('fs')
const { execSync } = require('child_process')
const { join } = require('path')

const testFile = join(process.cwd(), 'test-fixture.test.ts')
const outputFile = join(process.cwd(), 'test-output-debug.json')
const configFile = join(process.cwd(), 'vitest.e2e-debug.config.ts')

// Create test file
const testContent = `
import { describe, it, expect } from 'vitest'

function multiply(a, b) {
  return a  // Bug
}

describe('Math Operations', () => {
  describe('Multiplication', () => {
    it('should multiply two numbers correctly', () => {
      const x = 4
      const y = 5
      const result = multiply(x, y)
      expect(result).toBe(20)
    })
  })
})
`
writeFileSync(testFile, testContent)

// Create config
const configContent = `
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './dist/reporter/reporter.js'

export default defineConfig({
  test: {
    reporters: [
      new LLMReporter({
        outputFile: '${outputFile}',
        verbose: false
      })
    ],
    silent: true
  }
})
`
writeFileSync(configFile, configContent)

// Run test
try {
  execSync(`npx vitest run --config ${configFile} ${testFile}`, { stdio: 'ignore' })
} catch {
  // Expected to fail
}

// Read output
const output = JSON.parse(readFileSync(outputFile, 'utf-8'))
console.log('Reporter output:')
console.log(JSON.stringify(output.failures?.[0]?.error, null, 2))

// Clean up
const fs = require('fs')
fs.unlinkSync(testFile)
fs.unlinkSync(configFile)
fs.unlinkSync(outputFile)
