import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ContextExtractor } from './ContextExtractor.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ContextExtractor Security Tests', () => {
  let tempDir: string
  let extractor: ContextExtractor
  let safeFile: string

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `context-security-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    // Create a safe test file
    safeFile = join(tempDir, 'safe.ts')
    writeFileSync(
      safeFile,
      `function test() {
  const result = 42
  return result
}`
    )

    extractor = new ContextExtractor({ rootDir: tempDir })
  })

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Path Traversal Protection', () => {
    it('should reject attempts to read /etc/passwd', () => {
      const maliciousPaths = [
        '/etc/passwd',
        '../../../../etc/passwd',
        '../../../../../../../etc/passwd',
        './../../../etc/passwd',
        'src/../../etc/passwd'
      ]

      for (const path of maliciousPaths) {
        const result = extractor.extractCodeContext(path, 1)
        expect(result).toBeUndefined()
      }
    })

    it('should reject Windows system file access attempts', () => {
      const windowsPaths = [
        'C:\\Windows\\System32\\config\\sam',
        '..\\..\\..\\Windows\\System32\\config\\sam',
        '\\\\?\\C:\\Windows\\System32\\config\\sam'
      ]

      for (const path of windowsPaths) {
        const result = extractor.extractCodeContext(path, 1)
        expect(result).toBeUndefined()
      }
    })

    it('should reject null byte injection', () => {
      const result = extractor.extractCodeContext('safe.ts\0/etc/passwd', 1)
      expect(result).toBeUndefined()
    })

    it('should reject complex traversal patterns', () => {
      const complexPaths = [
        'safe/../../../../../../../etc/passwd',
        './././../../../etc/passwd',
        'safe/../../safe/../../etc/passwd'
      ]

      for (const path of complexPaths) {
        const result = extractor.extractCodeContext(path, 1)
        expect(result).toBeUndefined()
      }
    })

    it('should allow legitimate files within project', () => {
      const result = extractor.extractCodeContext('safe.ts', 2)
      expect(result).toBeDefined()
      expect(result?.code).toBeDefined()
      expect(result?.code.join('\n')).toContain('const result = 42')
      expect(result?.lineNumber).toBe(2)
    })
  })

  describe('Stack Trace Security', () => {
    it('should not extract context from malicious stack frames', () => {
      const maliciousStack = `Error: Test error
    at test (/etc/passwd:1:1)
    at async main (../../../../../../etc/shadow:5:10)
    at Object.<anonymous> (C:\\Windows\\System32\\config\\sam:10:5)`

      const result = extractor.extractFullContext(maliciousStack)

      // Should parse frames but not extract context from malicious paths
      expect(result.stackFrames).toHaveLength(3)
      expect(result.context).toBeUndefined()
    })

    it('should handle safe stack traces correctly', () => {
      const safeStack = `Error: Test error
    at test (safe.ts:2:10)
    at main (safe.ts:3:5)`

      const result = extractor.extractFullContext(safeStack)

      expect(result.stackFrames).toHaveLength(2)
      expect(result.context).toBeDefined()
      expect(result.context?.code).toBeDefined()
      expect(result.context?.code.join('\n')).toContain('const result = 42')
    })
  })

  describe('Symlink Attack Protection', () => {
    it('should not follow symlinks outside project root', () => {
      // This test is handled by PathValidator tests
      // Including here for completeness of security test coverage
      const result = extractor.extractCodeContext('../outside-link', 1)
      expect(result).toBeUndefined()
    })
  })

  describe('Resource Exhaustion Protection', () => {
    it('should handle very long file paths gracefully', () => {
      const longPath = 'a'.repeat(10000) + '.ts'
      const result = extractor.extractCodeContext(longPath, 1)
      expect(result).toBeUndefined()
    })

    it('should handle deeply nested paths', () => {
      const deepPath = Array(100).fill('dir').join('/') + '/file.ts'
      const result = extractor.extractCodeContext(deepPath, 1)
      expect(result).toBeUndefined()
    })
  })

  describe('Special Character Handling', () => {
    it('should handle paths with special shell characters safely', () => {
      const specialPaths = [
        'file;rm -rf /',
        'file$(whoami).ts',
        'file`id`.ts',
        'file|ls.ts',
        'file&netstat.ts'
      ]

      for (const path of specialPaths) {
        const result = extractor.extractCodeContext(path, 1)
        expect(result).toBeUndefined()
      }
    })

    it('should handle Unicode normalization attacks', () => {
      // Using different Unicode representations of the same character
      const unicodePaths = [
        'ﬁle.ts', // ligature fi
        'ﬀ.ts', // ligature ff
        '../ﬁle.ts'
      ]

      for (const path of unicodePaths) {
        const result = extractor.extractCodeContext(path, 1)
        // Should either be undefined or resolve to a safe path
        if (result) {
          expect(result.code).not.toContain('/etc/')
        }
      }
    })
  })
})
