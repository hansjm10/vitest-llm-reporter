import { describe, it, expect } from 'vitest'
import { hasProperty, extractStringProperty, extractNumberProperty } from './type-guards.js'

describe('Type Guards - Safe Property Access', () => {
  describe('hasProperty', () => {
    it('should return true for objects with the property', () => {
      const obj = { name: 'test', value: 123 }
      expect(hasProperty(obj, 'name')).toBe(true)
      expect(hasProperty(obj, 'value')).toBe(true)
    })

    it('should return false for objects without the property', () => {
      const obj = { name: 'test' }
      expect(hasProperty(obj, 'missing')).toBe(false)
    })

    it('should return false for null and undefined', () => {
      expect(hasProperty(null, 'any')).toBe(false)
      expect(hasProperty(undefined, 'any')).toBe(false)
    })

    it('should return false for non-objects', () => {
      expect(hasProperty('string', 'any')).toBe(false)
      expect(hasProperty(123, 'any')).toBe(false)
      expect(hasProperty(true, 'any')).toBe(false)
    })

    it('should return false for arrays', () => {
      expect(hasProperty(['a', 'b'], 'length')).toBe(false)
      expect(hasProperty([], '0')).toBe(false)
    })

    it('should handle null prototype objects safely', () => {
      const obj = Object.create(null)
      obj.name = 'test'
      expect(hasProperty(obj, 'name')).toBe(true)
      expect(hasProperty(obj, 'missing')).toBe(false)
    })

    it('should handle Proxy objects with throwing has trap', () => {
      const proxy = new Proxy(
        {},
        {
          has() {
            throw new Error('Proxy has trap error')
          }
        }
      )
      expect(hasProperty(proxy, 'any')).toBe(false)
    })

    it('should handle Proxy objects with normal has trap', () => {
      const proxy = new Proxy(
        { name: 'test' },
        {
          has(target, prop) {
            return prop in target
          }
        }
      )
      expect(hasProperty(proxy, 'name')).toBe(true)
      expect(hasProperty(proxy, 'missing')).toBe(false)
    })
  })

  describe('extractStringProperty', () => {
    it('should extract string properties from normal objects', () => {
      const obj = {
        message: 'error message',
        code: 'ERR_001',
        value: 123
      }
      expect(extractStringProperty(obj, ['message'])).toBe('error message')
      expect(extractStringProperty(obj, ['code'])).toBe('ERR_001')
      expect(extractStringProperty(obj, ['missing', 'message'])).toBe('error message')
    })

    it('should return undefined for non-string values', () => {
      const obj = {
        number: 123,
        bool: true,
        nil: null,
        undef: undefined,
        empty: ''
      }
      expect(extractStringProperty(obj, ['number'])).toBeUndefined()
      expect(extractStringProperty(obj, ['bool'])).toBeUndefined()
      expect(extractStringProperty(obj, ['nil'])).toBeUndefined()
      expect(extractStringProperty(obj, ['undef'])).toBeUndefined()
      expect(extractStringProperty(obj, ['empty'])).toBeUndefined() // Empty strings are ignored
    })

    it('should try multiple candidate keys in order', () => {
      const obj = {
        fileName: 'test.js',
        message: 'error'
      }
      expect(extractStringProperty(obj, ['file', 'fileName', 'filename'])).toBe('test.js')
      expect(extractStringProperty(obj, ['msg', 'message'])).toBe('error')
    })

    it('should handle null prototype objects', () => {
      const obj = Object.create(null)
      obj.message = 'test message'
      obj.code = 'CODE_001'

      expect(extractStringProperty(obj, ['message'])).toBe('test message')
      expect(extractStringProperty(obj, ['code'])).toBe('CODE_001')
      expect(extractStringProperty(obj, ['missing'])).toBeUndefined()
    })

    it('should handle objects with throwing getters', () => {
      const obj = {
        get message() {
          throw new Error('Getter error')
        },
        safeProperty: 'safe value'
      }

      expect(extractStringProperty(obj, ['message'])).toBeUndefined()
      expect(extractStringProperty(obj, ['safeProperty'])).toBe('safe value')
    })

    it('should handle Proxy objects with throwing get trap', () => {
      const proxy = new Proxy(
        { message: 'test' },
        {
          get() {
            throw new Error('Get trap error')
          },
          has() {
            return true
          }
        }
      )

      expect(extractStringProperty(proxy, ['message'])).toBeUndefined()
    })

    it('should handle Proxy objects with throwing has trap', () => {
      const proxy = new Proxy(
        { message: 'test' },
        {
          has() {
            throw new Error('Has trap error')
          }
        }
      )

      // hasOwnProperty bypasses the has trap, so this should still work
      expect(extractStringProperty(proxy, ['message'])).toBe('test')
    })

    it('should handle frozen and sealed objects', () => {
      const frozen = Object.freeze({ message: 'frozen' })
      const sealed = Object.seal({ message: 'sealed' })

      expect(extractStringProperty(frozen, ['message'])).toBe('frozen')
      expect(extractStringProperty(sealed, ['message'])).toBe('sealed')
    })

    it('should return undefined for invalid inputs', () => {
      expect(extractStringProperty(null, ['any'])).toBeUndefined()
      expect(extractStringProperty(undefined, ['any'])).toBeUndefined()
      expect(extractStringProperty('string', ['any'])).toBeUndefined()
      expect(extractStringProperty(123, ['any'])).toBeUndefined()
      expect(extractStringProperty(['array'], ['0'])).toBeUndefined()
    })
  })

  describe('extractNumberProperty', () => {
    it('should extract number properties from normal objects', () => {
      const obj = {
        line: 42,
        column: 10,
        count: 0,
        negative: -5
      }
      expect(extractNumberProperty(obj, ['line'])).toBe(42)
      expect(extractNumberProperty(obj, ['column'])).toBe(10)
      expect(extractNumberProperty(obj, ['count'])).toBe(0)
      expect(extractNumberProperty(obj, ['negative'])).toBe(-5)
    })

    it('should parse string numbers', () => {
      const obj = {
        line: '42',
        column: '10',
        mixed: 'abc123' // Should not parse
      }
      expect(extractNumberProperty(obj, ['line'])).toBe(42)
      expect(extractNumberProperty(obj, ['column'])).toBe(10)
      expect(extractNumberProperty(obj, ['mixed'])).toBeUndefined()
    })

    it('should apply validator function when provided', () => {
      const obj = {
        positive: 42,
        zero: 0,
        negative: -5
      }
      const isPositive = (n: number) => n > 0

      expect(extractNumberProperty(obj, ['positive'], isPositive)).toBe(42)
      expect(extractNumberProperty(obj, ['zero'], isPositive)).toBeUndefined()
      expect(extractNumberProperty(obj, ['negative'], isPositive)).toBeUndefined()
    })

    it('should try multiple candidate keys in order', () => {
      const obj = {
        lineNumber: 42,
        col: 10
      }
      expect(extractNumberProperty(obj, ['line', 'lineNumber', 'lineno'])).toBe(42)
      expect(extractNumberProperty(obj, ['column', 'col'])).toBe(10)
    })

    it('should handle null prototype objects', () => {
      const obj = Object.create(null)
      obj.line = 42
      obj.column = '10'

      expect(extractNumberProperty(obj, ['line'])).toBe(42)
      expect(extractNumberProperty(obj, ['column'])).toBe(10)
      expect(extractNumberProperty(obj, ['missing'])).toBeUndefined()
    })

    it('should handle objects with throwing getters', () => {
      const obj = {
        get line() {
          throw new Error('Getter error')
        },
        safeNumber: 42
      }

      expect(extractNumberProperty(obj, ['line'])).toBeUndefined()
      expect(extractNumberProperty(obj, ['safeNumber'])).toBe(42)
    })

    it('should handle Proxy objects with throwing traps', () => {
      const proxyGet = new Proxy(
        { line: 42 },
        {
          get() {
            throw new Error('Get trap error')
          },
          has() {
            return true
          }
        }
      )

      const proxyHas = new Proxy(
        { line: 42 },
        {
          has() {
            throw new Error('Has trap error')
          }
        }
      )

      expect(extractNumberProperty(proxyGet, ['line'])).toBeUndefined()
      // hasOwnProperty bypasses the has trap, so this should still work
      expect(extractNumberProperty(proxyHas, ['line'])).toBe(42)
    })

    it('should return undefined for non-number values', () => {
      const obj = {
        string: 'not a number',
        bool: true,
        nil: null,
        undef: undefined,
        object: { nested: 123 }
      }
      expect(extractNumberProperty(obj, ['string'])).toBeUndefined()
      expect(extractNumberProperty(obj, ['bool'])).toBeUndefined()
      expect(extractNumberProperty(obj, ['nil'])).toBeUndefined()
      expect(extractNumberProperty(obj, ['undef'])).toBeUndefined()
      expect(extractNumberProperty(obj, ['object'])).toBeUndefined()
    })

    it('should return undefined for invalid inputs', () => {
      expect(extractNumberProperty(null, ['any'])).toBeUndefined()
      expect(extractNumberProperty(undefined, ['any'])).toBeUndefined()
      expect(extractNumberProperty('string', ['any'])).toBeUndefined()
      expect(extractNumberProperty(123, ['any'])).toBeUndefined()
      expect(extractNumberProperty([42], ['0'])).toBeUndefined()
    })
  })

  describe('Security Edge Cases', () => {
    it('should handle deeply nested proxy traps', () => {
      const deepProxy = new Proxy(
        {},
        {
          get(target, prop) {
            if (prop === 'message') {
              return new Proxy(
                {
                  valueOf() {
                    throw new Error('Nested proxy trap')
                  }
                },
                {}
              )
            }
            return undefined
          },
          has() {
            return true
          }
        }
      )

      expect(extractStringProperty(deepProxy, ['message'])).toBeUndefined()
    })

    it('should handle circular references safely', () => {
      const obj: any = { message: 'test' }
      obj.circular = obj

      expect(extractStringProperty(obj, ['message'])).toBe('test')
      expect(extractStringProperty(obj, ['circular'])).toBeUndefined() // Circular ref is object, not string
    })

    it('should handle objects that throw on Object.getPrototypeOf', () => {
      // Create proxy with actual property so hasOwnProperty returns true
      const problematicProxy = new Proxy(
        { any: 'value' },
        {
          getPrototypeOf() {
            throw new Error('getPrototypeOf trap error')
          }
        }
      )

      // Should still work despite getPrototypeOf throwing
      expect(extractStringProperty(problematicProxy, ['any'])).toBe('value')
    })

    it('should handle objects with numeric string keys', () => {
      const obj = {
        '0': 'first',
        '1': 'second',
        '42': 'answer'
      }

      expect(extractStringProperty(obj, ['0'])).toBe('first')
      expect(extractStringProperty(obj, ['42'])).toBe('answer')
    })

    it('should not be affected by prototype pollution', () => {
      // Temporarily pollute Object prototype
      const originalValue = (Object.prototype as any).polluted
      ;(Object.prototype as any).polluted = 'pollution'

      try {
        const obj = { message: 'clean' }

        // Should not extract from prototype since we only check own properties
        expect(extractStringProperty(obj, ['polluted'])).toBeUndefined()
        expect(extractStringProperty(obj, ['message'])).toBe('clean')
      } finally {
        // Clean up
        if (originalValue === undefined) {
          delete (Object.prototype as any).polluted
        } else {
          ;(Object.prototype as any).polluted = originalValue
        }
      }
    })

    it('should handle objects with symbol properties', () => {
      const sym = Symbol('test')
      const obj = {
        [sym]: 'symbol value',
        normal: 'normal value'
      }

      // Should only work with string keys
      expect(extractStringProperty(obj, ['normal'])).toBe('normal value')
      expect(extractStringProperty(obj, [sym.toString()])).toBeUndefined()
    })
  })
})
