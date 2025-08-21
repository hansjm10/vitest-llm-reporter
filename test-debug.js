const { TemplateExtractor } = require('./dist/deduplication/compression/TemplateExtractor.js')

const extractor = new TemplateExtractor()

const failures = [
  {
    testId: 'test1',
    testName: 'Test 1',
    filePath: '/src/test1.ts',
    timestamp: new Date(),
    errorMessage: 'Cannot read property "name" of undefined'
  },
  {
    testId: 'test2',
    testName: 'Test 2',
    filePath: '/src/test2.ts',
    timestamp: new Date(),
    errorMessage: 'Cannot read property "value" of undefined'
  },
  {
    testId: 'test3',
    testName: 'Test 3',
    filePath: '/src/test3.ts',
    timestamp: new Date(),
    errorMessage: 'Cannot read property "data" of undefined'
  }
]

const template = extractor.extractTemplate(failures)

console.log('Template:', template)
console.log('Pattern:', template?.pattern)
console.log('Common Elements:', template?.commonElements)