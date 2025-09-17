# CLAUDE.md

> Think carefully and implement the most concise solution that changes as little code as possible.

## Project-Specific Instructions

This is the vitest-llm-reporter project - a Vitest reporter that generates structured JSON output optimized for LLM parsing.

### TypeScript Configuration
- The application uses TypeScript with strict typing (aside from tests)
- Maintain type safety in all production code
- Tests can use more relaxed typing for convenience

### Current Feature: Log Deduplication
Working on implementing log deduplication to reduce duplicate console output in test reports:
- Extends existing ConsoleCapture system
- Configurable via `deduplicateLogs` option
- Defaults to global scope with optional per-test mode
- Must handle 1000+ tests efficiently
- Preserves backward compatibility when disabled

### Tech Stack
- **Node.js**: 18+ (native structuredClone support)
- **Testing**: Vitest with coverage reporting
- **CI/CD**: GitHub Actions (latest versions)
- **Package Manager**: NPM with automated publishing
- **Type Checking**: TypeScript

### CI/CD Configuration
- **Workflows**: `.github/workflows/ci.yml` and `release.yml`
- **Node Versions**: Test matrix includes 18, 20, 22
- **Coverage Threshold**: 80% minimum
- **NPM Publishing**: Manual trigger via GitHub Release
- **Required Checks**: test, lint, type-check, build, coverage

### Architecture Notes
- Reporter implements Vitest's Reporter interface
- Console capture uses AsyncLocalStorage for thread safety
- Performance targets: <5s for 1000 tests, <500MB memory
- Modular component structure in src/

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
- `npm test` - Run all tests
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests
- `npm run test:benchmark` - Performance benchmarks
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
- Consistent with existing ConsoleCapture implementation
- Use existing debug framework for logging
- Maintain backward compatibility
- Document configuration options

## Recent Changes
- Added CI/CD pipeline specification (feature 002)
- Configured GitHub Actions workflows
- Set up NPM publishing automation
- Added log deduplication feature

# Important Instruction Reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
