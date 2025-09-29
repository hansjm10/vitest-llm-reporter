/**
 * Tests for OutputBuilder
 *
 * Verifies that the OutputBuilder correctly handles unhandled errors
 * in the summary counts.
 */

import { describe, it, expect } from 'vitest'
import { OutputBuilder } from './OutputBuilder.js'
import type { BuildOptions } from './types.js'
import type { SerializedError } from 'vitest'
import { prepareForSnapshot } from '../test-utils/snapshot-helpers.js'

describe('OutputBuilder', () => {
  describe('buildSummary with unhandled errors', () => {
    it('should include unhandled errors in failed count', () => {
      const builder = new OutputBuilder()

      const unhandledError: SerializedError = {
        message: 'ReferenceError: beforeAll is not defined',
        stack: 'ReferenceError: beforeAll is not defined\n  at test.js:1:1',
        name: 'ReferenceError'
      }

      const options: BuildOptions = {
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: [unhandledError]
      }

      const output = builder.build(options)

      // Verify summary counts include the unhandled error
      expect(output.summary.failed).toBe(1)
      expect(output.summary.total).toBe(1)
      expect(output.summary.passed).toBe(0)
      expect(output.summary.skipped).toBe(0)

      // Verify the error appears in failures array
      expect(output.failures).toBeDefined()
      expect(output.failures).toHaveLength(1)
      expect(output.failures![0].test).toBe('Unhandled Error')
      expect(output.failures![0].error.message).toContain('beforeAll is not defined')
    })

    it('should include unhandled errors in failed count (snapshot)', () => {
      const builder = new OutputBuilder()

      const unhandledError: SerializedError = {
        message: 'ReferenceError: beforeAll is not defined',
        stack: 'ReferenceError: beforeAll is not defined\n  at test.js:1:1',
        name: 'ReferenceError'
      }

      const options: BuildOptions = {
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: [unhandledError]
      }

      const output = builder.build(options)
      const normalized = prepareForSnapshot(output, { stripConsole: true })

      expect(normalized).toMatchInlineSnapshot(`
        {
          "failures": [
            {
              "consoleEvents": undefined,
              "duration": undefined,
              "endLine": 0,
              "error": {
                "assertion": undefined,
                "context": undefined,
                "message": "ReferenceError: beforeAll is not defined",
                "stackFrames": [
                  {
                    "column": 1,
                    "fileRelative": "test.js",
                    "inNodeModules": false,
                    "inProject": false,
                    "line": 1,
                  },
                ],
                "type": "UnhandledError",
              },
              "fileRelative": "",
              "startLine": 0,
              "test": "Unhandled Error",
            },
          ],
          "summary": {
            "duration": 0,
            "environment": {
              "ci": false,
              "node": {
                "runtime": "node",
                "version": "v18.0.0",
              },
              "os": {
                "arch": "x64",
                "platform": "linux",
                "release": "5.0.0",
                "version": "5.0.0",
              },
              "packageManager": "npm@9.0.0",
              "vitest": {
                "version": "3.0.0",
              },
            },
            "failed": 1,
            "passed": 0,
            "skipped": 0,
            "timestamp": "2024-01-01T00:00:00.000Z",
            "total": 1,
          },
        }
      `)
    })

    it('should handle multiple unhandled errors', () => {
      const builder = new OutputBuilder()

      const unhandledErrors: SerializedError[] = [
        {
          message: 'Error 1',
          stack: 'Error 1 stack',
          name: 'Error'
        },
        {
          message: 'Error 2',
          stack: 'Error 2 stack',
          name: 'Error'
        }
      ]

      const options: BuildOptions = {
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: unhandledErrors
      }

      const output = builder.build(options)

      // Verify both errors are counted
      expect(output.summary.failed).toBe(2)
      expect(output.summary.total).toBe(2)
      expect(output.failures).toHaveLength(2)
    })

    it('should add unhandled errors to existing test failures', () => {
      const builder = new OutputBuilder()

      const testFailure = {
        test: 'failing test',
        fileRelative: 'test.js',
        startLine: 1,
        endLine: 5,
        error: {
          message: 'Test assertion failed',
          type: 'AssertionError' as const
        }
      }

      const unhandledError: SerializedError = {
        message: 'Suite error',
        stack: 'Suite error stack',
        name: 'Error'
      }

      const options: BuildOptions = {
        testResults: {
          passed: [],
          failed: [testFailure],
          skipped: [],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: [unhandledError]
      }

      const output = builder.build(options)

      // Verify combined counts
      expect(output.summary.failed).toBe(2) // 1 test failure + 1 unhandled error
      expect(output.summary.total).toBe(2)
      expect(output.failures).toHaveLength(2)

      // Verify both types of failures are present
      const failureTests = output.failures!.map((f) => f.test)
      expect(failureTests).toContain('failing test')
      expect(failureTests).toContain('Unhandled Error')
    })

    it('should work correctly with passed and skipped tests', () => {
      const builder = new OutputBuilder()

      const passedTest = {
        test: 'passing test',
        fileRelative: 'test.js',
        startLine: 1,
        endLine: 5,
        status: 'passed' as const
      }

      const skippedTest = {
        test: 'skipped test',
        fileRelative: 'test.js',
        startLine: 10,
        endLine: 15,
        status: 'skipped' as const
      }

      const unhandledError: SerializedError = {
        message: 'Module error',
        stack: 'Module error stack',
        name: 'Error'
      }

      const options: BuildOptions = {
        testResults: {
          passed: [passedTest],
          failed: [],
          skipped: [skippedTest],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: [unhandledError]
      }

      const output = builder.build(options)

      // Verify counts
      expect(output.summary.total).toBe(3) // 1 passed + 1 skipped + 1 unhandled error
      expect(output.summary.passed).toBe(1)
      expect(output.summary.failed).toBe(1) // Only the unhandled error
      expect(output.summary.skipped).toBe(1)

      // Verify failures array
      expect(output.failures).toHaveLength(1)
      expect(output.failures![0].test).toBe('Unhandled Error')
    })

    it('should handle no unhandled errors (backward compatibility)', () => {
      const builder = new OutputBuilder()

      const options: BuildOptions = {
        testResults: {
          passed: [
            {
              test: 'test1',
              fileRelative: 'test.js',
              startLine: 1,
              endLine: 5,
              status: 'passed' as const
            }
          ],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000
        // No unhandledErrors property
      }

      const output = builder.build(options)

      // Verify normal behavior when no unhandled errors
      expect(output.summary.total).toBe(1)
      expect(output.summary.passed).toBe(1)
      expect(output.summary.failed).toBe(0)
      expect(output.summary.skipped).toBe(0)
      expect(output.failures).toBeUndefined()
    })

    it('should handle empty unhandled errors array', () => {
      const builder = new OutputBuilder()

      const options: BuildOptions = {
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: [] // Empty array
      }

      const output = builder.build(options)

      // Verify counts with empty array
      expect(output.summary.total).toBe(0)
      expect(output.summary.passed).toBe(0)
      expect(output.summary.failed).toBe(0)
      expect(output.summary.skipped).toBe(0)
      expect(output.failures).toBeUndefined() // No failures array when empty
    })

    it('should include runtime environment metadata in the summary', () => {
      const builder = new OutputBuilder()

      const output = builder.build({
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 0
      })

      expect(output.summary.environment).toBeDefined()
      expect(output.summary.environment).toMatchObject({
        os: {
          platform: expect.any(String),
          release: expect.any(String),
          arch: expect.any(String)
        },
        node: {
          version: expect.any(String)
        }
      })
    })

    it('should allow disabling optional environment fields', () => {
      const builder = new OutputBuilder({
        environmentMetadata: {
          includeVitest: false,
          includePackageManager: false,
          includeCi: false,
          includeNodeRuntime: false,
          includeOsVersion: false
        }
      })

      const output = builder.build({
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 0
      })

      expect(output.summary.environment).toBeDefined()
      expect(output.summary.environment?.vitest).toBeUndefined()
      expect(output.summary.environment?.packageManager).toBeUndefined()
      expect(output.summary.environment?.ci).toBeUndefined()
      expect(output.summary.environment?.node.runtime).toBeUndefined()
      expect(output.summary.environment?.os.version).toBeUndefined()
    })

    it('should allow disabling environment metadata entirely', () => {
      const builder = new OutputBuilder({
        environmentMetadata: {
          enabled: false
        }
      })

      const output = builder.build({
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 0
      })

      expect(output.summary.environment).toBeUndefined()
    })
  })

  describe('unhandled error conversion', () => {
    it('should convert unhandled errors to TestFailure format', () => {
      const builder = new OutputBuilder()

      const unhandledError: SerializedError = {
        message: 'Cannot find module',
        stack: 'Error: Cannot find module\n  at Object.<anonymous> (test.js:1:1)',
        name: 'Error'
      }

      const options: BuildOptions = {
        testResults: {
          passed: [],
          failed: [],
          skipped: [],
          successLogs: []
        },
        duration: 1000,
        unhandledErrors: [unhandledError]
      }

      const output = builder.build(options)

      // Verify the conversion
      const failure = output.failures![0]
      expect(failure.test).toBe('Unhandled Error')
      expect(failure.fileRelative).toBe('')
      expect(failure.startLine).toBe(0)
      expect(failure.endLine).toBe(0)
      expect(failure.error.type).toBe('UnhandledError')
      expect(failure.error.message).toBe('Cannot find module')
    })
  })
})
