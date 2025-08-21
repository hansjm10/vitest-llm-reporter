/**
 * Tests for Compression System
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { TemplateExtractor } from './TemplateExtractor'
import { ReferenceManager } from './ReferenceManager'
import type { DuplicateEntry, DeduplicationGroup, FailureTemplate } from '../../types/deduplication'

describe('Compression System', () => {
  describe('TemplateExtractor', () => {
    let extractor: TemplateExtractor

    beforeEach(() => {
      extractor = new TemplateExtractor()
    })

    it('should extract template from similar error messages', () => {
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
      
      expect(template).toBeDefined()
      expect(template?.pattern).toContain('Cannot read property')
      expect(template?.variables.length).toBeGreaterThan(0)
      expect(template?.commonElements).toContain('Cannot read property')
    })

    it('should extract template from similar stack traces', () => {
      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          stackTrace: `Error: Test failed
  at Object.<anonymous> (/src/test.ts:10:5)
  at Module._compile (module.js:653:30)`
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          stackTrace: `Error: Test failed
  at Object.<anonymous> (/src/test.ts:15:5)
  at Module._compile (module.js:653:30)`
        }
      ]

      const template = extractor.extractTemplate(failures)
      
      expect(template).toBeDefined()
      expect(template?.pattern).toContain('Error: Test failed')
      expect(template?.variables.length).toBeGreaterThanOrEqual(0)
    })

    it('should return null for single failure', () => {
      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Error'
        }
      ]

      const template = extractor.extractTemplate(failures)
      
      expect(template).toBeNull()
    })

    it('should extract template from console output', () => {
      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          consoleOutput: [
            '[INFO] Starting test',
            '[ERROR] Failed at line 10',
            '[INFO] Test complete'
          ]
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          consoleOutput: [
            '[INFO] Starting test',
            '[ERROR] Failed at line 20',
            '[INFO] Test complete'
          ]
        }
      ]

      const template = extractor.extractTemplate(failures)
      
      expect(template).toBeDefined()
      expect(template?.commonElements.length).toBeGreaterThan(0)
    })

    it('should limit template variables', () => {
      const extractorWithLimit = new TemplateExtractor({
        maxVariables: 2
      })

      const failures: DuplicateEntry[] = [
        {
          testId: 'test1',
          testName: 'Test 1',
          filePath: '/src/test1.ts',
          timestamp: new Date(),
          errorMessage: 'Error 1 at line 10 in file A with value X'
        },
        {
          testId: 'test2',
          testName: 'Test 2',
          filePath: '/src/test2.ts',
          timestamp: new Date(),
          errorMessage: 'Error 2 at line 20 in file B with value Y'
        }
      ]

      const template = extractorWithLimit.extractTemplate(failures)
      
      if (template) {
        expect(template.variables.length).toBeLessThanOrEqual(2)
      }
    })
  })

  describe('ReferenceManager', () => {
    let manager: ReferenceManager

    beforeEach(() => {
      manager = new ReferenceManager()
    })

    it('should add and retrieve references', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )

      const ref = manager.getReference('test1')
      
      expect(ref).toBeDefined()
      expect(ref?.groupId).toBe('group1')
      expect(ref?.similarity.score).toBe(0.9)
    })

    it('should get references by group', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )
      manager.addReference(
        'test2',
        'group1',
        { score: 0.85, level: 'high', confidence: 0.7 }
      )
      manager.addReference(
        'test3',
        'group2',
        { score: 0.95, level: 'exact', confidence: 0.9 }
      )

      const groupRefs = manager.getGroupReferences('group1')
      
      expect(groupRefs).toHaveLength(2)
      expect(groupRefs[0].groupId).toBe('group1')
      expect(groupRefs[1].groupId).toBe('group1')
    })

    it('should register and lookup groups', () => {
      const group: DeduplicationGroup = {
        id: 'group1',
        signature: 'error-signature',
        pattern: 'error-message',
        count: 2,
        firstSeen: new Date(),
        lastSeen: new Date(),
        examples: [],
        references: ['test1', 'test2']
      }

      manager.registerGroup(group)
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )

      const lookup = manager.lookup('test1')
      
      expect(lookup).toBeDefined()
      expect(lookup?.group?.id).toBe('group1')
      expect(lookup?.reference.groupId).toBe('group1')
    })

    it('should register templates', () => {
      const template: FailureTemplate = {
        id: 'template1',
        pattern: 'Error: {{var1}}',
        variables: [],
        commonElements: ['Error:'],
        differingElements: []
      }

      manager.registerTemplate(template)
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 },
        'template1'
      )

      const lookup = manager.lookup('test1')
      
      expect(lookup?.template?.id).toBe('template1')
    })

    it('should remove references', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )

      const removed = manager.removeReference('test1')
      const ref = manager.getReference('test1')
      
      expect(removed).toBe(true)
      expect(ref).toBeNull()
    })

    it('should remove group and its references', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )
      manager.addReference(
        'test2',
        'group1',
        { score: 0.85, level: 'high', confidence: 0.7 }
      )

      const removed = manager.removeGroup('group1')
      
      expect(removed).toBe(2)
      expect(manager.getReference('test1')).toBeNull()
      expect(manager.getReference('test2')).toBeNull()
    })

    it('should get compressed references', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )
      manager.addReference(
        'test2',
        'group1',
        { score: 0.85, level: 'high', confidence: 0.7 }
      )

      const compressed = manager.getCompressedReferences()
      
      expect(compressed).toHaveLength(2)
      expect(compressed[0].testId).toBe('test1')
      expect(compressed[0].groupId).toBe('group1')
    })

    it('should calculate statistics', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )
      manager.addReference(
        'test2',
        'group1',
        { score: 0.7, level: 'medium', confidence: 0.6 }
      )

      const stats = manager.getStats()
      
      expect(stats.totalReferences).toBe(2)
      expect(stats.uniqueGroups).toBe(1)
      expect(stats.averageSimilarity).toBe(0.8)
      expect(stats.similarityDistribution.high).toBe(1)
      expect(stats.similarityDistribution.medium).toBe(1)
    })

    it('should export and import references', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )

      const exported = manager.exportReferences()
      
      const newManager = new ReferenceManager()
      newManager.importReferences(exported)
      
      const ref = newManager.getReference('test1')
      expect(ref?.groupId).toBe('group1')
    })

    it('should clear all references', () => {
      manager.addReference(
        'test1',
        'group1',
        { score: 0.9, level: 'high', confidence: 0.8 }
      )

      manager.clear()
      
      expect(manager.getReference('test1')).toBeNull()
      expect(manager.getStats().totalReferences).toBe(0)
    })
  })
})