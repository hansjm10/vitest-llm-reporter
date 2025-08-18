const { writeFileSync, readFileSync, existsSync } = require('fs')
const { execSync } = require('child_process')

// Create a failing test
const testContent = `
import { describe, it, expect } from 'vitest'

describe('Check', () => {
  it('should fail', () => {
    expect(1).toBe(2)
  })
})
`
writeFileSync('check.test.ts', testContent)

// Create a simple reporter
const reporterContent = `
import { writeFileSync } from 'fs'

export default {
  onTaskUpdate(packs) {
    const results = []
    packs.forEach(pack => {
      pack.forEach(task => {
        if (task.type === 'test' && task.result?.state === 'fail') {
          results.push({
            type: task.type,
            resultKeys: Object.keys(task.result || {}),
            hasErrors: 'errors' in (task.result || {}),
            hasError: 'error' in (task.result || {}),
            errorsType: Array.isArray(task.result?.errors) ? 'array' : typeof task.result?.errors,
            errorType: typeof task.result?.error
          })
        }
      })
    })
    if (results.length > 0) {
      writeFileSync('check-output.json', JSON.stringify(results, null, 2))
    }
  }
}
`
writeFileSync('check-reporter.js', reporterContent)

// Run the test
try {
  execSync('npx vitest run --reporter=./check-reporter.js check.test.ts', { stdio: 'ignore' })
} catch {
  // Expected to fail
}

// Read the output
if (existsSync('check-output.json')) {
  const output = readFileSync('check-output.json', 'utf-8')
  console.log(output)
} else {
  console.log('No output file created')
}

// Clean up
const fs = require('fs')
if (fs.existsSync('check.test.ts')) fs.unlinkSync('check.test.ts')
if (fs.existsSync('check-reporter.js')) fs.unlinkSync('check-reporter.js')
if (fs.existsSync('check-output.json')) fs.unlinkSync('check-output.json')
