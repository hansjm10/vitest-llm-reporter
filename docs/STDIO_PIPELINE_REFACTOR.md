# Design Document

## Document Control
- **Title**: Consolidate stdio lifecycle and suppression into a single run-scoped pipeline
- **Authors**: Codex
- **Reviewers**: Repository maintainer
- **Status**: Draft
- **Last Updated**: 2026-03-30
- **Related Issues**: Current branch `fix/stdio-teardown-lifecycle-review`; review loop logs preserved in `.git/ralph-wiggum-loop.fez7g66x`
- **Execution Mode**: Hybrid

## 1. Summary
The current stdio subsystem is functionally recoverable but architecturally brittle. Configuration resolution is duplicated, suppression semantics are split across multiple modules, and lifecycle ownership is spread across several reporter hooks. The long-term fix is to replace the current ad hoc arrangement with a single run-scoped stdio pipeline made of three explicit pieces: a canonical stdio plan resolver, a shared suppression policy, and a session/controller that owns interception start, flush, and restore behavior. This should stop the repeated lifecycle/filter regressions, reduce test duplication, and make stdout cleanliness rules easier to reason about and extend.

## 2. Context & Problem Statement
- **Background**:
  - `LLMReporter` resolves stdio defaults and special cases like `pureStdout` in `src/reporter/reporter.ts:185-219`.
  - `StdioInterceptor` resolves overlapping defaults again in `src/console/stdio-interceptor.ts:69-93`.
  - Reporter lifecycle hooks start and stop interception in several places: `src/reporter/reporter.ts:428-435`, `src/reporter/reporter.ts:441-470`, `src/reporter/reporter.ts:700-738`, `src/reporter/reporter.ts:913-924`, `src/reporter/reporter.ts:1016-1173`, and `src/reporter/reporter.ts:1369-1453`.
  - Success-log filtering reuses `StdioFilterEvaluator`, but it applies its own normalization path in `src/events/EventOrchestrator.ts:633-690`.
  - The stdio behavior surface is covered by large overlapping suites in `src/console/stdio-interceptor.test.ts` and `src/reporter/reporter.stdio-suppression.test.ts`.
- **Problem**:
  - The same logical concern is owned in too many places: config resolution, live suppression, buffered-flush policy, teardown passthrough, and success-log filtering.
  - The review/fix loop repeatedly rediscovered the same class of bug because there is no single source of truth for stdio semantics.
  - The current design makes it easy to fix one path while leaving another path stale.
- **Forces**:
  - Machine-readable stdout must remain clean enough for JSON consumers.
  - Reporter hooks must still tolerate Vitest lifecycle quirks, including interception setup before `onTestRunStart()`.
  - Watch mode and `ctx.onClose()` fallback behavior must remain safe.
  - Framework presets and custom filters must remain supported.

## 3. Goals & Non-Goals
- **Goals**:
  1. Make stdio lifecycle ownership explicit and run-scoped.
  2. Ensure one shared suppression policy defines raw-vs-normalized matching for all code paths.
  3. Remove duplicated stdio config resolution and defaulting logic.
  4. Replace boolean-driven shutdown behavior with explicit internal policy enums.
  5. Shrink the regression surface into contract-style tests instead of overlapping behavior-specific suites.
- **Non-Goals**:
  - Redesign the reporter output schema.
  - Change framework preset definitions in `src/console/framework-log-presets.ts`.
  - Rework the console capture subsystem beyond the pieces needed to consume the shared suppression policy.
  - Rebuild `StreamingReporter` in this effort.

## 4. Stakeholders, Agents & Impacted Surfaces
- **Primary Stakeholders**:
  - Repository maintainer
  - Contributors working in reporter lifecycle or console capture code
  - Users relying on clean stdout JSON in CI and editor tooling
- **Agent Roles**:
  - Design Agent: finalize architecture and migration slices
  - Runtime Implementation Agent: build the new stdio plan, policy, and session/controller
  - Test Hardening Agent: replace duplicated tests with contract coverage and e2e assertions
  - Docs Agent: update README and configuration guidance after the refactor lands
- **Affected Packages/Services**:
  - `src/reporter/reporter.ts`
  - `src/console/stdio-interceptor.ts`
  - `src/console/stdio-filter.ts`
  - `src/events/EventOrchestrator.ts`
  - `src/types/reporter.ts`
  - `src/console/framework-log-presets.ts`
  - `src/console/stdio-interceptor.test.ts`
  - `src/reporter/reporter.stdio-suppression.test.ts`
  - `README.md`
- **Compatibility Considerations**:
  - The first refactor phase should preserve current external behavior where practical.
  - Internal contracts should stop encoding behavior through ambiguous combinations like `pureStdout`, `filterPattern: null`, and `flushWithFiltering`.
  - If a public config cleanup follows, it should be a deliberate separate change, not mixed into the core architectural move.

## 5. Current State
The current architecture mixes three responsibilities:

1. `LLMReporter` owns hook timing, config resolution, original writer access, and several shutdown fallbacks.
2. `StdioInterceptor` owns stream patching, line buffering, teardown control-sequence passthrough, and part of the filtering policy.
3. `EventOrchestrator` owns success-log suppression using a different normalization path than the live interception path.

This has several consequences:
- Config resolution is duplicated between `src/reporter/reporter.ts:185-219` and `src/console/stdio-interceptor.ts:69-93`.
- Suppression semantics are partly centralized in `src/console/stdio-filter.ts:24-100`, but caller-specific normalization still lives outside that class.
- The lifecycle contract is inferred from multiple hooks instead of represented directly.
- Tests validate many edge cases, but they do so through two large suites that overlap in responsibility and make failures hard to localize.

## 6. Proposed Solution
### 6.1 Architecture Overview
- **Narrative**:
  - Introduce a single stdio pipeline with three core units:
    1. `StdioPlanResolver`: converts public config into a canonical internal plan.
    2. `StdioSuppressionPolicy`: owns all matching and normalization rules.
    3. `StdioSessionController`: owns lifecycle, buffering, stream patching, and restore behavior for one run.
  - `LLMReporter` should delegate all stdio lifecycle work to the controller.
  - `EventOrchestrator` should no longer call `StdioFilterEvaluator` directly; it should use the shared suppression policy for success-log filtering.
- **Diagram**:

```text
LLMReporter hooks
  -> StdioSessionController
       -> StdioPlanResolver
       -> StdioSuppressionPolicy
       -> StdioSession (stream patching + buffers + restore)

Captured success logs
  -> StdioSuppressionPolicy
```

### 6.2 Detailed Design
- **Runtime Changes**:
  - Add a new internal `ResolvedStdioPlan` type in a dedicated module, for example `src/console/stdio-plan.ts`.
  - Move all constructor-time and update-time stdio defaulting into the plan resolver. `LLMReporter` and `StdioInterceptor` must stop performing their own default resolution.
  - Replace the current interceptor-owned lifecycle with a controller that exposes explicit operations:
    - `armForRun()`
    - `beginRun()`
    - `endRunBeforeReport()`
    - `abortOnClose()`
    - `getWriters()`
    - `updatePlan()`
  - Represent buffer shutdown behavior with an internal enum such as `bufferedTailPolicy: 'emit' | 'filter' | 'discard'` instead of deriving it from booleans.
  - Treat teardown passthrough as a narrow session concern: only control-only chunks may bypass suppression, and only while the session is active.
- **Data & Schemas**:
  - No JSON output schema changes are required.
  - Add explicit internal types for:
    - `ResolvedStdioPlan`
    - `SuppressionDecision`
    - `BufferedTailPolicy`
    - `SessionState`
- **APIs & Contracts**:
  - The policy should provide stable methods such as:
    - `shouldSuppressLiveLine(rawLine, source)`
    - `shouldSuppressBufferedChunk(rawChunk, source)`
    - `filterCapturedConsoleMessage(message)`
  - Normalization for framework presets must occur inside the policy, not at each callsite.
  - The controller should be the only module allowed to call `process.stdout.write = ...` or `process.stderr.write = ...`.
- **Tooling & Automation**:
  - Add test helpers that execute scenario tables instead of hand-encoding every lifecycle combination inline.
  - Add one e2e scenario that validates JSON cleanliness when noisy framework output is emitted before run start, during the run, and during teardown.

### 6.3 Operational Considerations
- **Deployment**:
  - No deployment changes.
  - Land in slices so behavior diffs stay reviewable.
- **Telemetry & Observability**:
  - Expand debug logging around session state transitions, resolved plan shape, and buffered-tail decisions.
  - Emit counters in debug mode for suppressed live lines, suppressed captured lines, passthrough control chunks, and post-run writes.
- **Security & Compliance**:
  - No new external permissions or data flows.
  - Maintain current behavior of ignoring predicate errors to avoid breaking stdout.

## 7. Work Breakdown & Delivery Plan
### 7.1 Issue Map

| Issue Title | Scope Summary | Proposed Assignee/Agent | Dependencies | Acceptance Criteria |
|-------------|---------------|-------------------------|--------------|---------------------|
| `refactor(stdio): centralize stdio plan resolution` | Create a single resolver for `pureStdout`, `stdio`, presets, and flush policy | Runtime Implementation Agent | Design doc approval | `LLMReporter` and interceptor stop duplicating stdio default resolution; unit tests cover plan combinations |
| `refactor(stdio): introduce shared suppression policy` | Move raw-vs-normalized matching into one policy used by interception and success-log filtering | Runtime Implementation Agent | Plan resolver | No external normalization logic remains outside the policy; regression tests cover framework and user filters |
| `refactor(stdio): add run-scoped session controller` | Replace scattered lifecycle logic with one controller/session abstraction | Runtime Implementation Agent | Plan resolver, suppression policy | Reporter hooks delegate to controller; writers are restored deterministically before JSON output |
| `test(stdio): replace overlapping lifecycle regressions with contract matrix` | Build helper-driven unit/integration coverage for lifecycle phases and buffered-tail behavior | Test Hardening Agent | Session controller | Fewer duplicate tests; scenario matrix covers `onInit`, `onTestRunStart`, `onTestRunEnd`, `onFinished`, and `onClose` |
| `docs(stdio): rewrite user guidance after refactor` | Update README examples and configuration semantics | Docs Agent | Runtime refactor | README matches shipped behavior and no longer documents removed/changed semantics inaccurately |

### 7.2 Milestones
- **Phase 1**: Land `ResolvedStdioPlan` and migrate config resolution to it without changing interception behavior.
- **Phase 2**: Land `StdioSuppressionPolicy` and migrate `EventOrchestrator` to use it for success-log filtering.
- **Phase 3**: Land `StdioSessionController`, remove lifecycle ownership from `LLMReporter`, and collapse duplicate tests.
- **Phase 4**: Update docs and consider a separate public API cleanup if the internal model exposes redundant options.

### 7.3 Coordination Notes
- **Hand-off Package**:
  - Review loop logs in `.git/ralph-wiggum-loop.fez7g66x`
  - Current lifecycle and config code in `src/reporter/reporter.ts`
  - Current interception code in `src/console/stdio-interceptor.ts`
  - Current suppression policy in `src/console/stdio-filter.ts`
  - Current success-log filtering in `src/events/EventOrchestrator.ts`
- **Communication Cadence**:
  - One design review before Phase 1
  - One implementation review at the end of each phase
  - Final docs review after Phase 4

## 8. Agent Guidance & Guardrails
- **Context Packets**:
  - Read `src/reporter/reporter.ts`, `src/console/stdio-interceptor.ts`, `src/console/stdio-filter.ts`, and `src/events/EventOrchestrator.ts` before editing.
  - Read the stdio sections in `README.md:371-458`.
- **Prompting & Constraints**:
  - Keep the refactor internal-first; do not mix public API redesign into the lifecycle/policy refactor.
  - Prefer deleting duplicated code over adding compatibility branches inside the new pipeline.
  - Preserve the requirement that interception is active before concurrent run-start hooks can emit framework noise.
- **Safety Rails**:
  - Do not reintroduce duplicate stdio config resolution.
  - Do not let `EventOrchestrator` own its own normalization rules after the shared policy lands.
  - Do not let mixed suppressed lines leak detached reset or cursor-control suffixes into stdout.
- **Validation Hooks**:
  - `npm test -- src/console/stdio-interceptor.test.ts src/reporter/reporter.stdio-suppression.test.ts src/reporter/reporter.test.ts`
  - `npm run type-check`
  - `npm run lint`

## 9. Alternatives Considered
- Keep patching the current design:
  - Rejected because each fix still has to reason across duplicated ownership boundaries.
- Move all logic into `LLMReporter`:
  - Rejected because `LLMReporter` is already large and would remain responsible for matching semantics, buffering, and hook timing.
- Keep current architecture but add more tests:
  - Rejected because the failure mode is ownership ambiguity, not just missing assertions.
- Redesign the public stdio API first:
  - Rejected for the first pass because the internal ownership problem exists regardless of the external shape.

## 10. Testing & Validation Plan
- **Unit / Integration**:
  - Add unit tests for plan resolution and suppression policy normalization.
  - Add controller/session tests for:
    - pre-run interception
    - run-end restore before JSON flush
    - `onFinished()` fallback
    - `ctx.onClose()` discard path
    - control-only passthrough
    - buffered partial chunk behavior
  - Keep one reporter integration suite that validates hook ordering end-to-end.
- **Performance**:
  - Verify no meaningful regression in reporter overhead for standard suites.
  - Avoid extra regex compilation or per-line config resolution on hot paths.
- **Tooling / A11y**:
  - Add one process-level e2e test that confirms stdout remains parseable JSON under noisy framework output.
  - N/A for accessibility.

## 11. Risks & Mitigations
- **Risk**: Hook sequencing changes break edge cases in watch mode or teardown.
  - **Mitigation**: Model lifecycle explicitly in the controller and cover each transition with tests.
- **Risk**: Success-log filtering diverges from live interception again.
  - **Mitigation**: Route both through one suppression policy and remove callsite normalization.
- **Risk**: Internal refactor changes visible behavior for existing users.
  - **Mitigation**: Preserve external behavior first; isolate any intentional behavior changes and document them.
- **Risk**: The controller abstraction becomes another wrapper around the same complexity.
  - **Mitigation**: Move ownership, not just method calls. `LLMReporter` should stop directly managing interception state.

## 12. Rollout Plan
- **Milestones**:
  - Land Phase 1 and Phase 2 first because they reduce duplication without changing lifecycle timing.
  - Land Phase 3 once policy and plan are centralized.
  - Land docs after behavior is stable.
- **Migration Strategy**:
  - Keep the current public config shape during the main internal refactor.
  - Translate public config into `ResolvedStdioPlan` once and pass the plan downward.
  - Delete obsolete merge/default code from reporter and interceptor as each phase lands.
- **Communication**:
  - Note in changelog/README that stdio internals were consolidated to improve reliability.
  - If any behavior changes are intentional, include a focused migration note with before/after examples.

## 13. Open Questions
- Should `autoDetectFrameworks` re-run on every `updateConfig()` call, or remain an init-time operation?
- Should success-log output preserve raw control prefixes for user-defined filters, or only for live stream interception?
- Should standalone terminal control chunks be preserved after `onTestRunEnd()`, or only before writer restoration?
- Should `StreamingReporter` eventually adopt the same session/controller for consistency?

## 14. Follow-Up Work
- Evaluate whether `pureStdout` and `flushWithFiltering` should survive as public options after the internal model stabilizes.
- Add debug-mode diagnostics that print the resolved stdio plan and active session state.
- Consider extracting a small shared child-process e2e harness for stdout pollution regression testing.

## 15. References
- `src/reporter/reporter.ts:185-219`
- `src/reporter/reporter.ts:428-470`
- `src/reporter/reporter.ts:700-738`
- `src/reporter/reporter.ts:913-924`
- `src/reporter/reporter.ts:1016-1173`
- `src/reporter/reporter.ts:1369-1453`
- `src/console/stdio-interceptor.ts:69-93`
- `src/console/stdio-interceptor.ts:171-388`
- `src/console/stdio-filter.ts:24-100`
- `src/events/EventOrchestrator.ts:633-690`
- `README.md:371-458`
- `.git/ralph-wiggum-loop.fez7g66x/iteration-01/review.txt`
- `.git/ralph-wiggum-loop.fez7g66x/iteration-02/review.txt`
- `.git/ralph-wiggum-loop.fez7g66x/iteration-03/review.txt`

## Appendix A — Glossary
- **Resolved Stdio Plan**: Canonical internal representation of all stdio behavior choices after config defaulting.
- **Suppression Policy**: Shared matcher and normalization logic used for live interception and captured-console filtering.
- **Session Controller**: Run-scoped owner of interception start, stop, flush, and restore transitions.
- **Buffered Tail**: Partial line or control chunk still held in memory when a run ends or the reporter closes.

## Appendix B — Change Log
| Date       | Author | Change Summary |
|------------|--------|----------------|
| 2026-03-30 | Codex  | Initial draft for stdio pipeline consolidation |
