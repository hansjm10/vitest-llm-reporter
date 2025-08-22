import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [
      ['./dist/index.js', { 
        outputFile: 'console-test-output.json',
        enableStreaming: true,
        console: true
      }]
    ]
  }
})
