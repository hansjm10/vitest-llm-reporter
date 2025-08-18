const { execSync } = require('child_process')
const { writeFileSync } = require('fs')

// Create test file
const testContent = `
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'fs'

describe('CWD Check', () => {
  it('should log cwd', () => {
    writeFileSync('cwd-check.txt', process.cwd())
    expect(1).toBe(2)
  })
})
`
writeFileSync('cwd-test.test.ts', testContent)

// Run with our reporter
const configContent = `
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['default'],
    silent: false
  }
})
`
writeFileSync('cwd.config.ts', configContent)

try {
  execSync('npx vitest run --config cwd.config.ts cwd-test.test.ts', { stdio: 'ignore' })
} catch {
  // Expected to fail
}

// Check what CWD was
const cwd = require('fs').readFileSync('cwd-check.txt', 'utf-8')
console.log('CWD during test:', cwd)
console.log('Current CWD:', process.cwd())

// Clean up
const fs = require('fs')
fs.unlinkSync('cwd-test.test.ts')
fs.unlinkSync('cwd.config.ts')
fs.unlinkSync('cwd-check.txt')
