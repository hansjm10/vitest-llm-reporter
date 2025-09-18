import { describe, it, expect } from 'vitest'
import { ConsoleMerger } from './merge.js'
import type { ConsoleEvent } from '../types/schema.js'

describe('ConsoleMerger', () => {
  const merger = new ConsoleMerger()

  describe('merge', () => {
    it('should return undefined when both inputs are undefined', () => {
      const result = merger.merge(undefined, undefined)
      expect(result).toBeUndefined()
    })

    it('should return intercepted events when task events are undefined', () => {
      const interceptedEvents: ConsoleEvent[] = [
        { level: 'log', message: 'custom log 1', timestampMs: 100 },
        { level: 'log', message: 'custom log 2', timestampMs: 200 },
        { level: 'error', message: 'custom error', timestampMs: 300 }
      ]
      const result = merger.merge(undefined, interceptedEvents)
      expect(result).toEqual(interceptedEvents)
    })

    it('should return task events when intercepted events are undefined', () => {
      const taskEvents: ConsoleEvent[] = [
        { level: 'log', message: 'vitest log 1', origin: 'task' },
        { level: 'log', message: 'vitest log 2', origin: 'task' },
        { level: 'warn', message: 'vitest warning', origin: 'task' }
      ]
      const result = merger.merge(taskEvents, undefined)
      expect(result).toEqual(taskEvents)
    })

    it('should merge non-overlapping events', () => {
      const taskEvents: ConsoleEvent[] = [
        { level: 'log', message: 'vitest log', origin: 'task' },
        { level: 'warn', message: 'vitest warning', origin: 'task' }
      ]
      const interceptedEvents: ConsoleEvent[] = [
        { level: 'error', message: 'custom error', origin: 'intercepted' },
        { level: 'info', message: 'custom info', origin: 'intercepted' }
      ]

      const result = merger.merge(taskEvents, interceptedEvents)

      expect(result).toBeDefined()
      expect(result?.length).toBe(4)
      expect(result?.some((e) => e.message === 'vitest log')).toBe(true)
      expect(result?.some((e) => e.message === 'vitest warning')).toBe(true)
      expect(result?.some((e) => e.message === 'custom error')).toBe(true)
      expect(result?.some((e) => e.message === 'custom info')).toBe(true)
    })

    it('should deduplicate adjacent identical events', () => {
      const taskEvents: ConsoleEvent[] = [
        { level: 'log', message: 'duplicate message', origin: 'task' },
        { level: 'log', message: 'unique vitest', origin: 'task' },
        { level: 'error', message: 'error message', origin: 'task' }
      ]
      const interceptedEvents: ConsoleEvent[] = [
        { level: 'log', message: 'duplicate message', origin: 'intercepted' },
        { level: 'log', message: 'unique custom', origin: 'intercepted' },
        { level: 'error', message: 'error message', origin: 'intercepted' }
      ]

      const result = merger.merge(taskEvents, interceptedEvents)

      // Should contain all unique messages
      // Note: deduplication only happens for adjacent identical events
      const logEvents = result?.filter((e) => e.level === 'log') || []
      const logTexts = logEvents.map((e) => e.message)
      expect(logTexts).toContain('duplicate message')
      expect(logTexts).toContain('unique custom')
      expect(logTexts).toContain('unique vitest')

      // Since duplicates aren't adjacent in merged array, both are kept
      // (intercepted events come first, then task events)
      expect(logTexts.filter((t) => t === 'duplicate message').length).toBe(2)
    })

    it('should sort by timestamp when both sources have timestamps', () => {
      const taskEvents: ConsoleEvent[] = [
        { level: 'log', message: 'Task log 1', timestampMs: 100, origin: 'task' },
        { level: 'log', message: 'Task log 2', timestampMs: 300, origin: 'task' }
      ]
      const interceptedEvents: ConsoleEvent[] = [
        { level: 'log', message: 'Intercepted log 1', timestampMs: 50, origin: 'intercepted' },
        { level: 'log', message: 'Intercepted log 2', timestampMs: 200, origin: 'intercepted' },
        { level: 'log', message: 'Intercepted log 3', timestampMs: 400, origin: 'intercepted' }
      ]

      const result = merger.merge(taskEvents, interceptedEvents)

      // Should be sorted by timestamp
      expect(result).toBeDefined()
      expect(result?.length).toBe(5)
      expect(result?.[0].message).toBe('Intercepted log 1') // 50ms
      expect(result?.[1].message).toBe('Task log 1') // 100ms
      expect(result?.[2].message).toBe('Intercepted log 2') // 200ms
      expect(result?.[3].message).toBe('Task log 2') // 300ms
      expect(result?.[4].message).toBe('Intercepted log 3') // 400ms
    })

    it('should preserve source order when no timestamps available', () => {
      const taskEvents: ConsoleEvent[] = [
        { level: 'log', message: 'Task log 1', origin: 'task' },
        { level: 'log', message: 'Task log 2', origin: 'task' }
      ]
      const interceptedEvents: ConsoleEvent[] = [
        { level: 'log', message: 'Intercepted log 1', origin: 'intercepted' },
        { level: 'log', message: 'Intercepted log 2', origin: 'intercepted' }
      ]

      const result = merger.merge(taskEvents, interceptedEvents)

      // Should preserve source order (intercepted first, then task)
      expect(result).toBeDefined()
      expect(result?.length).toBe(4)
      expect(result?.[0].message).toBe('Intercepted log 1')
      expect(result?.[1].message).toBe('Intercepted log 2')
      expect(result?.[2].message).toBe('Task log 1')
      expect(result?.[3].message).toBe('Task log 2')
    })

    it('should handle empty arrays', () => {
      const taskEvents: ConsoleEvent[] = []
      const interceptedEvents: ConsoleEvent[] = []

      const result = merger.merge(taskEvents, interceptedEvents)
      expect(result).toBeUndefined()
    })

    it('should preserve all event properties', () => {
      const taskEvents: ConsoleEvent[] = [
        {
          level: 'error',
          message: 'Error with args',
          args: ['arg1', 'arg2'],
          timestampMs: 100,
          origin: 'task'
        }
      ]
      const interceptedEvents: ConsoleEvent[] = [
        { level: 'warn', message: 'Warning', timestampMs: 50, origin: 'intercepted' }
      ]

      const result = merger.merge(taskEvents, interceptedEvents)

      expect(result).toBeDefined()
      expect(result?.length).toBe(2)

      const errorEvent = result?.find((e) => e.level === 'error')
      expect(errorEvent).toMatchObject({
        level: 'error',
        message: 'Error with args',
        args: ['arg1', 'arg2'],
        timestampMs: 100,
        origin: 'task'
      })
    })
  })
})
