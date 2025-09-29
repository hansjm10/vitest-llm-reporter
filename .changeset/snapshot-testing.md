---
"vitest-llm-reporter": minor
---

Add inline snapshot testing support to improve test maintenance. Introduced snapshot helper utilities that normalize test output (timestamps, durations, environment metadata, file paths) for stable snapshot comparisons. Converted key tests in reporter.test.ts, ErrorExtractor.test.ts, OutputBuilder.test.ts, and schema.test.ts to use toMatchInlineSnapshot() for structural validation. This reduces manual assertion maintenance and makes it easier to detect unintended changes in output structure.