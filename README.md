# Vitest LLM Reporter

[![CI](https://github.com/hansjm10/vitest-llm-reporter/actions/workflows/ci.yml/badge.svg)](https://github.com/hansjm10/vitest-llm-reporter/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/vitest-llm-reporter.svg)](https://www.npmjs.com/package/vitest-llm-reporter)
[![npm downloads](https://img.shields.io/npm/dm/vitest-llm-reporter.svg)](https://www.npmjs.com/package/vitest-llm-reporter)
[![license](https://img.shields.io/npm/l/vitest-llm-reporter.svg)](https://github.com/hansjm10/vitest-llm-reporter/blob/main/LICENSE)

Vitest reporter that generates structured JSON output optimized for LLM parsing.

## Features

- Compact structured JSON tailored for LLM consumption
- Automatic code-context extraction for test failures
- **Retry and flakiness detection** to identify intermittent failures
- Optional streaming reporter for live progress updates
- First-class TypeScript types and validation helpers

## Requirements

- Node.js 18+ (uses native `structuredClone`)
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
      [
        'vitest-llm-reporter',
        {
          outputFile: './test-results.json'
        }
      ]
    ]
  }
})
```

The reporter automatically extracts failure context and outputs structured JSON.

You can also enable the reporter directly from the CLI:

```bash
vitest run --reporter=vitest-llm-reporter
```

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
    "flaky": 2,
    "retried": 3,
    "duration": 5264,
    "timestamp": "2025-08-28T14:06:21.581Z",
    "environment": {
      "os": {
        "platform": "linux",
        "release": "6.6.20-200.fc39.x86_64",
        "arch": "x64",
        "version": "#1 SMP PREEMPT_DYNAMIC"
      },
      "node": {
        "version": "20.12.2",
        "runtime": "node"
      },
      "vitest": {
        "version": "3.2.4"
      },
      "ci": false,
      "packageManager": "npm@10.7.0"
    }
  }
}
```

The `flaky` count shows tests that failed initially but passed after retry. The `retried` count shows all tests that required retries. These fields help LLMs identify timing issues and unreliable tests.

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
    "timestamp": "2025-08-28T14:05:34.313Z",
    "environment": {
      "os": {
        "platform": "linux",
        "release": "6.6.20-200.fc39.x86_64",
        "arch": "x64"
      },
      "node": {
        "version": "20.12.2"
      },
      "ci": false
    }
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
          "expected": 105.5,
          "actual": 105.0,
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
          "message": "Tax calculation failed\n",
          "origin": "task"
        }
      ],
      "retryInfo": {
        "attempts": [
          {
            "attemptNumber": 1,
            "status": "failed",
            "duration": 42,
            "timestamp": "2025-08-28T14:05:34.100Z",
            "error": {
              "message": "expected 105.00 to be 105.50",
              "type": "AssertionError"
            }
          },
          {
            "attemptNumber": 2,
            "status": "failed",
            "duration": 38,
            "timestamp": "2025-08-28T14:05:34.150Z",
            "error": {
              "message": "expected 105.00 to be 105.50",
              "type": "AssertionError"
            }
          }
        ],
        "flakiness": {
          "isFlaky": false,
          "totalAttempts": 2,
          "failedAttempts": 2
        }
      }
    }
  ]
}
```

Failed tests include full context, console output, and retry information. The `retryInfo` field tracks all attempts with status, duration, and error details. Flaky tests (failed then passed) are automatically detected.

## Configuration

Control output content and size limits.

### Output Control

- `verbose`: Include passed and skipped tests
- `includePassedTests` / `includeSkippedTests`: Include specific test categories
- `outputFile`: Write JSON to file
- `enableConsoleOutput`: Emit JSON to stdout (default: true when no `outputFile`; otherwise true when the run has a TTY)
- `fileJsonSpacing`: File output indentation (default: 0)
- `consoleJsonSpacing`: Console output indentation (default: 2)

### Retry and Flakiness Detection

Track test retries and detect flaky tests to help LLMs identify intermittent failures:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          trackRetries: true, // Track retry attempts (default: true)
          detectFlakiness: true, // Detect flaky tests (default: true)
          includeAllAttempts: false, // Include all attempts in output (default: false)
          reportFlakyAsWarnings: false // Reserved for future use (default: false)
        }
      ]
    ]
  }
})
```

**Configuration Options:**

- `trackRetries` (default: `true`): Track and report all retry attempts for each test with status, duration, and error details
- `detectFlakiness` (default: `true`): Automatically detect flaky tests (tests that fail initially but pass after retry)
- `includeAllAttempts` (default: `false`): Include all retry attempts in the output, not just tests that were retried
- `reportFlakyAsWarnings` (default: `false`): Reserved for future feature to report flaky tests separately even if they eventually pass

**Output Fields:**

- `summary.flaky`: Count of flaky tests that failed initially but passed after retry
- `summary.retried`: Count of all tests that required retries
- `failure.retryInfo`: Detailed retry information including:
  - `attempts[]`: Array of all retry attempts with status, duration, timestamp, and error details
  - `flakiness`: Flakiness analysis with `isFlaky`, `totalAttempts`, `failedAttempts`, and `successAttempt`

This feature helps LLMs identify timing issues, concurrency problems, and unreliable tests. It's fully backward compatible - existing code continues to work without changes.

### Console Capture & Limits

- `captureConsoleOnFailure`: Include console output for failing tests (default: true)
- `captureConsoleOnSuccess`: Include filtered console output for passing tests (default: false)
- `maxConsoleBytes` / `maxConsoleLines`: Per-test capture limits (defaults: 50 KB & 100 lines)
- `includeDebugOutput`: Keep `console.debug` / `console.trace` messages (default: false)
- `warnWhenConsoleBlocked`: Emit a stderr warning if stdout seems blocked (default: true)
- `fallbackToStderrOnBlocked`: Mirror JSON to stderr if stdout write fails (default: true)

### Console Event Metadata

By default, console events in the output are trimmed to reduce size for LLM consumption. You can optionally include additional metadata:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          outputView: {
            console: {
              includeTestId: true, // Include originating test ID (default: false)
              includeTimestampMs: true // Include timestamp in ms (default: false)
            }
          }
        }
      ]
    ]
  }
})
```

- `outputView.console.includeTestId` (default: `false`): Include the originating test ID for each console event
- `outputView.console.includeTimestampMs` (default: `false`): Include the timestamp in milliseconds relative to test start

These options allow downstream tooling to access full-fidelity console metadata when needed while keeping the default output clean for LLM parsing.

### Paths & Error Detail

- `includeAbsolutePaths`: Add absolute file paths alongside repo-relative paths (default: false)
- `filterNodeModules`: Omit node_modules stack frames (default: true)
- `includeStackString`: Preserve the raw stack string in addition to parsed frames (default: false)
- `tokenCountingEnabled`: Collect token-counting metrics for custom pipelines (default: false)
- `performance`: Enable memory/processing monitors for large suites (`enabled`, `cacheSize`, `memoryWarningThreshold`)

### Environment Metadata

The summary includes host metadata (OS, Node.js, Vitest version, package manager, CI flag) to help LLMs reason about failures. You can fine-tune or disable this via `environmentMetadata`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          environmentMetadata: {
            includeVitest: false,
            includePackageManager: false,
            includeCi: false,
            includeNodeRuntime: false,
            includeOsVersion: false
          }
        }
      ]
    ]
  }
})
```

Set `environmentMetadata.enabled = false` to omit the block entirely.

### Spinner Behavior

- Enabled automatically when running in a TTY outside CI (`stderr` stream)
- Disable globally with `LLM_REPORTER_SPINNER=0`
- Spinner output stops automatically if stderr suppression is enabled

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
      [
        'vitest-llm-reporter',
        {
          stdio: { suppressStdout: false }
        }
      ]
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
      [
        'vitest-llm-reporter',
        {
          pureStdout: true // Suppresses all non-reporter stdout
        }
      ]
    ]
  }
})
```

#### Custom Filter Patterns

Filter specific log patterns or provide multiple matchers:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          stdio: {
            suppressStdout: true,
            // Mix and match regular expressions and predicates
            filterPattern: [/^(DEBUG:|TRACE:)/, (line: string) => line.startsWith('Verbose:')],
            frameworkPresets: ['nest'] // Re-enable the default Nest preset alongside custom patterns
          }
        }
      ]
    ]
  }
})
```

#### Advanced Options

- `stdio.suppressStderr`: Also suppress stderr (default: false)
- `stdio.redirectToStderr`: Redirect filtered stdout to stderr for debugging (default: false)
- `stdio.frameworkPresets`: Apply curated suppression presets for popular frameworks (e.g. `'nest'`, `'next'`, `'nuxt'`)
- `stdio.autoDetectFrameworks`: Inspect `package.json`/environment to automatically load matching presets (default: false)
- `captureConsoleOnSuccess`: Include console output from passing tests in the JSON `successLogs` section, with suppression stats (default: false)

**Note:** The test progress spinner writes to stderr and continues to work unless stderr suppression is enabled.

#### Framework Presets

Suppress startup banners from known frameworks without crafting custom regexes:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          stdio: {
            suppressStdout: true,
            frameworkPresets: ['next', 'fastify']
          }
        }
      ]
    ]
  }
})
```

Available presets: `nest`, `next`, `nuxt`, `angular`, `vite`, `fastify`, `express`, `strapi`, `remix`, `sveltekit`.

👉 Check out the runnable [framework preset demo config](examples/framework-presets-demo/vitest.config.ts) for a complete
Vitest setup that combines curated presets with a custom filter and per-test log deduplication. The demo also disables
Vitest's silent console mode (`test.silent = false`) so the simulated framework banners would normally appear even on
successful runs. A single non-matching log (`✅ Reporter still surfaces regular test output`) is captured and emitted in the
`successLogs` section of the JSON output, along with a `suppressed` summary that shows how many framework lines were filtered.

#### Auto-detect Frameworks

Let the reporter inspect dependencies and enable presets automatically:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          stdio: {
            suppressStdout: true,
            autoDetectFrameworks: true
          }
        }
      ]
    ]
  }
})
```

When `DEBUG=vitest-llm-reporter:*` is set, the reporter logs which presets were applied so you can confirm nothing important is filtered.

#### Application-Level Alternative

For NestJS applications, you can also disable logging in tests:

```typescript
// In your test setup
import { Logger } from '@nestjs/common'
Logger.overrideLogger(false) // Disable NestJS logging

// Or set log level
const app = await NestFactory.create(AppModule, {
  logger: process.env.NODE_ENV === 'test' ? false : undefined
})
```

### Log Deduplication

Log deduplication is enabled by default to reduce duplicate console output across tests. This feature consolidates identical log messages at the same level, showing occurrence counts instead of repeating the same message multiple times. By default the reporter deduplicates globally across the entire test run; switch to per-test scoping if you prefer isolation between suites.

#### Basic Usage

Explicitly confirm the default or override it if needed:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          deduplicateLogs: true // Enabled by default
        }
      ]
    ]
  }
})
```

To disable deduplication and surface every log message:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          deduplicateLogs: false
        }
      ]
    ]
  }
})
```

#### Advanced Configuration

Fine-tune deduplication behavior:

```typescript
export default defineConfig({
  test: {
    reporters: [
      [
        'vitest-llm-reporter',
        {
          deduplicateLogs: {
            enabled: true,
            maxCacheEntries: 10000, // Max unique entries to track
            includeSources: true, // Show which tests logged
            normalizeWhitespace: true, // Ignore whitespace differences
            stripTimestamps: true, // Ignore timestamp differences
            stripAnsiCodes: true, // Ignore color codes
            scope: 'per-test' // Optional: scope deduplication per test
          }
        }
      ]
    ]
  }
})
```

#### Configuration Options

| Option                | Type                     | Default    | Description                                   |
| --------------------- | ------------------------ | ---------- | --------------------------------------------- |
| `enabled`             | `boolean`                | `true`     | Enable/disable deduplication                  |
| `maxCacheEntries`     | `number`                 | `10000`    | Maximum unique log entries to track           |
| `includeSources`      | `boolean`                | `false`    | Include test IDs that generated the log       |
| `normalizeWhitespace` | `boolean`                | `true`     | Collapse multiple spaces for comparison       |
| `stripTimestamps`     | `boolean`                | `true`     | Ignore timestamps when comparing              |
| `stripAnsiCodes`      | `boolean`                | `true`     | Strip color codes when comparing              |
| `scope`               | `'global' \| 'per-test'` | `'global'` | Deduplicate across the entire run or per test |

#### Example Output

Without deduplication:

```
✓ test-1: Connecting to database...
✓ test-2: Connecting to database...
✓ test-3: Connecting to database...
```

With deduplication the duplicate entries are collapsed and annotated in the JSON payload:

```json
{
  "failures": [
    {
      "test": "connects to the database",
      "consoleEvents": [
        {
          "level": "log",
          "text": "Connecting to database...",
          "deduplication": {
            "deduplicated": true,
            "count": 3,
            "firstSeen": "2024-01-01T12:00:00.000Z",
            "lastSeen": "2024-01-01T12:00:01.200Z",
            "sources": ["test-1", "test-2"]
          }
        }
      ]
    }
  ]
}
```

#### Performance Impact

- Designed for test suites with 1000+ tests
- Overhead: <5% execution time
- Memory: <50MB for 10,000 unique entries
- Automatically evicts oldest entries when cache limit is reached

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
- Framework suppression demo: `npm run test:demo:framework` (uses
  `examples/framework-presets-demo/vitest.config.ts` to show curated presets in action)
- Normal: `npm test`

Demo test at `tests/demo/reporter-demo.test.ts` runs only with `LLM_REPORTER_DEMO=1`. The framework preset demo lives under
`examples/framework-presets-demo/` so you can inspect both the config and the sample test.

## Contributing

See [GitHub issues](https://github.com/hansjm10/vitest-llm-reporter/issues) for open tasks.

## Project documentation

- [Contributing Guide](./docs/CONTRIBUTING.md)
- [Security Policy](./docs/SECURITY.md)
- [Claude Usage Notes](./docs/CLAUDE.md)

## License

MIT
