---
"vitest-llm-reporter": minor
---

Add test retry and flakiness detection to help LLMs understand intermittent test failures.

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