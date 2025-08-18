const { ContextExtractor } = require('./dist/extraction/ContextExtractor.js')

const extractor = new ContextExtractor()

const stack = `AssertionError: expected 4 to be 20 // Object.is equality
    at /Users/jordan.hans/Documents/vitest-llm-reporter/debug-fixture.test.ts:7:20
    at file:///Users/jordan.hans/Documents/vitest-llm-reporter/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11`

const frames = extractor.parseStackTrace(stack)
console.log('Parsed frames:', JSON.stringify(frames, null, 2))

if (frames.length > 0) {
  const firstFrame = frames[0]
  console.log('Extracting context for:', firstFrame.file, firstFrame.line, firstFrame.column)
  const context = extractor.extractCodeContext(firstFrame.file, firstFrame.line, firstFrame.column)
  console.log('Context:', context)
}
