# Contributing to Vitest LLM Reporter

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. Fork and clone the repository
2. Install Node.js 18 or higher
3. Install dependencies: `npm ci`
4. Run tests: `npm test`

## Development Workflow

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Check code style: `npm run lint`
6. Check types: `npm run type-check`
7. Build the package: `npm run build`

### Pull Request Process

1. Push your branch to your fork
2. Open a pull request against `main`
3. Ensure all CI checks pass
4. Provide a clear description of changes
5. Wait for review and address feedback

## CI/CD Pipeline

Our automated pipeline ensures code quality:

### Required Checks

All PRs must pass these checks:
- **Tests**: Run on Node.js 18, 20, and 22
- **Linting**: ESLint validation
- **Type Checking**: TypeScript validation
- **Build**: Package builds successfully
- **Coverage**: Minimum 80% code coverage

### Running Checks Locally

Before pushing, run all checks:
```bash
npm run ci
```

This runs: lint, type-check, test, coverage, and build.

### Individual Commands

- `npm test` - Run test suite
- `npm run coverage` - Generate coverage report
- `npm run lint` - Check code style
- `npm run lint:fix` - Auto-fix style issues
- `npm run type-check` - Validate TypeScript
- `npm run build` - Build the package
- `npm run format` - Format code with Prettier

## Commit Guidelines

Use conventional commits for clear history:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or fixes
- `chore:` Maintenance tasks
- `ci:` CI/CD changes

Examples:
```
feat: add streaming reporter mode
fix: handle undefined test results
docs: update API documentation
```

## Testing

### Writing Tests

- Place tests in `tests/` directory
- Use descriptive test names
- Test edge cases and error conditions
- Maintain test coverage above 80%

### Running Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run coverage

# Run specific test file
npm test tests/your-test.js
```

## Code Style

We use ESLint and Prettier for consistent code style:

- Follow existing patterns in the codebase
- Use TypeScript for all source files
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Release Process

Releases are automated via GitHub Actions:

1. Maintainer updates version in `package.json`
2. Creates GitHub release with changelog
3. CI automatically publishes to NPM

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Ask questions in pull requests

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
