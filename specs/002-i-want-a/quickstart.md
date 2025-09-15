# CI/CD Pipeline Quick Start Guide

## Overview
This guide helps you set up and use the GitHub Actions CI/CD pipeline for vitest-llm-reporter.

## Prerequisites
- GitHub repository with admin access
- NPM account with publishing rights
- Node.js 17+ installed locally

## Setup Steps

### 1. Configure NPM Token
1. Log into npmjs.com
2. Go to Access Tokens → Generate New Token
3. Select "Automation" type
4. Copy the token
5. In GitHub repo: Settings → Secrets → Actions
6. Add new secret: `NPM_TOKEN` with the token value

### 2. Configure Branch Protection
1. Go to Settings → Branches
2. Add rule for `main` branch
3. Enable "Require status checks"
4. Select these required checks:
   - test (all Node versions)
   - lint
   - type-check
   - build
   - coverage
5. Enable "Require branches to be up to date"
6. Save protection rule

### 3. Create Workflow Files
The following workflow files should be in `.github/workflows/`:
- `ci.yml` - Runs on every PR and push to main
- `release.yml` - Runs when creating a GitHub Release

### 4. Ensure NPM Scripts Exist
Verify package.json has these scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "coverage": "vitest run --coverage",
    "lint": "eslint src",
    "type-check": "tsc --noEmit",
    "build": "tsc"
  }
}
```

## Usage Guide

### Creating a Pull Request
1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit
3. Push branch: `git push origin feature/my-feature`
4. Open PR on GitHub
5. Wait for CI checks to pass
6. Get review approval
7. Merge when all checks pass

### CI Pipeline Flow
```
PR Created/Updated
    ↓
Run CI Workflow
    ├── Test (Node 17, 18, 20, 22)
    ├── Lint
    ├── Type Check
    ├── Build
    └── Coverage Report
    ↓
Update PR Status
    ↓
Ready for Review
```

### Publishing a Release
1. Ensure main branch is ready for release
2. Update version in package.json (if not automated)
3. Go to GitHub → Releases → Create New Release
4. Choose tag version (e.g., v1.2.3)
5. Write release notes
6. Check "Pre-release" if applicable
7. Click "Publish release"
8. Release workflow automatically:
   - Validates on all platforms
   - Builds the package
   - Publishes to NPM
   - Adds provenance data

### Release Pipeline Flow
```
GitHub Release Created
    ↓
Run Release Workflow
    ├── Validate (all OS, all Node versions)
    └── Publish to NPM
    ↓
Package Available on NPM
```

## Testing the Pipeline

### 1. Test CI Workflow
```bash
# Create a test branch
git checkout -b test/ci-pipeline

# Make a small change
echo "// CI test" >> src/index.ts

# Commit and push
git add .
git commit -m "test: CI pipeline"
git push origin test/ci-pipeline

# Open PR and verify checks run
```

### 2. Test Coverage Reporting
```bash
# Run coverage locally first
npm run coverage

# Ensure coverage meets threshold (80%)
# Push changes and verify coverage appears in PR
```

### 3. Test Release Process (Dry Run)
```bash
# Create a pre-release to test
# Go to GitHub Releases
# Create release with "Pre-release" checked
# Use version like v0.0.1-test.1
# Verify workflow runs but doesn't affect production
```

## Troubleshooting

### CI Checks Failing
1. Check workflow run logs in Actions tab
2. Common issues:
   - Missing dependencies: Run `npm ci` locally
   - Lint errors: Run `npm run lint` and fix
   - Type errors: Run `npm run type-check` and fix
   - Test failures: Run `npm test` locally

### NPM Publish Failing
1. Verify NPM_TOKEN is set correctly
2. Check version doesn't already exist
3. Ensure package.json is valid
4. Verify npm account has publish rights

### Coverage Below Threshold
1. Run `npm run coverage` locally
2. Write additional tests for uncovered code
3. Check coverage report in `coverage/index.html`

## Monitoring

### Workflow Status
- Actions tab shows all workflow runs
- Each PR shows status checks at bottom
- Email notifications for failures (configurable)

### NPM Package Status
- Check npmjs.com for published versions
- Verify package metadata and README
- Monitor download statistics

## Best Practices

### Commit Messages
Use conventional commits for automated versioning:
- `feat:` New features (minor version)
- `fix:` Bug fixes (patch version)
- `BREAKING CHANGE:` Major version
- `chore:` Maintenance (no version change)
- `docs:` Documentation (no version change)

### PR Guidelines
1. Keep PRs focused and small
2. Write descriptive PR titles
3. Include test coverage for new code
4. Update documentation as needed
5. Wait for all checks before merging

### Release Guidelines
1. Test thoroughly before releasing
2. Write comprehensive release notes
3. Use semantic versioning
4. Tag pre-releases appropriately
5. Monitor post-release for issues

## Validation Checklist

Before considering the pipeline ready:
- [ ] NPM_TOKEN secret configured
- [ ] Branch protection enabled
- [ ] All required status checks defined
- [ ] CI workflow running on PRs
- [ ] Release workflow configured
- [ ] All npm scripts working
- [ ] Coverage threshold met
- [ ] Successfully published test package
- [ ] Documentation updated

## Support

For issues with:
- **GitHub Actions**: Check GitHub Status and Actions documentation
- **NPM Publishing**: See npm documentation and status page
- **This Pipeline**: Open issue in repository

## Next Steps

1. Complete setup following this guide
2. Run test PR to validate CI
3. Do a pre-release to test publishing
4. Update team on new workflow
5. Monitor initial releases closely