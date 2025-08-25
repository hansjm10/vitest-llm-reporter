
import { defineConfig } from 'vitest/config'
import { LLMReporter } from './dist/reporter/reporter.js'

export default defineConfig({
  test: {
    includeTaskLocation: true,
    // Don't disable console interception - let Vitest forward console to reporter
    disableConsoleIntercept: false,
    reporters: [
      new LLMReporter({
        outputFile: '/home/jordan/vitest-llm-reporter/.tmp-e2e-test-output.json',
        verbose: false,  // Disable verbose for cleaner output
        includePassedTests: false,
        includeSkippedTests: false,
        captureConsoleOnFailure: true,
        maxConsoleBytes: 50000,
        maxConsoleLines: 100
      })
    ]
  }
})
