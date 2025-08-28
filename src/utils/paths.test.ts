import { describe, it, expect } from 'vitest'
import { normalizeFileUrlOrPath, toRepoRelative, classify, processFilePath } from './paths.js'

describe('Path Utilities', () => {
  describe('normalizeFileUrlOrPath', () => {
    it('should handle regular file paths', () => {
      expect(normalizeFileUrlOrPath('/home/user/project/src/test.ts')).toBe(
        '/home/user/project/src/test.ts'
      )
      expect(normalizeFileUrlOrPath('src/test.ts')).toBe('src/test.ts')
    })

    it('should handle Unix file:// URLs', () => {
      expect(normalizeFileUrlOrPath('file:///home/user/project/src/test.ts')).toBe(
        '/home/user/project/src/test.ts'
      )
    })

    it('should handle Windows file:// URLs', () => {
      expect(normalizeFileUrlOrPath('file:///C:/Users/project/src/test.ts')).toBe(
        'C:/Users/project/src/test.ts'
      )
      expect(normalizeFileUrlOrPath('file://C:/Users/project/src/test.ts')).toBe(
        'C:/Users/project/src/test.ts'
      )
    })

    it('should handle empty input', () => {
      expect(normalizeFileUrlOrPath('')).toBe('')
    })

    it('should normalize paths with double slashes', () => {
      expect(normalizeFileUrlOrPath('/home//user///project/src/test.ts')).toBe(
        '/home/user/project/src/test.ts'
      )
    })
  })

  describe('toRepoRelative', () => {
    it('should convert absolute paths under root to relative', () => {
      expect(toRepoRelative('/home/project/src/test.ts', '/home/project')).toBe('src/test.ts')
      expect(toRepoRelative('/home/project/test.ts', '/home/project')).toBe('test.ts')
      expect(toRepoRelative('/home/project/', '/home/project')).toBe('.')
    })

    it('should handle nested paths correctly', () => {
      expect(toRepoRelative('/home/project/src/components/Button.ts', '/home/project')).toBe(
        'src/components/Button.ts'
      )
      expect(toRepoRelative('/home/project/tests/unit/math.test.ts', '/home/project')).toBe(
        'tests/unit/math.test.ts'
      )
    })

    it('should return original path if not under root', () => {
      expect(toRepoRelative('/tmp/external.ts', '/home/project')).toBe('/tmp/external.ts')
      expect(toRepoRelative('/other/project/file.ts', '/home/project')).toBe(
        '/other/project/file.ts'
      )
    })

    it('should handle empty or invalid input', () => {
      expect(toRepoRelative('', '/home/project')).toBe('')
      expect(toRepoRelative('/home/project/test.ts', '')).toBe('/home/project/test.ts')
    })

    it.skipIf(process.platform !== 'win32')('should handle Windows paths', () => {
      expect(toRepoRelative('C:\\Users\\project\\src\\test.ts', 'C:\\Users\\project')).toBe(
        'src/test.ts'
      )
      expect(toRepoRelative('C:\\Users\\project\\tests\\math.test.ts', 'C:\\Users\\project')).toBe(
        'tests/math.test.ts'
      )
    })

    it.skipIf(process.platform !== 'win32')('should ensure forward slashes in output', () => {
      expect(toRepoRelative('C:\\Users\\project\\src\\nested\\file.ts', 'C:\\Users\\project')).toBe(
        'src/nested/file.ts'
      )
    })
  })

  describe('classify', () => {
    it('should classify project files correctly', () => {
      const result = classify('/home/project/src/test.ts', '/home/project')
      expect(result.inProject).toBe(true)
      expect(result.inNodeModules).toBe(false)
    })

    it('should detect node_modules', () => {
      const result = classify('/home/project/node_modules/lib/index.js', '/home/project')
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(true)
    })

    it('should handle external files', () => {
      const result = classify('/tmp/external.ts', '/home/project')
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(false)
    })

    it('should handle node_modules outside project', () => {
      const result = classify('/other/node_modules/lib/index.js', '/home/project')
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(true)
    })

    it('should handle empty input', () => {
      const result = classify('', '/home/project')
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(false)
    })

    it.skipIf(process.platform !== 'win32')('should handle Windows paths with node_modules', () => {
      const result = classify(
        'C:\\Users\\project\\node_modules\\lib\\index.js',
        'C:\\Users\\project'
      )
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(true)
    })
  })

  describe('processFilePath', () => {
    it('should process absolute paths correctly', () => {
      const result = processFilePath('/home/project/src/test.ts', '/home/project', false)
      expect(result.fileRelative).toBe('src/test.ts')
      expect(result.fileAbsolute).toBeUndefined()
      expect(result.inProject).toBe(true)
      expect(result.inNodeModules).toBe(false)
    })

    it('should include absolute path when configured', () => {
      const result = processFilePath('/home/project/src/test.ts', '/home/project', true)
      expect(result.fileRelative).toBe('src/test.ts')
      expect(result.fileAbsolute).toBe('/home/project/src/test.ts')
      expect(result.inProject).toBe(true)
      expect(result.inNodeModules).toBe(false)
    })

    it('should handle file:// URLs', () => {
      const result = processFilePath('file:///home/project/src/test.ts', '/home/project', false)
      expect(result.fileRelative).toBe('src/test.ts')
      expect(result.inProject).toBe(true)
      expect(result.inNodeModules).toBe(false)
    })

    it('should handle node_modules paths', () => {
      const result = processFilePath(
        '/home/project/node_modules/lib/index.js',
        '/home/project',
        false
      )
      expect(result.fileRelative).toBe('node_modules/lib/index.js')
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(true)
    })

    it('should handle external paths', () => {
      const result = processFilePath('/tmp/external.ts', '/home/project', false)
      expect(result.fileRelative).toBe('/tmp/external.ts')
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(false)
    })

    it('should handle relative paths as-is', () => {
      const result = processFilePath('src/test.ts', '/home/project', false)
      expect(result.fileRelative).toBe('src/test.ts')
      expect(result.fileAbsolute).toBeUndefined()
      expect(result.inProject).toBe(false) // Can't determine without absolute path
      expect(result.inNodeModules).toBe(false)
    })

    it('should handle undefined input', () => {
      const result = processFilePath(undefined, '/home/project', false)
      expect(result.fileRelative).toBe('')
      expect(result.fileAbsolute).toBeUndefined()
      expect(result.inProject).toBe(false)
      expect(result.inNodeModules).toBe(false)
    })

    it.skipIf(process.platform !== 'win32')(
      'should handle Windows file URLs with absolute paths',
      () => {
        const result = processFilePath(
          'file:///C:/Users/project/src/test.ts',
          'C:\\Users\\project',
          true
        )
        expect(result.fileRelative).toBe('src/test.ts')
        expect(result.fileAbsolute).toBe('C:/Users/project/src/test.ts')
        expect(result.inProject).toBe(true)
        expect(result.inNodeModules).toBe(false)
      }
    )
  })
})
