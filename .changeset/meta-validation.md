---
"vitest-llm-reporter": minor
---

Add self-validation to ensure reporter output complies with the JSON schema.

**New Features:**
- Add `validateOutput` configuration option to enable schema validation of reporter output
- Reporter validates its own output after generation and logs any schema violations
- Validation errors are logged to stderr for visibility without failing the test run
- E2E test verifies that reporter output passes schema validation

**New Configuration Option:**
- `validateOutput`: Enable/disable output validation (default: false)

**Developer Experience:**
- Enabled by default in vitest.config.ts for dogfooding
- Helps catch schema compliance issues during development and testing
- Provides detailed error messages when validation fails

This feature ensures the reporter always generates valid JSON that conforms to the documented schema, improving reliability for LLM consumers.