import { defineConfig } from 'vitest/config';
import { LLMReporter } from './dist/reporter/reporter.js';

export default defineConfig({
  test: {
    // Enable location tracking for line numbers
    includeTaskLocation: true,
    reporters: [
      // Keep default reporter for human-readable output
      'default',
      // Add LLM reporter for structured output
      new LLMReporter({
        outputFile: 'test-output.json',
        verbose: true,
        includePassedTests: true,
        includeSkippedTests: true
      })
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});