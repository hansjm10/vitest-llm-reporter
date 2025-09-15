# Implementation Plan: Improve Test Reporter by Removing Duplicate Logs

**Branch**: `001-improve-our-current` | **Date**: 2025-09-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-improve-our-current/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Implement log deduplication in vitest-llm-reporter to consolidate duplicate console output from multiple tests, reducing noise while preserving debugging context. The solution extends the existing ConsoleCapture system with a configurable deduplication layer that tracks and consolidates logs with the same level and content across the entire test run.

## Technical Context
**Language/Version**: TypeScript 5.x with strict typing (except tests)
**Primary Dependencies**: Vitest, AsyncLocalStorage, Node.js streams
**Storage**: In-memory Map for deduplication cache
**Testing**: Vitest with existing test structure
**Target Platform**: Node.js 18+
**Project Type**: single (library with CLI)
**Performance Goals**: Handle 1000+ tests under 5 seconds, <500MB memory
**Constraints**: <5% performance overhead, backward compatibility required
**Scale/Scope**: Support test suites with 1000+ tests, 10K+ log messages

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (vitest-llm-reporter library)
- Using framework directly? Yes - extending Vitest Reporter interface
- Single data model? Yes - extending existing ConsoleBuffer/LogEntry
- Avoiding patterns? Yes - no unnecessary abstractions

**Architecture**:
- EVERY feature as library? Yes - reporter is a library
- Libraries listed: vitest-llm-reporter (test reporting with deduplication)
- CLI per library: Configured via vitest.config.ts
- Library docs: README.md with configuration options

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Yes
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes - actual Vitest runner
- Integration tests for: new deduplication feature
- FORBIDDEN: Implementation before test, skipping RED phase

**Observability**:
- Structured logging included? Yes - existing debug framework
- Frontend logs → backend? N/A (library only)
- Error context sufficient? Yes - preserves test context

**Versioning**:
- Version number assigned? Will increment minor version
- BUILD increments on every change? Yes
- Breaking changes handled? No breaking changes (opt-in feature)

## Project Structure

### Documentation (this feature)
```
specs/001-improve-our-current/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command) ✓
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT) - SELECTED
src/
├── console/             # Console capture system (extend)
│   ├── ConsoleCapture.ts
│   ├── ConsoleBuffer.ts
│   └── LogDeduplicator.ts  # NEW
├── config/              # Configuration (extend)
├── output/              # Output generation (extend)
└── types/               # Type definitions (extend)

tests/
├── integration/
│   └── deduplication.test.ts  # NEW
└── unit/
    └── LogDeduplicator.test.ts # NEW
```

**Structure Decision**: Option 1 (Single project) - Library with integrated deduplication

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - ✓ All technical decisions resolved through research
   - ✓ Performance characteristics understood
   - ✓ Integration points identified

2. **Generate and dispatch research agents**:
   - ✓ Analyzed existing codebase architecture
   - ✓ Identified console capture integration points
   - ✓ Evaluated performance requirements

3. **Consolidate findings** in `research.md`:
   - ✓ Architecture approach decided
   - ✓ Performance strategy defined
   - ✓ Implementation considerations documented

**Output**: research.md with all NEEDS CLARIFICATION resolved ✓

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`: ✓
   - DeduplicationEntry: Tracks unique logs with metadata
   - DeduplicationCache: Manages deduplication state
   - LogKey: Composite identifier for duplicate detection
   - DeduplicationStats: Performance metrics

2. **Generate API contracts** from functional requirements: ✓
   - Configuration interface extension (deduplication-config.ts)
   - Deduplication service interface (deduplication-service.ts)
   - Output format with metadata (deduplication-output.ts)

3. **Generate contract tests** from contracts: ✓
   - Configuration validation tests (planned)
   - Deduplication behavior tests (planned)
   - Output format verification (planned)

4. **Extract test scenarios** from user stories: ✓
   - Same log, same level → deduplicated
   - Same log, different level → not deduplicated
   - Configuration toggle → enable/disable
   - Large scale → 1000+ tests performance

5. **Update CLAUDE.md incrementally**: ✓
   - Added TypeScript strict typing note
   - Added deduplication feature context
   - Kept under 150 lines (40 lines)

**Output**: data-model.md ✓, /contracts/* ✓, test scenarios ✓, quickstart.md ✓, CLAUDE.md ✓

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (data-model.md, contracts/, quickstart.md)
- Task categories:
  1. Type definitions and interfaces (3 tasks)
  2. Contract tests for TDD (4 tasks) 
  3. Core LogDeduplicator implementation (3 tasks)
  4. ConsoleCapture integration (2 tasks)
  5. OutputBuilder integration (2 tasks)
  6. Configuration integration (2 tasks)
  7. Integration tests (2 tasks)
  8. Performance benchmarks (1 task)

**Ordering Strategy**:
- TDD order: Tests before implementation (contract tests → implementation → integration)
- Dependency order: Types → Core logic → Integration points → Output formatting
- Mark [P] for parallel execution (independent test files, type definitions)

**Task Breakdown Preview**:
1. Create type definitions [P]
2. Write contract tests for configuration [P]
3. Write contract tests for deduplication service [P] 
4. Write contract tests for output format [P]
5. Implement LogDeduplicator core class
6. Integrate with ConsoleCapture
7. Integrate with ConsoleBuffer
8. Extend configuration system
9. Update OutputBuilder for deduplication metadata
10. Write integration tests
11. Add performance benchmarks
12. Update documentation

**Estimated Output**: 15-20 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*No violations - feature follows all constitutional principles*

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*