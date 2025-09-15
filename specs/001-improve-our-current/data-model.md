# Data Model: Log Deduplication

## Core Entities

### DeduplicationEntry
Represents a unique log entry with tracking metadata.

**Fields:**
- `key: string` - Composite key (logLevel:normalizedMessage)
- `logLevel: LogLevel` - The severity level (debug, info, warn, error)
- `originalMessage: string` - First occurrence of the message
- `normalizedMessage: string` - Message after normalization
- `firstSeen: Date` - Timestamp of first occurrence
- `lastSeen: Date` - Timestamp of most recent occurrence
- `count: number` - Total occurrences
- `sources: Set<string>` - Test IDs that generated this log
- `metadata: Map<string, any>` - Additional context (optional)

**Validation Rules:**
- logLevel must be valid enum value
- count must be >= 1
- sources must contain at least one entry
- key must match pattern: `{level}:{hash}`

**State Transitions:**
- Created → Active (on first log)
- Active → Updated (on duplicate)
- Active → Reported (on output generation)

### DeduplicationCache
Manages the in-memory deduplication state.

**Fields:**
- `entries: Map<string, DeduplicationEntry>` - Unique log entries
- `enabled: boolean` - Feature toggle
- `maxEntries: number` - Cache size limit (default: 10000)
- `stats: DeduplicationStats` - Performance metrics

**Relationships:**
- Contains 0..* DeduplicationEntry instances
- Referenced by ConsoleCapture
- Cleared on test run completion

### LogKey
Composite identifier for duplicate detection.

**Fields:**
- `level: LogLevel` - Log severity
- `hash: string` - Content hash
- `normalized: string` - Normalized content

**Generation Rules:**
- Strip timestamps (ISO date patterns)
- Normalize whitespace (collapse multiple spaces)
- Remove ANSI color codes
- Lowercase for comparison
- Preserve original for display

### DeduplicationStats
Performance and usage metrics.

**Fields:**
- `totalLogs: number` - All logs processed
- `uniqueLogs: number` - Unique entries created
- `duplicatesRemoved: number` - Logs deduplicated
- `cacheSize: number` - Current entry count
- `processingTimeMs: number` - Total processing time

## Type Definitions

### LogLevel
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log' | 'trace';
```

### DeduplicationConfig
```typescript
interface DeduplicationConfig {
  enabled: boolean;
  maxCacheEntries?: number;
  includeSources?: boolean;
  normalizeWhitespace?: boolean;
  stripTimestamps?: boolean;
  stripAnsiCodes?: boolean;
}
```

### DeduplicationOutput
```typescript
interface DeduplicationOutput {
  message: string;
  level: LogLevel;
  count: number;
  firstSeen: string;
  sources?: string[];
  deduplicated: boolean;
}
```

## Integration Points

### ConsoleCapture Extension
The existing ConsoleCapture class will integrate the deduplication cache:
- Check cache before storing in ConsoleBuffer
- Update deduplication metadata on match
- Pass through if deduplication disabled

### ConsoleBuffer Extension
Buffer will track deduplication status:
- Store reference to DeduplicationEntry
- Include deduplication flag in output
- Preserve original message for first occurrence

### OutputBuilder Extension
Output generation will include deduplication metadata:
- Add occurrence count to deduplicated entries
- Include source test list if configured
- Maintain backward compatibility when disabled

## Constraints

### Performance
- Key generation must be < 1ms per log
- Cache lookup must be O(1)
- Memory overhead < 50MB for 10K entries

### Compatibility
- Must not break existing output format
- Configuration must be backward compatible
- Default behavior unchanged (disabled)

### Concurrency
- Thread-safe for parallel test execution
- No race conditions on cache updates
- Consistent state across test isolation

## Example Data Flow

```
1. Test logs: "Connection established" (info level)
2. Generate key: "info:connection_established"
3. Check cache: Not found
4. Create DeduplicationEntry:
   - key: "info:connection_established"
   - count: 1
   - sources: ["test-id-123"]
5. Second test logs same message
6. Generate key: "info:connection_established"  
7. Check cache: Found
8. Update entry:
   - count: 2
   - sources: ["test-id-123", "test-id-456"]
9. Output shows: "Connection established (×2)"
```