const { writeFileSync } = require('fs')
const { execSync } = require('child_process')

// Create test
writeFileSync('simple.test.ts', `
import { it, expect } from 'vitest'
it('fail', () => expect(1).toBe(2))
`)

// Create reporter
writeFileSync('simple-reporter.js', `
import { writeFileSync } from 'fs'
export default {
  onInit() { writeFileSync('reporter-ran.txt', 'init') },
  onTaskUpdate() { writeFileSync('reporter-ran.txt', 'update') }
}
`)

// Run
try {
  execSync('npx vitest run --reporter=./simple-reporter.js simple.test.ts', { stdio: 'ignore' })
} catch {}

// Check
const fs = require('fs')
console.log('Reporter ran:', fs.existsSync('reporter-ran.txt'))

// Clean up
if (fs.existsSync('simple.test.ts')) fs.unlinkSync('simple.test.ts')
if (fs.existsSync('simple-reporter.js')) fs.unlinkSync('simple-reporter.js')
if (fs.existsSync('reporter-ran.txt')) fs.unlinkSync('reporter-ran.txt')
