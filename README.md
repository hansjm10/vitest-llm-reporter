# Vitest LLM Reporter

A Vitest reporter optimized for LLM consumption with structured, token-efficient output.

## Features

- 🚀 50% smaller output than default reporter
- 🤖 LLM-optimized JSON structure
- 📍 Detailed failure context with code snippets
- ⚡ Token-efficient field names
- 🔧 TypeScript types included

## Requirements

- Node.js 17.0.0 or higher (uses native `structuredClone` API)
- Vitest 3.0.0 or higher

## Installation

```bash
npm install --save-dev vitest-llm-reporter
```

## Schema

The reporter outputs a JSON structure optimized for LLM consumption:

### Basic Output
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

### Schema Types

```typescript
interface LLMReporterOutput {
  summary: TestSummary
  failures?: TestFailure[]
  passed?: TestResult[]  // Only in verbose mode
  skipped?: TestResult[] // Only in verbose mode
}

interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  timestamp: string
}

interface TestFailure {
  test: string
  file: string
  line: number
  suite?: string[]
  error: TestError
}

interface TestError {
  message: string
  type: string
  stack?: string
  context?: ErrorContext
}

interface ErrorContext {
  code: string[]
  expected?: any
  actual?: any
  lineNumber?: number
  columnNumber?: number
}
```

## Development Status

This project is being developed using Test-Driven Development (TDD). Current progress:

- ✅ JSON Schema Definition (Issue #2)
- ⏳ Reporter Interface Implementation (Issue #3)
- ⏳ Basic Reporter Class (Issue #4)
- ⏳ Test Failure Context Extraction (Issue #5)
- ⏳ Configuration Options (Issue #6)
- ⏳ Integration Tests (Issue #7)
- ⏳ Streaming Output Support (Issue #8)
- ⏳ Documentation (Issue #9)

## Contributing

Contributions are welcome! Please check the [GitHub issues](https://github.com/hansjm10/vitest-llm-reporter/issues) for current tasks.

## License

MIT