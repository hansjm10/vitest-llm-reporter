const { ErrorExtractor } = require('./dist/extraction/ErrorExtractor.js');

const extractor = new ErrorExtractor();
const error = new Error('Test error');
error.stack = `Error: Test error
    at Object.<anonymous> (/Users/test/file.js:10:15)`;

const result = extractor.extractWithContext(error);
console.log(JSON.stringify(result, null, 2));
