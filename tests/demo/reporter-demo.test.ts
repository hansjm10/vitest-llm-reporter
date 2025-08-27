import { describe, it, expect } from 'vitest'

// Enable this demo by setting env var:
//   LLM_REPORTER_DEMO=1 npm test
// or use the npm script: npm run test:demo
const DEMO_ENABLED = process.env.LLM_REPORTER_DEMO === '1'

describe.runIf(DEMO_ENABLED)('LLM Reporter Demo', () => {
  it('emits console logs and fails intentionally', () => {
    // eslint-disable-next-line no-console
    console.info('Demo start: showcasing console capture')
    // eslint-disable-next-line no-console
    console.info('Info context', { feature: 'demo', step: 1 })
    console.warn('Heads up: multi-line example:\n- first line\n- second line')
    console.error('Simulated error path log')

    // Intentional failure for demonstration of failure reporting
    expect(1).toBe(2)
  })
})
