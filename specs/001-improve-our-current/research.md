# Research: Log Deduplication for vitest-llm-reporter

## Overview
Research findings for implementing duplicate log detection and consolidation in the vitest-llm-reporter to improve test output clarity when running large test suites.

## Technical Context Decisions

### Language/Framework
- **Decision**: TypeScript with strict typing (except tests)
- **Rationale**: Project already uses TypeScript throughout with strict configurations
- **Alternatives considered**: None - maintaining existing technology stack

### Architecture Approach
- **Decision**: Extend existing ConsoleCapture system with deduplication layer
- **Rationale**: Current architecture already captures all console output centrally
- **Alternatives considered**: 
  - Post-processing approach - Rejected due to loss of real-time deduplication
  - External service - Rejected as overly complex for the requirement

### Performance Strategy
- **Decision**: In-memory hash-based deduplication with configurable cache size
- **Rationale**: Fast O(1) lookups needed for 1000+ tests, memory overhead acceptable
- **Alternatives considered**:
  - Database storage - Rejected due to complexity and latency
  - File-based caching - Rejected due to I/O overhead

## Current System Analysis

### Console Capture Architecture
The reporter already implements a sophisticated console capture system:
- **ConsoleCapture class**: Central interception point for all console methods
- **Thread-safe design**: Uses AsyncLocalStorage for parallel test isolation
- **Buffered approach**: Per-test ConsoleBuffer instances with limits
- **Method coverage**: Captures log, error, warn, debug, info, trace

### Configuration System
Existing configuration structure supports extension:
- **StdioConfig**: Already handles filtering and suppression
- **LLMReporterConfig**: Extensible for new deduplication options
- **Environment variables**: Support for debug and feature flags

### Performance Characteristics
Current benchmarks show good scalability:
- 1000 tests: < 5000ms, < 500MB memory
- 2000 tests: < 10000ms, < 800MB memory
- Memory monitoring: 500MB warning threshold already in place

## Implementation Considerations

### Deduplication Key Generation
- **Decision**: Composite key of `logLevel + normalizedMessage`
- **Rationale**: Ensures same content at different levels remains distinct
- **Message normalization**: Strip timestamps, normalize whitespace

### Similarity Detection
- **Decision**: Exact match after normalization for v1, consider fuzzy matching for v2
- **Rationale**: Simpler implementation, predictable behavior
- **Future enhancement**: Levenshtein distance for "similar" detection

### Metadata Tracking
- **Decision**: Track occurrence count, first timestamp, source tests
- **Rationale**: Preserves debugging context while reducing noise
- **Storage**: Lightweight Map structure with configurable size limit

### Integration Points
1. **ConsoleCapture.captureOutput()**: Primary interception point
2. **ConsoleBuffer**: Add deduplication check before storage
3. **OutputBuilder**: Include deduplication metadata in output
4. **Configuration**: Add `deduplicateLogs` boolean flag

## Risk Analysis

### Performance Impact
- **Risk**: Hash computation overhead on every log
- **Mitigation**: Efficient hashing, early exit for disabled feature
- **Monitoring**: Extend existing performance tracking

### Memory Overhead
- **Risk**: Deduplication cache growth with large test suites
- **Mitigation**: Configurable cache size, LRU eviction strategy
- **Default limit**: 10,000 unique entries

### Debugging Experience
- **Risk**: Lost context from hidden duplicates
- **Mitigation**: Preserve metadata showing occurrence count and sources
- **Option**: Debug mode to disable deduplication

## Compatibility Requirements

### Vitest Integration
- Must maintain Reporter interface compatibility
- Preserve existing lifecycle event handling
- Support watch mode with proper state reset

### Output Format
- Maintain backward compatibility with existing JSON structure
- Add optional deduplication metadata fields
- Preserve streaming output capability

### Configuration Migration
- Default to disabled for backward compatibility
- Clear documentation for enabling feature
- Support both config file and CLI options

## Testing Strategy

### Unit Tests
- Deduplication logic isolation
- Key generation consistency
- Cache management behavior

### Integration Tests
- End-to-end deduplication across test suite
- Configuration option validation
- Performance benchmarks with feature enabled

### Edge Cases
- Parallel test execution
- Watch mode state management
- Memory pressure scenarios
- Disabled feature bypass

## Conclusion

The existing vitest-llm-reporter architecture provides an excellent foundation for implementing log deduplication. The centralized console capture system, robust configuration framework, and proven performance characteristics support adding this feature with minimal architectural changes. The implementation should focus on extending the current ConsoleCapture and ConsoleBuffer components while maintaining backward compatibility and performance targets.