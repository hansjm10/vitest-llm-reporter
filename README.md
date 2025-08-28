# Vitest LLM Reporter

[![npm version](https://img.shields.io/npm/v/vitest-llm-reporter.svg)](https://www.npmjs.com/package/vitest-llm-reporter)
[![npm downloads](https://img.shields.io/npm/dm/vitest-llm-reporter.svg)](https://www.npmjs.com/package/vitest-llm-reporter)
[![license](https://img.shields.io/npm/l/vitest-llm-reporter.svg)](https://github.com/jordan-hans/vitest-llm-reporter/blob/main/LICENSE)

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

### Optional: Per-test streaming output

If you prefer live, per-test console updates, use the `StreamingReporter`:

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

Note: `StreamingReporter` is a thin wrapper around the base reporter that prints simple, real-time lines as tests complete. It does not change the JSON output behavior.

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

## Configuration

You can tune what the reporter includes and how aggressively it trims output.

### Output Control
- `verbose`: Include passed and skipped tests in the final JSON.
- `includePassedTests` / `includeSkippedTests`: Include specific categories without enabling full verbose mode.
- `outputFile`: Write the JSON to a file path.
- `enableConsoleOutput`: Control whether to emit JSON to console at end of test run (default: true when no outputFile or when TTY detected).
- `fileJsonSpacing`: JSON indentation for file output (default: 0 for compact).
- `consoleJsonSpacing`: JSON indentation for console output (default: 2 for readability).

### Spinner Control
The test runner spinner is automatically disabled in CI environments and can be controlled via:
- Configuration: Set explicit value in config
- Environment: `LLM_REPORTER_SPINNER=0` to force disable
- Default: Enabled when TTY detected and not in CI

### Truncation
- `truncation`: Enable late-stage truncation to cap the output size.

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

Notes on truncation:
- The reporter does not use model-specific context windows; it only respects your explicit `maxTokens` (or a default of 100,000 if unset).
- Token counts are estimates based on a simple character-to-token heuristic, suitable for budgeting and thresholds.

## Debugging

If the reporter isn't working as expected, enable debug output:

```bash
DEBUG=vitest:llm-reporter:* npm test
```

This prints internal diagnostics to stderr, including a formatted view of any
unhandled errors. Stdout remains clean, machine‑parseable JSON.

### Demo: Intentional Failure With Console Logs

You can enable a small demo test that intentionally fails and emits console output to showcase how the reporter captures logs:

- Run demo: `npm run test:demo` (equivalent to `LLM_REPORTER_DEMO=1 vitest run`)
- Normal run (demo off): `npm test`

The demo test lives in `tests/demo/reporter-demo.test.ts` and only runs when the `LLM_REPORTER_DEMO=1` environment variable is set.

## Migration from Previous Versions

### Latest Changes

#### Deprecated Configuration Options
- **`enableStreaming`**: Deprecated. Use `enableConsoleOutput` instead for controlling end-of-run console JSON emission. Note: This is distinct from `StreamingReporter.enableStreaming` which controls live per-test output.

#### Removed Configuration Options
The following unused truncation configuration options have been removed:
- **`TruncationConfig.strategy`**: This field was never used and has been removed.
- **`TruncationConfig.featureFlag`**: This field was never used and has been removed.

### Previously Removed Options

The following configuration options were removed in earlier versions:

- **`streamingMode`**: This legacy flag has been removed. Use `enableConsoleOutput` instead.
- **`streaming`** config object and **`StreamingConfig`** type: This unimplemented configuration block has been removed. 
- **`TruncationConfig.enableStreamingTruncation`**: This unused option has been removed from truncation configuration.
- **`TruncationConfig.model`**: Removed. Truncation no longer varies by model and only respects `maxTokens`.
- **`tokenCountingModel`**: Removed from reporter config. The reporter performs model-agnostic token estimation.

Additionally, model-based context utilities were removed:
- `getEffectiveMaxTokens`, `MODEL_CONTEXT_WINDOWS`, and related helpers are no longer exported.

**Migration Guide:**
- If you were using `enableStreaming` for console output control, replace it with `enableConsoleOutput`
- If you had `truncation.strategy` or `truncation.featureFlag` in your config, these can be safely removed
- Spinner now defaults to off in CI environments. Use `LLM_REPORTER_SPINNER=0` environment variable to force disable
- Use `fileJsonSpacing` and `consoleJsonSpacing` to control JSON formatting separately for file and console output
- If you previously relied on model-specific context windows, set an explicit `truncation.maxTokens` to control output size.

## Contributing

Contributions are welcome! Please check the [GitHub issues](https://github.com/hansjm10/vitest-llm-reporter/issues) for current tasks.

## License

MIT
