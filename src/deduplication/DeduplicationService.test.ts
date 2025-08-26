/**
 * Tests for DeduplicationService
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DeduplicationService } from './DeduplicationService.js'
import { StackTracePattern } from './patterns/StackTracePattern.js'
import { ErrorMessagePattern } from './patterns/ErrorMessagePattern.js'
import type { DuplicateEntry, DeduplicationConfig } from '../types/deduplication.js'

describe('DeduplicationService', () => {
  let service: DeduplicationService

  beforeEach(() => {
    service = new DeduplicationService()
  })

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeDefined()
      expect(service.getStats()).toMatchObject({
        totalFailures: 0,
        uniqueFailures: 0,
        duplicateGroups: 0
      })
    })

    it('should accept custom configuration', () => {
      const config: Partial<DeduplicationConfig> = {
        strategy: 'aggressive',
        compression: {
          enabled: true,
          minGroupSize: 3,
          maxTemplateVariables: 5,
          preserveExamples: 2
        }
      }

      const customService = new DeduplicationService(config)
      expect(customService).toBeDefined()
    })
  })

  describe('process', () => {
    it('should return empty result for no failures', () => {
      const result = service.process([])

      expect(result.groups).toHaveLength(0)
      expect(result.references.size).toBe(0)
      expect(result.stats.totalFailures).toBe(0)
    })

    it('should not group dissimilar failures', () => {
      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Error in component A'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Completely different error in component B'
        }
      ]

      const result = service.process(failures)

      expect(result.groups).toHaveLength(0)
      expect(result.stats.totalFailures).toBe(2)
      expect(result.stats.uniqueFailures).toBe(2)
    })

    it('should group similar error messages', () => {
      // Add pattern matchers
      service.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
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
          errorMessage: 'Cannot read property "name" of undefined'
        },
        {
          testId: 'test3',
          testName: 'Test 3',
          filePath: '/src/test3.ts',
          timestamp: new Date(),
          errorMessage: 'Cannot read property "value" of undefined'
        }
      ]

      const result = service.process(failures)

      // Should group the identical errors
      expect(result.groups.length).toBeGreaterThan(0)
      expect(result.stats.totalFailures).toBe(3)
    })

    it('should group similar stack traces', () => {
      // Add pattern matchers
      service.addPattern(new StackTracePattern())

      const stackTrace1 = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)
        at Module._compile (module.js:653:30)
        at Object.Module._extensions..js (module.js:664:10)`

      const stackTrace2 = `Error: Test failed
        at Object.<anonymous> (/src/test.ts:10:5)
        at Module._compile (module.js:653:30)
        at Object.Module._extensions..js (module.js:664:10)`

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          stackTrace: stackTrace1
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          stackTrace: stackTrace2
        }
      ]

      const result = service.process(failures)

      expect(result.groups.length).toBeGreaterThan(0)
      expect(result.groups[0].count).toBe(2)
    })

    it('should respect minGroupSize configuration', () => {
      const config: Partial<DeduplicationConfig> = {
        compression: {
          enabled: true,
          minGroupSize: 3,
          maxTemplateVariables: 10,
          preserveExamples: 3
        }
      }

      service.configure(config)
      service.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Same error'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Same error'
        }
      ]

      const result = service.process(failures)

      // Should not group because minGroupSize is 3
      expect(result.groups).toHaveLength(0)
    })

    it('should generate compressed output when enabled', () => {
      const config: Partial<DeduplicationConfig> = {
        compression: {
          enabled: true,
          minGroupSize: 2,
          maxTemplateVariables: 10,
          preserveExamples: 3
        }
      }

      service.configure(config)
      service.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Same error'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Same error'
        }
      ]

      const result = service.process(failures)

      expect(result.compressedOutput).toBeDefined()
      expect(result.compressedOutput?.version).toBe('1.0.0')
      expect(result.compressedOutput?.groups).toBeDefined()
      expect(result.compressedOutput?.metadata.compressionRatio).toBeDefined()
    })
  })

  describe('addPattern', () => {
    it('should add pattern matcher', () => {
      const pattern = new StackTracePattern()
      service.addPattern(pattern)

      // Pattern should be used in processing
      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          stackTrace: 'at test.ts:10'
        }
      ]

      const result = service.process(failures)
      expect(result).toBeDefined()
    })
  })

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = service.getStats()

      expect(stats).toHaveProperty('totalFailures')
      expect(stats).toHaveProperty('uniqueFailures')
      expect(stats).toHaveProperty('duplicateGroups')
      expect(stats).toHaveProperty('compressionRatio')
      expect(stats).toHaveProperty('patternDistribution')
      expect(stats).toHaveProperty('similarityDistribution')
    })

    it('should update stats after processing', () => {
      service.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Error'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Error'
        }
      ]

      service.process(failures)
      const stats = service.getStats()

      expect(stats.totalFailures).toBe(2)
      expect(stats.processingTime).toBeGreaterThan(0)
    })
  })

  describe('reset', () => {
    it('should reset service state', () => {
      service.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Error'
        }
      ]

      service.process(failures)
      service.reset()

      const stats = service.getStats()
      expect(stats.totalFailures).toBe(0)
      expect(stats.uniqueFailures).toBe(0)
      expect(stats.duplicateGroups).toBe(0)
    })
  })

  describe('strategy configuration', () => {
    it('should use aggressive strategy', () => {
      const config: Partial<DeduplicationConfig> = {
        strategy: 'aggressive'
      }

      const aggressiveService = new DeduplicationService(config)
      aggressiveService.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Cannot read property "x" of undefined'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Cannot read property "y" of undefined'
        }
      ]

      const result = aggressiveService.process(failures)
      // Aggressive strategy should be more likely to group these
      expect(result.stats.totalFailures).toBe(2)
    })

    it('should use conservative strategy', () => {
      const config: Partial<DeduplicationConfig> = {
        strategy: 'conservative'
      }

      const conservativeService = new DeduplicationService(config)
      conservativeService.addPattern(new ErrorMessagePattern())

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Error with value 123'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Error with value 456'
        }
      ]

      const result = conservativeService.process(failures)
      // Conservative strategy should be less likely to group these
      expect(result.groups.length).toBe(0)
    })
  })
})
