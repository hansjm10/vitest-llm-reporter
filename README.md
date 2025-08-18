# Vitest LLM Reporter

A zero-config Vitest reporter that outputs concise, structured JSON optimized for LLM consumption.

## Features

- 🚀 50% smaller output than default reporter
- 🤖 Structured JSON perfect for LLM parsing
- 📍 Automatic code context extraction for failures
- ⚡ Zero configuration required
- 🔧 TypeScript types included

## Requirements

- Node.js 17.0.0 or higher (uses native `structuredClone` API)
- Vitest 3.0.0 or higher

## Installation

```bash
npm install --save-dev vitest-llm-reporter
```

## Usage

Add the reporter to your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['vitest-llm-reporter']
  }
})
```

Or specify an output file:

```typescript
export default defineConfig({
  test: {
    reporters: [
      ['vitest-llm-reporter', { 
        outputFile: './test-results.json' 
      }]
    ]
  }
})
```

That's it! The reporter will automatically extract failure context and output structured JSON.

## Output Format

The reporter generates concise JSON with only the essential information for understanding test results:

```json
{
  "summary": {
    "total": 10,
    "passed": 8,
    "failed": 2,
    "skipped": 0,
    "duration": 1234,
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "failures": [
    {
      "test": "should calculate tax correctly",
      "file": "/src/tax.test.ts",
      "line": 45,
      "error": {
        "message": "Expected 105.50 but got 105.00",
        "type": "AssertionError",
        "context": {
          "code": [
            "44: const price = 100;",
            "45: expect(calculateTax(price)).toBe(105.50);",
            "46: // Tax should be 5.5%"
          ],
          "expected": 105.50,
          "actual": 105.00,
          "lineNumber": 45
        }
      }
    }
  ]
}
```

The output focuses on failures with their context, keeping passed tests minimal to save tokens.

## Debugging

If the reporter isn't working as expected, enable debug output:

```bash
DEBUG=vitest:llm-reporter:* npm test
```


## Contributing

Contributions are welcome! Please check the [GitHub issues](https://github.com/hansjm10/vitest-llm-reporter/issues) for current tasks.

## License

MIT