# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**vitest-llm-reporter** is a Vitest reporter that generates structured JSON output optimized for LLM parsing. The reporter provides compact, machine-readable test results with automatic code context extraction for failures.

**Tech Stack:**
- TypeScript with strict typing (relaxed for test files)
- Node.js 18+ (requires native `structuredClone`)
- Vitest 3.0+ as the test framework
- Build with TypeScript Compiler (`tsc`)

## Essential Commands

### Testing
```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:demo           # Run demo test with reporter output
npm run coverage            # Run tests with coverage report (requires 80%+)
vitest run path/to/file.test.ts  # Run specific test file
```

### Code Quality (Must Pass Before Commits)
```bash
npm run ci                  # Run full CI pipeline (lint, type-check, test, coverage, build)
npm run lint                # Check code style with ESLint
npm run lint:fix            # Auto-fix linting issues
npm run type-check          # Validate TypeScript types (alias: typecheck)
npm run format              # Format code with Prettier
npm run format:check        # Check code formatting
```

### Building
```bash
npm run build               # Compile TypeScript to dist/
```

### Benchmarking
```bash
npm run bench               # Run all benchmarks
npm run bench:reporter      # Run reporter-specific benchmarks
npm run bench:large-suites  # Run large suite benchmarks
```

## Architecture

### Module Structure
The codebase is organized into focused modules under `src/`:

- **`reporter/`** - Core `LLMReporter` class implementing Vitest reporter interface
- **`streaming/`** - `StreamingReporter` for real-time test output
- **`extraction/`** - Extract test failure context and code snippets from source files
  - `ErrorExtractor` - Parse error messages and stack traces
  - `ContextExtractor` - Extract surrounding code context from test files
  - `TestCaseExtractor` - Extract test case metadata
- **`console/`** - Console capture and filtering using AsyncLocalStorage for thread safety
  - `capture.ts` - Main console capture logic
  - `LogDeduplicator` - Reduce duplicate console messages across tests
  - `stdio-interceptor.ts` - Intercept stdout/stderr to filter framework logs
  - `framework-log-presets.ts` - Predefined filters for popular frameworks (NestJS, Next.js, etc.)
- **`output/`** - JSON output generation and file writing
- **`builders/`** - Build structured test result objects
- **`config/`** - Configuration parsing and defaults
- **`validation/`** - Schema validation for output JSON
- **`truncation/`** - Token-based truncation to fit LLM context windows
- **`tokenization/`** - Token estimation for output sizing
- **`monitoring/`** - Performance metrics and memory monitoring
- **`state/`** - State management for reporter lifecycle
- **`utils/`** - Shared utilities (paths, environment, sanitization)
- **`types/`** - TypeScript type definitions and schemas

### Key Components

**`LLMReporter` (src/reporter/reporter.ts)**
- Implements Vitest's `Reporter` interface
- Captures test lifecycle events (`onInit`, `onTestEnd`, `onFinished`)
- Coordinates extraction, console capture, and output generation
- Main configuration entry point

**Console Capture (src/console/)**
- Uses AsyncLocalStorage to associate console output with specific tests
- Thread-safe for parallel test execution
- Supports filtering framework logs and deduplication
- Configurable per-test capture limits (bytes/lines)

**Context Extraction (src/extraction/)**
- Reads source files to extract code context around test failures
- Parses stack traces to identify error locations
- Provides line numbers and surrounding code snippets for debugging

**Output Generation (src/output/)**
- Builds structured JSON with summary, failures, and optional passed/skipped tests
- Writes to file or stdout based on configuration
- Supports indentation control for console vs file output

## Development Workflow

### Making Code Changes
1. Create a feature branch
2. Implement changes with tests
3. Run `npm run ci` to verify all checks pass
4. Ensure code coverage remains above 80%
5. Follow conventional commit format (e.g., `feat:`, `fix:`, `docs:`)

### Adding Features
- Add tests in `tests/` or colocated `.test.ts` files
- Update types in `src/types/` if adding new configuration options
- Document new options in README.md if user-facing
- For significant changes, run `npm run changeset` to document the change

### Release Process
- Uses [Changesets](https://github.com/changesets/changesets) for versioning
- Run `npm run changeset` to create a changeset describing your changes
- Commit the generated file in `.changeset/` with your code
- CI automatically creates release PRs when changesets are merged
- Merging the release PR triggers automated npm publish and GitHub release

## Configuration System

The reporter accepts extensive configuration options via the Vitest config:

```typescript
reporters: [
  ['vitest-llm-reporter', {
    outputFile: './test-results.json',  // File output (default: undefined, writes to stdout)
    verbose: false,                      // Include passed/skipped tests (default: false)
    captureConsoleOnFailure: true,       // Capture console for failed tests (default: true)
    deduplicateLogs: true,               // Deduplicate console output (default: true)
    stdio: {
      suppressStdout: true,              // Filter framework logs (default: true)
      frameworkPresets: ['nest', 'next'] // Apply framework-specific filters
    },
    truncation: {
      enabled: true,                     // Enable output truncation
      maxTokens: 100000                  // Token budget for LLM context
    }
  }]
]
```

See `src/types/reporter.ts` for complete configuration schema.

## Testing Notes

- Tests use Vitest's API to create mock test results
- Console capture tests verify AsyncLocalStorage isolation
- Reporter tests check JSON output structure and file writing
- Demo test (`tests/demo/reporter-demo.test.ts`) runs only with `LLM_REPORTER_DEMO=1`
- Framework preset demo in `examples/framework-presets-demo/`

## Performance Targets

- Handle 1000+ tests in <5 seconds
- Memory usage under 500MB for large suites
- Console capture overhead <5% of execution time
- Log deduplication automatic eviction at 10,000 entries

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
- Tests on Node.js 18, 20, and 22
- Requires: lint, type-check, test, 80%+ coverage, successful build
- Automated npm publishing on release PR merge
- Uses provenance for npm package publishing