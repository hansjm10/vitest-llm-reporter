const { writeFileSync, readFileSync } = require('fs')
const { execSync } = require('child_process')
const { join } = require('path')

const testFile = join(process.cwd(), 'test-no-cleanup.test.ts')
const outputFile = join(process.cwd(), 'test-output-no-cleanup.json')
const configFile = join(process.cwd(), 'vitest.no-cleanup.config.ts')

// Create test file
const testContent = `
import { describe, it, expect } from 'vitest'

describe('Test', () => {
  it('should fail', () => {
    expect(4).toBe(20)
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
writeFileSync(configFile, configContent)

// Run test
try {
  execSync(`npx vitest run --config ${configFile} ${testFile}`, { stdio: 'ignore' })
} catch {}

// Check if file still exists
const fs = require('fs')
console.log('Test file exists after run:', fs.existsSync(testFile))

// Read output
const output = JSON.parse(readFileSync(outputFile, 'utf-8'))
console.log('Context code length:', output.failures?.[0]?.error?.context?.code?.length || 0)

// NOW clean up
fs.unlinkSync(testFile)
fs.unlinkSync(configFile)
fs.unlinkSync(outputFile)
