# Output Determinism

This document describes the deterministic behavior of the LLM Reporter's output and identifies fields that vary across test runs.

## Overview

The LLM Reporter produces **structurally deterministic** output, meaning that given the same test results, the reporter will generate output with the same structure, test names, error messages, and console events. However, certain time-dependent fields will naturally vary between runs.

This determinism is critical for:
- **Reproducible test results** - The same tests produce the same output structure
- **Reliable CI/CD pipelines** - Output can be compared across builds
- **Consistent LLM parsing** - AI tools receive predictable formats
- **Debugging and troubleshooting** - Easy to spot actual changes vs. timing variations

## Non-Deterministic Fields

The following fields contain time-dependent values that will vary between test runs:

### Summary Fields

| Field | Type | Description | Why It Varies |
|-------|------|-------------|---------------|
| `summary.timestamp` | string (ISO 8601) | When the test run started | Captured at runtime |
| `summary.duration` | number (milliseconds) | Total test execution time | Performance varies by system load |

### Test Result Fields

| Field | Type | Description | Why It Varies |
|-------|------|-------------|---------------|
| `duration` | number (milliseconds) | Individual test execution time | Performance varies by system load |

Found in:
- `TestResult.duration` (passed/skipped tests)
- `TestSuccessLog.duration` (success logs)

### Console Event Fields

| Field | Type | Description | Why It Varies |
|-------|------|-------------|---------------|
| `consoleEvents[].timestamp` | number (milliseconds) | Time since test start | Captured during test execution |
| `consoleEvents[].timestampMs` | number (milliseconds) | Time since test start | Captured during test execution |
| `deduplication.firstSeen` | string (ISO 8601) | First occurrence of deduplicated log | Captured during test execution |
| `deduplication.lastSeen` | string (ISO 8601) | Last occurrence of deduplicated log | Captured during test execution |

Found in:
- `TestFailure.consoleEvents[]`
- `TestSuccessLog.consoleEvents[]`

### Retry Information Fields

| Field | Type | Description | Why It Varies |
|-------|------|-------------|---------------|
| `retryInfo.attempts[].timestamp` | string (ISO 8601) | When the retry attempt started | Captured at runtime |
| `retryInfo.attempts[].duration` | number (milliseconds) | Retry attempt execution time | Performance varies by system load |

Found in:
- `TestFailure.retryInfo.attempts[]`
- `TestResult.retryInfo.attempts[]` (for passed tests that were retried)

## Deterministic Fields

All other fields are deterministic and will be identical across runs with the same test results:

### Structural Fields
- Test names (`test`)
- File paths (`fileRelative`, `fileAbsolute`)
- Line numbers (`startLine`, `endLine`)
- Test suite hierarchy (`suite[]`)

### Error Information
- Error messages (`error.message`)
- Error types (`error.type`)
- Stack traces (`error.stack`)
- Stack frames (`error.stackFrames[]`)
- Assertion details (`error.assertion`)
- Error context (`error.context`)

### Console Output
- Console levels (`consoleEvents[].level`)
- Console messages (`consoleEvents[].message`)
- Console arguments (`consoleEvents[].args[]`)
- Deduplication counts (`deduplication.count`)
- Deduplication sources (`deduplication.sources[]`)

### Test Counts
- Total tests (`summary.total`)
- Passed tests (`summary.passed`)
- Failed tests (`summary.failed`)
- Skipped tests (`summary.skipped`)
- Flaky tests (`summary.flaky`)
- Retried tests (`summary.retried`)

### Retry Information (Non-Time Fields)
- Attempt numbers (`retryInfo.attempts[].attemptNumber`)
- Attempt status (`retryInfo.attempts[].status`)
- Flakiness indicators (`retryInfo.flakiness.isFlaky`)
- Attempt counts (`retryInfo.flakiness.totalAttempts`, `failedAttempts`)

## Testing for Determinism

The repository includes utilities for testing output determinism:

### Using the Normalizer

The `normalizeOutput()` function removes all time-dependent fields to enable deterministic comparisons:

```typescript
import { normalizeOutput, areOutputsDeterministic } from '../tests/utils/output-normalizer.js'

// Run reporter multiple times
const output1 = await runReporter(testData)
const output2 = await runReporter(testData)

// Compare normalized outputs
const normalized1 = normalizeOutput(output1)
const normalized2 = normalizeOutput(output2)

expect(normalized1).toEqual(normalized2) // Should pass

// Or use the convenience function
expect(areOutputsDeterministic(output1, output2)).toBe(true)
```

### Normalized Values

The normalizer replaces time-dependent fields with fixed values:

| Field Type | Normalized Value |
|------------|-----------------|
| ISO 8601 timestamps | `"2024-01-01T00:00:00.000Z"` |
| Durations (milliseconds) | `0` |
| Timestamp numbers | `0` |

### Test Coverage

The determinism test suite (`tests/integration/output-determinism.test.ts`) verifies:

1. **Multiple runs with identical input** - Same test data produces identical normalized output
2. **Time field normalization** - All time-dependent fields are properly removed
3. **Complex scenarios** - Determinism with console output, retries, and deduplication
4. **Edge cases** - Empty results, missing optional fields, test ordering
5. **Field documentation** - All non-deterministic fields are documented

## Configuration Impact

The following configuration options affect output structure but remain deterministic:

- `verbose` - Includes passed/skipped tests in output
- `captureConsoleOnFailure` - Includes console events for failed tests
- `includeStackString` - Includes raw stack traces in errors
- `includeAbsolutePaths` - Includes absolute file paths
- `outputView` - Controls which optional fields are projected

These configurations change what appears in the output but maintain determinism for the included fields.

## Environment Metadata

The `summary.environment` field contains runtime information:

```typescript
{
  "environment": {
    "os": {
      "platform": "linux",    // Deterministic per system
      "release": "5.15.167",  // Deterministic per system
      "arch": "x64",          // Deterministic per system
      "version": "..."        // Deterministic per system
    },
    "node": {
      "version": "20.10.0",   // Deterministic per installation
      "runtime": "node"       // Deterministic
    },
    "vitest": {
      "version": "3.0.0"      // Deterministic per installation
    },
    "ci": false,              // Deterministic per environment
    "packageManager": "npm@10.2.3" // Deterministic per installation
  }
}
```

Environment metadata is deterministic within the same system/installation but will differ across different environments (e.g., local vs. CI, different OS versions).

## Best Practices

### For Testing
1. **Use the normalizer** - Always normalize outputs before comparing across runs
2. **Test structural changes** - Focus on test names, errors, and console messages
3. **Ignore timing differences** - Don't compare raw durations or timestamps

### For CI/CD
1. **Compare normalized outputs** - Use the normalizer when validating reporter behavior
2. **Focus on deterministic fields** - Check test counts, error messages, and structure
3. **Allow timing variance** - Don't fail on duration differences

### For LLM Integration
1. **Parse deterministic fields first** - Use test names and error messages as primary keys
2. **Ignore timing in prompts** - Don't include durations/timestamps in context unless needed
3. **Focus on structure** - The output structure is stable and predictable

## Implementation Notes

The normalizer implementation (`tests/utils/output-normalizer.ts`) uses:
- `structuredClone()` for deep copying (Node.js 18+ required)
- Recursive normalization for nested structures
- Preservation of all non-time fields for accurate structural comparison

The test suite runs the reporter multiple times with varying timing conditions to ensure determinism is maintained even under different system loads.

## Changelog

- **v1.2.0+** - Added determinism validation and comprehensive test coverage
- Introduced `normalizeOutput()` utility for testing
- Documented all non-deterministic fields
- Added test suite for determinism validation