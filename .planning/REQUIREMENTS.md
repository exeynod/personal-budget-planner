# REQUIREMENTS — v1.0.1 UI Conformance & Tech Debt

## Phase 29 — UI Conformance Audit & Critical Fixes

- [ ] **UICONF-01** — Web Playwright snapshot baselines созданы для всех 8 V10 экранов (Home, Transactions, AddSheet, CategoryDetail, PLAN мая, Subscriptions, Savings, AI initial-state) с onboarded test fixture.
- [ ] **UICONF-02** — UI-REVIEW.md содержит per-screen deviation report против `prototype/index.html` (web) с severity classification (BLOCKER / WARNING / INFO).
- [ ] **UICONF-03** — iOS UI-REVIEW.md содержит per-screen deviation report через XcodeBuildMCP screenshots vs DESIGN-SYSTEM.md spec.
- [ ] **UICONF-04** — Все BLOCKER-уровневые deviations исправлены (commits с `fix(ui-conf):` префиксом); re-run snapshots green.
- [ ] **UICONF-05** — WARNING/INFO deviations задокументированы в DIVERGENCES.md с v1.1 backlog reference.

## Phase 30 — Tech Debt Cleanup

- [ ] **DEBT-01** — `npx tsc --noEmit` exit 0 (фикс pre-existing errors в `analytics.ts`, `AiView.tsx`, `TxV10TabDemote.test.tsx`, `AiView.test.tsx`).
- [ ] **DEBT-02** — AddSheet submit handler triggers refetch на parent screens (HomeMount + TransactionsMount); `data-testid="parent-refetched"` updates после successful create.
- [ ] **DEBT-03** — Account picker заменён на bottom-sheet list (web + iOS); row-cycler удалён.
- [ ] **DEBT-04** — iOS SubscriptionMenuSheet day/price editor PATCH error surfaces via PosterToast (не silent fail); web equivalent.
- [ ] **DEBT-05** — Web Transactions row swipe-left delete (parity с iOS swipeActions); fallback right-click context menu для desktop.
- [ ] **DEBT-06** — iOS PosterStyle.swift + KeypadView.swift press-feedback uses `.posterAnimation(...)` modifier (replace bare `.animation()`); reduce-motion respected.
- [ ] **DEBT-07** — iOS SettingsAPI extracted to own `SettingsAPI.swift` file (cosmetic re-org per Plan 27-11 frontmatter intent).

## Phase 31 — Regression Hardening

- [ ] **REG-01** — Playwright fixture `tests/e2e/fixtures/onboarded-user.ts` setups onboarded test user via `/api/v1/internal/onboarding/*` (test-mode bypass); reused by acceptance + pixel specs.
- [ ] **REG-02** — `v10-acceptance-tz14.spec.ts` проходит зелёным (CTA label flexible regex matching dynamic state).
- [ ] **REG-03** — `v10-pixel-snapshots.spec.ts` генерирует все 8 baselines на dev machine; diff fails на сознательно introduced regression (sanity).
- [ ] **REG-04** — iOS XCTest 358/358 (testRoundRubles + testCycleDayClampedInFebruary либо fixed, либо `XCTSkipIf` с TODO).

---

## Traceability

| ID | Phase | Status |
|----|-------|--------|
| UICONF-01 | Phase 29 | Pending |
| UICONF-02 | Phase 29 | Pending |
| UICONF-03 | Phase 29 | Pending |
| UICONF-04 | Phase 29 | Pending |
| UICONF-05 | Phase 29 | Pending |
| DEBT-01 | Phase 30 | Pending |
| DEBT-02 | Phase 30 | Pending |
| DEBT-03 | Phase 30 | Pending |
| DEBT-04 | Phase 30 | Pending |
| DEBT-05 | Phase 30 | Pending |
| DEBT-06 | Phase 30 | Pending |
| DEBT-07 | Phase 30 | Pending |
| REG-01 | Phase 31 | Pending |
| REG-02 | Phase 31 | Pending |
| REG-03 | Phase 31 | Pending |
| REG-04 | Phase 31 | Pending |

**Coverage:** 16/16 requirements mapped ✓
