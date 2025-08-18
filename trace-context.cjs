const ContextExtractor = require('./dist/extraction/ContextExtractor.js').ContextExtractor
const fs = require('fs')

const extractor = new ContextExtractor()

// Test with a file we know exists
const testFile = '/Users/jordan.hans/Documents/vitest-llm-reporter/tests/e2e/error-context.test.ts'
console.log('File exists:', fs.existsSync(testFile))

const context = extractor.extractCodeContext(testFile, 122, 33)
console.log('Context:', context)
