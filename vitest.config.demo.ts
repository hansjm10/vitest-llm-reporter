import { defineConfig } from 'vitest/config'
import LLMReporter from './dist/index.js'

export default defineConfig({
  test: {
    reporters: [
      'default',
      new LLMReporter({
        outputFile: 'demo-output.json',
        captureConsoleOnFailure: true,
        maxConsoleBytes: 50_000,
        maxConsoleLines: 100
      })
    ]
  }
})