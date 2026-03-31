import { describe, expect, it } from 'vitest'
import { StdioSuppressionPolicy } from './stdio-filter.js'

describe('StdioSuppressionPolicy', () => {
  it('suppresses CRLF-terminated captured lines that match an exact custom pattern', () => {
    const policy = new StdioSuppressionPolicy(/^Secret$/, [])

    const filtered = policy.filterCapturedConsoleMessage('Secret\r\nVisible\r\n')

    expect(filtered).toEqual({
      message: 'Visible\r\n',
      totalLines: 2,
      suppressedLines: 1
    })
  })
})
