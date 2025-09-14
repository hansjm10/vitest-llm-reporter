/**
 * Test utilities for deduplication testing
 *
 * @module tests/utils/deduplication-helpers
 */

import type { 
  LogEntry, 
  DeduplicationEntry,
  DeduplicationConfig,
  LogLevel,
  ConsoleOutputWithDeduplication
} from '../../src/types/deduplication.js'

/**
 * Create a test log entry
 */
export function createLogEntry(
  message: string,
  level: LogLevel = 'log',
  testId?: string
): LogEntry {
  return {
    message,
    level,
    timestamp: new Date(),
    testId: testId || 'test-' + Math.random().toString(36).substring(7),
  }
}

/**
 * Create multiple log entries with the same message
 */
export function createDuplicateLogEntries(
  message: string,
  count: number,
  level: LogLevel = 'log',
  testIdPrefix = 'test'
): LogEntry[] {
  return Array.from({ length: count }, (_, i) => 
    createLogEntry(message, level, `${testIdPrefix}-${i}`)
  )
}

/**
 * Create log entries with different levels but same message
 */
export function createMultiLevelLogEntries(
  message: string,
  levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
): LogEntry[] {
  return levels.map((level, i) => 
    createLogEntry(message, level, `test-${level}-${i}`)
  )
}

/**
 * Create a mock deduplication entry
 */
export function createDeduplicationEntry(
  key: string,
  message: string,
  level: LogLevel = 'log',
  count = 1,
  sources: string[] = ['test-1']
): DeduplicationEntry {
  const now = new Date()
  return {
    key,
    logLevel: level,
    originalMessage: message,
    normalizedMessage: normalizeMessage(message),
    firstSeen: now,
    lastSeen: now,
    count,
    sources: new Set(sources),
  }
}

/**
 * Normalize a message for comparison (simplified version for testing)
 */
export function normalizeMessage(
  message: string,
  config: Partial<DeduplicationConfig> = {}
): string {
  let normalized = message
  
  // Strip ANSI codes
  if (config.stripAnsiCodes !== false) {
    normalized = normalized.replace(/\x1b\[[0-9;]*m/g, '')
  }
  
  // Strip timestamps (ISO date patterns)
  if (config.stripTimestamps !== false) {
    normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, '')
    normalized = normalized.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '')
  }
  
  // Normalize whitespace
  if (config.normalizeWhitespace !== false) {
    normalized = normalized.replace(/\s+/g, ' ').trim()
  }
  
  return normalized.toLowerCase()
}

/**
 * Generate a deduplication key for testing
 */
export function generateTestKey(level: LogLevel, message: string): string {
  const normalized = normalizeMessage(message)
  const hash = simpleHash(normalized)
  return `${level}:${hash}`
}

/**
 * Simple hash function for testing (not cryptographically secure)
 */
export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Assert that console output has deduplication metadata
 */
export function assertHasDeduplicationMetadata(
  output: ConsoleOutputWithDeduplication,
  expectedCount: number,
  expectedSources?: string[]
): void {
  if (!output.deduplication) {
    throw new Error('Expected deduplication metadata but found none')
  }
  
  if (output.deduplication.count !== expectedCount) {
    throw new Error(
      `Expected count ${expectedCount} but got ${output.deduplication.count}`
    )
  }
  
  if (expectedSources && output.deduplication.sources) {
    const sources = output.deduplication.sources
    if (sources.length !== expectedSources.length) {
      throw new Error(
        `Expected ${expectedSources.length} sources but got ${sources.length}`
      )
    }
    for (const source of expectedSources) {
      if (!sources.includes(source)) {
        throw new Error(`Expected source ${source} not found in ${sources.join(', ')}`)
      }
    }
  }
}

/**
 * Create a large number of diverse log entries for performance testing
 */
export function createLargeLogDataset(
  uniqueMessages: number,
  duplicatesPerMessage: number,
  levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
): LogEntry[] {
  const entries: LogEntry[] = []
  
  for (let i = 0; i < uniqueMessages; i++) {
    const message = `Log message ${i}: ${generateRandomMessage()}`
    const level = levels[i % levels.length]
    
    for (let j = 0; j < duplicatesPerMessage; j++) {
      entries.push(createLogEntry(message, level, `test-${i}-${j}`))
    }
  }
  
  // Shuffle to simulate random order
  return shuffleArray(entries)
}

/**
 * Generate a random message for testing
 */
function generateRandomMessage(): string {
  const templates = [
    'Processing request {}',
    'Connection established to {}',
    'Error occurred: {}',
    'Successfully completed operation {}',
    'Warning: {} detected',
    'Debug: state = {}',
  ]
  
  const template = templates[Math.floor(Math.random() * templates.length)]
  const value = Math.random().toString(36).substring(7)
  return template.replace('{}', value)
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Mock ILogDeduplicator for testing
 */
export class MockLogDeduplicator {
  private entries = new Map<string, DeduplicationEntry>()
  private stats = {
    totalLogs: 0,
    uniqueLogs: 0,
    duplicatesRemoved: 0,
    cacheSize: 0,
    processingTimeMs: 0,
  }
  
  constructor(private config: DeduplicationConfig) {}
  
  isDuplicate(entry: LogEntry): boolean {
    this.stats.totalLogs++
    const key = this.generateKey(entry)
    
    if (this.entries.has(key)) {
      const existing = this.entries.get(key)!
      existing.count++
      existing.lastSeen = entry.timestamp
      if (entry.testId) {
        existing.sources.add(entry.testId)
      }
      this.stats.duplicatesRemoved++
      return true
    }
    
    this.entries.set(key, createDeduplicationEntry(
      key,
      entry.message,
      entry.level,
      1,
      entry.testId ? [entry.testId] : []
    ))
    this.stats.uniqueLogs++
    this.stats.cacheSize = this.entries.size
    return false
  }
  
  generateKey(entry: LogEntry): string {
    return generateTestKey(entry.level, entry.message)
  }
  
  getMetadata(key: string): DeduplicationEntry | undefined {
    return this.entries.get(key)
  }
  
  getAllEntries(): Map<string, DeduplicationEntry> {
    return new Map(this.entries)
  }
  
  getStats() {
    return { ...this.stats }
  }
  
  clear(): void {
    this.entries.clear()
    this.stats = {
      totalLogs: 0,
      uniqueLogs: 0,
      duplicatesRemoved: 0,
      cacheSize: 0,
      processingTimeMs: 0,
    }
  }
  
  isEnabled(): boolean {
    return this.config.enabled
  }
}