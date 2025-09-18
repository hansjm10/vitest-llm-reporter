---
vitest-llm-reporter: major
---

Unify console event payloads to use a single `message` field by removing the redundant `text` property. This reduces output size and simplifies downstream processing, but consumers must update to the new shape.
