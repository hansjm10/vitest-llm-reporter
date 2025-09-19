import { describe, it, expect } from 'vitest'
import { LogDeduplicator } from './LogDeduplicator.js'

interface TestLogEntry {
  message: string
  offsetSeconds: number
}

describe('LogDeduplicator eviction policy', () => {
  const baseTimestamp = new Date('2024-01-01T00:00:00.000Z')

  const makeEntry = ({ message, offsetSeconds }: TestLogEntry) => ({
    message,
    level: 'log' as const,
    timestamp: new Date(baseTimestamp.getTime() + offsetSeconds * 1000)
  })

  it('evicts the least recently used entry when cache limit is exceeded', () => {
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 3
    })

    const initialEntries = [
      makeEntry({ message: 'Message 0', offsetSeconds: 0 }),
      makeEntry({ message: 'Message 1', offsetSeconds: 1 }),
      makeEntry({ message: 'Message 2', offsetSeconds: 2 })
    ]

    for (const entry of initialEntries) {
      expect(deduplicator.isDuplicate(entry)).toBe(false)
    }

    expect(deduplicator.getStats()).toMatchObject({
      uniqueLogs: 3,
      cacheSize: 3,
      duplicatesRemoved: 0
    })

    const evictionTrigger = makeEntry({ message: 'Message 3', offsetSeconds: 3 })
    expect(deduplicator.isDuplicate(evictionTrigger)).toBe(false)

    const statsAfterEviction = deduplicator.getStats()
    expect(statsAfterEviction.cacheSize).toBe(3)
    expect(statsAfterEviction.uniqueLogs).toBe(4)

    const reintroduced = makeEntry({ message: 'Message 0', offsetSeconds: 4 })
    expect(deduplicator.isDuplicate(reintroduced)).toBe(false)

    const statsAfterReintroduction = deduplicator.getStats()
    expect(statsAfterReintroduction.uniqueLogs).toBe(5)
    expect(statsAfterReintroduction.duplicatesRemoved).toBe(0)

    const key = deduplicator.generateKey(reintroduced)
    const metadata = deduplicator.getMetadata(key)
    expect(metadata?.firstSeen).toEqual(reintroduced.timestamp)
    expect(metadata?.count).toBe(1)
  })
})
