import * as fs from 'node:fs'
import type { LLMReporterOutput } from '../types/schema.js'

type StreamWrite = typeof process.stdout.write

interface ReporterConsoleSinkConfig {
  consoleJsonSpacing: number
  fallbackToStderrOnBlocked: boolean
  framedOutput: boolean
  warnWhenConsoleBlocked: boolean
}

export class ReporterConsoleSink {
  constructor(
    private readonly config: ReporterConsoleSinkConfig,
    private readonly debugError: (message: string, ...args: unknown[]) => void
  ) {}

  write(
    output: LLMReporterOutput,
    writers: { stdout: StreamWrite; stderr: StreamWrite },
    options: { probeWhenEmpty?: boolean } = {}
  ): boolean {
    const { probeWhenEmpty = false } = options

    if (probeWhenEmpty) {
      return this.probeBlockedStdout(writers, output)
    }

    try {
      const jsonOutput = JSON.stringify(output, null, this.config.consoleJsonSpacing)

      if (this.config.framedOutput) {
        writers.stdout('\n' + '='.repeat(80) + '\n')
        writers.stdout('LLM Reporter Output:\n')
        writers.stdout('='.repeat(80) + '\n')
      }

      const writeResult = writers.stdout(jsonOutput + '\n')

      if (this.config.framedOutput) {
        writers.stdout('='.repeat(80) + '\n')
      }

      if (!writeResult) {
        this.warnAndFallback(
          writers.stderr,
          output,
          'vitest-llm-reporter: stdout appears to be blocked. JSON results may not be visible.\n' +
            "If you do not see the JSON output, configure `outputFile` or adjust your project's log/silent settings.\n"
        )
      }

      return true
    } catch (error) {
      this.debugError('Failed to write to console: %O', error)
      this.warnAndFallback(
        writers.stderr,
        output,
        'vitest-llm-reporter: Console output appears blocked. ' +
          "If you do not see the JSON output, configure `outputFile` or adjust your project's log/silent settings.\n"
      )
      return false
    }
  }

  private probeBlockedStdout(
    writers: { stdout: StreamWrite; stderr: StreamWrite },
    output: LLMReporterOutput
  ): boolean {
    try {
      writers.stdout('')
      return false
    } catch (probeError) {
      this.debugError('Stdout appears blocked during probe: %O', probeError)
      this.warnAndFallback(
        writers.stderr,
        output,
        'vitest-llm-reporter: Console output appears blocked. ' +
          "If you do not see the JSON output, configure `outputFile` or adjust your project's log/silent settings.\n"
      )
      return false
    }
  }

  private warnAndFallback(
    stderrWrite: StreamWrite,
    output: LLMReporterOutput,
    warning: string
  ): void {
    if (!this.config.warnWhenConsoleBlocked) {
      return
    }

    this.writeToStderr(stderrWrite, warning, 'fs.writeSync stderr hint failed: %O')

    if (!this.config.fallbackToStderrOnBlocked) {
      return
    }

    const jsonOutput = JSON.stringify(output, null, this.config.consoleJsonSpacing)
    this.writeToStderr(stderrWrite, jsonOutput + '\n', 'fs.writeSync stderr JSON failed: %O')
  }

  private writeToStderr(stderrWrite: StreamWrite, value: string, fallbackLogMessage: string): void {
    try {
      stderrWrite(value)
    } catch {
      try {
        process.stderr.write(value)
      } catch {
        try {
          fs.writeSync(2, value)
        } catch (error) {
          this.debugError(fallbackLogMessage, error)
        }
      }
    }
  }
}
