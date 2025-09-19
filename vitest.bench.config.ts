import { mkdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { LLMReporter } from './src/reporter/reporter.ts';

mkdirSync('tmp', { recursive: true });

export default defineConfig({
  test: {
    // Include benchmark files
    include: ['**/*.{test,spec,bench}.?(c|m)[jt]s?(x)'],
    // Enable location tracking for line numbers
    includeTaskLocation: true,
    reporters: [
      // Only emit LLM reporter output for benches
      new LLMReporter({
        outputFile: 'tmp/test-output.json',
        verbose: true,
        includePassedTests: true,
        includeSkippedTests: true
      })
    ],
    coverage: {
      provider: 'v8',
      reporter: ['json', 'html']
    }
  }
});
