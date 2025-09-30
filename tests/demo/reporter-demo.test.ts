import { describe, it, expect } from 'vitest'

// Enable this demo by setting env var:
//   LLM_REPORTER_DEMO=1 npm test
// or use the npm script: npm run test:demo
const DEMO_ENABLED = process.env.LLM_REPORTER_DEMO === '1'

describe.runIf(DEMO_ENABLED)('LLM Reporter Demo', () => {
  it('emits console logs and fails intentionally', () => {
    console.info('Demo start: showcasing console capture')

    console.info('Info context', { feature: 'demo', step: 1 })
    console.warn('Heads up: multi-line example:\n- first line\n- second line')
    console.error('Simulated error path log')

    // Intentional failure for demonstration of failure reporting
    expect(1).toBe(2)
  })

  it('demonstrates comparison insights for complex objects', () => {
    console.log('Testing complex nested structure comparison')

    const expected = {
      user: {
        id: 123,
        name: 'John Doe',
        profile: {
          email: 'john@example.com',
          settings: {
            theme: 'dark',
            notifications: ['email', 'sms', 'push']
          }
        }
      },
      metadata: {
        lastLogin: '2024-01-15T10:30:00Z',
        loginCount: 42
      }
    }

    const actual = {
      user: {
        id: 123,
        name: 'Jane Smith',
        profile: {
          email: 'jane@example.com',
          settings: {
            theme: 'light',
            notifications: ['email', 'push']
          }
        }
      },
      metadata: {
        lastLogin: '2024-01-15T10:30:00Z',
        loginCount: 43
      }
    }

    console.warn('This will show structured comparison insights')

    // This failure will demonstrate the comparison insights feature
    expect(actual).toEqual(expected)
  })
})
