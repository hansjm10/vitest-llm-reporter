# Performance Benchmark Baseline Metrics

This document establishes baseline performance metrics for the LLM Vitest Reporter system. These are targets used by the benchmark suite to detect regressions and to guide optimization.

## Overview

The benchmark suite currently focuses on two main areas:
1. **Reporter Performance** — Core reporter throughput on small/medium suites
2. **Large Suite Performance** — Throughput and resources on 1000–2000 tests and a memory‑pressure case

## Baseline Metrics

### General Performance Targets (current)

| Component   | Operation                      | Target Latency | Memory Limit |
|-------------|--------------------------------|----------------|--------------|
| Reporter    | Single test                    | < 50ms         | 50MB         |
| Reporter    | 10 tests                       | < 200ms        | 50MB         |
| Reporter    | 100 tests                      | < 1000ms       | 75MB         |
| Large Suite | 1000 tests                     | < 5000ms       | 500MB        |
| Large Suite | 2000 tests                     | < 10000ms      | 800MB        |
| Large Suite | 1500 tests (memory pressure)   | < 12000ms      | 900MB        |

These thresholds align with the assertions in `tests/benchmarks/*.bench.ts` and constants in `tests/benchmarks/utils.ts`.

### Detailed Component Metrics

#### Reporter Performance
- Single test: < 50ms average
- Small suite (10 tests): < 200ms average
- Medium suite (100 tests): < 1000ms average
- Memory delta: < 50MB (medium: < 75MB)
- Success rate: > 95%

#### Large Suite Performance
- 1000 tests: < 5000ms average
- 2000 tests: < 10000ms average
- 1500 tests (memory pressure): < 12000ms average; memory delta < 900MB

## Memory Management Targets

### Memory Usage Limits
- Basic reporter runs: < 50–75MB delta
- Large suites (1000+ tests): < 500–800MB delta
- Memory pressure case: < 900MB delta

### Garbage Collection Targets
GC monitoring has been simplified away in the current suite; we focus on timing, success rate, and memory delta.

## Performance Quality Metrics

### Success Rates
- Normal operations: > 95%
- Error-heavy suites: > 80–95%, depending on scenario
- Large suites: > 85–90%

### Consistency Requirements
- Run-to-run variation: < 30%
- Scaling: sub‑quadratic time growth
- Memory scaling: < 2x linear growth

## Test Environment Assumptions

### Hardware Baseline
- CPU: Modern multi-core processor (2GHz+)
- Memory: 8GB+ available RAM
- Storage: SSD with 100MB/s+ write speed
- Node.js: Version 18.0.0+

### Test Conditions
- Iterations: 10–100 per benchmark (varies by complexity)
- Warmup: 2–10 iterations before measurement
- Timeout: 5–30 seconds depending on test size
- Isolation: Clean state between test runs

## Benchmark Categories

### Fast Benchmarks (< 1 second each)
- Reporter basic operations
- Memory snapshots

### Medium Benchmarks (1–10 seconds each)
- Reporter medium suites
- Large suite components

### Slow Benchmarks (10+ seconds each)
- Memory pressure tests
- Large suite runs on constrained hosts

## Performance Regression Detection

The benchmark suite now includes **automated performance regression detection** to ensure code changes don't degrade performance beyond acceptable thresholds.

### How Regression Detection Works

1. **Baseline Metrics**: Current performance baselines are stored in `baseline-metrics.json`
2. **Automatic Comparison**: Each benchmark run compares results against baselines
3. **Threshold-Based Alerts**: Regressions trigger warnings or errors based on severity
4. **Non-Blocking Warnings**: Minor regressions (warnings) log alerts but don't fail tests
5. **Critical Failures**: Severe regressions (critical) cause tests to fail

### Regression Thresholds

#### Warning Level (Yellow Flags)
- **Time**: > 20% slower than baseline average
- **Memory**: > 30% memory increase
- **Success Rate**: > 5% decrease in success rate

#### Critical Level (Red Flags)
- **Time**: > 50% slower than baseline average
- **Memory**: > 100% memory increase (2x)
- **Success Rate**: > 10% decrease in success rate

#### Green Status (Acceptable)
- Within 20% of baseline performance
- Within 30% of baseline memory usage
- Within 5% of baseline success rate

### Baseline Metrics File

The `baseline-metrics.json` file contains:
```json
{
  "version": "1.0.0",
  "capturedAt": "2025-09-29T15:54:43.000Z",
  "metrics": {
    "reporter_single_suite": {
      "maxMs": 50,
      "avgMs": 0.16,
      "memoryMB": 0.96,
      "successRate": 100,
      "description": "Reporter processing 1 test"
    },
    // ... more benchmarks
  }
}
```

### Using the Baseline Comparator

The `baseline-comparator.ts` module provides utilities for regression detection:

```typescript
import { loadBaseline, assertNoRegression } from './baseline-comparator'

// Load baseline metrics
const baseline = loadBaseline()

// Assert no regression for a benchmark
assertNoRegression('reporter_single_suite', result, baseline)

// Compare and get detailed report
const comparison = compareToBaseline('reporter_single_suite', result, baseline)
console.log(comparison.summary) // "Performance within baseline thresholds"
```

### Updating Baselines

Baselines should be updated when:
1. **Legitimate improvements**: Performance optimizations that improve metrics
2. **Architectural changes**: Significant refactoring that changes performance characteristics
3. **Hardware upgrades**: CI environment changes that affect baseline measurements

**How to update baselines:**

1. Run benchmarks multiple times to ensure stability:
   ```bash
   npm run bench
   npm run bench
   npm run bench
   ```

2. Review the results to ensure they're consistent and expected

3. Update `baseline-metrics.json` with new metrics:
   - Update `capturedAt` timestamp
   - Update metric values (`avgMs`, `memoryMB`, `successRate`)
   - Update `maxMs` thresholds if needed
   - Add notes about why baselines were updated

4. Document the change in git commit:
   ```bash
   git add tests/benchmarks/baseline-metrics.json
   git commit -m "test: update performance baselines after optimization"
   ```

### Interpreting Regression Reports

When a regression is detected, you'll see output like:

```
⚠️  Performance warning for reporter_medium_suite:
WARNING: time +25.3% (0.19ms vs 0.15ms)
```

Or for critical regressions:
```
❌ Error: Performance regression detected for large_suite_1000:
CRITICAL: time +65.2% (0.53ms vs 0.32ms), memory +45.1% (0.60MB vs 0.41MB)
```

**What to do:**
1. **Warning**: Investigate the cause, but test can proceed
2. **Critical**: Fix the regression or update baselines if justified

## Optimization Priorities

### High Priority (Critical Path)
1. Large suite processing speed
2. Memory usage under load
3. Error‑heavy suite throughput

### Medium Priority (Quality of Life)
1. Configuration impact (verbose/truncation)
2. Startup/shutdown overhead
3. Persistent I/O costs

### Low Priority (Nice to Have)
1. Debug mode overhead
2. Edge case handling
3. Micro‑optimizations

## Usage Instructions

### Running Benchmarks
```bash
# Run all benchmarks
npm run bench

# Run specific component benchmarks
npm run bench:reporter
npm run bench:large-suites

# Run an individual benchmark file
npm run test:bench -- tests/benchmarks/reporter.bench.ts
```

### Interpreting Results
1. Compare against baselines in this document
2. Look for success rates > 90% (scenario dependent)
3. Check memory delta stays within limits
4. Monitor consistency across runs
5. Flag regressions > 30% performance decrease

### Updating Baselines (Legacy Instructions)

See **Performance Regression Detection** section above for current baseline update procedures.

When legitimate performance improvements are made:
1. Run `npm run bench` multiple times to establish stability
2. Update `baseline-metrics.json` with new measurements
3. Update thresholds in this document if warranted (prefer modest tightening)
4. Document the change and reason in git commit

## Historical Performance Data

### Version 0.1.0 (Refactor Baseline)
- Baselines aligned to simplified architecture (Reporter + Large Suites)
- Streaming/Dedup benchmarks removed from targets
- Memory targets expressed as delta vs heapUsed
