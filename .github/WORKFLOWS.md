# GitHub Actions Workflows Documentation

## Overview

This repository uses GitHub Actions for continuous integration and automated NPM publishing.

## Workflows

### CI Workflow (`.github/workflows/ci.yml`)

**Purpose**: Validates code quality on every pull request and push to main branch.

**Triggers**:
- Pull requests to main/master branch
- Pushes to main/master branch
- Manual dispatch via GitHub UI

**Jobs**:
- **Test**: Runs test suite on Node.js 17, 18, 20, and 22
- **Lint**: Validates code style with ESLint
- **Type Check**: Validates TypeScript types
- **Build**: Ensures package builds successfully
- **Coverage**: Generates coverage report and comments on PRs

**Features**:
- Parallel job execution for faster feedback
- Dependency caching for improved performance
- Automatic PR cancellation for outdated runs
- Test result and coverage artifact uploads
- Coverage threshold enforcement (80%)

### Release Workflow (`.github/workflows/release.yml`)

**Purpose**: Publishes packages to NPM when releases are created.

**Triggers**:
- GitHub Release publication
- Manual dispatch with dry-run option

**Jobs**:
- **Validate**: Tests on multiple OS (Ubuntu, Windows, macOS) and Node versions
- **Publish**: Builds and publishes package to NPM with provenance

**Features**:
- Multi-platform validation before publishing
- Version verification against git tags
- NPM duplicate version prevention
- Package provenance for supply chain security
- Dry-run mode for testing
- Release asset uploads

## Setup Requirements

### Repository Secrets

1. **NPM_TOKEN** (Required)
   - Generate at npmjs.com → Access Tokens → Automation
   - Add to repository Settings → Secrets → Actions

### Branch Protection

Configure for `main` branch:
- Require status checks: test, lint, type-check, build, coverage
- Require branches to be up to date
- Dismiss stale reviews on new commits

### NPM Configuration

Ensure `package.json` includes:
```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

## Usage

### Running CI Manually

1. Go to Actions tab
2. Select "CI" workflow
3. Click "Run workflow"
4. Optionally enable debug logging

### Publishing a Release

1. Update version in `package.json`
2. Commit and push to main
3. Create new release on GitHub
4. Tag with version (e.g., `v1.0.0`)
5. Publish release
6. Workflow automatically publishes to NPM

### Dry Run Release

1. Go to Actions tab
2. Select "Release" workflow
3. Click "Run workflow"
4. Enable "dry_run" option
5. Review output without publishing

## Troubleshooting

### CI Failures

- **Test failures**: Review test output in workflow logs
- **Lint errors**: Run `npm run lint:fix` locally
- **Type errors**: Run `npm run type-check` locally
- **Coverage below threshold**: Add tests to increase coverage

### Release Failures

- **Version mismatch**: Ensure package.json version matches git tag
- **NPM authentication**: Verify NPM_TOKEN secret is valid
- **Version exists**: Increment version in package.json
- **Build failures**: Test build locally with `npm run build`

## Maintenance

### Updating Dependencies

Dependabot automatically creates PRs for:
- NPM dependencies (weekly)
- GitHub Actions (weekly)

### Workflow Updates

Test workflow changes in feature branches before merging to main.

## Performance Optimization

- Workflows use composite actions for reusability
- Node modules are cached between runs
- Jobs run in parallel when possible
- Concurrency groups prevent duplicate runs

## Security

- NPM tokens are stored as encrypted secrets
- Workflows use minimal required permissions
- Package publishing includes provenance attestation
- Dependencies are automatically updated via Dependabot