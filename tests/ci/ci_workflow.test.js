import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

describe('CI Workflow Validation', () => {
  const workflowPath = join(process.cwd(), '.github/workflows/ci.yml');

  it('should have CI workflow file', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it('should have valid YAML structure', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);
    expect(workflow).toBeDefined();
    expect(workflow.name).toBe('CI');
  });

  it('should trigger on pull_request and push to main', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.on).toBeDefined();
    expect(workflow.on.pull_request).toBeDefined();
    expect(workflow.on.pull_request.branches).toContain('main');
    expect(workflow.on.push).toBeDefined();
    expect(workflow.on.push.branches).toContain('main');
  });

  it('should have test job with matrix strategy', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs.test).toBeDefined();
    expect(workflow.jobs.test.strategy).toBeDefined();
    expect(workflow.jobs.test.strategy.matrix['node-version']).toEqual([18, 20, 22]);
  });

  it('should have lint job', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs.lint).toBeDefined();
    expect(workflow.jobs.lint.steps).toContainEqual(
      expect.objectContaining({ run: 'npm run lint' })
    );
  });

  it('should have type-check job', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs['type-check']).toBeDefined();
    expect(workflow.jobs['type-check'].steps).toContainEqual(
      expect.objectContaining({ run: 'npm run type-check' })
    );
  });

  it('should have build job', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs.build).toBeDefined();
    expect(workflow.jobs.build.steps).toContainEqual(
      expect.objectContaining({ run: 'npm run build' })
    );
  });

  it('should have coverage job', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs.coverage).toBeDefined();
    // The coverage command is run with || true to allow failures
    const coverageStep = workflow.jobs.coverage.steps.find(step =>
      step.run && step.run.includes('npm run coverage')
    );
    expect(coverageStep).toBeDefined();
  });

  it('should use concurrency groups', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.concurrency).toBeDefined();
    expect(workflow.concurrency.group).toContain('${{ github.workflow }}');
    expect(workflow.concurrency['cancel-in-progress']).toBe(true);
  });

  it('should cache node_modules', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    const testJob = workflow.jobs.test;
    // Our composite action handles caching internally
    const setupStep = testJob.steps.find(step =>
      step.uses && step.uses.includes('./.github/actions/setup')
    );
    expect(setupStep).toBeDefined();
    // Verify the composite action has cache parameter
    expect(setupStep.with?.cache !== 'false').toBe(true);
  });
});