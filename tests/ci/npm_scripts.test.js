import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('NPM Scripts Validation', () => {
  const packageJsonPath = join(process.cwd(), 'package.json')
  let packageJson

  beforeAll(() => {
    const content = readFileSync(packageJsonPath, 'utf8')
    packageJson = JSON.parse(content)
  })

  it('should have test script', () => {
    expect(packageJson.scripts.test).toBeDefined()
    expect(packageJson.scripts.test).toContain('vitest run')
  })

  it('should have coverage script', () => {
    expect(packageJson.scripts.coverage).toBeDefined()
    expect(packageJson.scripts.coverage).toContain('vitest run --coverage')
  })

  it('should have lint script', () => {
    expect(packageJson.scripts.lint).toBeDefined()
    expect(packageJson.scripts.lint).toContain('eslint')
  })

  it('should have type-check script', () => {
    expect(packageJson.scripts['type-check']).toBeDefined()
    expect(packageJson.scripts['type-check']).toContain('tsc --noEmit')
  })

  it('should have build script', () => {
    expect(packageJson.scripts.build).toBeDefined()
    expect(packageJson.scripts.build).toContain('tsc')
  })

  it('should have ci script combining all checks', () => {
    expect(packageJson.scripts.ci).toBeDefined()
    expect(packageJson.scripts.ci).toContain('lint')
    expect(packageJson.scripts.ci).toContain('type-check')
    expect(packageJson.scripts.ci).toContain('test')
    expect(packageJson.scripts.ci).toContain('coverage')
    expect(packageJson.scripts.ci).toContain('build')
  })

  it('should have prepublishOnly script', () => {
    expect(packageJson.scripts.prepublishOnly).toBeDefined()
    expect(packageJson.scripts.prepublishOnly).toContain('build')
  })

  it('should have correct package metadata', () => {
    expect(packageJson.name).toBe('vitest-llm-reporter')
    expect(packageJson.version).toBeDefined()
    expect(packageJson.description).toBeDefined()
    expect(packageJson.main).toBeDefined()
    expect(packageJson.types).toBeDefined()
    expect(packageJson.files).toBeDefined()
    expect(packageJson.repository).toBeDefined()
    expect(packageJson.author).toBeDefined()
    expect(packageJson.license).toBeDefined()
  })

  it('should have Node engine requirement', () => {
    expect(packageJson.engines).toBeDefined()
    expect(packageJson.engines.node).toBe('>=18.0.0')
  })

  it('should have publishConfig for NPM', () => {
    expect(packageJson.publishConfig).toBeDefined()
    expect(packageJson.publishConfig.access).toBe('public')
    expect(packageJson.publishConfig.provenance).toBe(true)
  })
})
