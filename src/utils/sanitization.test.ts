import { describe, it, expect } from 'vitest'
import {
  escapeJsonString,
  escapeJsonArray,
  validateFilePath,
  createSafeObject,
  validateFilePathDiagnostics
} from './sanitization.js'

describe('Sanitization Utilities', () => {
  describe('escapeJsonString', () => {
    it('should escape JSON special characters', () => {
      expect(escapeJsonString('test "quotes"')).toBe('test \\"quotes\\"')
      expect(escapeJsonString('back\\slash')).toBe('back\\\\slash')
      expect(escapeJsonString('new\nline')).toBe('new\\nline')
      expect(escapeJsonString('tab\ttab')).toBe('tab\\ttab')
      expect(escapeJsonString('return\rreturn')).toBe('return\\rreturn')
    })

    it('should escape control characters as Unicode', () => {
      const input = 'null\x00byte'
      const output = escapeJsonString(input)
      expect(output).toBe('null\\u0000byte')
    })

    it('should handle form feed and backspace', () => {
      expect(escapeJsonString('form\ffeed')).toBe('form\\ffeed')
      expect(escapeJsonString('back\bspace')).toBe('back\\bspace')
    })

    it('should not escape HTML characters', () => {
      // HTML characters are valid in JSON strings
      expect(escapeJsonString('<script>alert()</script>')).toBe('<script>alert()</script>')
      expect(escapeJsonString("&<>'")).toBe("&<>'")
    })

    it('should handle non-string inputs', () => {
      expect(escapeJsonString(null as any)).toBe('')
      expect(escapeJsonString(undefined as any)).toBe('')
      expect(escapeJsonString(123 as any)).toBe('')
    })

    it('should handle empty strings', () => {
      expect(escapeJsonString('')).toBe('')
    })

    it('should preserve safe characters', () => {
      const safeText = 'Hello World 123 ABC abc!@#$%^&*()'
      const escaped = escapeJsonString(safeText)
      expect(escaped).toBe(safeText)
    })
  })

  describe('escapeJsonArray', () => {
    it('should escape array of strings', () => {
      const strings = ['test "quotes"', 'new\nline', 'normal string']
      const result = escapeJsonArray(strings)
      expect(result[0]).toBe('test \\"quotes\\"')
      expect(result[1]).toBe('new\\nline')
      expect(result[2]).toBe('normal string')
    })

    it('should handle empty array', () => {
      expect(escapeJsonArray([])).toEqual([])
    })
  })

  describe('createSafeObject', () => {
    it('should filter out prototype pollution keys', () => {
      const malicious = {
        normal: 'value',
        __proto__: { evil: true },
        constructor: { evil: true },
        prototype: { evil: true }
      }

      const safe = createSafeObject(malicious)
      expect(safe.normal).toBe('value')
      expect(Object.prototype.hasOwnProperty.call(safe, '__proto__')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(safe, 'constructor')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(safe, 'prototype')).toBe(false)
    })

    it('should handle nested objects', () => {
      const nested = {
        level1: {
          level2: {
            value: 'deep',
            __proto__: { evil: true }
          }
        }
      }

      const safe = createSafeObject(nested)
      expect((safe as any).level1.level2.value).toBe('deep')
      expect(Object.prototype.hasOwnProperty.call((safe as any).level1.level2, '__proto__')).toBe(
        false
      )
    })

    it('should handle arrays', () => {
      const withArray = {
        items: [
          { value: 1, __proto__: {} },
          { value: 2, constructor: {} }
        ] as any
      }

      const safe = createSafeObject(withArray)
      expect(Array.isArray((safe as any).items)).toBe(true)
      expect((safe as any).items[0].value).toBe(1)
      expect(Object.prototype.hasOwnProperty.call((safe as any).items[0], '__proto__')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call((safe as any).items[1], 'constructor')).toBe(
        false
      )
    })

    it('should handle circular references', () => {
      const circular: any = { value: 'test' }
      circular.self = circular

      const safe = createSafeObject(circular)
      expect(safe.value).toBe('test')
      expect(safe.self).toEqual({}) // Circular reference broken
    })

    it('should throw on excessive nesting', () => {
      const createDeeplyNested = (depth: number): any => {
        if (depth === 0) return { value: 'bottom' }
        return { next: createDeeplyNested(depth - 1) }
      }

      const tooDeep = createDeeplyNested(51)
      expect(() => createSafeObject(tooDeep)).toThrow('Maximum object nesting depth exceeded')
    })
  })

  describe('validateFilePath Security Tests', () => {
    describe('Path Traversal Attack Prevention', () => {
      it('should reject simple .. traversal attempts', () => {
        expect(validateFilePath('../etc/passwd')).toBe(false)
        expect(validateFilePath('../../etc/passwd')).toBe(false)
        expect(validateFilePath('test/../../../etc/passwd')).toBe(false)
      })

      it('should reject .. in any part of the path', () => {
        expect(validateFilePath('/safe/path/../../../etc/passwd')).toBe(false)
        expect(validateFilePath('C:\\safe\\..\\..\\windows\\system32')).toBe(false)
        expect(validateFilePath('/usr/local/../../../root/.ssh/id_rsa')).toBe(false)
      })

      it('should reject paths that normalize to contain ..', () => {
        // These might not have .. initially but could after normalization
        const maliciousPath = '/safe/.//../etc/passwd'
        expect(validateFilePath(maliciousPath)).toBe(false)
      })

      it('should reject URL-encoded traversal patterns', () => {
        expect(validateFilePath('%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toBe(false)
        expect(validateFilePath('test%2f..%2f..%2fetc%2fpasswd')).toBe(false)
        expect(validateFilePath('%2e%2e%2e%2e%2fetc%2fpasswd')).toBe(false)
      })

      it('should reject absolute paths that resolve differently', () => {
        if (process.platform === 'win32') {
          // On Windows, test absolute path resolution
          const suspiciousPath = 'C:\\safe\\path\\..\\..\\..\\windows\\system32'
          expect(validateFilePath(suspiciousPath)).toBe(false)
        } else {
          // On Unix-like systems
          const suspiciousPath = '/usr/local/../../etc/passwd'
          expect(validateFilePath(suspiciousPath)).toBe(false)
        }
      })

      it('should handle complex traversal patterns', () => {
        expect(validateFilePath('./../etc/passwd')).toBe(false)
        expect(validateFilePath('./../../etc/passwd')).toBe(false)
        expect(validateFilePath('.../.../etc/passwd')).toBe(false)
        expect(validateFilePath('..;/etc/passwd')).toBe(false)
      })
    })

    describe('Null Byte Injection Prevention', () => {
      it('should reject paths with null bytes', () => {
        expect(validateFilePath('test.txt\0.jpg')).toBe(false)
        expect(validateFilePath('/etc/passwd\0')).toBe(false)
        expect(validateFilePath('\0/etc/passwd')).toBe(false)
      })

      it('should reject URL-encoded null bytes', () => {
        expect(validateFilePath('test.txt%00.jpg')).toBe(false)
        expect(validateFilePath('%00/etc/passwd')).toBe(false)
      })
    })

    describe('Protocol Injection Prevention', () => {
      it('should reject javascript: protocol', () => {
        expect(validateFilePath('javascript:alert(1)')).toBe(false)
        expect(validateFilePath('JavaScript:alert(1)')).toBe(false)
        expect(validateFilePath('test/javascript:alert(1)')).toBe(false)
      })

      it('should reject data: protocol', () => {
        expect(validateFilePath('data:text/html,<script>alert(1)</script>')).toBe(false)
        expect(validateFilePath('DATA:text/html,test')).toBe(false)
      })

      it('should reject file:// protocol', () => {
        expect(validateFilePath('file:///etc/passwd')).toBe(false)
        expect(validateFilePath('FILE://c:/windows/system32')).toBe(false)
      })
    })

    describe('Platform-Specific Security', () => {
      if (process.platform === 'win32') {
        it('should reject Windows ADS (Alternative Data Streams)', () => {
          // Basic ADS patterns
          expect(validateFilePath('test.txt:hidden')).toBe(false)
          expect(validateFilePath('file.txt:$DATA')).toBe(false)
          expect(validateFilePath('test:stream:$DATA')).toBe(false)

          // Critical: ADS in paths with valid drive letters
          expect(validateFilePath('C:\\test.txt:hidden')).toBe(false)
          expect(validateFilePath('C:\\folder\\file.txt:stream:$DATA')).toBe(false)
          expect(validateFilePath('D:\\path\\to\\file.exe:alternate')).toBe(false)
          expect(validateFilePath('C:\\Users\\test\\doc.txt:malicious:$DATA')).toBe(false)

          // Multiple colons attack patterns
          expect(validateFilePath('C:\\file:stream1:stream2')).toBe(false)
          expect(validateFilePath('D:\\app\\test:data:more')).toBe(false)

          // Edge cases with colons
          expect(validateFilePath('test:data')).toBe(false) // No drive letter
          expect(validateFilePath('C:test.txt')).toBe(false) // Missing backslash
        })

        it('should allow valid Windows drive paths', () => {
          expect(validateFilePath('C:\\test\\file.txt')).toBe(true)
          expect(validateFilePath('D:\\projects\\app.js')).toBe(true)
          expect(validateFilePath('C:\\')).toBe(true) // Root drive
          const trailingPath = 'E:\\folder\\'
          const diagnostics = validateFilePathDiagnostics(trailingPath)
          console.log('validateFilePath diagnostics for trailing path', diagnostics)
          expect(diagnostics.valid).toBe(true)
          expect(validateFilePath(trailingPath)).toBe(true) // Folder with trailing slash
        })

        it('should reject extended-length path prefixes', () => {
          expect(validateFilePath('\\\\?\\C:\\temp\\file.txt')).toBe(false)
          expect(validateFilePath('\\\\?\\UNC\\server\\share\\file.txt')).toBe(false)
        })

        it('should reject Windows reserved device names', () => {
          expect(validateFilePath('CON')).toBe(false)
          expect(validateFilePath('PRN.txt')).toBe(false)
          expect(validateFilePath('AUX.log')).toBe(false)
          expect(validateFilePath('NUL')).toBe(false)
          expect(validateFilePath('COM1')).toBe(false)
          expect(validateFilePath('LPT1.txt')).toBe(false)
        })

        it('should reject paths exceeding Windows length limit', () => {
          const longPath = 'C:\\' + 'a'.repeat(260)
          expect(validateFilePath(longPath)).toBe(false)
        })
      } else {
        it('should reject extremely long Unix paths', () => {
          const longPath = '/' + 'a'.repeat(4097)
          expect(validateFilePath(longPath)).toBe(false)
        })
      }
    })

    describe('Valid Path Acceptance', () => {
      it('should accept normal relative paths', () => {
        expect(validateFilePath('test.txt')).toBe(true)
        expect(validateFilePath('src/index.ts')).toBe(true)
        expect(validateFilePath('path/to/file.js')).toBe(true)
      })

      it('should accept normal absolute paths', () => {
        if (process.platform === 'win32') {
          expect(validateFilePath('C:\\Users\\test\\file.txt')).toBe(true)
          expect(validateFilePath('D:\\Projects\\app\\src\\index.js')).toBe(true)
        } else {
          expect(validateFilePath('/home/user/file.txt')).toBe(true)
          expect(validateFilePath('/usr/local/bin/app')).toBe(true)
        }
      })

      it('should accept paths with dots that are not traversal', () => {
        expect(validateFilePath('file.test.ts')).toBe(true)
        expect(validateFilePath('./current/dir/file.txt')).toBe(true)
        expect(validateFilePath('test.d.ts')).toBe(true)
        expect(validateFilePath('version.1.2.3.txt')).toBe(true)
      })

      it('should accept paths with special characters', () => {
        expect(validateFilePath('file-name_123.txt')).toBe(true)
        expect(validateFilePath('path/to/file (1).txt')).toBe(true)
        expect(validateFilePath('test@file.txt')).toBe(true)
      })
    })

    describe('Edge Cases', () => {
      it('should reject empty strings', () => {
        expect(validateFilePath('')).toBe(false)
      })

      it('should reject non-string inputs', () => {
        expect(validateFilePath(null as any)).toBe(false)
        expect(validateFilePath(undefined as any)).toBe(false)
        expect(validateFilePath(123 as any)).toBe(false)
        expect(validateFilePath({} as any)).toBe(false)
        expect(validateFilePath([] as any)).toBe(false)
      })

      it('should handle Unicode in paths correctly', () => {
        expect(validateFilePath('文件.txt')).toBe(true)
        expect(validateFilePath('файл.txt')).toBe(true)
        expect(validateFilePath('αρχείο.txt')).toBe(true)
      })

      it('should reject mixed encoding attacks', () => {
        expect(validateFilePath('test\u002e\u002e/etc/passwd')).toBe(false)
        expect(validateFilePath('test\x2e\x2e/etc/passwd')).toBe(false)
      })
    })

    describe('Regression Tests for Fixed Vulnerability', () => {
      it('should reject paths where normalization introduces traversal', () => {
        if (process.platform === 'win32') {
          // This is the specific vulnerability case that was fixed
          const maliciousPath = 'C:\\safe\\..\\..\\windows\\system32\\config'
          expect(validateFilePath(maliciousPath)).toBe(false)

          // Additional Windows-specific cases
          expect(validateFilePath('C:\\app\\..\\..\\..\\windows\\system32')).toBe(false)
          expect(validateFilePath('D:\\test\\..\\..\\..\\..\\windows')).toBe(false)
        } else {
          // Unix-like regression tests
          expect(validateFilePath('/app/../../../etc/passwd')).toBe(false)
          expect(validateFilePath('/usr/local/../../../root/.ssh')).toBe(false)
        }
      })

      it('should properly validate absolute paths after resolution', () => {
        // Create paths that look safe but aren't
        const testCases = [
          '/safe/../../etc/passwd',
          '/usr/../../../root',
          '/home/user/../../../etc/shadow'
        ]

        if (process.platform === 'win32') {
          testCases.push('C:\\safe\\..\\..\\windows', 'D:\\app\\..\\..\\..\\system32')
        }

        testCases.forEach((testPath) => {
          expect(validateFilePath(testPath)).toBe(false)
        })
      })
    })
  })
})
