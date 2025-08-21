/**
 * Environment Detection Utilities
 *
 * This module provides utilities for detecting environment capabilities,
 * including TTY detection and CI environment identification.
 *
 * @module environment-utils
 */

import { createLogger } from './logger.js'
import type {
  EnvironmentInfo,
  EnvironmentDetectionOptions,
  CIEnvironmentInfo,
  TTYInfo
} from '../types/environment.js'

const logger = createLogger('environment')

/**
 * Well-known CI environment variables and their providers
 */
const CI_PROVIDERS: Record<string, { name: string; envVars: string[] }> = {
  // GitHub Actions
  github: {
    name: 'GitHub Actions',
    envVars: ['GITHUB_ACTIONS', 'GITHUB_WORKFLOW']
  },
  // GitLab CI
  gitlab: {
    name: 'GitLab CI',
    envVars: ['GITLAB_CI']
  },
  // Jenkins
  jenkins: {
    name: 'Jenkins',
    envVars: ['JENKINS_URL', 'BUILD_NUMBER']
  },
  // CircleCI
  circleci: {
    name: 'CircleCI',
    envVars: ['CIRCLECI']
  },
  // Travis CI
  travis: {
    name: 'Travis CI',
    envVars: ['TRAVIS']
  },
  // Azure DevOps
  azure: {
    name: 'Azure DevOps',
    envVars: ['AZURE_HTTP_USER_AGENT', 'BUILD_SOURCESDIRECTORY']
  },
  // Buildkite
  buildkite: {
    name: 'Buildkite',
    envVars: ['BUILDKITE']
  },
  // TeamCity
  teamcity: {
    name: 'TeamCity',
    envVars: ['TEAMCITY_VERSION']
  },
  // Drone
  drone: {
    name: 'Drone',
    envVars: ['DRONE']
  },
  // Bamboo
  bamboo: {
    name: 'Bamboo',
    envVars: ['bamboo_planKey']
  }
}

/**
 * Generic CI environment variables that indicate CI presence
 */
const GENERIC_CI_VARS = ['CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER']

/**
 * Detects TTY capabilities for stdout and stderr
 */
export function detectTTY(options?: EnvironmentDetectionOptions): TTYInfo {
  logger('Detecting TTY capabilities')

  // Allow forced TTY for testing
  const stdout = options?.forceTTY?.stdout ?? process.stdout?.isTTY === true
  const stderr = options?.forceTTY?.stderr ?? process.stderr?.isTTY === true

  const result: TTYInfo = {
    stdout,
    stderr,
    hasAnyTTY: stdout || stderr,
    hasFullTTY: stdout && stderr
  }

  logger('TTY detection result: %o', result)
  return result
}

/**
 * Detects CI environment and provider
 */
export function detectCIEnvironment(options?: EnvironmentDetectionOptions): CIEnvironmentInfo {
  logger('Detecting CI environment')

  const env = { ...process.env, ...options?.additionalEnvVars }

  // Force CI for testing
  if (options?.forceCI !== undefined) {
    logger('Using forced CI setting: %s', options.forceCI)
    return {
      isCI: options.forceCI,
      provider: options.forceCI ? 'forced' : undefined
    }
  }

  // Check for specific CI providers
  for (const [key, provider] of Object.entries(CI_PROVIDERS)) {
    const hasProviderVars = provider.envVars.some((envVar) => env[envVar])
    if (hasProviderVars) {
      logger('Detected CI provider: %s', provider.name)

      const details: CIEnvironmentInfo['details'] = {}

      // Extract common CI details based on provider
      switch (key) {
        case 'github':
          details.buildId = env.GITHUB_RUN_ID
          details.branch = env.GITHUB_REF_NAME
          details.commit = env.GITHUB_SHA
          details.pullRequest =
            env.GITHUB_EVENT_NAME === 'pull_request' ? env.GITHUB_EVENT_NUMBER : undefined
          details.repository = env.GITHUB_REPOSITORY
          break
        case 'gitlab':
          details.buildId = env.CI_PIPELINE_ID
          details.branch = env.CI_COMMIT_REF_NAME
          details.commit = env.CI_COMMIT_SHA
          details.pullRequest = env.CI_MERGE_REQUEST_IID
          details.repository = env.CI_PROJECT_PATH
          break
        case 'jenkins':
          details.buildId = env.BUILD_NUMBER
          details.branch = env.GIT_BRANCH
          details.commit = env.GIT_COMMIT
          details.repository = env.JOB_NAME
          break
        case 'circleci':
          details.buildId = env.CIRCLE_BUILD_NUM
          details.branch = env.CIRCLE_BRANCH
          details.commit = env.CIRCLE_SHA1
          details.pullRequest = env.CIRCLE_PR_NUMBER
          details.repository = env.CIRCLE_PROJECT_REPONAME
          break
        case 'travis':
          details.buildId = env.TRAVIS_BUILD_NUMBER
          details.branch = env.TRAVIS_BRANCH
          details.commit = env.TRAVIS_COMMIT
          details.pullRequest =
            env.TRAVIS_PULL_REQUEST !== 'false' ? env.TRAVIS_PULL_REQUEST : undefined
          details.repository = env.TRAVIS_REPO_SLUG
          break
        case 'azure':
          details.buildId = env.BUILD_BUILDID
          details.branch = env.BUILD_SOURCEBRANCH
          details.commit = env.BUILD_SOURCEVERSION
          details.repository = env.BUILD_REPOSITORY_NAME
          break
        case 'buildkite':
          details.buildId = env.BUILDKITE_BUILD_NUMBER
          details.branch = env.BUILDKITE_BRANCH
          details.commit = env.BUILDKITE_COMMIT
          details.pullRequest =
            env.BUILDKITE_PULL_REQUEST !== 'false' ? env.BUILDKITE_PULL_REQUEST : undefined
          details.repository = env.BUILDKITE_REPO
          break
        case 'drone':
          details.buildId = env.DRONE_BUILD_NUMBER
          details.branch = env.DRONE_BRANCH
          details.commit = env.DRONE_COMMIT_SHA
          details.pullRequest = env.DRONE_PULL_REQUEST
          details.repository = env.DRONE_REPO
          break
      }

      return {
        isCI: true,
        provider: provider.name,
        details: Object.keys(details).length > 0 ? details : undefined
      }
    }
  }

  // Check for generic CI indicators
  const hasGenericCI = GENERIC_CI_VARS.some((envVar) => env[envVar])
  if (hasGenericCI) {
    logger('Detected generic CI environment')
    return {
      isCI: true,
      provider: 'Generic CI'
    }
  }

  logger('No CI environment detected')
  return {
    isCI: false
  }
}

/**
 * Detects complete environment information
 */
export function detectEnvironment(options?: EnvironmentDetectionOptions): EnvironmentInfo {
  logger('Starting environment detection')

  const tty = detectTTY(options)
  const ci = detectCIEnvironment(options)

  const platform = {
    os: process.platform,
    nodeVersion: process.version,
    isHeadless: ci.isCI || !tty.hasAnyTTY
  }

  const capabilities = {
    supportsColor: tty.hasAnyTTY && !ci.isCI,
    supportsInteractive: tty.hasFullTTY && !ci.isCI,
    supportsTerminal: tty.hasAnyTTY
  }

  const result: EnvironmentInfo = {
    tty,
    ci,
    platform,
    capabilities
  }

  logger('Environment detection complete: %o', result)
  return result
}

/**
 * Checks if the current environment supports color output
 */
export function supportsColor(envInfo?: EnvironmentInfo): boolean {
  const env = envInfo ?? detectEnvironment()
  return env.capabilities.supportsColor
}

/**
 * Checks if the current environment supports interactive features
 */
export function supportsInteractive(envInfo?: EnvironmentInfo): boolean {
  const env = envInfo ?? detectEnvironment()
  return env.capabilities.supportsInteractive
}

/**
 * Checks if the current environment is running in CI
 */
export function isCI(envInfo?: EnvironmentInfo): boolean {
  const env = envInfo ?? detectEnvironment()
  return env.ci.isCI
}

/**
 * Checks if the current environment has any TTY capabilities
 */
export function hasTTY(envInfo?: EnvironmentInfo): boolean {
  const env = envInfo ?? detectEnvironment()
  return env.tty.hasAnyTTY
}
