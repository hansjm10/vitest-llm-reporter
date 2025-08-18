const { writeFileSync } = require('fs')
const { execSync } = require('child_process')

// Create test file with a known location
const testContent = `
import { describe, it, expect } from 'vitest'

describe('Reporter Test', () => {
  it('should fail at line 7', () => {
    const result = 4
    expect(result).toBe(20) // This is line 7
  })
})
`
writeFileSync('reporter-test.test.ts', testContent)

// Create a custom reporter that tests context extraction
const reporterContent = `
import { ContextExtractor } from './dist/extraction/ContextExtractor.js'
import { writeFileSync } from 'fs'

export default {
  onTaskUpdate(packs) {
    const extractor = new ContextExtractor()
    const results = []
    
    packs.forEach(pack => {
      pack.forEach(task => {
        if (task.type === 'test' && task.result?.state === 'fail') {
          const error = task.result.errors?.[0] || task.result.error
          if (error && error.stack) {
            // Extract file path from stack
            const match = error.stack.match(/at\\s+(.+?):(\\d+):(\\d+)/)
            if (match) {
              const file = match[1]
              const line = parseInt(match[2], 10)
              const column = parseInt(match[3], 10)
              
              const context = extractor.extractCodeContext(file, line, column)
              results.push({
                file,
                line,
                column,
                hasContext: !!context,
                codeLength: context?.code?.length || 0
              })
            }
          }
        }
      })
    })
    
    if (results.length > 0) {
      writeFileSync('reporter-context-test.json', JSON.stringify(results, null, 2))
    }
  }
}
`
writeFileSync('test-reporter.js', reporterContent)

// Run the test
try {
  execSync('npx vitest run --reporter=./test-reporter.js reporter-test.test.ts', { stdio: 'ignore' })
} catch {
  // Expected to fail
}

// Check output
const fs = require('fs')
if (fs.existsSync('reporter-context-test.json')) {
  const output = fs.readFileSync('reporter-context-test.json', 'utf-8')
  console.log('Context extraction in reporter:')
  console.log(output)
} else {
  console.log('No output file created')
}

// Clean up
if (fs.existsSync('reporter-test.test.ts')) fs.unlinkSync('reporter-test.test.ts')
if (fs.existsSync('test-reporter.js')) fs.unlinkSync('test-reporter.js')
if (fs.existsSync('reporter-context-test.json')) fs.unlinkSync('reporter-context-test.json')
