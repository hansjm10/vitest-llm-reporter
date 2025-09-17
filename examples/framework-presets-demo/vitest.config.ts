import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    reporters: [
      [
        'vitest-llm-reporter',
        {
          stdio: {
            suppressStdout: true,
            frameworkPresets: ['nest', 'next', 'fastify'],
            // Combine presets with a custom filter to keep repeated CI banners quiet
            filterPattern: [/^CI\s?:/i]
          },
          deduplicateLogs: {
            enabled: true,
            scope: 'per-test'
          }
        }
      ]
    ]
  }
})
