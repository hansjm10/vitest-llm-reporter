const testContent = "\nimport { describe, it, expect } from 'vitest'\n\ndescribe('Debug', () => {\n  it('should fail with context', () => {\n    const result = 4\n    expect(result).toBe(20) // Line 7\n  })\n})\n"

const lines = testContent.split('\n')
lines.forEach((line, i) => {
  console.log('Line ' + (i + 1) + ': "' + line + '"')
})
