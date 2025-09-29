---
---

Add automated performance regression detection to benchmark suite.

The benchmark suite now includes baseline comparison capabilities to detect performance regressions:

- Created `baseline-metrics.json` with established performance baselines for all benchmarks
- Implemented `baseline-comparator.ts` with utilities for loading baselines and comparing results
- Integrated regression detection into `reporter.bench.ts` and `large-suites.bench.ts`
- Added comprehensive documentation in `BASELINE_METRICS.md` for regression thresholds and baseline updates
- Regression detection uses configurable thresholds (warning: 20% time / 30% memory, critical: 50% time / 100% memory)
- Non-critical regressions log warnings while critical regressions fail tests
