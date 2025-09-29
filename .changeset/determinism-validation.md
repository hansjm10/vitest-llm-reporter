---
"vitest-llm-reporter": patch
---

Add determinism validation to ensure stable output across test runs.

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