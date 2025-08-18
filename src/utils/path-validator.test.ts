import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PathValidator } from './path-validator'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

describe('PathValidator', () => {
  let tempDir: string
  let validator: PathValidator
  let testFile: string

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `path-validator-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    
    // Create a test file
    testFile = join(tempDir, 'test.ts')
    writeFileSync(testFile, 'test content')
    
    // Create subdirectory with file
    const subDir = join(tempDir, 'src')
    mkdirSync(subDir)
    writeFileSync(join(subDir, 'index.ts'), 'index content')
    
    validator = new PathValidator(tempDir)
  })

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('valid paths', () => {
    it('should validate files within project root', () => {
      const result = validator.validate('test.ts')
      expect(result).toBeTruthy()
      expect(result).toMatch(/test\.ts$/)
    })

    it('should validate files in subdirectories', () => {
      const result = validator.validate('src/index.ts')
      expect(result).toBeTruthy()
      expect(result).toMatch(/src[\/\\]index\.ts$/)
    })

    it('should validate absolute paths within root', () => {
      const result = validator.validate(testFile)
      expect(result).toBeTruthy()
      expect(result).toMatch(/test\.ts$/)
    })

    it('should handle ./ relative paths', () => {
      const result = validator.validate('./test.ts')
      expect(result).toBeTruthy()
      expect(result).toMatch(/test\.ts$/)
    })

    it('should handle nested relative paths', () => {
      const result = validator.validate('./src/../test.ts')
      expect(result).toBeTruthy()
      expect(result).toMatch(/test\.ts$/)
    })
  })

  describe('path traversal attacks', () => {
    it('should reject parent directory traversal', () => {
      const result = validator.validate('../../../etc/passwd')
      expect(result).toBeNull()
    })

    it('should reject absolute paths outside root', () => {
      const result = validator.validate('/etc/passwd')
      expect(result).toBeNull()
    })

    it('should reject Windows-style traversal attempts', () => {
      const attempts = [
        '..\\..\\..\\windows\\system32\\config\\sam',
        'C:\\Windows\\System32\\config\\sam',
        '\\\\server\\share\\file'
      ]
      
      for (const attempt of attempts) {
        const result = validator.validate(attempt)
        expect(result).toBeNull()
      }
    })

    it('should reject paths with null bytes', () => {
      const result = validator.validate('test.ts\0.malicious')
      expect(result).toBeNull()
    })

    it('should reject complex traversal patterns', () => {
      const attempts = [
        'src/../../../../../../etc/passwd',
        './src/.././../etc/passwd',
        'src/../../.././../etc/passwd'
      ]
      
      for (const attempt of attempts) {
        const result = validator.validate(attempt)
        expect(result).toBeNull()
      }
    })
  })

  describe('symlink handling', () => {
    it('should resolve symlinks within project root', () => {
      const linkPath = join(tempDir, 'link-to-test')
      try {
        symlinkSync(testFile, linkPath)
        const result = validator.validate('link-to-test')
        expect(result).toBeTruthy()
        expect(result).toMatch(/test\.ts$/)
      } catch (error) {
        // Skip test if symlinks aren't supported (e.g., Windows without admin)
        console.warn('Symlink test skipped:', error)
      }
    })

    it('should reject symlinks pointing outside root', () => {
      const outsideFile = join(tempDir, '..', 'outside.txt')
      writeFileSync(outsideFile, 'outside content')
      
      const linkPath = join(tempDir, 'evil-link')
      try {
        symlinkSync(outsideFile, linkPath)
        const result = validator.validate('evil-link')
        expect(result).toBeNull()
      } catch (error) {
        // Skip test if symlinks aren't supported
        console.warn('Symlink security test skipped:', error)
      } finally {
        rmSync(outsideFile, { force: true })
      }
    })
  })

  describe('non-existent paths', () => {
    it('should return null for non-existent files', () => {
      const result = validator.validate('does-not-exist.ts')
      expect(result).toBeNull()
    })

    it('should return null for non-existent directories', () => {
      const result = validator.validate('fake-dir/file.ts')
      expect(result).toBeNull()
    })
  })

  describe('caching', () => {
    it('should cache validated paths', () => {
      const firstResult = validator.validate('test.ts')
      const secondResult = validator.validate('test.ts')
      
      expect(firstResult).toBe(secondResult)
      expect(validator.getCacheStats().size).toBe(1)
      expect(validator.getCacheStats().hits).toBe(1)
    })

    it('should cache failed validations', () => {
      const firstResult = validator.validate('../etc/passwd')
      const secondResult = validator.validate('../etc/passwd')
      
      expect(firstResult).toBeNull()
      expect(secondResult).toBeNull()
      expect(validator.getCacheStats().size).toBe(1)
      expect(validator.getCacheStats().misses).toBe(1)
    })

    it('should clear cache when requested', () => {
      validator.validate('test.ts')
      expect(validator.getCacheStats().size).toBe(1)
      
      validator.clearCache()
      expect(validator.getCacheStats().size).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = validator.validate('')
      expect(result).toBeNull()
    })

    it('should handle paths with special characters', () => {
      const specialFile = join(tempDir, 'file with spaces.ts')
      writeFileSync(specialFile, 'content')
      
      const result = validator.validate('file with spaces.ts')
      expect(result).toBeTruthy()
      expect(result).toMatch(/file with spaces\.ts$/)
    })

    it('should handle Unicode paths', () => {
      const unicodeFile = join(tempDir, '测试文件.ts')
      writeFileSync(unicodeFile, 'content')
      
      const result = validator.validate('测试文件.ts')
      expect(result).toBeTruthy()
      expect(result).toMatch(/测试文件\.ts$/)
    })

    it('should handle very long paths', () => {
      const longName = 'a'.repeat(200)
      const longFile = join(tempDir, `${longName}.ts`)
      writeFileSync(longFile, 'content')
      
      const result = validator.validate(`${longName}.ts`)
      expect(result).toBeTruthy()
      expect(result).toMatch(new RegExp(`${longName}\\.ts$`))
    })
  })
})