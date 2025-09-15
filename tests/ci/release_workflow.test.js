import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

describe('Release Workflow Validation', () => {
  const workflowPath = join(process.cwd(), '.github/workflows/release.yml');

  it('should have release workflow file', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it('should have valid YAML structure', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);
    expect(workflow).toBeDefined();
    expect(workflow.name).toBe('Release');
  });

  it('should trigger on release published', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.on).toBeDefined();
    expect(workflow.on.release).toBeDefined();
    expect(workflow.on.release.types).toContain('published');
  });

  it('should have correct permissions', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.permissions).toBeDefined();
    expect(workflow.permissions.contents).toBe('read');
    expect(workflow.permissions.packages).toBe('write');
    expect(workflow.permissions['id-token']).toBe('write');
  });

  it('should have validate job with multi-OS matrix', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs.validate).toBeDefined();
    expect(workflow.jobs.validate.strategy).toBeDefined();
    expect(workflow.jobs.validate.strategy.matrix.os).toEqual([
      'ubuntu-latest',
      'windows-latest',
      'macos-latest'
    ]);
    expect(workflow.jobs.validate.strategy.matrix['node-version']).toEqual([17, 18, 20, 22]);
  });

  it('should have publish job', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    expect(workflow.jobs.publish).toBeDefined();
    expect(workflow.jobs.publish.needs).toContain('validate');
    expect(workflow.jobs.publish.environment).toBe('npm-production');
  });

  it('should use NPM_TOKEN secret', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    const publishJob = workflow.jobs.publish;
    const publishStep = publishJob.steps.find(step =>
      step.run && step.run.includes('npm publish')
    );
    expect(publishStep).toBeDefined();
    expect(publishStep.env.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
  });

  it('should setup Node with registry URL', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    const publishJob = workflow.jobs.publish;
    const setupStep = publishJob.steps.find(step =>
      step.uses && step.uses.includes('actions/setup-node')
    );
    expect(setupStep).toBeDefined();
    expect(setupStep.with['registry-url']).toBe('https://registry.npmjs.org');
  });

  it('should run build before publish', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    const publishJob = workflow.jobs.publish;
    const buildStepIndex = publishJob.steps.findIndex(step =>
      step.run && step.run.includes('npm run build')
    );
    const publishStepIndex = publishJob.steps.findIndex(step =>
      step.run && step.run.includes('npm publish')
    );

    expect(buildStepIndex).toBeGreaterThanOrEqual(0);
    expect(publishStepIndex).toBeGreaterThanOrEqual(0);
    expect(buildStepIndex).toBeLessThan(publishStepIndex);
  });

  it('should use npm ci with ignore-scripts for security', () => {
    const content = readFileSync(workflowPath, 'utf8');
    const workflow = load(content);

    const publishJob = workflow.jobs.publish;
    const installStep = publishJob.steps.find(step =>
      step.run && step.run.includes('npm ci')
    );
    expect(installStep).toBeDefined();
    expect(installStep.run).toContain('--ignore-scripts');
  });
});