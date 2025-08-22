import { defineConfig } from 'vitest/config';
import { LLMReporter } from './src/reporter/reporter.ts';

export default defineConfig({
  test: {
    // Enable location tracking for line numbers
    includeTaskLocation: true,
    reporters: [
      // Keep default reporter for human-readable output
      'default',
      // Add LLM reporter for structured output
      new LLMReporter({
        outputFile: undefined, // Display to console instead of file
        verbose: false, // Reduce verbosity for cleaner output
        includePassedTests: false, // Don't include passed tests in final report
        includeSkippedTests: false, // Don't include skipped tests in final report
        enableStreaming: false, // Disable streaming - focus on final JSON output
        streamingMode: false    // Disable streaming mode
      })
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
