---
phase: 64-addsheet-v06
plan: 02
subsystem: ui
tags: [ios, swiftui, transaction-editor, ai-suggest, debounce, observable, pro-gate]

# Dependency graph
requires:
  - phase: 64-addsheet-v06
    plan: 01
    provides: TransactionEditor in-place extension surface (description Section, public API + 3 call-sites stable)
  - backend: app/api/routes/ai_suggest.py
    provides: GET /api/v1/ai/suggest-category?q= (require_pro, confidence>=0.5 filter)
provides:
  - AISuggestCategoryAPI.suggest(q:) — silent non-throwing iOS wrapper (nil on any error)
  - APIClient suppressUnauthHandler flag (401/403 skip global logout when set)
  - "@Observable AISuggestHint debounce/cancel helper with injectable suggest seam"
  - Inline tappable AI category chip in TransactionEditor (create modes)
affects: [transactions, add-sheet, ai]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Silent network wrapper: async -> DTO? (non-throwing) encodes the silent contract in the signature"
    - "Additive suppressUnauthHandler flag to bypass global logout for a Pro-gated 403"
    - "Cancellable-Task debounce in @Observable helper; Task.isCancelled checked AFTER await to defeat stale races"
    - "Injectable closure seam (suggest) for network-free unit tests"

key-files:
  created:
    - ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift
    - ios/BudgetPlanner/Features/Transactions/AISuggestHint.swift
    - ios/BudgetPlannerTests/Features/Transactions/AISuggestHintTests.swift
  modified:
    - ios/BudgetPlanner/Networking/APIClient.swift
    - ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift

key-decisions:
  - "suppressUnauthHandler is additive (default false) on request/requestVoid/rawRequest — existing call-sites behave identically; only AI-suggest opts in"
  - "AISuggestCategoryAPI.suggest is non-throwing (async -> DTO?) so the silent-on-error contract is enforced by the type, not by caller discipline"
  - "Debounce/cancel state extracted to @Observable AISuggestHint (editor is a struct View) with injectable suggest seam → fully unit-testable without HTTP"
  - "Task.isCancelled re-checked AFTER await suggest(q) so a slow stale response cannot overwrite a newer query (stale-race mitigation)"
  - "Chip gated to create modes only (!mode.isEdit) per CONTEXT — edit is not a priority and must not hit the network"
  - "Tap on chip aligns kind to the suggested category for actual modes (kind-filtered Picker would otherwise drop the selection)"

patterns-established:
  - "Pro-gated endpoint accessed with suppressUnauthHandler:true to avoid logging the owner out on a 403"
  - "Silent auxiliary-hint wrapper returning nil on every failure path"

requirements-completed: [AI-V10-03]

# Metrics
duration: 3min
completed: 2026-05-20
---

# Phase 64 Plan 02: Inline AI Category Hint Summary

**Inline debounce AI category hint added to TransactionEditor: typing >=3 chars in «Описание» fires GET /ai/suggest-category?q= via a cancellable-Task @Observable AISuggestHint helper, a tappable «AI: <name>» chip sets categoryId on explicit tap (never auto-applied), and a non-pro 403 silently hides the chip WITHOUT logging the owner out (suppressUnauthHandler).**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-20T14:29:06Z
- **Tasks:** 3
- **Files:** 5 (3 created, 2 modified)

## Accomplishments
- `APIClient.request/requestVoid/rawRequest` gained an additive `suppressUnauthHandler: Bool = false`. When set, the 401 and 403 switch cases skip `onUnauthenticated?()` — so a `require_pro` 403 on the AI endpoint never triggers the global re-auth/logout (T-64-02-02). Existing call-sites (default false) are byte-for-byte unchanged in behaviour.
- `SuggestCategoryDTO {categoryId, name, confidence}` + `AISuggestCategoryAPI.suggest(q:) async -> SuggestCategoryDTO?` — non-throwing; passes `suppressUnauthHandler: true` and returns nil on any error (403/404/network/decoding). The silent contract is in the signature.
- `@MainActor @Observable AISuggestHint` debounce helper: cancels the previous in-flight Task on each `descriptionChanged`, skips queries below `minChars` (no closure call), checks `Task.isCancelled` AFTER `await suggest(q)` so a slow stale response can't overwrite a newer query, and exposes an injectable `suggest` closure seam for tests.
- `TransactionEditor` wired: `@State aiHint`, `.onChange(of: description)` gated to create modes, and a tappable `Label("AI: <name>", systemImage: "sparkles")` chip shown only when `!mode.isEdit && suggestion.categoryId != nil`. `applySuggestion` sets `categoryId` (and aligns `kind` for actual modes) then `clear()` — explicit user action, not auto-apply. No error banner on a missing hint.
- 5 unit tests covering below-min (closure not called), happy-path (trimmed q), stale-cancel race (slow first query loses to fast second), silent-nil, and clear().

## Task Commits

1. **Task 1: AISuggestCategoryAPI wrapper + silent-403 APIClient** — `f429e10` (feat)
2. **Task 2: @Observable AISuggestHint debounce helper + 5 tests** — `b2a0ee3` (feat, TDD)
3. **Task 3: Wire AISuggestHint into TransactionEditor + tappable chip** — `4352349` (feat)

## Files Created/Modified
- `ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift` — `SuggestCategoryDTO` + `AISuggestCategoryAPI.suggest(q:)` silent wrapper (suppressUnauthHandler:true).
- `ios/BudgetPlanner/Features/Transactions/AISuggestHint.swift` — `@Observable` debounce/cancel helper, injectable suggest seam, never mutates categoryId.
- `ios/BudgetPlannerTests/Features/Transactions/AISuggestHintTests.swift` — 5 tests (incl. AsyncGate-coordinated stale-race test).
- `ios/BudgetPlanner/Networking/APIClient.swift` — additive `suppressUnauthHandler` on request/requestVoid/rawRequest; gates onUnauthenticated for 401/403.
- `ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift` — aiHint @State, description .onChange (create-only), tappable chip, applySuggestion helper.

## Decisions Made
See frontmatter `key-decisions`. Highlights: silent contract encoded in the `suggest` return type; debounce/cancel logic in an @Observable helper for testability; stale-race defeated by re-checking `Task.isCancelled` after the await; chip is create-mode-only and applied only on explicit tap (kind aligned for actual modes so the kind-filtered category Picker keeps the selection).

## Deviations from Plan

None - plan executed exactly as written.

Task 2 (TDD): helper and tests were authored and committed together as one cohesive feat unit (sibling-convention from 64-01); RED was implicit since `AISuggestHint`/`SuggestCategoryDTO` did not exist before this plan. The plan's `<verify>` blocks were run via `xcodebuild` (XcodeBuildMCP MCP tools were not exposed to this executor's function set — known upstream tools-restriction behaviour; the documented `xcodebuild` fallback in each `<automated>` block produced equivalent results).

## Threat Surface Scan
No new security-relevant surface beyond the plan's `<threat_model>`. The single new outbound call (`GET /ai/suggest-category`, T-64-02-01 accepted PII) and its 403/error handling (T-64-02-02 mitigated via suppressUnauthHandler; T-64-02-03 stale-race mitigated; T-64-02-04 silent-fail mitigated) are all covered by the register. No new endpoints, schema changes, or auth paths introduced.

## User Setup Required
None.

## Self-Check: PASSED

All 3 created + 2 modified source files verified present; all 3 task commits (f429e10, b2a0ee3, 4352349) found in git history. Build GREEN; AISuggestHintTests (5) + TransactionEditorAccountTests (6) = 11 tests GREEN. grep confirms `suppressUnauthHandler` in APIClient.swift (9) + AISuggestCategoryAPI.swift (3), `AISuggestHint` in TransactionEditor.swift (1), 3 TransactionEditor call-sites unchanged.

---
*Phase: 64-addsheet-v06*
*Completed: 2026-05-20*
