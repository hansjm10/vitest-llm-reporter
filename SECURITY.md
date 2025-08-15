# Security Policy

## Overview

The vitest-llm-reporter implements multiple security measures to prevent common web application vulnerabilities when processing and validating test results. This document outlines the security considerations and best practices for using this library.

## Security Features

### 1. XSS (Cross-Site Scripting) Prevention

All code snippets and user-provided content in test results are automatically sanitized during validation to prevent XSS attacks:

- HTML special characters are escaped (`<`, `>`, `&`, `"`, `'`, `/`)
- Code arrays are sanitized before processing
- Safe for rendering in web contexts without additional escaping

**Example:**
```javascript
// Input with XSS attempt
{
  context: {
    code: ['<script>alert("XSS")</script>']
  }
}

// Automatically sanitized to:
{
  context: {
    code: ['&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;']
  }
}
```

### 2. Prototype Pollution Prevention

The validation system uses safe object creation to prevent prototype pollution attacks:

- Uses `Object.create(null)` for validation objects
- Filters out dangerous keys (`__proto__`, `constructor`, `prototype`)
- All property access uses `Object.prototype.hasOwnProperty.call()`

### 3. ReDoS (Regular Expression Denial of Service) Prevention

Timestamp validation uses a strict, non-vulnerable regex pattern:

- Fixed-length ISO 8601 regex pattern prevents exponential backtracking
- Dual validation with regex and Date constructor
- Rejects malformed timestamps quickly (< 100ms)

### 4. Path Traversal Protection

File paths are validated to prevent directory traversal attacks:

- Rejects paths containing `../` or `..\\`
- Blocks null byte injection (`\0`)
- Requires absolute paths only
- No access to parent directories

**Rejected patterns:**
- `../../../etc/passwd`
- `..\\..\\windows\\system32`
- `test/../../sensitive/data.txt`
- Relative paths like `src/test.ts`

### 5. Memory Protection

Implements comprehensive memory protection with atomic reservation to prevent exhaustion attacks:

#### Features:
- Maximum 100 lines of code context per error
- Total code size limit of 1MB across all test results
- Configurable limits for different environments
- Early validation termination when limits exceeded
- **Atomic memory reservation** to prevent concurrent bypass attacks

#### Concurrent Attack Prevention:
The validator uses a two-phase memory reservation system to prevent race conditions:

1. **Estimation Phase**: Quickly estimates memory usage without full serialization
2. **Reservation Phase**: Atomically reserves estimated memory BEFORE consumption
3. **Validation Phase**: Calculates actual usage and verifies against reservation
4. **Rollback Phase**: Releases reserved memory if validation fails

This prevents the Time-of-Check to Time-of-Use (TOCTOU) vulnerability where multiple concurrent requests could bypass memory limits:

```javascript
// Attack scenario that is now prevented:
// 10 concurrent requests × 900KB each = 9MB total (bypasses 1MB limit)
const attacks = Array(10).fill(createLargePayload(900_000));
await Promise.all(attacks.map(p => validator.validate(p))); // Now properly rejected
```

The fix ensures that memory is reserved atomically before consumption, preventing concurrent validations from collectively exhausting available memory.

### 6. Type Safety

Replaces unsafe `any` types with strict type unions:

- `AssertionValue` type for expected/actual values
- Circular reference detection in assertion values
- JSON serialization validation

## Usage Guidelines

### Input Validation

Always validate untrusted input before processing:

```typescript
import { validateSchema, resetCodeSizeCounter } from 'vitest-llm-reporter';

// Reset counter before validating new schema
resetCodeSizeCounter();

const untrustedData = getTestResults();
if (validateSchema(untrustedData)) {
  // Safe to process
  processTestResults(untrustedData);
} else {
  // Validation failed - reject the input
  console.error('Invalid test results format');
}
```

### File Path Handling

When working with file paths, ensure they are absolute and validated:

```typescript
import { validateFilePath } from 'vitest-llm-reporter/utils';

const filePath = getUserProvidedPath();
if (!validateFilePath(filePath)) {
  throw new Error('Invalid file path');
}
```

### HTML Rendering

Although code is automatically sanitized during validation, always use proper escaping when rendering in HTML:

```typescript
// Already sanitized, but double-check for defense in depth
const safeHtml = escapeHtml(testResult.error.context.code[0]);
```

## Reporting Security Issues

If you discover a security vulnerability in this library:

1. **DO NOT** open a public issue
2. Email security concerns to the maintainer
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

## Security Checklist

Before using in production:

- [ ] Validate all external input using `validateSchema()`
- [ ] Reset code size counter between validations
- [ ] Use absolute file paths only
- [ ] Implement rate limiting for validation endpoints
- [ ] Monitor memory usage in production
- [ ] Keep the library updated to the latest version
- [ ] Review security logs regularly

## Dependencies

This library has minimal dependencies to reduce attack surface:

- No runtime dependencies
- Development dependencies are regularly updated
- All dependencies are audited using `npm audit`

## Best Practices

1. **Defense in Depth**: Layer multiple security controls
2. **Least Privilege**: Run with minimal required permissions
3. **Input Validation**: Never trust external input
4. **Output Encoding**: Always encode output for the target context
5. **Regular Updates**: Keep all dependencies updated
6. **Security Testing**: Run security tests in CI/CD pipeline

## Compliance

This library implements security measures aligned with:

- OWASP Top 10 Web Application Security Risks
- CWE/SANS Top 25 Most Dangerous Software Errors
- Node.js Security Best Practices

## Version History

- v0.2.0: Critical security fix for concurrent memory bypass
  - Fixed TOCTOU vulnerability in memory limit validation
  - Implemented atomic memory reservation system
  - Added rollback mechanism for failed validations
  - Enhanced memory estimation for complex structures
  - Added protection against concurrent exhaustion attacks

- v0.1.0: Initial security implementation
  - XSS prevention via HTML escaping
  - Prototype pollution protection
  - ReDoS prevention with strict regex
  - Path traversal protection
  - Memory exhaustion limits
  - Type safety improvements

## Contact

For security-related questions or concerns, please contact the maintainer.