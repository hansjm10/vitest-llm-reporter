/**
 * Framework log suppression presets
 *
 * Provides curated regular expressions and predicates for suppressing
 * noisy framework startup banners that commonly appear when running Vitest
 * inside web or server frameworks.
 */

import type { FrameworkPresetName, StdioFilter } from '../types/reporter.js'

/** Framework preset metadata */
interface FrameworkPresetDefinition {
  readonly name: FrameworkPresetName
  readonly description: string
  readonly patterns: readonly StdioFilter[]
}

const FRAMEWORK_PRESET_ORDER: readonly FrameworkPresetName[] = [
  'nest',
  'next',
  'nuxt',
  'angular',
  'vite',
  'fastify',
  'express',
  'strapi',
  'remix',
  'sveltekit'
] as const

/**
 * Curated framework presets. Patterns are intentionally conservative to
 * minimize the chance of filtering legitimate test output.
 */
const FRAMEWORK_PRESET_DEFINITIONS: Record<FrameworkPresetName, FrameworkPresetDefinition> = {
  nest: {
    name: 'nest',
    description: 'NestJS application banners and lifecycle logs',
    patterns: [/^\[Nest\]\s/, /^\[RoutesResolver\]/, /^\[InstanceLoader\]/]
  },
  next: {
    name: 'next',
    description: 'Next.js CLI dev/prod server output',
    patterns: [
      /^(?:info|ready|event|wait|warn|error)\s+-\s/, // `info  - Loaded env ...`
      /^Creating an optimized production build\.\.\./,
      /^Compiled (?:successfully|with warnings)/
    ]
  },
  nuxt: {
    name: 'nuxt',
    description: 'Nuxt CLI output (consola icons)',
    patterns: [/^[ℹ✔✖❯]\s/, /^Nuxt\s/i, /^Nitro\s/i]
  },
  angular: {
    name: 'angular',
    description: 'Angular CLI spinner + summary output',
    patterns: [/^[✔✖⚠ℹ]\s/, /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s/]
  },
  vite: {
    name: 'vite',
    description: 'Vite dev server banner',
    patterns: [/^\s*VITE v\d/i, /^➜\s/, /^✓\s/, /^✗\s/]
  },
  fastify: {
    name: 'fastify',
    description: 'Fastify JSON logger startup output',
    patterns: [
      /^\{"level":\d+,"time":\d+,"pid":\d+,"hostname":.+?,"msg":"(?:Server listening|Routes ready|Plugins ready)/,
      /Fastify server listening on/i
    ]
  },
  express: {
    name: 'express',
    description: 'Express listening banners used in starters',
    patterns: [/(?:Express|Server) listening (?:on|at)/i]
  },
  strapi: {
    name: 'strapi',
    description: 'Strapi structured logs',
    patterns: [/^\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}.*\]\s(?:info|warn|error|debug):/]
  },
  remix: {
    name: 'remix',
    description: 'Remix dev server banner',
    patterns: [/^Remix App Server/, /^💿/]
  },
  sveltekit: {
    name: 'sveltekit',
    description: 'SvelteKit CLI output',
    patterns: [/^\s*SvelteKit v\d/i, /^\s*(?:local|network):\shttps?:\/\//i]
  }
}

/** Mapping of framework presets to package name hints used for auto-detection */
const FRAMEWORK_PACKAGE_HINTS: Record<FrameworkPresetName, readonly string[]> = {
  nest: ['@nestjs/core', '@nestjs/*'],
  next: ['next'],
  nuxt: ['nuxt', 'nuxt3', '@nuxt/*'],
  angular: ['@angular/core', '@angular/cli'],
  vite: ['vite'],
  fastify: ['fastify', '@fastify/*'],
  express: ['express'],
  strapi: ['@strapi/strapi', '@strapi/*'],
  remix: ['@remix-run/node', '@remix-run/dev', '@remix-run/serve', 'remix'],
  sveltekit: ['@sveltejs/kit']
}

/** Optional environment variable hints for framework detection */
const FRAMEWORK_ENV_HINTS: Partial<Record<FrameworkPresetName, readonly string[]>> = {
  next: ['NEXT_TELEMETRY_DISABLED', 'NEXT_RUNTIME', 'NEXT_PHASE'],
  nuxt: ['NUXT_TELEMETRY_DISABLED', 'NUXT_HOST', 'NUXT_PORT']
}

/**
 * Return all available preset names.
 */
export function listFrameworkPresets(): FrameworkPresetName[] {
  return [...FRAMEWORK_PRESET_ORDER]
}

/**
 * Resolve the concrete pattern list for the requested presets.
 */
export function getFrameworkPresetPatterns(presets: Iterable<FrameworkPresetName>): StdioFilter[] {
  const collected: StdioFilter[] = []
  for (const preset of presets) {
    const definition = FRAMEWORK_PRESET_DEFINITIONS[preset]
    if (!definition) {
      continue
    }
    collected.push(...definition.patterns)
  }
  return collected
}

/** Package.json fields we care about for auto-detection */
interface PackageLike {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
}

/** Input for framework auto detection */
export interface FrameworkDetectionContext {
  readonly packageJson?: PackageLike | null
  readonly env?: NodeJS.ProcessEnv
}

function hasDependencyMatch(dependency: string, hint: string): boolean {
  if (hint.endsWith('*')) {
    const prefix = hint.slice(0, -1)
    return dependency.startsWith(prefix)
  }
  return dependency === hint
}

/**
 * Auto-detect framework presets based on package metadata and environment.
 */
export function detectFrameworkPresets(context: FrameworkDetectionContext): FrameworkPresetName[] {
  const detected = new Set<FrameworkPresetName>()
  const packageJson = context.packageJson

  if (packageJson) {
    const dependencyNames = new Set<string>()
    const sections: (keyof PackageLike)[] = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies'
    ]
    for (const key of sections) {
      const section = packageJson[key]
      if (!section) continue
      for (const depName of Object.keys(section)) {
        dependencyNames.add(depName)
      }
    }

    for (const preset of FRAMEWORK_PRESET_ORDER) {
      const hints = FRAMEWORK_PACKAGE_HINTS[preset]
      if (!hints?.length) continue
      const matched = Array.from(dependencyNames).some((name) =>
        hints.some((hint) => hasDependencyMatch(name, hint))
      )
      if (matched) {
        detected.add(preset)
      }
    }
  }

  const env = context.env
  if (env) {
    for (const preset of FRAMEWORK_PRESET_ORDER) {
      if (detected.has(preset)) continue
      const hints = FRAMEWORK_ENV_HINTS[preset]
      if (!hints?.length) continue
      const matched = hints.some((hint) => hint in env)
      if (matched) {
        detected.add(preset)
      }
    }
  }

  return Array.from(detected).sort(
    (a, b) => FRAMEWORK_PRESET_ORDER.indexOf(a) - FRAMEWORK_PRESET_ORDER.indexOf(b)
  )
}

/**
 * Human readable descriptions for presets (useful for documentation / debugging).
 */
export function describeFrameworkPreset(preset: FrameworkPresetName): string | undefined {
  return FRAMEWORK_PRESET_DEFINITIONS[preset]?.description
}

/**
 * Export preset definitions for testing purposes.
 */
export function getFrameworkPresetDefinition(
  preset: FrameworkPresetName
): FrameworkPresetDefinition | undefined {
  return FRAMEWORK_PRESET_DEFINITIONS[preset]
}
