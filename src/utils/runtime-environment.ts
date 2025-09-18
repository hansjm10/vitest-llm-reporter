import os from 'node:os'
import { createRequire } from 'node:module'
import type { RuntimeEnvironmentSummary } from '../types/schema.js'
import type { EnvironmentMetadataConfig } from '../types/reporter.js'
import { isCI } from './environment.js'

const require = createRequire(import.meta.url)

let cachedBaseEnvironment: RuntimeEnvironmentSummary | undefined

/**
 * Collects host runtime metadata for inclusion in the summary.
 * The result is cached for the lifetime of the process to avoid
 * repeated filesystem reads when resolving package metadata.
 */
export function getRuntimeEnvironmentSummary(
  options?: EnvironmentMetadataConfig
): RuntimeEnvironmentSummary | undefined {
  if (options?.enabled === false) {
    return undefined
  }

  const base = getBaseEnvironment()

  const includeOsVersion = options?.includeOsVersion !== false
  const includeNodeRuntime = options?.includeNodeRuntime !== false
  const includeVitest = options?.includeVitest !== false
  const includeCi = options?.includeCi !== false
  const includePackageManager = options?.includePackageManager !== false

  const environment: RuntimeEnvironmentSummary = {
    os: {
      platform: base.os.platform,
      release: base.os.release,
      arch: base.os.arch,
      ...(includeOsVersion && base.os.version ? { version: base.os.version } : {})
    },
    node: {
      version: base.node.version,
      ...(includeNodeRuntime && base.node.runtime ? { runtime: base.node.runtime } : {})
    }
  }

  if (includeVitest && base.vitest?.version) {
    environment.vitest = { version: base.vitest.version }
  }

  if (includeCi && base.ci !== undefined) {
    environment.ci = base.ci
  }

  if (includePackageManager && base.packageManager) {
    environment.packageManager = base.packageManager
  }

  return environment
}

function getBaseEnvironment(): RuntimeEnvironmentSummary & {
  ci?: boolean
  packageManager?: string
} {
  if (!cachedBaseEnvironment) {
    const nodeVersion = normalizeNodeVersion(process.version)
    const base: RuntimeEnvironmentSummary = {
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch()
      },
      node: {
        version: nodeVersion
      }
    }

    const nodeRuntime = process.release?.name
    if (nodeRuntime) {
      base.node.runtime = nodeRuntime
    }

    const osVersion = getOsVersion()
    if (osVersion) {
      base.os.version = osVersion
    }

    const vitestVersion = resolvePackageVersion('vitest')
    if (vitestVersion) {
      base.vitest = { version: vitestVersion }
    }

    base.ci = isCI

    const packageManager = parsePackageManager(process.env.npm_config_user_agent)
    if (packageManager) {
      base.packageManager = packageManager
    }

    cachedBaseEnvironment = base
  }

  // Return a shallow copy to prevent external mutation of the cached instance
  const cached = cachedBaseEnvironment!
  return {
    os: { ...cached.os },
    node: { ...cached.node },
    ...(cached.vitest ? { vitest: { ...cached.vitest } } : {}),
    ...(cached.ci !== undefined ? { ci: cached.ci } : {}),
    ...(cached.packageManager ? { packageManager: cached.packageManager } : {})
  }
}

function getOsVersion(): string | undefined {
  const versionFn = (os as unknown as { version?: () => string }).version
  if (typeof versionFn !== 'function') {
    return undefined
  }

  try {
    const value = versionFn()
    return value && typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

function normalizeNodeVersion(version: string): string {
  if (typeof version !== 'string') {
    return ''
  }

  return version.startsWith('v') ? version.slice(1) : version
}

function parsePackageManager(userAgent?: string): string | undefined {
  if (!userAgent) {
    return undefined
  }

  const [identifier] = userAgent.split(' ')
  if (!identifier) {
    return undefined
  }

  const [name, rawVersion] = identifier.split('/')
  if (!name) {
    return undefined
  }

  return rawVersion ? `${name}@${rawVersion}` : name
}

function resolvePackageVersion(pkgName: string): string | undefined {
  try {
    const packageJsonPath = require.resolve(`${pkgName}/package.json`)
    const packageJson = require(packageJsonPath) as { version?: unknown }
    const version = packageJson?.version
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}
