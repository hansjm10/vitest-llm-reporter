/**
 * Minimal Environment Detection Utilities
 *
 * @module environment-utils
 */

export const isTTY = !!process.stdout.isTTY

export const isCI = Boolean(
  process.env.CI || process.env.GITHUB_ACTIONS || process.env.BUILDKITE || process.env.CIRCLECI
)

export const supportsColor = isTTY && process.env.FORCE_COLOR !== '0'
