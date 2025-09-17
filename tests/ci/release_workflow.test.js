import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { load } from 'js-yaml'
import { join } from 'path'

describe('Release Workflow Validation', () => {
  const workflowPath = join(process.cwd(), '.github/workflows/release.yml')

  it('should have release workflow file', () => {
    expect(existsSync(workflowPath)).toBe(true)
  })

  it('should have valid YAML structure', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)
    expect(workflow).toBeDefined()
    expect(workflow.name).toBe('Release')
  })

  it('should trigger on push to master and support manual runs', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    expect(workflow.on).toBeDefined()
    expect(workflow.on.push).toBeDefined()
    expect(workflow.on.push.branches).toContain('master')
    expect(workflow.on.workflow_dispatch).toBeDefined()
  })

  it('should have correct permissions', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    expect(workflow.permissions).toBeDefined()
    expect(workflow.permissions.contents).toBe('write')
    expect(workflow.permissions.packages).toBe('write')
    expect(workflow.permissions['id-token']).toBe('write')
  })

  it('should run release job with proper setup', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    expect(workflow.jobs.release).toBeDefined()
    const releaseJob = workflow.jobs.release
    expect(releaseJob['runs-on']).toBe('ubuntu-latest')
    expect(
      releaseJob.steps.some((step) => step.uses && step.uses.includes('actions/checkout'))
    ).toBe(true)
    expect(
      releaseJob.steps.some((step) => step.uses && step.uses.includes('actions/setup-node'))
    ).toBe(true)
  })

  it('should use changesets action to handle publishing', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    const releaseJob = workflow.jobs.release
    const changesetStep = releaseJob.steps.find(
      (step) => step.uses && step.uses.includes('changesets/action')
    )
    expect(changesetStep).toBeDefined()
    expect(changesetStep.with.version).toContain('release:version')
    expect(changesetStep.with.publish).toContain('release:publish')
    expect(changesetStep.with.branch).toBe('master')
    expect(changesetStep.with.createGithubReleases).toBe(true)
  })

  it('should use NPM_TOKEN secret', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    const releaseJob = workflow.jobs.release
    const changesetStep = releaseJob.steps.find(
      (step) => step.uses && step.uses.includes('changesets/action')
    )
    expect(changesetStep).toBeDefined()
    expect(changesetStep.env.NPM_TOKEN).toBe('${{ secrets.NPM_TOKEN }}')
    expect(changesetStep.env.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}')
  })

  it('should setup Node with registry URL', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    const releaseJob = workflow.jobs.release
    const setupStep = releaseJob.steps.find(
      (step) => step.uses && step.uses.includes('actions/setup-node')
    )
    expect(setupStep).toBeDefined()
    expect(setupStep.with['registry-url']).toBe('https://registry.npmjs.org')
  })

  it('should run build before publish', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))

    const releaseJob = workflow.jobs.release
    const changesetStep = releaseJob.steps.find(
      (step) => step.uses && step.uses.includes('changesets/action')
    )
    expect(changesetStep).toBeDefined()
    expect(changesetStep.with.publish).toContain('npm run release:publish')
    expect(pkg.scripts['release:publish']).toContain('npm run build')
  })

  it('should use npm ci with ignore-scripts for security', () => {
    const content = readFileSync(workflowPath, 'utf8')
    const workflow = load(content)

    const releaseJob = workflow.jobs.release
    const installStep = releaseJob.steps.find((step) => step.run && step.run.includes('npm ci'))
    expect(installStep).toBeDefined()
    expect(installStep.run).toContain('--ignore-scripts')
  })
})
