# Vitest LLM Reporter

[![CI](https://github.com/jordan-hans/vitest-llm-reporter/actions/workflows/ci.yml/badge.svg)](https://github.com/jordan-hans/vitest-llm-reporter/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/vitest-llm-reporter.svg)](https://www.npmjs.com/package/vitest-llm-reporter)
[![npm downloads](https://img.shields.io/npm/dm/vitest-llm-reporter.svg)](https://www.npmjs.com/package/vitest-llm-reporter)
[![license](https://img.shields.io/npm/l/vitest-llm-reporter.svg)](https://github.com/jordan-hans/vitest-llm-reporter/blob/main/LICENSE)

Vitest reporter that generates structured JSON output optimized for LLM parsing.

## Features

- 50% smaller output than default reporter
- Structured JSON output for LLM parsing
- Automatic code context extraction for test failures
- TypeScript support included

## Requirements

- Node.js 17+ (uses native `structuredClone`)
- Vitest 3.0+

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

The reporter automatically extracts failure context and outputs structured JSON.

### Streaming Output

For live per-test updates, use `StreamingReporter`:

```typescript
import { defineConfig } from 'vitest/config'
import { StreamingReporter } from 'vitest-llm-reporter'

export default defineConfig({
  test: {
    // Enable live output
    reporters: [new StreamingReporter({ enableStreaming: true })]
  }
})
```

Note: `StreamingReporter` prints real-time updates as tests complete without changing the JSON output.

## Output Format

JSON output includes only essential test information.

### Success Output
When all tests pass:
```json
{
  "summary": {
    "total": 432,
    "passed": 427,
    "failed": 0,
    "skipped": 5,
    "duration": 5264,
    "timestamp": "2025-08-28T14:06:21.581Z"
  }
}
```

### Failure Output
When tests fail, detailed context is included:
```json
{
  "summary": {
    "total": 432,
    "passed": 427,
    "failed": 1,
    "skipped": 4,
    "duration": 7294,
    "timestamp": "2025-08-28T14:05:34.313Z"
  },
  "failures": [
    {
      "test": "should calculate tax correctly",
      "fileRelative": "tests/tax.test.ts",
      "startLine": 9,
      "endLine": 9,
      "suite": ["Tax Calculator"],
      "error": {
        "message": "expected 105.00 to be 105.50 // Object.is equality",
        "type": "AssertionError",
        "stackFrames": [
          {
            "fileRelative": "tests/tax.test.ts",
            "line": 18,
            "column": 15,
            "inProject": true,
            "inNodeModules": false
          }
        ],
        "assertion": {
          "expected": 105.50,
          "actual": 105.00,
          "operator": "strictEqual",
          "expectedType": "number",
          "actualType": "number"
        },
        "context": {
          "code": [
            " 16:   it('should calculate tax correctly', () => {",
            " 17:     const price = 100;",
            " 18:     expect(calculateTax(price)).toBe(105.50);",
            " 19:     // Tax should be 5.5%",
            " 20:   })"
          ],
          "lineNumber": 18,
          "columnNumber": 15
        }
      },
      "consoleEvents": [
        {
          "level": "error",
          "text": "Tax calculation failed\n",
          "origin": "task"
        }
      ]
    }
  ]
}
```

Failed tests include full context and console output. Passed tests are omitted to reduce size.

## Configuration

Control output content and size limits.

### Output Control
- `verbose`: Include passed and skipped tests
- `includePassedTests` / `includeSkippedTests`: Include specific test categories
- `outputFile`: Write JSON to file
- `enableConsoleOutput`: Emit JSON to console (default: true with TTY)
- `fileJsonSpacing`: File output indentation (default: 0)
- `consoleJsonSpacing`: Console output indentation (default: 2)

### Spinner Control
Test spinner disabled automatically in CI. Override with:
- Config setting
- Environment: `LLM_REPORTER_SPINNER=0`
- Default: Enabled with TTY, disabled in CI

### Suppress External Logs / Pure Output

By default, the reporter suppresses external framework logs (like NestJS startup messages) to keep the JSON output clean. This prevents logs from polluting the structured output that LLMs need to parse.

#### Default Behavior (Enabled)
The reporter automatically filters out common framework logs:
```typescript
// By default, filters logs matching /^\[Nest\]\s/
export default defineConfig({
  test: {
    reporters: ['vitest-llm-reporter'] // Stdio suppression enabled by default
  }
})
```

#### Disable Suppression
To see all stdout output (framework logs, etc.):
```typescript
export default defineConfig({
  test: {
    reporters: [
      ['vitest-llm-reporter', { 
        stdio: { suppressStdout: false } 
      }]
    ]
  }
})
```

#### Pure Output Mode
For maximum cleanliness, suppress ALL external stdout:
```typescript
export default defineConfig({
  test: {
    reporters: [
      ['vitest-llm-reporter', { 
        pureStdout: true  // Suppresses all non-reporter stdout
      }]
    ]
  }
})
```

#### Custom Filter Patterns
Filter specific log patterns:
```typescript
export default defineConfig({
  test: {
    reporters: [
      ['vitest-llm-reporter', { 
        stdio: { 
          suppressStdout: true,
          filterPattern: /^(DEBUG:|TRACE:)/  // Custom pattern
        }
      }]
    ]
  }
})
```

#### Advanced Options
- `stdio.suppressStderr`: Also suppress stderr (default: false)
- `stdio.redirectToStderr`: Redirect filtered stdout to stderr for debugging (default: false)

**Note:** The test progress spinner writes to stderr and continues to work unless stderr suppression is enabled.

#### Application-Level Alternative
For NestJS applications, you can also disable logging in tests:
```typescript
// In your test setup
import { Logger } from '@nestjs/common'
Logger.overrideLogger(false)  // Disable NestJS logging

// Or set log level
const app = await NestFactory.create(AppModule, {
  logger: process.env.NODE_ENV === 'test' ? false : undefined
})
```

### Truncation
Limit output size with truncation settings.

Example truncation config:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          truncation: {
            enabled: true,
            enableLateTruncation: true,
            // Token budget for the final JSON output
            // If unset, defaults to 100_000 estimated tokens
            maxTokens: 8_000
          }
        }
      ]
    ]
  }
})
```

Truncation notes:
- Uses explicit `maxTokens` setting (default: 100,000)
- Token estimates based on character count heuristics

## Debugging

Enable debug output for troubleshooting:

```bash
DEBUG=vitest:llm-reporter:* npm test
```

Diagnostics print to stderr while stdout remains clean JSON.

### Demo Mode

Run the included demo test to see failure reporting and console capture:

- Demo: `npm run test:demo` or `LLM_REPORTER_DEMO=1 vitest run`
- Normal: `npm test`

Demo test at `tests/demo/reporter-demo.test.ts` runs only with `LLM_REPORTER_DEMO=1`.

## Contributing

See [GitHub issues](https://github.com/hansjm10/vitest-llm-reporter/issues) for open tasks.

## License

MIT
