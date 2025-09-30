---
'vitest-llm-reporter': minor
---

Add visual diff output for assertion failures

This feature enhances error reporting by automatically generating visual diffs for assertion failures. When tests fail due to assertion errors, the reporter now includes a formatted diff showing the differences between expected and actual values.

**Key Features:**
- Automatic diff generation for assertion errors with expected/actual values
- Support for objects, arrays, primitives, and nested structures
- Handles circular references safely
- Three diff formats: JSON, string, and object
- Line-by-line comparison with visual indicators (-, +)

**New Schema Field:**
- Added `diff` field to `TestError` interface with format: `{ formatted: string, format: 'json' | 'string' | 'object' }`

**Example Output:**
```
- expected
+ actual

  {
-   "name": "John"
+   "name": "Jane"
    "age": 30
  }
```

This feature requires no configuration changes and works automatically for all assertion failures.