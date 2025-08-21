/**
 * Environment Detection Tests
 *
 * Tests for environment detection utilities including TTY detection
 * and CI environment identification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  detectTTY,
  detectCIEnvironment,
  detectEnvironment,
  supportsColor,
  supportsInteractive,
  isCI,
  hasTTY
} from './environment.js'
import type { EnvironmentDetectionOptions } from '../types/environment.js'

describe('Environment Detection', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Clear environment variables
    for (const key of Object.keys(process.env)) {
      if (
        key.includes('CI') ||
        key.includes('GITHUB') ||
        key.includes('GITLAB') ||
        key.includes('JENKINS') ||
        key.includes('TRAVIS') ||
        key.includes('BUILD')
      ) {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('detectTTY', () => {
    it('should detect real TTY capabilities', () => {
      // Test with real process TTY values (whatever they are)
      const result = detectTTY()

      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result).toHaveProperty('hasAnyTTY')
      expect(result).toHaveProperty('hasFullTTY')
      expect(typeof result.stdout).toBe('boolean')
      expect(typeof result.stderr).toBe('boolean')
      expect(result.hasAnyTTY).toBe(result.stdout || result.stderr)
      expect(result.hasFullTTY).toBe(result.stdout && result.stderr)
    })

    it('should respect forced TTY options - both true', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: true, stderr: true }
      }

      const result = detectTTY(options)

      expect(result).toEqual({
        stdout: true,
        stderr: true,
        hasAnyTTY: true,
        hasFullTTY: true
      })
    })

    it('should respect forced TTY options - mixed', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: true, stderr: false }
      }

      const result = detectTTY(options)

      expect(result).toEqual({
        stdout: true,
        stderr: false,
        hasAnyTTY: true,
        hasFullTTY: false
      })
    })

    it('should respect forced TTY options - both false', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: false, stderr: false }
      }

      const result = detectTTY(options)

      expect(result).toEqual({
        stdout: false,
        stderr: false,
        hasAnyTTY: false,
        hasFullTTY: false
      })
    })

    it('should respect partial forced TTY options', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: true }
      }

      const result = detectTTY(options)

      expect(result.stdout).toBe(true)
      expect(result.hasAnyTTY).toBe(true)
      // stderr should use real value
      expect(typeof result.stderr).toBe('boolean')
    })
  })

  describe('detectCIEnvironment', () => {
    it('should detect no CI environment by default', () => {
      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: false
      })
    })

    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true'
      process.env.GITHUB_RUN_ID = '123456'
      process.env.GITHUB_REF_NAME = 'main'
      process.env.GITHUB_SHA = 'abcdef123456'
      process.env.GITHUB_REPOSITORY = 'owner/repo'

      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: true,
        provider: 'GitHub Actions',
        details: {
          buildId: '123456',
          branch: 'main',
          commit: 'abcdef123456',
          repository: 'owner/repo'
        }
      })
    })

    it('should detect GitLab CI', () => {
      process.env.GITLAB_CI = 'true'
      process.env.CI_PIPELINE_ID = '789'
      process.env.CI_COMMIT_REF_NAME = 'feature-branch'
      process.env.CI_COMMIT_SHA = '789abc456def'
      process.env.CI_PROJECT_PATH = 'group/project'

      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: true,
        provider: 'GitLab CI',
        details: {
          buildId: '789',
          branch: 'feature-branch',
          commit: '789abc456def',
          repository: 'group/project'
        }
      })
    })

    it('should detect Jenkins', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com'
      process.env.BUILD_NUMBER = '42'
      process.env.GIT_BRANCH = 'origin/develop'
      process.env.GIT_COMMIT = 'def456789abc'
      process.env.JOB_NAME = 'test-job'

      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: true,
        provider: 'Jenkins',
        details: {
          buildId: '42',
          branch: 'origin/develop',
          commit: 'def456789abc',
          repository: 'test-job'
        }
      })
    })

    it('should detect CircleCI', () => {
      process.env.CIRCLECI = 'true'
      process.env.CIRCLE_BUILD_NUM = '100'
      process.env.CIRCLE_BRANCH = 'master'
      process.env.CIRCLE_SHA1 = '123def456abc'
      process.env.CIRCLE_PROJECT_REPONAME = 'my-project'

      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: true,
        provider: 'CircleCI',
        details: {
          buildId: '100',
          branch: 'master',
          commit: '123def456abc',
          repository: 'my-project'
        }
      })
    })

    it('should detect Travis CI', () => {
      process.env.TRAVIS = 'true'
      process.env.TRAVIS_BUILD_NUMBER = '200'
      process.env.TRAVIS_BRANCH = 'staging'
      process.env.TRAVIS_COMMIT = 'abc123def456'
      process.env.TRAVIS_REPO_SLUG = 'user/repo'
      process.env.TRAVIS_PULL_REQUEST = 'false'

      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: true,
        provider: 'Travis CI',
        details: {
          buildId: '200',
          branch: 'staging',
          commit: 'abc123def456',
          repository: 'user/repo'
        }
      })
    })

    it('should detect Travis CI with pull request', () => {
      process.env.TRAVIS = 'true'
      process.env.TRAVIS_PULL_REQUEST = '15'

      const result = detectCIEnvironment()

      expect(result.details?.pullRequest).toBe('15')
    })

    it('should detect generic CI environment', () => {
      process.env.CI = 'true'

      const result = detectCIEnvironment()

      expect(result).toEqual({
        isCI: true,
        provider: 'Generic CI'
      })
    })

    it('should respect forced CI options', () => {
      const options: EnvironmentDetectionOptions = {
        forceCI: true
      }

      const result = detectCIEnvironment(options)

      expect(result).toEqual({
        isCI: true,
        provider: 'forced'
      })
    })

    it('should respect additional environment variables', () => {
      const options: EnvironmentDetectionOptions = {
        additionalEnvVars: {
          CI: 'true'
        }
      }

      const result = detectCIEnvironment(options)

      expect(result).toEqual({
        isCI: true,
        provider: 'Generic CI'
      })
    })
  })

  describe('detectEnvironment', () => {
    it('should return complete environment information with forced TTY', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: true, stderr: true }
      }

      const result = detectEnvironment(options)

      expect(result).toEqual({
        tty: {
          stdout: true,
          stderr: true,
          hasAnyTTY: true,
          hasFullTTY: true
        },
        ci: {
          isCI: false
        },
        platform: {
          os: process.platform,
          nodeVersion: process.version,
          isHeadless: false
        },
        capabilities: {
          supportsColor: true,
          supportsInteractive: true,
          supportsTerminal: true
        }
      })
    })

    it('should detect headless CI environment', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: false, stderr: false },
        forceCI: true
      }

      const result = detectEnvironment(options)

      expect(result.platform.isHeadless).toBe(true)
      expect(result.capabilities.supportsColor).toBe(false)
      expect(result.capabilities.supportsInteractive).toBe(false)
      expect(result.capabilities.supportsTerminal).toBe(false)
      expect(result.ci.isCI).toBe(true)
    })

    it('should handle TTY without CI correctly', () => {
      const options: EnvironmentDetectionOptions = {
        forceTTY: { stdout: true, stderr: false },
        forceCI: false
      }

      const result = detectEnvironment(options)

      expect(result.platform.isHeadless).toBe(false)
      expect(result.capabilities.supportsColor).toBe(true)
      expect(result.capabilities.supportsInteractive).toBe(false)
      expect(result.capabilities.supportsTerminal).toBe(true)
      expect(result.ci.isCI).toBe(false)
    })

    it('should return real environment information', () => {
      const result = detectEnvironment()

      expect(result).toHaveProperty('tty')
      expect(result).toHaveProperty('ci')
      expect(result).toHaveProperty('platform')
      expect(result).toHaveProperty('capabilities')
      expect(result.platform.os).toBe(process.platform)
      expect(result.platform.nodeVersion).toBe(process.version)
    })
  })

  describe('helper functions', () => {
    describe('supportsColor', () => {
      it('should use provided environment info', () => {
        const envInfo = {
          capabilities: { supportsColor: true }
        } as any

        expect(supportsColor(envInfo)).toBe(true)
      })

      it('should use provided environment info - false', () => {
        const envInfo = {
          capabilities: { supportsColor: false }
        } as any

        expect(supportsColor(envInfo)).toBe(false)
      })

      it('should detect from real environment', () => {
        const result = supportsColor()
        expect(typeof result).toBe('boolean')
      })
    })

    describe('supportsInteractive', () => {
      it('should use provided environment info', () => {
        const envInfo = {
          capabilities: { supportsInteractive: true }
        } as any

        expect(supportsInteractive(envInfo)).toBe(true)
      })

      it('should use provided environment info - false', () => {
        const envInfo = {
          capabilities: { supportsInteractive: false }
        } as any

        expect(supportsInteractive(envInfo)).toBe(false)
      })

      it('should detect from real environment', () => {
        const result = supportsInteractive()
        expect(typeof result).toBe('boolean')
      })
    })

    describe('isCI', () => {
      it('should return false by default', () => {
        expect(isCI()).toBe(false)
      })

      it('should return true for CI environment', () => {
        process.env.CI = 'true'
        expect(isCI()).toBe(true)
      })

      it('should use provided environment info', () => {
        const envInfo = {
          ci: { isCI: true }
        } as any

        expect(isCI(envInfo)).toBe(true)
      })
    })

    describe('hasTTY', () => {
      it('should use provided environment info', () => {
        const envInfo = {
          tty: { hasAnyTTY: true }
        } as any

        expect(hasTTY(envInfo)).toBe(true)
      })

      it('should use provided environment info - false', () => {
        const envInfo = {
          tty: { hasAnyTTY: false }
        } as any

        expect(hasTTY(envInfo)).toBe(false)
      })

      it('should detect from real environment', () => {
        const result = hasTTY()
        expect(typeof result).toBe('boolean')
      })
    })
  })
})
