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
- Node.js: Version 17.0.0+

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

### Red Flags (Investigation Required)
- > 50% slower than baseline for any component
- > 30% memory increase for equivalent operations
- < 80% success rate for any benchmark

### Yellow Flags (Monitor Closely)
- 20–50% slower than baseline
- 10–30% memory increase
- 80–90% success rate

### Green Status (Acceptable)
- Within 20% of baseline performance
- Within 10% of baseline memory usage
- > 90% success rate (scenario dependent)

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

### Updating Baselines
When legitimate performance improvements are made:
1. Run `npm run bench:all` multiple times to establish stability
2. Update thresholds here if warranted (prefer modest tightening)
3. Note the change and reason in this document

## Historical Performance Data

### Version 0.1.0 (Refactor Baseline)
- Baselines aligned to simplified architecture (Reporter + Large Suites)
- Streaming/Dedup benchmarks removed from targets
- Memory targets expressed as delta vs heapUsed
