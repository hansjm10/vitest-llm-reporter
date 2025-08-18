const { writeFileSync } = require('fs')
const { execSync } = require('child_process')

// Create a test to inspect the data structure
const testContent = `
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'fs'

describe('Inspect', () => {
  it('should fail and log structure', () => {
    expect(1).toBe(2)
  })
})
`

writeFileSync('inspect.test.ts', testContent)

// Create a custom reporter to log the test case structure
const reporterContent = `
export class InspectReporter {
  onTaskUpdate(packs) {
    packs.forEach(pack => {
      pack.forEach(task => {
        if (task.type === 'test' && task.result?.state === 'fail') {
          const { writeFileSync } = require('fs')
          writeFileSync('inspect-output.json', JSON.stringify({
            hasErrors: 'errors' in task.result,
            hasError: 'error' in task.result,
            resultKeys: Object.keys(task.result),
            errors: task.result.errors,
            error: task.result.error
          }, null, 2))
        }
      })
    })
  }
}
`

writeFileSync('inspect-reporter.js', reporterContent)

// Run with custom reporter
const configContent = `
import { defineConfig } from 'vitest/config'
import { InspectReporter } from './inspect-reporter.js'

export default defineConfig({
  test: {
    reporters: [new InspectReporter()],
    silent: true
  }
})
`

writeFileSync('inspect.config.ts', configContent)

try {
  execSync('npx vitest run --config inspect.config.ts inspect.test.ts', { stdio: 'pipe' })
} catch {
  // Expected to fail
}

// Read output
try {
  const output = require('fs').readFileSync('inspect-output.json', 'utf-8')
  console.log(output)
} catch (e) {
  console.log('No output found')
}

// Clean up
const fs = require('fs')
fs.unlinkSync('inspect.test.ts')
fs.unlinkSync('inspect-reporter.js')
fs.unlinkSync('inspect.config.ts')
if (fs.existsSync('inspect-output.json')) fs.unlinkSync('inspect-output.json')
