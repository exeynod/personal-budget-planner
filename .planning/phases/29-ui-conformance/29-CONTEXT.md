# Phase 29: UI Conformance Audit & Critical Fixes — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (v1.0.1 patch milestone — discuss skipped, ROADMAP+REQUIREMENTS as spec).

<domain>
## Phase Boundary

Pixel-perfect аудит каждого V10 экрана против эталонного `prototype/index.html`
(web — Maximal Poster reference) и DESIGN-SYSTEM.md spec (iOS), produce
UI-REVIEW.md с deviations classified BLOCKER/WARNING/INFO; fix BLOCKER-уровневые
inline. WARNING/INFO — в DIVERGENCES.md под v1.1 backlog.

8 экранов:
1. Home (coral)
2. Transactions (cobalt)
3. AddSheet (black)
4. CategoryDetail (cobalt/red)
5. PLAN мая (cobalt)
6. Subscriptions (coral)
7. Savings (black)
8. AI initial-state (black)

</domain>

<decisions>
## Implementation Decisions

### Reference sources
- **Web prototype:** `.planning/v1.0-handoff/handoff/prototype/index.html` — single-page rendered mockup.
- **iOS spec:** `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` + `SCREENS.md` per-screen sections.
- **Token source-of-truth:** `frontend/src/styles/tokens.css` (web) + `ios/BudgetPlanner/PosterTokens.swift` (iOS).
- **Existing DIVERGENCES.md:** `.planning/v1.0-handoff/DIVERGENCES.md` — pre-known web/iOS/cross deviations (W-01..W-05, I-01..I-05, X-01..X-02). Audit must NOT re-flag known items.

### Audit method
- **Web:** Playwright snapshots с onboarded test fixture (нужно построить — это REG-01 dependency, но Phase 29 может включить inline). For each of 8 screens: `npx playwright test v10-pixel-snapshots --update-snapshots` → manually open `index.html` in same browser → side-by-side dimensional comparison.
- **iOS:** XcodeBuildMCP screenshots на iPhone 17 Pro Simulator → compare с DESIGN-SYSTEM.md per-screen text descriptions + token spec.

### Severity classification
- **BLOCKER:** wrong color (≥3 digit hex difference), missing element, completely wrong layout (e.g., element order swapped), broken animation reference.
- **WARNING:** spacing drift (1-3px), opacity drift (5-15%), font-weight mismatch (e.g., 500 vs 600), shadow radius off.
- **INFO:** subjective polish (icon alignment, micro-animation timing within easing curves).

### Scope guardrails
- Phase 29 fixes ONLY BLOCKER-level deviations. WARNING/INFO go to DIVERGENCES.md → Phase 28 already deferred polish, but new findings get logged for v1.1.
- Phase 29 MUST produce a Playwright fixture for onboarded user (basic version — full version is Phase 31 REG-01) to enable snapshot generation. Inline ok.
- 5-min Lighthouse + count-up wall-clock items inherited from Phase 28 — owner manual still, NOT Phase 29 scope.

</decisions>

<code_context>
- Playwright spec scaffold: `frontend/tests/e2e/v10-pixel-snapshots.spec.ts` (Plan 28-03)
- Existing DIVERGENCES.md: `.planning/v1.0-handoff/DIVERGENCES.md`
- Web V10 screens: `frontend/src/screensV10/{Home,Transactions,AddSheet,CategoryDetail,Plan,Subscriptions,Savings,Ai}/`
- iOS V10 screens: `ios/BudgetPlanner/FeaturesV10/{Home,Transactions,AddSheet,CategoryDetail,Plan,Subscriptions,Savings,Ai}/`
- prototype: `.planning/v1.0-handoff/handoff/prototype/index.html` (1100+ lines render of all 8 screens)
- internal onboarding endpoint: `/api/v1/internal/onboarding/*` (Phase 22 BE-15) — protected by X-Internal-Token, perfect for test-mode user setup.
</code_context>

<specifics>
## Specific Ideas

**Suggested plan structure:**
- 29-01: web onboarded-user fixture for Playwright (inline minimal version) + snapshot generation для 8 экранов
- 29-02: web side-by-side analysis vs prototype/index.html → UI-REVIEW.md (web section)
- 29-03: iOS XcodeBuildMCP screenshots для 8 экранов + UI-REVIEW.md (iOS section)
- 29-04: BLOCKER-fix wave (parallel where possible) — only screens with BLOCKER-уровневыми deviations get a fix-plan
- 29-05: re-snapshot + verify; commit DIVERGENCES.md update with WARNING/INFO

</specifics>

<deferred>
## Deferred Ideas

- Lighthouse score improvement → v1.1 (POL-05 already documented at 233 kB woff2)
- Playwright visual regression CI integration → v1.1
- iOS snapshot-test framework (e.g., Point-Free SnapshotTesting) → v1.1
</deferred>
