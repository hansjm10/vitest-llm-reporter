
import { describe, it, expect, beforeEach, vi } from 'vitest'

function multiply(a: number, b: number): number {
  // Bug: always returns first number
  return a
}

describe('Math Operations', () => {
  // Store original console methods
  let consoleLogSpy: any
  let consoleWarnSpy: any
  let consoleErrorSpy: any
  
  beforeEach(() => {
    // Spy on console methods to ensure they're captured
    consoleLogSpy = vi.spyOn(console, 'log')
    consoleWarnSpy = vi.spyOn(console, 'warn')
    consoleErrorSpy = vi.spyOn(console, 'error')
  })
  
  describe('Multiplication', () => {
    it('should multiply two numbers correctly', () => {
      const x = 4
      const y = 5
      const result = multiply(x, y)
      // Emit various console outputs for capture
      console.log('E2E multiply log:', x, y, result)
      console.warn('E2E multiply warn')
      console.error('E2E multiply error')
      // This will fail: multiply has a bug and returns 4 instead of 20
      expect(result).toBe(20)
    })

    it('should handle multiplication by zero', () => {
      const result = multiply(10, 0)
      console.log('E2E zero log:', result)
      console.warn('E2E zero warn')
      console.error('E2E zero error')
      // This will also fail: returns 10 instead of 0
      expect(result).toBe(0)
    })
  })

  describe('Complex Assertions', () => {
    it('should match object structure', () => {
      const user = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      }
      console.log('E2E object log:', user)
      console.warn('E2E object warn')
      console.error('E2E object error')
      
      // This will fail: age mismatch
      expect(user).toEqual({
        name: 'John Doe',
        age: 25,
        email: 'john@example.com'
      })
    })
  })
})
