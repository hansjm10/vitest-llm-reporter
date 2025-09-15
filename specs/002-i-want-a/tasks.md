# Tasks: CI/CD Pipeline with GitHub Actions

**Input**: Design documents from `/specs/002-i-want-a/`
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
- **CI/CD Files**: `.github/workflows/` for GitHub Actions
- Project type: NPM library (single project structure)

## Phase 3.1: Setup
- [ ] T001 Create .github/workflows directory structure if not exists
- [ ] T002 [P] Create GitHub dependabot configuration in .github/dependabot.yml
- [ ] T003 [P] Create reusable setup action in .github/actions/setup/action.yml
- [ ] T004 Verify and update package.json scripts for CI/CD compatibility

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T005 [P] Create workflow validation test in tests/ci/test_ci_workflow.js
- [ ] T006 [P] Create release workflow validation test in tests/ci/test_release_workflow.js
- [ ] T007 [P] Create NPM script validation test in tests/ci/test_npm_scripts.js
- [ ] T008 [P] Create GitHub settings validation test in tests/ci/test_github_settings.js
- [ ] T009 [P] Create artifact management test in tests/ci/test_artifacts.js
- [ ] T010 [P] Create coverage reporting test in tests/ci/test_coverage.js

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T011 Create CI workflow configuration in .github/workflows/ci.yml
- [ ] T012 Create Release workflow configuration in .github/workflows/release.yml
- [ ] T013 [P] Add coverage script to package.json if missing
- [ ] T014 [P] Add type-check script to package.json (already exists as typecheck)
- [ ] T015 [P] Create composite setup action for node/npm in .github/actions/setup/action.yml
- [ ] T016 Configure workflow concurrency groups in ci.yml
- [ ] T017 Configure matrix testing strategy in ci.yml
- [ ] T018 Configure caching strategy for node_modules in workflows
- [ ] T019 Configure artifact upload for test results in ci.yml
- [ ] T020 Configure artifact upload for coverage reports in ci.yml

## Phase 3.4: Integration
- [ ] T021 Integrate coverage reporting with PR comments
- [ ] T022 Configure NPM publishing authentication in release.yml
- [ ] T023 Add version validation logic to release workflow
- [ ] T024 Configure GitHub release asset uploads
- [ ] T025 Add workflow status badges to README.md
- [ ] T026 Configure branch protection rules automation
- [ ] T027 Add workflow dispatch for manual triggers
- [ ] T028 Configure timeout and retry logic for flaky operations

## Phase 3.5: Polish
- [ ] T029 [P] Create workflow documentation in .github/WORKFLOWS.md
- [ ] T030 [P] Add CI/CD section to main README.md
- [ ] T031 [P] Create CONTRIBUTING.md with CI/CD guidelines
- [ ] T032 [P] Add workflow debugging guide in docs/ci-debugging.md
- [ ] T033 Optimize workflow performance with job dependencies
- [ ] T034 Add security scanning workflow in .github/workflows/security.yml
- [ ] T035 Validate all workflows with GitHub's workflow linter
- [ ] T036 Run complete CI/CD pipeline test with mock release

## Dependencies
- Setup tasks (T001-T004) must complete first
- Tests (T005-T010) before implementation (T011-T020)
- Core workflows (T011-T012) before integration (T021-T028)
- All implementation before polish (T029-T036)
- T011 blocks T016, T017, T018, T019, T020
- T012 blocks T022, T023, T024
- T013-T014 can run in parallel with workflow creation

## Parallel Example
```
# Launch T005-T010 together (all test files):
Task: "Create workflow validation test in tests/ci/test_ci_workflow.js"
Task: "Create release workflow validation test in tests/ci/test_release_workflow.js"
Task: "Create NPM script validation test in tests/ci/test_npm_scripts.js"
Task: "Create GitHub settings validation test in tests/ci/test_github_settings.js"
Task: "Create artifact management test in tests/ci/test_artifacts.js"
Task: "Create coverage reporting test in tests/ci/test_coverage.js"

# Launch T029-T032 together (all documentation):
Task: "Create workflow documentation in .github/WORKFLOWS.md"
Task: "Add CI/CD section to main README.md"
Task: "Create CONTRIBUTING.md with CI/CD guidelines"
Task: "Add workflow debugging guide in docs/ci-debugging.md"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing workflows
- Commit after each task with conventional commit messages
- Test workflows in feature branch before merging
- Use act tool locally for workflow testing if needed

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - github-actions-workflow.yml → CI and Release workflow tasks
   - npm-scripts.json → Package.json script tasks
   - github-settings.json → Repository configuration tasks

2. **From Data Model**:
   - CI Workflow Configuration → ci.yml implementation
   - Release Workflow Configuration → release.yml implementation
   - Job Definitions → Individual job configuration tasks

3. **From User Stories**:
   - PR validation story → CI workflow and status checks
   - NPM publishing story → Release workflow and authentication
   - Coverage reporting story → Coverage integration tasks

4. **Ordering**:
   - Setup → Tests → Workflows → Integration → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (T005-T010)
- [x] All entities have implementation tasks (T011-T020)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (marked with [P])
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

## Execution Summary
- **Total Tasks**: 36
- **Parallel Groups**: 4 (T002-T003, T005-T010, T013-T015, T029-T032)
- **Critical Path**: Setup → Tests → CI/Release workflows → Integration
- **Estimated Time**: 4-6 hours with parallel execution