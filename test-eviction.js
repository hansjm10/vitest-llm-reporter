import { LogDeduplicator } from './src/console/LogDeduplicator.js'

const deduplicator = new LogDeduplicator({
  enabled: true,
  maxCacheEntries: 10
})

// Add 20 unique messages
for (let i = 0; i < 20; i++) {
  const entry = {
    message: `Message ${i}`,
    level: 'info',
    timestamp: new Date(Date.now() + i * 1000)
  }
  deduplicator.isDuplicate(entry)
  if (i === 9 || i === 10 || i === 19) {
    const stats = deduplicator.getStats()
    console.log(`After entry ${i}: cacheSize=${stats.cacheSize}, uniqueLogs=${stats.uniqueLogs}`)
  }
}

const finalStats = deduplicator.getStats()
console.log(`Final: cacheSize=${finalStats.cacheSize}, uniqueLogs=${finalStats.uniqueLogs}`)
