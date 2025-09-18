# vitest-llm-reporter

## 1.0.0

### Major Changes

- 17d717b: Unify console event payloads to use a single `message` field by removing the redundant `text` property. This reduces output size and simplifies downstream processing, but consumers must update to the new shape.

### Minor Changes

- 24015a4: Add TypeScript-backed end-line resolution for tests, improving metadata accuracy and covering edge cases like chained modifiers and todo tests.

## 0.2.5

### Patch Changes

- b26010f: Point the internal dev dependency at the local package via `file:.`.

## 0.2.4

### Patch Changes

- 6834dd5: Document CLI flag usage for enabling the reporter directly.

## 0.2.3

### Patch Changes

- 0f1a5eb: chore: integrate Changesets workflow and CI guardrails
