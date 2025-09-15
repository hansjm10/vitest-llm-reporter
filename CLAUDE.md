# CLAUDE.md

> Think carefully and implement the most concise solution that changes as little code as possible.

## Project-Specific Instructions

This is the vitest-llm-reporter project - a Vitest reporter that generates structured JSON output optimized for LLM parsing.

## Current Feature: CI/CD Pipeline with GitHub Actions

### Tech Stack
- **Node.js**: 17+ (required for native structuredClone)
- **Testing**: Vitest with coverage reporting
- **CI/CD**: GitHub Actions (latest versions)
- **Package Manager**: NPM with automated publishing
- **Type Checking**: TypeScript

### CI/CD Configuration
- **Workflows**: `.github/workflows/ci.yml` and `release.yml`
- **Node Versions**: Test matrix includes 17, 18, 20, 22
- **Coverage Threshold**: 80% minimum
- **NPM Publishing**: Manual trigger via GitHub Release
- **Required Checks**: test, lint, type-check, build, coverage

### NPM Scripts Required
```json
{
  "test": "vitest run",
  "coverage": "vitest run --coverage",
  "lint": "eslint src",
  "type-check": "tsc --noEmit",
  "build": "tsc"
}
```

## Testing

Always run tests before committing:
- `npm test` - Run test suite
- `npm run coverage` - Generate coverage report
- `npm run lint` - Check code style
- `npm run type-check` - Validate TypeScript types
- `npm run build` - Build the package

## Code Style

Follow existing patterns in the codebase:
- TypeScript for all source files
- Vitest for testing
- ESLint for linting
- Conventional commits for version management

## Recent Changes
- Added CI/CD pipeline specification (feature 002)
- Configured GitHub Actions workflows
- Set up NPM publishing automation

# Important Instruction Reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.