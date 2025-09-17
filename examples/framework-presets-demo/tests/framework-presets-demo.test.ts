import { describe, it, expect } from 'vitest'

// This demo mimics framework banners that would normally clutter stdout.
// Running the suite with the reporter config in the parent folder will
// suppress the framework messages while still showing the assertion result.

describe('framework preset demo', () => {
  it('suppresses noisy framework banners', () => {
    console.log('[Nest] Starting Nest application...')
    console.log('info  - ready on http://localhost:3000')
    console.log('{"level":30,"time":1712345678901,"pid":12345,"hostname":"local","msg":"Server listening"}')
    console.log('CI : verbose banner that we still want filtered')

    expect(true).toBe(true)
  })
})
