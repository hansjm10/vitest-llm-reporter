/**
 * LLM Reporter Implementation
 *
 * Core reporter class for Vitest that generates LLM-optimized output.
 *
 * @module reporter
 */

import type { Vitest, SerializedError } from 'vitest'
import type { LLMReporterConfig } from '../types/reporter'
import type {
  InternalState,
  CollectedTest,
  TestBase,
  TestCaseData
} from '../types/reporter-internal'
import type {
  LLMReporterOutput,
  TestSummary,
  TestFailure,
  TestResult,
  TestError,
  ErrorContext
} from '../types/schema'
import { getProperty, extractLineNumber } from './helpers'
import * as fs from 'fs'
import * as path from 'path'

export class LLMReporter {
  private config: Required<LLMReporterConfig>
  private context?: Vitest
  private state: InternalState
  private output?: LLMReporterOutput

  constructor(config: LLMReporterConfig = {}) {
    this.config = {
      verbose: config.verbose ?? false,
      outputFile: config.outputFile ?? undefined,
      includePassedTests: config.includePassedTests ?? false,
      includeSkippedTests: config.includeSkippedTests ?? false
    } as Required<LLMReporterConfig>

    this.state = {
      specifications: [],
      queuedModules: [],
      collectedTests: [],
      runningModules: [],
      completedModules: [],
      moduleStartTimes: {},
      moduleDurations: {},
      readyTests: [],
      testResults: {
        passed: [],
        failed: [],
        skipped: []
      }
    }
  }

  getConfig(): Required<LLMReporterConfig> {
    return this.config
  }

  getContext(): Vitest | undefined {
    return this.context
  }

  getState(): InternalState {
    return this.state
  }

  getOutput(): LLMReporterOutput | undefined {
    return this.output
  }

  onInit(ctx: Vitest): void {
    this.context = ctx
  }

  onTestRunStart(specifications: unknown[]): void {
    this.state.startTime = Date.now()
    this.state.specifications = specifications
  }

  onTestModuleQueued(module: unknown): void {
    const id = getProperty<string>(module, 'id')
    if (id) {
      this.state.queuedModules.push(id)
    }
  }

  onTestModuleCollected(module: unknown): void {
    const mod = module as { children?: () => unknown; filepath?: string; id?: string }
    if (mod.children && typeof mod.children === 'function') {
      const tests = mod.children() as Array<{
        id?: string
        name?: string
        mode?: string
        file?: { filepath?: string }
        suite?: string[]
      }>
      for (const test of tests) {
        const collectedTest: CollectedTest = {
          id: test.id,
          name: test.name,
          mode: test.mode,
          file: mod.filepath || test.file?.filepath
        }

        if (test.suite) {
          collectedTest.suite = test.suite
        }

        this.state.collectedTests.push(collectedTest)
      }
    }
  }

  onTestModuleStart(module: unknown): void {
    const id = getProperty<string>(module, 'id')
    if (id) {
      this.state.runningModules.push(id)
      this.state.moduleStartTimes[id] = Date.now()
    }
  }

  onTestModuleEnd(module: unknown): void {
    const id = getProperty<string>(module, 'id')
    if (id) {
      const index = this.state.runningModules.indexOf(id)
      if (index > -1) {
        this.state.runningModules.splice(index, 1)
      }

      this.state.completedModules.push(id)

      if (this.state.moduleStartTimes[id]) {
        this.state.moduleDurations[id] = Date.now() - this.state.moduleStartTimes[id]
      }
    }
  }

  onTestCaseReady(testCase: unknown): void {
    const id = getProperty<string>(testCase, 'id')
    if (id) {
      this.state.readyTests.push(id)
    }
  }

  onTestCaseResult(testCase: unknown): void {
    try {
      this.processTestCase(testCase)
    } catch (error) {
      // Handle errors gracefully
      console.error('Error processing test case:', error)
    }
  }

  private processTestCase(testCase: unknown): void {
    if (!testCase || typeof testCase !== 'object') return

    const tc = testCase as TestCaseData
    const name = tc.name ?? 'Unknown Test'
    const filepath = tc.file?.filepath ?? tc.filepath ?? ''
    const location = tc.location ?? {}
    const startLine = location.start?.line ?? 0
    const endLine = location.end?.line ?? 0
    const suite = tc.suite
    const result = tc.result ?? {}
    const state = result.state ?? 'unknown'
    const duration = result.duration ?? 0

    const baseTest: TestBase = {
      test: name,
      file: filepath,
      startLine,
      endLine,
      suite
    }

    if (state === 'passed') {
      const passedTest: TestResult = {
        ...baseTest,
        status: 'passed',
        duration
      }
      this.state.testResults.passed.push(passedTest)
    } else if (state === 'failed') {
      const error = result.error || {}

      // Safely extract error properties
      const errorExpected = getProperty<unknown>(error, 'expected')
      const errorActual = getProperty<unknown>(error, 'actual')
      const errorLineNumber = getProperty<number>(error, 'lineNumber')
      const errorStack = getProperty<string>(error, 'stack')
      const errorContext = getProperty<ErrorContext>(error, 'context')
      const errorMessage = getProperty<string>(error, 'message')
      const errorName = getProperty<string>(error, 'name')
      const errorType = getProperty<string>(error, 'type')
      const errorConstructor = getProperty<Record<string, unknown>>(error, 'constructor')
      const errorConstructorName = errorConstructor
        ? getProperty<string>(errorConstructor, 'name')
        : undefined

      // Build error context
      let finalErrorContext: ErrorContext | undefined
      if (errorExpected !== undefined || errorActual !== undefined) {
        finalErrorContext = {
          code: [],
          expected: errorExpected as
            | string
            | number
            | boolean
            | null
            | undefined
            | Record<string, unknown>
            | unknown[],
          actual: errorActual as
            | string
            | number
            | boolean
            | null
            | undefined
            | Record<string, unknown>
            | unknown[],
          lineNumber: errorLineNumber ?? extractLineNumber(errorStack)
        }
      } else {
        finalErrorContext = errorContext
      }

      // Determine error type - fallback to 'Error' if not specified
      let finalErrorType = 'Error'
      if (errorName) {
        finalErrorType = errorName
      } else if (errorType) {
        finalErrorType = errorType
      } else if (errorConstructorName && errorConstructorName !== 'Object') {
        finalErrorType = errorConstructorName
      }

      const testError: TestError = {
        message: errorMessage ?? 'Unknown error',
        type: finalErrorType,
        stack: errorStack,
        context: finalErrorContext
      }

      const failedTest: TestFailure = {
        ...baseTest,
        error: testError
      }
      this.state.testResults.failed.push(failedTest)
    } else if (state === 'skipped' || tc.mode === 'skip') {
      const skippedTest: TestResult = {
        ...baseTest,
        status: 'skipped',
        duration
      }
      this.state.testResults.skipped.push(skippedTest)
    }
  }

  onTestRunEnd(_modules: unknown[], errors: SerializedError[], _status: string): void {
    const endTime = Date.now()
    const duration = this.state.startTime ? endTime - this.state.startTime : 0

    const summary: TestSummary = {
      total:
        this.state.testResults.passed.length +
        this.state.testResults.failed.length +
        this.state.testResults.skipped.length,
      passed: this.state.testResults.passed.length,
      failed: this.state.testResults.failed.length,
      skipped: this.state.testResults.skipped.length,
      duration,
      timestamp: new Date().toISOString()
    }

    // Process unhandled errors
    const unhandledFailures: TestFailure[] = errors.map((error) => ({
      test: 'Unhandled Error',
      file: '',
      startLine: 0,
      endLine: 0,
      error: {
        message: error.message || 'Unhandled error',
        type: 'UnhandledError',
        stack: error.stack
      }
    }))

    const allFailures = [...this.state.testResults.failed, ...unhandledFailures]

    this.output = {
      summary
    }

    // Add failures if any exist
    if (allFailures.length > 0) {
      this.output.failures = allFailures
    }

    // Add passed tests if configured
    if (this.config.verbose || this.config.includePassedTests) {
      if (this.state.testResults.passed.length > 0) {
        this.output.passed = this.state.testResults.passed
      }
    }

    // Add skipped tests if configured
    if (this.config.verbose || this.config.includeSkippedTests) {
      if (this.state.testResults.skipped.length > 0) {
        this.output.skipped = this.state.testResults.skipped
      }
    }

    // Make sure the output is JSON-serializable (handle circular references)
    try {
      const jsonString = JSON.stringify(this.output, (_key, value) => {
        // Handle circular references
        const seen = new WeakSet<object>()
        return JSON.parse(
          JSON.stringify(value, (_k, v: unknown) => {
            if (typeof v === 'object' && v !== null) {
              if (seen.has(v)) return undefined
              seen.add(v)
            }
            return v
          })
        ) as unknown
      })
      this.output = JSON.parse(jsonString) as LLMReporterOutput
    } catch {
      // If serialization fails, keep the output as is
    }

    // Write to file if configured
    if (this.config.outputFile && this.output) {
      this.writeOutputFile(this.config.outputFile, this.output)
    }
  }

  private writeOutputFile(outputFile: string, output: LLMReporterOutput): void {
    try {
      const outputPath = path.resolve(outputFile)
      const outputDir = path.dirname(outputPath)

      // Ensure directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // Write the file
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
    } catch (error) {
      console.error('Failed to write output file:', error)
    }
  }
}