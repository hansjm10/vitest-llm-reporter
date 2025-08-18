const { execSync } = require('child_process')
const { writeFileSync, readFileSync } = require('fs')
const { join } = require('path')

// Create test file
const testFile = join(process.cwd(), 'debug-test.test.ts')
const outputFile = join(process.cwd(), 'debug-output.json')

const testContent = `
import { describe, it, expect } from 'vitest'

describe('Debug Test', () => {
  it('should fail', () => {
    const result = 4
    expect(result).toBe(20)
  })
})
`

writeFileSync(testFile, testContent)

// Create config
const configContent = `
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './src/reporter/reporter'

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
const configFile = join(process.cwd(), 'debug.config.ts')
writeFileSync(configFile, configContent)

// Run test
try {
  execSync(`npx vitest run --config ${configFile} ${testFile}`, { stdio: 'inherit' })
} catch {
  // Expected to fail
}

// Check output
const output = JSON.parse(readFileSync(outputFile, 'utf-8'))
console.log('\n=== OUTPUT ===')
console.log(JSON.stringify(output.failures?.[0]?.error, null, 2))

// Clean up
require('fs').unlinkSync(testFile)
require('fs').unlinkSync(configFile)
require('fs').unlinkSync(outputFile)
