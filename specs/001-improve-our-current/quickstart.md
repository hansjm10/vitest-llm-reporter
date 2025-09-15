# Quick Start: Log Deduplication Feature

## Overview
This guide demonstrates how to enable and use the log deduplication feature in vitest-llm-reporter to reduce duplicate console output in your test reports.

## Installation
```bash
npm install vitest-llm-reporter@latest
```

## Basic Configuration

### Enable Deduplication (Simple)
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      ['vitest-llm-reporter', {
        deduplicateLogs: true  // Enable with defaults
      }]
    ]
  }
});
```

### Advanced Configuration
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      ['vitest-llm-reporter', {
        deduplicateLogs: {
          enabled: true,
          maxCacheEntries: 10000,     // Max unique entries to track
          includeSources: true,        // Show which tests logged
          normalizeWhitespace: true,   // Ignore whitespace differences
          stripTimestamps: true,       // Ignore timestamp differences
          stripAnsiCodes: true         // Ignore color codes
        }
      }]
    ]
  }
});
```

## Example Test Scenarios

### Scenario 1: Multiple Tests with Same Log
```typescript
// test1.spec.ts
test('first test', () => {
  console.log('Connecting to database...');
  expect(true).toBe(true);
});

// test2.spec.ts
test('second test', () => {
  console.log('Connecting to database...');
  expect(true).toBe(true);
});

// Output with deduplication enabled:
// ✓ first test
//   Connecting to database...
// ✓ second test
//   [Deduplicated: "Connecting to database..." (×2)]
```

### Scenario 2: Different Log Levels
```typescript
test('mixed levels', () => {
  console.debug('Processing request');
  console.warn('Processing request');  // Different level, not deduplicated
  console.debug('Processing request'); // Same level, deduplicated
});

// Output:
// Processing request [debug]
// Processing request [warn]
// [Deduplicated: "Processing request" [debug] (×2)]
```

### Scenario 3: Large Test Suite
```typescript
// Running 1000+ tests with extensive logging
// Before: 50,000 log lines
// After: 5,000 unique log lines with occurrence counts
```

## Verification Steps

### 1. Run Tests with Deduplication Disabled
```bash
npm test
# Observe: All duplicate logs appear in output
```

### 2. Enable Deduplication
Update `vitest.config.ts` as shown above.

### 3. Run Tests with Deduplication Enabled
```bash
npm test
# Observe: Duplicate logs consolidated with counts
```

### 4. Check JSON Output
```bash
npm test -- --reporter=vitest-llm-reporter
cat test-results.json | jq '.console[] | select(.deduplication.deduplicated == true)'
# Observe: Deduplication metadata in JSON output
```

## Performance Validation

### Benchmark Command
```bash
# Run performance test with 1000+ tests
npm run test:benchmark

# Expected results:
# - Execution time: < 5 seconds
# - Memory usage: < 500MB
# - Deduplication overhead: < 5%
```

### Memory Monitoring
```bash
# Monitor memory usage during test run
NODE_OPTIONS="--max-old-space-size=512" npm test

# Should complete without memory errors
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `deduplicateLogs` | `boolean \| object` | `false` | Enable deduplication |
| `maxCacheEntries` | `number` | `10000` | Maximum unique entries |
| `includeSources` | `boolean` | `false` | Track source tests |
| `normalizeWhitespace` | `boolean` | `true` | Ignore whitespace |
| `stripTimestamps` | `boolean` | `true` | Ignore timestamps |
| `stripAnsiCodes` | `boolean` | `true` | Ignore color codes |

## Troubleshooting

### Deduplication Not Working
1. Verify configuration is loaded: `console.log(config.deduplicateLogs)`
2. Check log levels match exactly
3. Ensure feature is enabled in config

### Performance Issues
1. Reduce `maxCacheEntries` if memory constrained
2. Disable `includeSources` to reduce metadata overhead
3. Use `DEBUG=vitest:llm-reporter:dedup` for diagnostics

### Output Format Issues
1. Deduplication preserves backward compatibility
2. When disabled, output format unchanged
3. Check JSON schema for deduplication fields

## Integration Tests

### Test File: `deduplication.test.ts`
```typescript
import { test, expect } from 'vitest';

test('deduplication reduces output', async () => {
  // Generate duplicate logs
  for (let i = 0; i < 10; i++) {
    console.log('Repeated message');
  }
  
  // Verify in reporter output
  const output = await getReporterOutput();
  expect(output).toContain('Repeated message (×10)');
  expect(output.split('Repeated message').length).toBe(2); // Once + count
});
```

## Next Steps
1. Enable deduplication in your test configuration
2. Run your test suite to see reduced output
3. Adjust configuration based on your needs
4. Monitor performance with large test suites