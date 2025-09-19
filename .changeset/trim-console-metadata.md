---
"vitest-llm-reporter": patch
---

-Keep full-fidelity console metadata in internal state while trimming the default output view for LLM consumption.
-Expose `outputView.console.includeTestId` and `outputView.console.includeTimestampMs` flags so downstream tooling can surface those fields when needed.
