/**
 * Test fixtures for deduplication testing
 */

import type { DuplicateEntry, DeduplicationGroup } from '../types/deduplication'

/**
 * Create a mock duplicate entry
 */
export function createMockEntry(overrides?: Partial<DuplicateEntry>): DuplicateEntry {
  return {
    testId: 'test-1',
    testName: 'Test Case 1',
    filePath: '/src/test.spec.ts',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    errorMessage: 'Test failed',
    stackTrace: 'Error: Test failed\n  at test.spec.ts:10:5',
    consoleOutput: ['[INFO] Test started', '[ERROR] Test failed'],
    metadata: {},
    ...overrides
  }
}

/**
 * Create multiple similar entries
 */
export function createSimilarEntries(count: number, pattern: string): DuplicateEntry[] {
  const entries: DuplicateEntry[] = []
  
  for (let i = 0; i < count; i++) {
    entries.push(createMockEntry({
      testId: `test-${i}`,
      testName: `Test Case ${i}`,
      errorMessage: pattern.replace('{{num}}', i.toString()),
      stackTrace: `Error: ${pattern.replace('{{num}}', i.toString())}\n  at test.spec.ts:${10 + i}:5`
    }))
  }
  
  return entries
}

/**
 * Common error patterns for testing
 */
export const ERROR_PATTERNS = {
  nullReference: [
    'Cannot read property "name" of undefined',
    'Cannot read property "value" of undefined',
    'Cannot read property "data" of undefined'
  ],
  typeError: [
    'TypeError: x is not a function',
    'TypeError: y is not a function',
    'TypeError: z is not a function'
  ],
  assertion: [
    'Expected 5 but got 10',
    'Expected 3 but got 7',
    'Expected 1 but got 2'
  ],
  timeout: [
    'Timeout: Test exceeded 5000ms',
    'Timeout: Test exceeded 10000ms',
    'Timeout: Test exceeded 3000ms'
  ]
}

/**
 * Common stack trace patterns
 */
export const STACK_PATTERNS = {
  simple: `Error: Test failed
  at Object.<anonymous> (/src/test.spec.ts:10:5)
  at Module._compile (module.js:653:30)
  at Object.Module._extensions..js (module.js:664:10)`,
  
  withAsync: `Error: Async test failed
  at async Object.<anonymous> (/src/async.spec.ts:20:10)
  at async Promise.all (index 0)
  at async runTest (/node_modules/vitest/dist/index.js:100:5)`,
  
  nested: `Error: Nested error
  at innerFunction (/src/utils.ts:50:15)
  at middleFunction (/src/helpers.ts:30:10)
  at outerFunction (/src/main.ts:10:5)
  at Object.<anonymous> (/src/test.spec.ts:5:3)`
}

/**
 * Create a mock deduplication group
 */
export function createMockGroup(overrides?: Partial<DeduplicationGroup>): DeduplicationGroup {
  const entries = createSimilarEntries(3, 'Error {{num}}')
  
  return {
    id: 'group-1',
    signature: 'error-signature',
    pattern: 'error-message',
    count: 3,
    firstSeen: new Date('2024-01-01T00:00:00Z'),
    lastSeen: new Date('2024-01-01T01:00:00Z'),
    examples: entries,
    references: entries.map(e => e.testId),
    ...overrides
  }
}

/**
 * Test data sets for different scenarios
 */
export const TEST_SCENARIOS = {
  /**
   * Identical errors that should be grouped
   */
  identicalErrors: (): DuplicateEntry[] => [
    createMockEntry({
      testId: 'test-1',
      errorMessage: 'Cannot connect to database',
      stackTrace: STACK_PATTERNS.simple
    }),
    createMockEntry({
      testId: 'test-2',
      errorMessage: 'Cannot connect to database',
      stackTrace: STACK_PATTERNS.simple
    }),
    createMockEntry({
      testId: 'test-3',
      errorMessage: 'Cannot connect to database',
      stackTrace: STACK_PATTERNS.simple
    })
  ],

  /**
   * Similar errors with minor variations
   */
  similarErrors: (): DuplicateEntry[] => [
    createMockEntry({
      testId: 'test-1',
      errorMessage: ERROR_PATTERNS.nullReference[0],
      stackTrace: STACK_PATTERNS.simple.replace('10', '15')
    }),
    createMockEntry({
      testId: 'test-2',
      errorMessage: ERROR_PATTERNS.nullReference[1],
      stackTrace: STACK_PATTERNS.simple.replace('10', '20')
    }),
    createMockEntry({
      testId: 'test-3',
      errorMessage: ERROR_PATTERNS.nullReference[2],
      stackTrace: STACK_PATTERNS.simple.replace('10', '25')
    })
  ],

  /**
   * Different errors that should not be grouped
   */
  differentErrors: (): DuplicateEntry[] => [
    createMockEntry({
      testId: 'test-1',
      errorMessage: 'Database connection failed',
      stackTrace: STACK_PATTERNS.simple
    }),
    createMockEntry({
      testId: 'test-2',
      errorMessage: 'Network timeout',
      stackTrace: STACK_PATTERNS.withAsync
    }),
    createMockEntry({
      testId: 'test-3',
      errorMessage: 'File not found',
      stackTrace: STACK_PATTERNS.nested
    })
  ],

  /**
   * Mixed scenario with some similar and some different
   */
  mixedErrors: (): DuplicateEntry[] => [
    // Group 1: Null reference errors
    createMockEntry({
      testId: 'test-1',
      errorMessage: ERROR_PATTERNS.nullReference[0]
    }),
    createMockEntry({
      testId: 'test-2',
      errorMessage: ERROR_PATTERNS.nullReference[1]
    }),
    // Group 2: Type errors
    createMockEntry({
      testId: 'test-3',
      errorMessage: ERROR_PATTERNS.typeError[0]
    }),
    createMockEntry({
      testId: 'test-4',
      errorMessage: ERROR_PATTERNS.typeError[1]
    }),
    // Unique error
    createMockEntry({
      testId: 'test-5',
      errorMessage: 'Unique error that does not match any pattern'
    })
  ],

  /**
   * Large dataset for performance testing
   */
  largeDataset: (size: number = 100): DuplicateEntry[] => {
    const entries: DuplicateEntry[] = []
    const patterns = Object.values(ERROR_PATTERNS).flat()
    
    for (let i = 0; i < size; i++) {
      const patternIndex = i % patterns.length
      entries.push(createMockEntry({
        testId: `test-${i}`,
        testName: `Test Case ${i}`,
        errorMessage: patterns[patternIndex].replace(/\d+/, (i * 10).toString()),
        stackTrace: STACK_PATTERNS.simple.replace('10', (i % 100).toString())
      }))
    }
    
    return entries
  }
}

/**
 * Assertion helpers for testing
 */
export const ASSERTIONS = {
  /**
   * Check if entries are in the same group
   */
  areGrouped: (result: { groups: DeduplicationGroup[] }, ...testIds: string[]): boolean => {
    for (const group of result.groups) {
      const hasAll = testIds.every(id => group.references.includes(id))
      if (hasAll) return true
    }
    return false
  },

  /**
   * Check if entry is not grouped
   */
  isNotGrouped: (result: { groups: DeduplicationGroup[] }, testId: string): boolean => {
    for (const group of result.groups) {
      if (group.references.includes(testId)) return false
    }
    return true
  },

  /**
   * Count groups containing specific pattern
   */
  countGroupsWithPattern: (result: { groups: DeduplicationGroup[] }, pattern: string): number => {
    return result.groups.filter(g => 
      g.examples.some(e => e.errorMessage?.includes(pattern))
    ).length
  }
}