# Tasks: Log Deduplication for vitest-llm-reporter

**Input**: Design documents from `/specs/001-improve-our-current/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- **vitest-llm-reporter**: Existing library structure with new deduplication feature
- Paths shown below are based on existing project structure

## Phase 3.1: Setup
- [ ] T001 [P] Create new type definitions file at src/types/deduplication.ts
- [ ] T002 [P] Create LogDeduplicator service file at src/console/LogDeduplicator.ts
- [ ] T003 [P] Update TypeScript configuration to include new types

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T004 [P] Contract test for DeduplicationConfig in tests/contract/deduplication-config.test.ts
- [ ] T005 [P] Contract test for ILogDeduplicator service in tests/contract/deduplication-service.test.ts
- [ ] T006 [P] Contract test for DeduplicationOutput format in tests/contract/deduplication-output.test.ts
- [ ] T007 [P] Integration test for duplicate detection in tests/integration/deduplication.test.ts
- [ ] T008 [P] Integration test for configuration toggle in tests/integration/deduplication-config.test.ts
- [ ] T009 [P] Integration test for large-scale performance in tests/integration/deduplication-performance.test.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T010 Implement DeduplicationEntry and related types in src/types/deduplication.ts
- [ ] T011 Implement LogDeduplicator core class with key generation in src/console/LogDeduplicator.ts
- [ ] T012 Add isDuplicate and getMetadata methods to LogDeduplicator in src/console/LogDeduplicator.ts
- [ ] T013 Implement cache management and stats tracking in src/console/LogDeduplicator.ts
- [ ] T014 Extend LLMReporterConfig with deduplication options in src/config/index.ts
- [ ] T015 Integrate LogDeduplicator into ConsoleCapture.captureOutput() in src/console/ConsoleCapture.ts
- [ ] T016 Update ConsoleBuffer to track deduplication metadata in src/console/ConsoleBuffer.ts
- [ ] T017 Extend OutputBuilder to include deduplication metadata in src/output/OutputBuilder.ts

## Phase 3.4: Integration
- [ ] T018 Wire up configuration from vitest.config.ts to reporter in src/reporter.ts
- [ ] T019 Add deduplication state reset for watch mode in src/reporter.ts
- [ ] T020 Implement debug logging for deduplication stats in src/console/LogDeduplicator.ts
- [ ] T021 Add memory monitoring for deduplication cache in src/console/LogDeduplicator.ts

## Phase 3.5: Polish
- [ ] T022 [P] Unit tests for message normalization in tests/unit/LogDeduplicator.test.ts
- [ ] T023 [P] Unit tests for key generation in tests/unit/LogDeduplicator.test.ts
- [ ] T024 [P] Unit tests for cache eviction in tests/unit/LogDeduplicator.test.ts
- [ ] T025 Performance benchmark with 1000+ tests in tests/benchmark/deduplication.benchmark.ts
- [ ] T026 [P] Update README.md with deduplication configuration docs
- [ ] T027 Verify quickstart scenarios work as documented

## Dependencies
- Setup (T001-T003) can run in parallel
- Tests (T004-T009) before implementation (T010-T017)
- T010 blocks T011-T013 (type definitions needed)
- T011 blocks T015-T016 (core class needed)
- T014 blocks T018 (config types needed)
- T015-T017 must complete before T018-T021
- Implementation before polish (T022-T027)

## Parallel Example
```
# Launch T004-T009 together (all contract and integration tests):
Task: "Contract test for DeduplicationConfig in tests/contract/deduplication-config.test.ts"
Task: "Contract test for ILogDeduplicator service in tests/contract/deduplication-service.test.ts"
Task: "Contract test for DeduplicationOutput format in tests/contract/deduplication-output.test.ts"
Task: "Integration test for duplicate detection in tests/integration/deduplication.test.ts"
Task: "Integration test for configuration toggle in tests/integration/deduplication-config.test.ts"
Task: "Integration test for large-scale performance in tests/integration/deduplication-performance.test.ts"
```

```
# Launch T022-T024, T026 together (unit tests and docs):
Task: "Unit tests for message normalization in tests/unit/LogDeduplicator.test.ts"
Task: "Unit tests for key generation in tests/unit/LogDeduplicator.test.ts"
Task: "Unit tests for cache eviction in tests/unit/LogDeduplicator.test.ts"
Task: "Update README.md with deduplication configuration docs"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task
- Avoid: vague tasks, same file conflicts
- Performance target: <5% overhead for 1000 tests
- Memory target: <50MB for 10K unique entries
- Configuration must be backward compatible (default: disabled)

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - deduplication-config.ts → T004 contract test [P]
   - deduplication-service.ts → T005 contract test [P]
   - deduplication-output.ts → T006 contract test [P]

2. **From Data Model**:
   - DeduplicationEntry → T010 type definition
   - DeduplicationCache → T011-T013 core implementation
   - LogKey → T011 key generation logic
   - DeduplicationStats → T013 stats tracking

3. **From User Stories (quickstart.md)**:
   - Multiple tests same log → T007 integration test [P]
   - Different log levels → T007 integration test [P]
   - Large test suite → T009 performance test [P]
   - Configuration toggle → T008 integration test [P]

4. **Ordering**:
   - Setup → Tests → Types → Core → Integration → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (T004-T006)
- [x] All entities have implementation tasks (T010-T013)
- [x] All tests come before implementation (T004-T009 before T010-T021)
- [x] Parallel tasks truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Performance requirements addressed (T009, T025)
- [x] Configuration backward compatibility ensured (T014, T018)