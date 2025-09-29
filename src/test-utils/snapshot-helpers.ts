/**
 * Snapshot Testing Helpers
 *
 * Utilities to normalize test output for stable snapshot comparisons.
 * These helpers strip volatile data like timestamps, durations, and system-specific paths.
 */

/**
 * Normalizes an LLMReporterOutput object for snapshot testing by removing volatile fields
 */
export function normalizeForSnapshot(output: any): any {
  if (!output) return output

  const normalized = structuredClone(output)

  // Normalize summary
  if (normalized.summary) {
    // Replace timestamp with fixed value
    if (normalized.summary.timestamp) {
      normalized.summary.timestamp = '2024-01-01T00:00:00.000Z'
    }

    // Replace duration with 0 for stable snapshots
    if (typeof normalized.summary.duration === 'number') {
      normalized.summary.duration = 0
    }

    // Normalize environment metadata
    if (normalized.summary.environment) {
      const env = normalized.summary.environment

      // Normalize OS info
      if (env.os) {
        env.os.platform = 'linux'
        env.os.release = '5.0.0'
        env.os.arch = 'x64'
        if (env.os.version) env.os.version = '5.0.0'
      }

      // Normalize Node info
      if (env.node) {
        env.node.version = 'v18.0.0'
        if (env.node.runtime) env.node.runtime = 'node'
      }

      // Normalize Vitest info
      if (env.vitest) {
        env.vitest.version = '3.0.0'
      }

      // Normalize package manager
      if (env.packageManager) {
        if (typeof env.packageManager === 'string') {
          // Handle string packageManager (e.g., "npm@11.3.0")
          env.packageManager = 'npm@9.0.0'
        } else if (typeof env.packageManager === 'object' && env.packageManager !== null) {
          env.packageManager.name = 'npm'
          env.packageManager.version = '9.0.0'
        }
      }

      // Normalize CI info
      if (env.ci !== undefined) {
        env.ci = false
      }
    }
  }

  // Normalize durations in test results
  if (normalized.passed) {
    normalized.passed = normalized.passed.map((test: any) => ({
      ...test,
      duration: 0
    }))
  }

  if (normalized.failures) {
    normalized.failures = normalized.failures.map((failure: any) => ({
      ...failure,
      duration: failure.duration !== undefined ? 0 : undefined
    }))
  }

  if (normalized.skipped) {
    normalized.skipped = normalized.skipped.map((test: any) => ({
      ...test,
      duration: 0
    }))
  }

  // Normalize file paths to be relative and consistent
  const normalizeFilePath = (path: string): string => {
    if (!path) return path
    // Convert absolute paths to relative
    return path.replace(/^.*\/(src|tests?)\//, '$1/')
  }

  if (normalized.failures) {
    normalized.failures = normalized.failures.map((failure: any) => ({
      ...failure,
      fileRelative: normalizeFilePath(failure.fileRelative),
      error: failure.error
        ? {
            ...failure.error,
            stackFrames: failure.error.stackFrames?.map((frame: any) => ({
              ...frame,
              fileRelative: normalizeFilePath(frame.fileRelative)
            }))
          }
        : undefined
    }))
  }

  if (normalized.passed) {
    normalized.passed = normalized.passed.map((test: any) => ({
      ...test,
      fileRelative: normalizeFilePath(test.fileRelative)
    }))
  }

  if (normalized.skipped) {
    normalized.skipped = normalized.skipped.map((test: any) => ({
      ...test,
      fileRelative: normalizeFilePath(test.fileRelative)
    }))
  }

  return normalized
}

/**
 * Normalizes error extraction results for snapshot testing
 */
export function normalizeErrorForSnapshot(error: any): any {
  if (!error) return error

  const normalized = structuredClone(error)

  // Normalize stack traces - remove absolute paths
  if (normalized.stack) {
    normalized.stack = normalized.stack
      .split('\n')
      .map((line: string) => line.replace(/\/.*\/(src|tests?)\//, '$1/'))
      .join('\n')
  }

  // Normalize stack frames
  if (normalized.stackFrames) {
    normalized.stackFrames = normalized.stackFrames.map((frame: any) => ({
      ...frame,
      fileRelative: frame.fileRelative?.replace(/^.*\/(src|tests?)\//, '$1/')
    }))
  }

  // Normalize context code paths
  if (normalized.context?.filePath) {
    normalized.context.filePath = normalized.context.filePath.replace(/^.*\/(src|tests?)\//, '$1/')
  }

  return normalized
}

/**
 * Normalizes test summary for snapshot testing
 */
export function normalizeSummaryForSnapshot(summary: any): any {
  if (!summary) return summary

  return {
    ...summary,
    timestamp: '2024-01-01T00:00:00.000Z',
    duration: 0,
    environment: summary.environment
      ? {
          os: {
            platform: 'linux',
            release: '5.0.0',
            arch: 'x64'
          },
          node: {
            version: 'v18.0.0'
          }
        }
      : undefined
  }
}

/**
 * Strips console output for snapshot testing (since console capture can be flaky in tests)
 */
export function stripConsoleOutput(output: any): any {
  if (!output) return output

  const normalized = structuredClone(output)

  if (normalized.failures) {
    normalized.failures = normalized.failures.map((failure: any) => {
      const { console: _console, ...rest } = failure
      return rest
    })
  }

  return normalized
}

/**
 * Sorts arrays in output for consistent snapshot ordering
 */
export function sortOutputForSnapshot(output: any): any {
  if (!output) return output

  const sorted = structuredClone(output)

  // Sort failures by test name
  if (sorted.failures) {
    sorted.failures.sort((a: any, b: any) => a.test.localeCompare(b.test))
  }

  // Sort passed tests by test name
  if (sorted.passed) {
    sorted.passed.sort((a: any, b: any) => a.test.localeCompare(b.test))
  }

  // Sort skipped tests by test name
  if (sorted.skipped) {
    sorted.skipped.sort((a: any, b: any) => a.test.localeCompare(b.test))
  }

  return sorted
}

/**
 * Complete normalization for snapshot testing - combines all normalizers
 */
export function prepareForSnapshot(output: any, options?: { stripConsole?: boolean }): any {
  let normalized = normalizeForSnapshot(output)

  if (options?.stripConsole) {
    normalized = stripConsoleOutput(normalized)
  }

  normalized = sortOutputForSnapshot(normalized)

  return normalized
}
