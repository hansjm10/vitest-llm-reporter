import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { load } from 'js-yaml'
import { join } from 'path'

describe('Artifact Management Validation', () => {
  const ciWorkflowPath = join(process.cwd(), '.github/workflows/ci.yml')

  it('should upload test results as artifacts', () => {
    const content = readFileSync(ciWorkflowPath, 'utf8')
    const workflow = load(content)

    const testJob = workflow.jobs.test
    const uploadStep = testJob.steps.find(
      (step) => step.uses && step.uses.includes('actions/upload-artifact')
    )

    expect(uploadStep).toBeDefined()
    expect(uploadStep.with.name).toContain('test-results')
    expect(uploadStep.with.path).toBeDefined()
  })

  it('should upload coverage reports as artifacts', () => {
    const content = readFileSync(ciWorkflowPath, 'utf8')
    const workflow = load(content)

    const coverageJob = workflow.jobs.coverage
    const uploadStep = coverageJob.steps.find(
      (step) => step.uses && step.uses.includes('actions/upload-artifact')
    )

    expect(uploadStep).toBeDefined()
    expect(uploadStep.with.name).toContain('coverage')
    expect(uploadStep.with.path).toContain('coverage')
  })

  it('should set artifact retention days', () => {
    const content = readFileSync(ciWorkflowPath, 'utf8')
    const workflow = load(content)

    const testJob = workflow.jobs.test
    const uploadStep = testJob.steps.find(
      (step) => step.uses && step.uses.includes('actions/upload-artifact')
    )

    expect(uploadStep.with['retention-days']).toBeDefined()
    expect(uploadStep.with['retention-days']).toBeLessThanOrEqual(7)
  })

  it('should handle artifact upload failures gracefully', () => {
    const content = readFileSync(ciWorkflowPath, 'utf8')
    const workflow = load(content)

    const testJob = workflow.jobs.test
    const uploadStep = testJob.steps.find(
      (step) => step.uses && step.uses.includes('actions/upload-artifact')
    )

    expect(uploadStep.with['if-no-files-found']).toBeDefined()
    expect(['warn', 'ignore']).toContain(uploadStep.with['if-no-files-found'])
  })

  it('should cache dependencies between runs', () => {
    const content = readFileSync(ciWorkflowPath, 'utf8')
    const workflow = load(content)

    const jobs = Object.values(workflow.jobs)
    // Our composite action handles caching
    const hasCaching = jobs.some((job) =>
      job.steps.some((step) => step.uses && step.uses.includes('./.github/actions/setup'))
    )

    expect(hasCaching).toBe(true)
  })

  it('should use proper cache keys', () => {
    // Verify our composite action has proper caching configuration
    const setupActionPath = join(process.cwd(), '.github/actions/setup/action.yml')
    const content = readFileSync(setupActionPath, 'utf8')
    const action = load(content)

    // Check that the action uses cache
    const cacheStep = action.runs.steps.find(
      (step) => step.uses && step.uses.includes('actions/cache')
    )

    expect(cacheStep).toBeDefined()
    expect(cacheStep.with.key).toContain('${{ runner.os }}')
    expect(cacheStep.with.key).toContain('node-')
    expect(cacheStep.with['restore-keys']).toBeDefined()
  })

  it('should generate build artifacts in release workflow', () => {
    const releaseWorkflowPath = join(process.cwd(), '.github/workflows/release.yml')
    const content = readFileSync(releaseWorkflowPath, 'utf8')
    const workflow = load(content)

    const releaseJob = workflow.jobs.release
    const changesetStep = releaseJob.steps.find(
      (step) => step.uses && step.uses.includes('changesets/action')
    )

    expect(changesetStep).toBeDefined()
    expect(changesetStep.with.publish).toContain('npm run release:publish')
  })

  it('should have timeout configuration for long-running jobs', () => {
    const content = readFileSync(ciWorkflowPath, 'utf8')
    const workflow = load(content)

    const jobs = Object.values(workflow.jobs)
    const hasTimeout = jobs.some((job) => job['timeout-minutes'] !== undefined)

    expect(hasTimeout).toBe(true)
  })
})
