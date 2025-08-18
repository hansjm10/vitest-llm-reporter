const { writeFileSync } = require('fs')
const { execSync } = require('child_process')

// Create test
writeFileSync('interface-test.test.ts', `
import { it, expect } from 'vitest'
it('fail', () => expect(1).toBe(2))
`)

// Create reporter that logs all method calls
writeFileSync('interface-reporter.js', `
import { writeFileSync, appendFileSync } from 'fs'

export default class InterfaceReporter {
  constructor() {
    writeFileSync('interface-calls.log', 'Reporter created\\n')
  }
  
  onInit() { appendFileSync('interface-calls.log', 'onInit\\n') }
  onPathsCollected() { appendFileSync('interface-calls.log', 'onPathsCollected\\n') }
  onCollected() { appendFileSync('interface-calls.log', 'onCollected\\n') }
  onTaskUpdate(packs) { 
    appendFileSync('interface-calls.log', 'onTaskUpdate with ' + packs.length + ' packs\\n')
    packs.forEach(pack => {
      pack.forEach(task => {
        if (task.type === 'test' && task.result?.state === 'fail') {
          appendFileSync('interface-calls.log', 'Failed test found\\n')
        }
      })
    })
  }
  onTestRemoved() { appendFileSync('interface-calls.log', 'onTestRemoved\\n') }
  onWatcherStart() { appendFileSync('interface-calls.log', 'onWatcherStart\\n') }
  onWatcherRerun() { appendFileSync('interface-calls.log', 'onWatcherRerun\\n') }
  onServerRestart() { appendFileSync('interface-calls.log', 'onServerRestart\\n') }
  onFinished() { appendFileSync('interface-calls.log', 'onFinished\\n') }
  
  // Old interface methods
  onTestCaseResult() { appendFileSync('interface-calls.log', 'onTestCaseResult\\n') }
  onTestRunEnd() { appendFileSync('interface-calls.log', 'onTestRunEnd\\n') }
}
`)

// Run
try {
  execSync('npx vitest run --reporter=./interface-reporter.js interface-test.test.ts', { stdio: 'ignore' })
} catch {}

// Check
const fs = require('fs')
if (fs.existsSync('interface-calls.log')) {
  console.log(fs.readFileSync('interface-calls.log', 'utf-8'))
}

// Clean up
if (fs.existsSync('interface-test.test.ts')) fs.unlinkSync('interface-test.test.ts')
if (fs.existsSync('interface-reporter.js')) fs.unlinkSync('interface-reporter.js')
if (fs.existsSync('interface-calls.log')) fs.unlinkSync('interface-calls.log')
