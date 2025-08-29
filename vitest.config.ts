import { defineConfig } from 'vitest/config';
import { LLMReporter } from 'vitest-llm-reporter';

export default defineConfig({
  test: {
    // Enable location tracking for line numbers
    includeTaskLocation: true,
    // Force exit after tests complete
    pool: 'vmThreads',
    poolOptions: {
      vmThreads: {
        // Force exit after tests complete
        useAtomics: false
      }
    },
    // Add teardown timeout
    teardownTimeout: 1000,
    reporters: [
      // Only emit LLM reporter output (no default Vitest output)
      new LLMReporter({
        outputFile: undefined, // Display to console instead of file
        verbose: false, // Reduce verbosity for cleaner output
        includePassedTests: false, // Don't include passed tests in final report
        includeSkippedTests: false, // Don't include skipped tests in final report
        enableStreaming: false // Disable streaming - focus on final JSON output
      })
    ],
    coverage: {
      provider: 'v8',
      // Remove 'text' to avoid extra console output; keep non-console reporters
      reporter: ['json', 'html']
    }
  }
});
