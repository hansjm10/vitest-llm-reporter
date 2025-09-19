---
"vitest-llm-reporter": patch
---

Strip internal console metadata before emitting results so downstream consumers avoid extra context while dedupe stats remain intact.
