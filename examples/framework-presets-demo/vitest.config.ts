import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const exampleRoot = fileURLToPath(new URL('.', import.meta.url))
const reporterEntry = fileURLToPath(new URL('../../src/index.ts', import.meta.url))

export default defineConfig({
  root: exampleRoot,
  resolve: {
    alias: {
      'vitest-llm-reporter': reporterEntry
    }
  },
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
