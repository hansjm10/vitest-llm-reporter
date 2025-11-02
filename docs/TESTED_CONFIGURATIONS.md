# Tested Configurations

This document lists all configuration scenarios that are tested through our integration matrix E2E tests. These scenarios represent real-world usage patterns and ensure the reporter works correctly across different configuration combinations.

> **Vitest versions:** The matrix runs on Vitest 4.x, which is the officially supported baseline. Earlier Vitest 3.x releases may keep working, but we do not validate them in CI.

## Test Scenarios

The following scenarios are automatically tested in `tests/e2e/config-matrix.test.ts`:

### 1. CI Mode

**Purpose:** Optimized for CI/CD pipelines with pure stdout and minimal output

**Configuration:**
```typescript
{
  pureStdout: true,
  verbose: false,
  includePassedTests: false,
  includeSkippedTests: false,
  captureConsoleOnFailure: true,
  deduplicateLogs: true,
  fileJsonSpacing: 0,
  consoleJsonSpacing: 0
}
```

**What it tests:**
- Pure stdout mode suppresses framework output
- Compact JSON output (no spacing)
- Only failures are included
- Console capture works for failed tests
- Log deduplication is active

**Use case:** GitHub Actions, GitLab CI, Jenkins, or any CI/CD pipeline where you want clean JSON output without noise from the framework.

---

### 2. Local Development

**Purpose:** Developer-friendly with verbose output and readable formatting

**Configuration:**
```typescript
{
  verbose: true,
  includePassedTests: true,
  includeSkippedTests: true,
  captureConsoleOnFailure: true,
  captureConsoleOnSuccess: true,
  enableConsoleOutput: true,
  fileJsonSpacing: 2,
  consoleJsonSpacing: 2,
  deduplicateLogs: false
}
```

**What it tests:**
- Verbose mode includes all test results
- Passed and skipped tests are included
- Console output captured for both failures and successes
- Pretty-printed JSON (2-space indentation)
- Deduplication disabled for full logs
- Console output enabled

**Use case:** Local development where you want to see everything that's happening, including passed tests and all console output.

---

### 3. Production with Truncation

**Purpose:** Token-limited output for LLM context windows with deduplication

**Configuration:**
```typescript
{
  truncation: {
    enabled: true,
    maxTokens: 50000,
    strategy: 'proportional'
  },
  deduplicateLogs: true,
  verbose: false,
  includePassedTests: false,
  includeSkippedTests: false,
  captureConsoleOnFailure: true,
  maxConsoleBytes: 10000,
  maxConsoleLines: 50
}
```

**What it tests:**
- Truncation keeps output within token budget
- Proportional truncation strategy
- Log deduplication reduces size
- Console output limits (bytes and lines)
- Only failures included to save tokens

**Use case:** Production environments where you're sending test results to an LLM API with context window limits (e.g., Claude API with 200k token limit).

---

### 4. Minimal (Defaults)

**Purpose:** Default configuration with no overrides

**Configuration:**
```typescript
{}
```

**What it tests:**
- All default values work correctly
- Reporter functions with zero configuration
- Sensible defaults are applied

**Use case:** Quick setup without any customization. Good starting point for new users.

---

### 5. Flakiness Detection

**Purpose:** Track retries and detect flaky tests

**Configuration:**
```typescript
{
  verbose: true,
  includePassedTests: true,
  trackRetries: true,
  detectFlakiness: true,
  includeAllAttempts: true,
  reportFlakyAsWarnings: true,
  captureConsoleOnFailure: true
}
```

**What it tests:**
- Retry tracking is enabled
- Flaky test detection works
- All retry attempts are included in output
- Flaky tests reported as warnings
- Console captured for debugging flakes

**Use case:** CI environments where you want to identify and track flaky tests that pass after retries, helping you improve test stability.

---

### 6. Framework Preset (NestJS)

**Purpose:** Suppress framework logs with NestJS preset

**Configuration:**
```typescript
{
  verbose: false,
  captureConsoleOnFailure: true,
  stdio: {
    suppressStdout: true,
    frameworkPresets: ['nest']
  },
  deduplicateLogs: true
}
```

**What it tests:**
- Framework preset filtering works
- NestJS-specific logs are suppressed
- Application logs are still captured
- Deduplication works with presets

**Use case:** NestJS applications where you want to filter out the framework's startup logs and lifecycle messages while keeping your application logs.

---

## How to Add New Scenarios

To add a new test scenario:

1. **Add to scenarios.ts:**
   ```typescript
   // In tests/e2e/scenarios.ts
   {
     name: 'Your Scenario Name',
     description: 'What this scenario tests',
     config: {
       // Your configuration
     },
     expectedBehavior: {
       hasFailures: true,
       hasSummary: true,
       capturesConsole: true,
       includesPassedTests: false,
       includesSkippedTests: false
     }
   }
   ```

2. **Define expected behavior:**
   - Set `hasFailures` to `true` if failures should be present
   - Set `hasSummary` to `true` if summary should be included
   - Set `capturesConsole` to `true` if console output should be captured
   - Set `includesPassedTests` to `true` if passed tests should be in output
   - Set `includesSkippedTests` to `true` if skipped tests should be in output

3. **Run the tests:**
   ```bash
   npm test tests/e2e/config-matrix.test.ts
   ```

4. **Update this documentation:**
   - Add a new section with the scenario name
   - Document the configuration
   - Explain what it tests
   - Describe the use case

## Test Coverage

The integration matrix tests verify:

- **Output structure:** Valid JSON with required fields
- **Configuration options:** Each config option is respected
- **Error context:** Stack traces and code context are extracted
- **Console capture:** Console output is captured when configured
- **Truncation:** Output stays within token limits
- **Deduplication:** Duplicate logs are reduced
- **Schema validation:** Output matches the defined schema
- **Cross-scenario consistency:** All scenarios produce valid output

## Running the Tests

```bash
# Run all E2E tests including matrix
npm test tests/e2e/

# Run only the matrix test
npm test tests/e2e/config-matrix.test.ts

# Run all tests
npm test

# Run full CI suite
npm run ci
```

## Debugging Failed Tests

If a scenario test fails:

1. Check the test output for which assertion failed
2. Run that specific scenario in isolation
3. Examine the generated output file (`.tmp-e2e-matrix-output-*.json`)
4. Verify the configuration is correct in `scenarios.ts`
5. Check if the expected behavior matches the actual output
6. Review the E2E runner logs for execution errors

## Performance Considerations

The matrix tests run multiple E2E scenarios, which can be slow. To optimize:

- The project is built once in `beforeAll` before all scenarios
- Tests run in parallel when possible
- Temporary files are cleaned up after each test
- A shared test fixture is reused across scenarios

Total test time: ~60-90 seconds for all scenarios on modern hardware.