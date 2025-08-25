/**
 * Output Strategies Tests
 *
 * Comprehensive tests for all output strategies including file, console, and dual
 * output modes with validation, fallback behavior, and performance testing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { FileOutputStrategy } from './FileOutputStrategy.js'
import { ConsoleOutputStrategy } from './ConsoleOutputStrategy.js'
import { OutputValidator } from '../validators/OutputValidator.js'
import type { LLMReporterOutput } from '../../types/schema.js'

// Mock the logger to avoid console output during tests
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => vi.fn()
}))

// Mock environment for consistent testing
vi.mock('../../utils/environment.js', () => ({
  detectEnvironment: () => ({
    tty: {
      stdout: true,
      stderr: true,
      hasAnyTTY: true,
      hasFullTTY: true
    },
    ci: {
      isCI: false
    },
    platform: {
      os: 'linux',
      nodeVersion: 'v18.0.0',
      isHeadless: false
    },
    capabilities: {
      supportsColor: true,
      supportsInteractive: true,
      supportsTerminal: true
    }
  })
}))

// Test data
const mockReporterOutput: LLMReporterOutput = {
  summary: {
    total: 3,
    passed: 2,
    failed: 1,
    skipped: 0,
    duration: 1500,
    timestamp: '2024-01-01T10:00:00.000Z'
  },
  failures: [
    {
      test: 'failing test',
      file: '/test/example.test.ts',
      startLine: 10,
      endLine: 15,
      error: {
        message: 'Test failed',
        type: 'AssertionError'
      }
    }
  ],
  passed: [
    {
      test: 'passing test 1',
      file: '/test/example.test.ts',
      startLine: 1,
      endLine: 5,
      status: 'passed' as const,
      duration: 100
    }
  ]
}

// Test utilities
const createTempFile = (content = ''): string => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-output-'))
  const tempFile = path.join(tempDir, 'output.json')
  if (content) {
    fs.writeFileSync(tempFile, content)
  }
  return tempFile
}

const cleanupTempFile = (filePath: string): void => {
  try {
    const dir = path.dirname(filePath)
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe('OutputValidator', () => {
  let validator: OutputValidator

  beforeEach(() => {
    validator = new OutputValidator()
  })

  describe('validateFilePermissions', () => {
    it('should validate writable file path', () => {
      const tempFile = createTempFile('{"test": "data"}')
      const result = validator.validateFilePermissions(tempFile)

      expect(result.isValid).toBe(true)
      expect(result.directoryWritable).toBe(true)
      expect(result.fileExists).toBe(true)
      expect(result.fileWritable).toBe(true)
      expect(result.resolvedPath).toBe(path.resolve(tempFile))

      cleanupTempFile(tempFile)
    })

    it('should validate new file in existing directory', () => {
      const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-dir-'))
      const newFile = path.join(tempDir, 'new-file.json')

      const result = validator.validateFilePermissions(newFile)

      expect(result.isValid).toBe(true)
      expect(result.directoryWritable).toBe(true)
      expect(result.fileExists).toBe(false)
      expect(result.resolvedPath).toBe(path.resolve(newFile))

      fs.rmSync(tempDir, { recursive: true })
    })

    it('should handle invalid paths', () => {
      const result = validator.validateFilePermissions('')

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle paths with null bytes', () => {
      const result = validator.validateFilePermissions('/path/with\0null')

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('validateConsoleCapabilities', () => {
    it('should validate console capabilities', () => {
      const result = validator.validateConsoleCapabilities()

      expect(result.isValid).toBe(true)
      expect(result.hasStdout).toBe(true)
      expect(result.hasStderr).toBe(true)
      expect(result.hasTTY).toBe(true)
      expect(result.environment).toBeDefined()
    })
  })

  describe('validateDualOutput', () => {
    it('should validate dual output capabilities', () => {
      const tempFile = createTempFile()
      const result = validator.validateDualOutput(tempFile)

      expect(result.isValid).toBe(true)
      expect(result.context).toBeDefined()

      cleanupTempFile(tempFile)
    })
  })
})

describe('FileOutputStrategy', () => {
  let tempFile: string

  beforeEach(() => {
    tempFile = createTempFile()
  })

  afterEach(() => {
    cleanupTempFile(tempFile)
  })

  it('should initialize and write to file', async () => {
    const strategy = new FileOutputStrategy({
      filePath: tempFile,
      formatting: { spaces: 2 }
    })

    expect(strategy.canExecute()).toBe(true)

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    // Verify file content
    const content = fs.readFileSync(tempFile, 'utf8')
    const parsed = JSON.parse(content)
    expect(parsed.summary.total).toBe(3)
    expect(parsed.failures).toHaveLength(1)
  })

  it('should handle directory creation', async () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-nested-'))
    const nestedFile = path.join(tempDir, 'nested', 'deep', 'output.json')

    const strategy = new FileOutputStrategy({
      filePath: nestedFile,
      options: { createDirectories: true }
    })

    expect(strategy.canExecute()).toBe(true)

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    // Verify nested directory was created
    expect(fs.existsSync(nestedFile)).toBe(true)

    fs.rmSync(tempDir, { recursive: true })
  })

  it('should handle backup creation', async () => {
    // Write initial content
    fs.writeFileSync(tempFile, '{"initial": "data"}')

    const strategy = new FileOutputStrategy({
      filePath: tempFile,
      options: { backupExisting: true }
    })

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    // Check for backup file
    const tempDir = path.dirname(tempFile)
    const files = fs.readdirSync(tempDir)
    const backupFile = files.find((f) => f.includes('.backup.'))

    expect(backupFile).toBeDefined()
  })

  it('should handle circular references', async () => {
    const circularData: any = { ...mockReporterOutput }
    circularData.circular = circularData // Create circular reference

    const strategy = new FileOutputStrategy({
      filePath: tempFile,
      formatting: { handleCircularRefs: true }
    })

    await strategy.initialize()
    await strategy.write(circularData)
    await strategy.close()

    const content = fs.readFileSync(tempFile, 'utf8')
    expect(content).toContain('[Circular Reference]')
  })

  it('should fail on invalid paths', () => {
    expect(() => {
      new FileOutputStrategy({ filePath: '' })
    }).toThrow('FilePath is required')
  })

  it('should handle write failures gracefully', () => {
    const strategy = new FileOutputStrategy({
      filePath: '/root/readonly/file.json' // Assuming this path is not writable
    })

    expect(strategy.canExecute()).toBe(false)
  })
})

describe('ConsoleOutputStrategy', () => {
  let mockStdout: any
  let mockStderr: any

  beforeEach(() => {
    mockStdout = {
      write: vi.fn((data, encoding, callback) => {
        if (callback) callback()
        return true
      }),
      writable: true
    }
    mockStderr = {
      write: vi.fn((data, encoding, callback) => {
        if (callback) callback()
        return true
      }),
      writable: true
    }

    vi.stubGlobal('process', {
      ...process,
      stdout: mockStdout,
      stderr: mockStderr
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should initialize and write to console', async () => {
    const strategy = new ConsoleOutputStrategy({
      stream: 'stdout',
      formatting: { spaces: 2 }
    })

    expect(strategy.canExecute()).toBe(true)

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    expect(mockStdout.write).toHaveBeenCalled()
    const writeCall = mockStdout.write.mock.calls[0]
    const output = writeCall[0]
    expect(output).toContain('"total": 3')
  })

  it('should write to stderr when configured', async () => {
    const strategy = new ConsoleOutputStrategy({
      stream: 'stderr',
      formatting: { spaces: 2 }
    })

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    expect(mockStderr.write).toHaveBeenCalled()
  })

  it('should handle silent mode', async () => {
    const strategy = new ConsoleOutputStrategy({
      options: { silent: true }
    })

    expect(strategy.canExecute()).toBe(true)
    expect(strategy.isSilent()).toBe(true)

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    expect(mockStdout.write).not.toHaveBeenCalled()
  })

  it('should include timestamp when configured', async () => {
    const strategy = new ConsoleOutputStrategy({
      options: { includeTimestamp: true }
    })

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    const writeCall = mockStdout.write.mock.calls[0]
    const output = writeCall[0]
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should add separators when configured', async () => {
    const strategy = new ConsoleOutputStrategy({
      options: { addSeparators: true }
    })

    await strategy.initialize()
    await strategy.write(mockReporterOutput)
    await strategy.close()

    const writeCall = mockStdout.write.mock.calls[0]
    const output = writeCall[0]
    expect(output).toContain('='.repeat(60))
  })

  it('should handle write stream errors', async () => {
    mockStdout.write = vi.fn((data, encoding, callback) => {
      callback(new Error('Write failed'))
      return false
    })

    const strategy = new ConsoleOutputStrategy()
    await strategy.initialize()

    await expect(strategy.write(mockReporterOutput)).rejects.toThrow('Failed to write to console')
  })
})

// Performance tests
describe('Performance Tests', () => {
  let tempFile: string

  beforeEach(() => {
    tempFile = createTempFile()
  })

  afterEach(() => {
    cleanupTempFile(tempFile)
  })

  it('should handle large output efficiently', async () => {
    // Create large mock data
    const largeOutput: LLMReporterOutput = {
      ...mockReporterOutput,
      failures: Array.from({ length: 1000 }, (_, i) => ({
        test: `test ${i}`,
        file: `/test/example${i}.test.ts`,
        startLine: i * 10,
        endLine: i * 10 + 5,
        error: {
          message: `Test ${i} failed with a very long error message that contains lots of details about what went wrong`,
          type: 'AssertionError',
          stack: `Error: Test ${i} failed\n    at test${i} (example${i}.test.ts:${i * 10}:1)`
        }
      }))
    }

    const startTime = Date.now()

    const strategy = new FileOutputStrategy({
      filePath: tempFile,
      formatting: { spaces: 0 } // Compact for performance
    })

    await strategy.initialize()
    await strategy.write(largeOutput)
    await strategy.close()

    const duration = Date.now() - startTime

    // Should complete in reasonable time (< 5 seconds)
    expect(duration).toBeLessThan(5000)

    // Verify file was written correctly
    const content = fs.readFileSync(tempFile, 'utf8')
    const parsed = JSON.parse(content)
    expect(parsed.failures).toHaveLength(1000)
  })
})
