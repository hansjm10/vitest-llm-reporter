# vitest-llm-reporter

## 1.2.1

### Patch Changes

- 3b03ccb: chore: update @typescript-eslint/parser dev dependency
- cc06fd8: chore: update vitest tooling to 4.0.3, align reporter output handling, and ensure Vitest CLI works on Node 18 via crypto.hash polyfill and wrapper script
- e793141: chore: update eslint dev dependency
- 1fabd8f: chore: update @eslint/js dev dependency
- d66d268: chore: update typescript dev dependency
- adb4b2b: chore: update @types/node dev dependency
- 27f1a98: chore: update @typescript-eslint/eslint-plugin dev dependency

## Unreleased

### Documentation

- Clarify that Vitest 4 is the supported baseline, note the best-effort status of Vitest 3, and update public docs accordingly. (Fixes #114)

## 1.2.0

### Minor Changes

- 5106f35: Add self-validation to ensure reporter output complies with the JSON schema.

  **New Features:**
  - Add `validateOutput` configuration option to enable schema validation of reporter output
  - Reporter validates its own output after generation and logs any schema violations
  - Validation errors are logged to stderr for visibility without failing the test run
  - E2E test verifies that reporter output passes schema validation

  **New Configuration Option:**
  - `validateOutput`: Enable/disable output validation (default: false)

  **Developer Experience:**
  - Enabled by default in vitest.config.ts for dogfooding
  - Helps catch schema compliance issues during development and testing
  - Provides detailed error messages when validation fails

  This feature ensures the reporter always generates valid JSON that conforms to the documented schema, improving reliability for LLM consumers.

- 01c0110: Add test retry and flakiness detection to help LLMs understand intermittent test failures.

  **New Features:**
  - Track all retry attempts for each test with status, duration, and error details
  - Automatically detect flaky tests (tests that pass after failing)
  - Add `flaky` and `retried` counts to test summary
  - Include detailed retry history in failure reports with `retryInfo` field

  **New Configuration Options:**
  - `trackRetries`: Enable/disable retry tracking (default: true)
  - `detectFlakiness`: Enable/disable flaky test detection (default: true)
  - `includeAllAttempts`: Include all attempts or only retried tests (default: false)
  - `reportFlakyAsWarnings`: Reserved for future flaky test reporting (default: false)

  **Schema Changes:**
  - Added `RetryAttempt`, `RetryInfo`, and `FlakinessInfo` types
  - Extended `TestFailure` with optional `retryInfo` field
  - Added `flaky` and `retried` counts to `TestSummary`

  This feature is fully backward compatible and helps LLMs identify timing issues, concurrency problems, and unreliable tests.

- 69bf1c7: Add inline snapshot testing support to improve test maintenance. Introduced snapshot helper utilities that normalize test output (timestamps, durations, environment metadata, file paths) for stable snapshot comparisons. Converted key tests in reporter.test.ts, ErrorExtractor.test.ts, OutputBuilder.test.ts, and schema.test.ts to use toMatchInlineSnapshot() for structural validation. This reduces manual assertion maintenance and makes it easier to detect unintended changes in output structure.

### Patch Changes

- def67f0: Add determinism validation to ensure stable output across test runs.

  **New Test Utilities:**
  - `normalizeOutput()` - Strips time-dependent fields for deterministic comparison
  - `areOutputsDeterministic()` - Convenience function for comparing outputs
  - `extractNonDeterministicValues()` - Extracts time-dependent fields for debugging

  **New Test Coverage:**
  - 12 comprehensive test cases validating deterministic output behavior
  - Tests for multiple runs with identical input data
  - Tests for console events, retry info, and deduplication
  - Edge case coverage for empty results and missing optional fields

  **Documentation:**
  - `docs/OUTPUT_DETERMINISM.md` - Complete documentation of deterministic vs. non-deterministic fields
  - Documents all 9 time-dependent fields that vary between runs
  - Provides best practices for testing and CI/CD integration

  This ensures reliable CI/CD pipelines, reproducible test results, and consistent LLM parsing behavior. The output structure remains deterministic while allowing natural timing variations.

- edf144a: Add comprehensive integration matrix testing for real-world configuration scenarios.

  **Test Infrastructure:**
  - Created `tests/e2e/scenarios.ts` with 6 real-world configuration scenarios
  - Added `tests/utils/e2e-runner.ts` helper for E2E test execution
  - Implemented `tests/e2e/config-matrix.test.ts` with 22 automated tests

  **Tested Scenarios:**
  - CI Mode: Pure stdout with compact JSON for CI/CD pipelines
  - Local Development: Verbose output with readable formatting
  - Production with Truncation: Token-limited output for LLM context windows
  - Minimal (Defaults): Zero-configuration setup validation
  - Flakiness Detection: Retry tracking and flaky test detection
  - Framework Preset (NestJS): Framework log suppression

  **Documentation:**
  - Added `docs/TESTED_CONFIGURATIONS.md` with detailed scenario documentation
  - Explains what each scenario tests and when to use it
  - Includes instructions for adding new test scenarios

  This ensures the reporter works correctly across different configuration combinations and validates backward compatibility for all future changes.

- dfed6d9: -Keep full-fidelity console metadata in internal state while trimming the default output view for LLM consumption.
  -Expose `outputView.console.includeTestId` and `outputView.console.includeTimestampMs` flags so downstream tooling can surface those fields when needed.

## 1.1.0

### Minor Changes

- 611acd5: Add richer environment metadata to the summary and expose configuration switches to trim or disable individual fields.

### Patch Changes

- 3dcb97c: Fix teardown error accounting to keep summary totals consistent.
- 8ff87e6: Ensure `includeAbsolutePaths` propagates to unhandled errors so their stack frames retain absolute paths.
- 4412ed7: Preserve Vitest log timestamps when routing console events so log ordering and dedup heuristics remain stable.

## 1.0.0

### Major Changes

- 17d717b: Unify console event payloads to use a single `message` field by removing the redundant `text` property. This reduces output size and simplifies downstream processing, but consumers must update to the new shape.

### Minor Changes

- 24015a4: Add TypeScript-backed end-line resolution for tests, improving metadata accuracy and covering edge cases like chained modifiers and todo tests.

## 0.2.5

### Patch Changes

- b26010f: Point the internal dev dependency at the local package via `file:.`.

## 0.2.4

### Patch Changes

- 6834dd5: Document CLI flag usage for enabling the reporter directly.

## 0.2.3

### Patch Changes

- 0f1a5eb: chore: integrate Changesets workflow and CI guardrails
