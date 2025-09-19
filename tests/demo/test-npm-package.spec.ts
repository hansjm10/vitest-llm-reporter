import { describe, it, expect } from 'vitest'

describe('NPM Package Test', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle arrays', () => {
    const arr = [1, 2, 3]
    expect(arr).toHaveLength(3)
    expect(arr).toContain(2)
  })

  it.skip('should fail this test (demo only)', () => {
    // This was intentionally failing to demo reporter output
    expect('npm').toBe('local')
  })

  it.skip('should skip this test', () => {
    expect(true).toBe(false)
  })
})
