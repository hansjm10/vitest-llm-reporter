import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { TestEndResolver } from './TestEndResolver.js'
import { TestCaseExtractor } from './TestCaseExtractor.js'

describe('TestEndResolver', () => {
  const createFixture = (): { dir: string; file: string } => {
    const dir = mkdtempSync(path.join(tmpdir(), 'end-resolver-'))
    const file = path.join(dir, 'sample.test.ts')
    const content = `import { test, expect } from 'vitest'

test('block', () => {
  const value = 1
  expect(value).toBe(1)
})

test('expr', () => expect(true).toBe(true))
`
    writeFileSync(file, content)
    return { dir, file }
  }

  it('resolves end line for block and expression bodies', () => {
    const { dir, file } = createFixture()

    try {
      const resolver = new TestEndResolver(dir)
      const blockEnd = resolver.resolve(file, 3)
      const exprEnd = resolver.resolve(file, 8)

      expect(blockEnd).toBe(6)
      expect(exprEnd).toBe(8)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('integrates with TestCaseExtractor to enrich endLine', () => {
    const { dir, file } = createFixture()

    try {
      const extractor = new TestCaseExtractor({ rootDir: dir })
      const testCase = {
        name: 'block',
        filepath: file,
        location: { line: 3 },
        result: { state: 'fail' }
      }

      const extracted = extractor.extract(testCase)

      expect(extracted?.startLine).toBe(3)
      expect(extracted?.endLine).toBe(6)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('handles chained test modifiers and async bodies', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'end-resolver-'))
    const file = path.join(dir, 'chained.test.ts')
    const modifier = 'only'
    const content = `import { test } from 'vitest'

test.concurrent.${modifier}('chained', async () => {
  await Promise.resolve()
  return 'done'
})
`
    writeFileSync(file, content)

    try {
      const resolver = new TestEndResolver(dir)
      const endLine = resolver.resolve(file, 3)
      expect(endLine).toBe(6)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back gracefully when callback is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'end-resolver-'))
    const file = path.join(dir, 'todo.test.ts')
    const content = `import { it } from 'vitest'

it.todo('pending case')
`
    writeFileSync(file, content)

    try {
      const resolver = new TestEndResolver(dir)
      const endLine = resolver.resolve(file, 3)
      expect(endLine).toBeUndefined()

      const extractor = new TestCaseExtractor({ rootDir: dir })
      const extracted = extractor.extract({
        name: 'pending case',
        filepath: file,
        location: { line: 3 },
        result: { state: 'skip' }
      })

      expect(extracted?.startLine).toBe(3)
      expect(extracted?.endLine).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves relative paths using configured rootDir', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'end-resolver-'))
    const file = path.join(dir, 'relative.test.ts')
    const content = `import { it } from 'vitest'

it('works', () => {
  const value = 41
  expect(value + 1).toBe(42)
})
`
    writeFileSync(file, content)

    try {
      const resolver = new TestEndResolver(dir)
      const relative = path.relative(dir, file)
      const endLine = resolver.resolve(relative, 3)
      expect(endLine).toBe(6)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined when TypeScript is unavailable', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'end-resolver-'))
    const file = path.join(dir, 'no-ts.test.ts')
    writeFileSync(
      file,
      `test('noop', () => {})
`
    )

    try {
      const resolver = new TestEndResolver(dir)
      ;(resolver as unknown as { tsModule: false }).tsModule = false
      expect(resolver.resolve(file, 1)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
