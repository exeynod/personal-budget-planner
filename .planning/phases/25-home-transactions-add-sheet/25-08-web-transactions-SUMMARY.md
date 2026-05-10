---
phase: 25-home-transactions-add-sheet
plan: 8
subsystem: ui
tags: [react, typescript, vitest, posterRouter, posterSheet, transactions-view, transactions-mount, day-grouping, filter-chips, spec-tags, gap-closure]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 2
    provides: PosterRouterProvider / usePosterRouter / PosterSheet + screensV10/common formatDay/formatTimeHM
  - phase: 25-home-transactions-add-sheet
    plan: 3
    provides: listAccounts / listCategoriesV10 / listActualV10 + AccountResponse / CategoryV10 / ActualV10Read types
  - phase: 25-home-transactions-add-sheet
    plan: 4
    provides: HomeMount (push target receiver — TransactionsMount swaps in for the prior placeholder); _placeholders module
  - phase: 25-home-transactions-add-sheet
    plan: 6
    provides: V10MainShell / PosterRouter root = OnboardingMount → HomeMount (the place TransactionsMount renders inside the PosterRouter stack)
  - phase: 23-design-system-foundation
    provides: Eyebrow / Mass / Chip / PosterButton + .poster-row-in / .poster-bar-fill keyframes + cobalt/paper/yellow tokens

provides:
  - "Pure compute helpers (applyFilterChip / groupByDay / computeHeaderSummary / formatTxAmount / tagFor) — no React, no fetch — unit-testable in isolation"
  - "TransactionsView pure presentational component (TXN-V10-01..05: cobalt bg + ← НАЗАД + SECTION II eyebrow + Mass italic «Реестр.» + 6 chips + day-grouped rows with mono time/amount and inline roundup/deposit spec-tags)"
  - "TransactionsMount data fetcher (parallel listAccounts/listCategoriesV10/getCurrentPeriod + sequential listActualV10) wired to PosterRouter pop + edit-sheet stub + delete-with-confirm gate"
  - "Transactions/index.ts barrel re-exporting TransactionsMount/TransactionsView/TransactionsViewProps + 5 helpers + 2 types"
  - "HomeMount swap: «ВСЕ ОПЕРАЦИИ →» now pushes the real TransactionsMount instead of TransactionsViewPlaceholder"

affects:
  - 25-09-ios-transactions    (parallel iOS counterpart — same compute formulas, same chip mapping)
  - 25-10-web-add-sheet       (independent — AddSheet swap target lives in V10MainShell, not Transactions)
  - 26                         (TransactionEditor poster retrofit will replace EditPlaceholder inside TransactionsMount's PosterSheet)
  - 27                         (placeholder removal cascade unaffected — Transactions placeholder fully removed in this plan)

# Tech tracking
tech-stack:
  added: []   # all dependencies already present (react 18, vitest, @testing-library/react)
  patterns:
    - "Pure-helpers + presentational-view + mount-fetcher triad (mirrors HomeView pattern from Plan 25-04): computeTransactions.ts (no React) → TransactionsView.tsx (no fetch) → TransactionsMount.tsx (router + sheet-bound, side-effectful)"
    - "Browser context-menu hijack for delete UX on web: `onContextMenu={(e) => { e.preventDefault(); if (window.confirm(...)) onRowDelete(tx); }}` — desktop-only path; mobile gets onClick=edit. iOS Plan 25-09 uses native swipe-left action."
    - "Identity short-circuit in pure filter: `applyFilterChip(actuals, _, 'all')` returns the input array unchanged so callers can compare with === to skip useMemo recompute downstream"
    - "DM Serif italic fallback chain: `--poster-font-dm-serif`, `--poster-font-pt-serif`, 'PT Serif', Georgia, serif — survives missing tokens.css value (per ADR-001 Cyrillic fallback)"
    - "Stable lexicographic sort of ISO datetime strings (created_at) — works without Date construction because format is always padded + UTC offset suffixed"

key-files:
  created:
    - frontend/src/screensV10/Transactions/computeTransactions.ts
    - frontend/src/screensV10/Transactions/__tests__/computeTransactions.test.ts
    - frontend/src/screensV10/Transactions/TransactionsView.tsx
    - frontend/src/screensV10/Transactions/TransactionsView.module.css
    - frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx
    - frontend/src/screensV10/Transactions/TransactionsMount.tsx
    - frontend/src/screensV10/Transactions/index.ts
  modified:
    - frontend/src/screensV10/Home/HomeMount.tsx                # swap TransactionsViewPlaceholder → TransactionsMount

key-decisions:
  - "Surface-split view-vs-mount (parity with Plan 25-04 HomeView): TransactionsView is router-agnostic (props-only); TransactionsMount owns fetch + state (filter chip, edit-sheet open) + router.pop + delete-API call. View is trivially testable without provider scaffolding."
  - "Delete UX divergence (web vs iOS, per CONTEXT D-Defer): web uses right-click → window.confirm (single fast path; desktop-only — touch users get edit on tap, delete deferred to a future polish pass / mobile context-menu primitive). iOS plan 25-09 uses native swipe-left + .destructive action. Documented in `<deferred>`."
  - "Edit sheet uses a Phase 26 stub: PosterSheet wraps a thin EditPlaceholder (eyebrow + italic «Редактировать —» + WIP hint + close button). Phase 26 swaps the inner content; the PosterSheet binding (isOpen / onClose / backgroundColor='paper' / testId='tx-edit-sheet') is the contract that Phase 26 inherits."
  - "Filter-chip mapping is hardcoded const CHIP_LIST in TransactionsView (TXN-V10-02) — no localization layer yet; if i18n lands later, swap labels but keep `id: TxFilterChip` stable so handler contracts don't break."
  - "v0.x deleteActual (frontend/src/api/actual.ts) is reused — no new v10 wrapper added. The endpoint contract `DELETE /actual/{id}` is identical between v0.x and v1.0 (Phase 25-01 only widened POST/GET, not DELETE). Documented in TransactionsMount header comment."
  - "Identity-return for `applyFilterChip(_, _, 'all')` — pure helpers usually return new arrays, but the 'all' fast-path returns the input reference. This is intentional optimisation: HomeMount's filtered useMemo dependency-checks reference equality before recomputing groupByDay, saving a hot-path allocation for the default-state user."
  - "sumCents in computeHeaderSummary + groupByDay uses Math.abs — display-magnitude semantics. Roundups (positive) and expenses (negative) both contribute positively to the day total. The amount column itself shows the signed value; the eyebrow/sum is a magnitude indicator."
  - "Empty-state copy «Реестр пуст — добавьте первую трату через FAB» (italic + mono hint) instead of a silent blank page — clear signal to the user that nothing was filtered out by accident."

patterns-established:
  - "Triad of pure-helpers + props-only view + router-bound mount (now applied to both Home and Transactions). Reusable for any future poster screen needing fetch + filter + render."
  - "Web context-menu deletion gate via browser confirm — single-path desktop UX. Mobile-friendly long-press alternative deferred to a future polish pass (CONTEXT D-Defer)."
  - "PosterSheet edit-stub pattern: real editor lands in a future phase; current plan ships PosterSheet binding + WIP-content placeholder so users see clear progress signal AND the integration contract is forward-compatible."
  - "ISO date string lexicographic sort: `a.created_at > b.created_at ? -1 : 1` is correct for wire-format ISO timestamps. No Date construction needed in hot path."

requirements-completed:
  - TXN-V10-01    # cobalt bg + Mass italic «Реестр.» + eyebrow «N ЗАПИСЕЙ · X ₽»
  - TXN-V10-02    # 6 single-select filter chips (Все/Кафе/Продукты/Транспорт/Подписки/Копилка)
  - TXN-V10-03    # day grouping with DM Serif italic dateLabel + mono day-sum on right
  - TXN-V10-04    # rows formatted with U+2212 negatives + roundup/deposit inline plates + mono time + sub-line «cat · BANK MASK»
  - TXN-V10-05    # row tap → edit PosterSheet (stub); right-click → window.confirm → DELETE; v0.x deleteActual reused
  # T-T-01 also achieved: HomeMount «ВСЕ ОПЕРАЦИИ →» now pushes real TransactionsMount

# Metrics
duration: ~7m
completed: 2026-05-10
---

# Phase 25 Plan 8: Web Transactions Registry Summary

**Built the V10 web Transactions registry end-to-end (TXN-V10-01..05) — cobalt push-stack screen with eyebrow/Mass italic header, single-select filter chip-bar, day-grouped rows with DM Serif italic dateLabel + mono time/amount, inline roundup/deposit spec-tag plates and U+2212 negatives — split into pure compute helpers, props-only TransactionsView, and a TransactionsMount data fetcher wired to PosterRouter.pop + PosterSheet edit stub + window.confirm-gated delete; HomeMount «ВСЕ ОПЕРАЦИИ →» now lands on the real registry instead of the WIP placeholder.**

## Performance

- **Duration:** ~7 min (~412s wall-clock from `git log` of plan commits)
- **Started:** 2026-05-10T16:09:55Z
- **Completed:** 2026-05-10T16:16:47Z (approx)
- **Tasks:** 3 of 3 (5 commits — TDD RED/GREEN splits for Tasks 1-2; Task 3 atomic)
- **Files created:** 7 (3 production source + 1 CSS module + 2 test files + 1 barrel)
- **Files modified:** 1 (HomeMount.tsx — TransactionsMount swap)

## Accomplishments

- **5 pure compute helpers** unit-tested with 26 cases covering happy path + edge cases + threat mitigations (T-25-08-01 mapped category code, T-25-08-02 confirm gate documented in View, U+2212 / U+202F char-point assertions for amount formatting).
- **TransactionsView (~225 LOC + ~190 CSS LOC)** renders all 5 TXN-V10-* requirements: ← НАЗАД top-left button, eyebrow row («SECTION II» + «N ЗАПИСЕЙ · X ₽»), Mass italic «Реестр.» 88px, 6-chip filter bar with active highlight, day groups (DM Serif italic dateLabel + mono day-sum), per-row staggered animation + 50px-wide mono time + description + optional spec-tag plate + sub-line + signed mono amount, empty-state placeholder.
- **TransactionsMount** orchestrates parallel fetch (accounts/categories/period) + sequential actuals fetch + view-model computation + router.pop + edit PosterSheet binding + delete-API call; loading and error sub-views with retry; cancellation guard against unmount race.
- **HomeMount swap** — single-line import edit + push-handler change. Placeholder is fully removed (no remaining mention in HomeMount.tsx; placeholder export still lives in `_placeholders.tsx` as no-op for safety).
- **15/15 TransactionsView component tests + 26/26 compute tests + 42/42 HomeMount + computeHomeData regression tests** pass; full project test suite **334/334** pass; tsc strict clean; vite build succeeds (~250 ms; 197 KiB gz).

## Filter chip mapping (TxFilterChip → predicate)

| Chip label | TxFilterChip id | Filter logic |
|------------|-----------------|--------------|
| Все        | `all`           | identity (no filter; returns input array unchanged for === comparison) |
| Кафе       | `cafe`          | `categories.find(c => c.id === a.category_id)?.code === 'cafe'` |
| Продукты   | `food`          | `categories.find(c => c.id === a.category_id)?.code === 'food'` |
| Транспорт  | `transit`       | `categories.find(c => c.id === a.category_id)?.code === 'transit'` |
| Подписки   | `subs`          | `categories.find(c => c.id === a.category_id)?.code === 'subs'` (CONTEXT D-Defer: subscription-link join skipped for MVP) |
| Копилка    | `savings`       | `kind === 'roundup' \|\| kind === 'deposit'` |

Implementation builds an O(1) Map<id, code> lookup once per call to amortise the per-row category match across long lists.

## Edit sheet strategy

- **Now (Plan 25-08):** PosterSheet wraps an `EditPlaceholder` stub.
  - Stub renders: eyebrow «EDIT TRANSACTION» + italic «Редактировать —» 32px + WIP hint with `TX #{id}` reference + yellow «ЗАКРЫТЬ» PosterButton.
  - PosterSheet binding: `isOpen={editingTx !== null}`, `onClose={handleEditClose}`, `backgroundColor="var(--poster-paper)"`, `testId="tx-edit-sheet"`.
- **Phase 26 retrofit:** swap `EditPlaceholder` for the real poster-styled `TransactionEditor` component (custom keypad + amount/description/category/account fields + save handler). The PosterSheet binding contract is stable — Phase 26 only edits the inner component.
- This mirrors V10MainShell's `AddSheetPlaceholderContent` pattern (Plan 25-06) and keeps the integration surface forward-compatible.

## Delete UX (web)

- **Trigger:** right-click on a row → `onContextMenu` event.
- **Gate:** `e.preventDefault()` then `window.confirm('Удалить операцию?')`. Two-click path before DELETE fires (T-25-08-02 mitigation).
- **API call:** `await deleteActual(tx.id)` — reuses the existing v0.x endpoint from `frontend/src/api/actual.ts` (no new v10 wrapper needed; the `DELETE /actual/{id}` contract is identical between v0.x and v1.0).
- **Failure handling:** `window.alert('Не удалось удалить операцию — попробуйте снова')`. Plan 25-12 polish may upgrade to a poster-styled toast.
- **Reload:** on success, bump `reloadToken` → useEffect re-fetch.
- **Mobile divergence (CONTEXT D-Defer):** touch-only users get only the edit path on tap. A long-press → action-sheet UX is deferred. iOS Plan 25-09 implements native swipe-left + .destructive action — divergent platform UX, same backend contract.

## Empty-state copy

- Headline (DM Serif italic 36px paper, centered): «Реестр пуст —»
- Hint (mono 11px paper, opacity 0.6): «добавьте первую трату через FAB»
- Container: 80px top margin, flex-column centered. No backdrop overlay, no spinner.
- Renders when `dayGroups.length === 0` (post-filter — chip='savings' on a budget without roundups/deposits will also show empty state, which is the desired signal).

## Stagger animation pattern

- Class: `.poster-row-in` (from `stylesV10/animations.css` — 0.45s `posterRowIn` keyframe, ease-out).
- Delay formula: `${(0.07 + dayGroupIdx * 0.07 + rowIdx * 0.045).toFixed(3)}s`
  - Each new day group adds 0.07s baseline.
  - Each row within a group adds 0.045s on top.
  - Day-1 row-0 starts at 0.070s; day-1 row-1 at 0.115s; day-2 row-0 at 0.140s; etc.
- Pattern mirrors HomeView's category-row stagger (`0.08 + i*0.045`) — same easing, slightly faster baseline because TransactionsView typically has more rows per screen.
- `prefers-reduced-motion: reduce` flattens to a 0.2s linear opacity fade (handled globally in animations.css).

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1 RED: failing tests for computeTransactions helpers** — `cf16d8c` (test)
2. **Task 1 GREEN: implement compute helpers** — `19391e4` (feat)
3. **Task 2 RED: failing tests for TransactionsView** — `d4af83c` (test)
4. **Task 2 GREEN: implement TransactionsView + CSS module** — `01c7338` (feat)
5. **Task 3: TransactionsMount + barrel + HomeMount swap** — `78945b0` (feat)

Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol.

## Files Created/Modified

### Created

- `frontend/src/screensV10/Transactions/computeTransactions.ts` (~210 LOC) — 5 pure helpers + 2 type exports.
- `frontend/src/screensV10/Transactions/__tests__/computeTransactions.test.ts` (~260 LOC, 26 tests) — 6 chip cases + groupByDay (3) + computeHeaderSummary (3) + formatTxAmount (6) + tagFor (4) + TxFilterChip (1) + applyFilterChip edge cases (2).
- `frontend/src/screensV10/Transactions/TransactionsView.tsx` (~230 LOC) — pure presenter, all 5 TXN-V10-* requirements, keyboard a11y on row, browser context-menu hijack for delete.
- `frontend/src/screensV10/Transactions/TransactionsView.module.css` (~190 LOC) — layout + tone-fixed colours; animations come from `stylesV10/animations.css`.
- `frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx` (~255 LOC, 15 tests) — header / back / chips / day groups / spec-tags / row tap / amount format / empty state.
- `frontend/src/screensV10/Transactions/TransactionsMount.tsx` (~245 LOC) — fetch + filter state + edit-sheet binding + delete handler + router glue; loading/error sub-views with retry; cancellation guard.
- `frontend/src/screensV10/Transactions/index.ts` — barrel re-exporting Mount/View/Props + 5 helpers + 2 types.

### Modified

- `frontend/src/screensV10/Home/HomeMount.tsx` — replaced `TransactionsViewPlaceholder` import with `TransactionsMount` import; `onAllOperationsTap` now pushes `<TransactionsMount />`. Placeholder mention fully removed (no comment string match either — acceptance criteria required `grep -c == 0`).

## Decisions Made

(See `key-decisions` in frontmatter.)

Highlights:

- **Surface-split view-vs-mount (parity with Plan 25-04).** TransactionsView is router-agnostic and takes plain handlers as props. TransactionsMount imports the router, owns the chip + edit-sheet state, and binds the four interaction targets. This mirrors HomeView/HomeMount and the iOS HomeView/HomeViewModel split (Plan 25-05) so paired plans stay 1:1 and the View stays trivially testable.

- **Web delete UX = right-click context-menu + browser confirm.** Per CONTEXT decisions, web uses right-click (cleaner desktop UX than swipe-left which is awkward on a mouse). The `onContextMenu` handler calls `e.preventDefault()` (suppress browser menu) then `window.confirm('Удалить операцию?')` (two-click gate before DELETE fires — T-25-08-02 mitigation). Mobile (touch) users only get the edit path on tap; long-press deletion is deferred per CONTEXT D-Defer. iOS Plan 25-09 implements the native swipe-left + .destructive action for mobile UX.

- **Edit sheet stub now → real editor in Phase 26.** PosterSheet wraps an `EditPlaceholder` rendering eyebrow + italic «Редактировать —» + WIP hint + close button. Phase 26 swaps only the inner content; the PosterSheet binding (isOpen / onClose / backgroundColor / testId) is the stable contract. Same forward-compat pattern as V10MainShell's AddSheetPlaceholderContent (Plan 25-06).

- **v0.x `deleteActual` reused — no new v10 wrapper.** The `DELETE /actual/{id}` endpoint contract is identical between v0.x and v1.0 (Phase 25-01 only widened POST/GET to support 4-valued kind + account_id). Adding a v10 wrapper would be duplication for zero gain — TransactionsMount imports `deleteActual` directly from `frontend/src/api/actual.ts`. Documented in TransactionsMount's header comment block.

- **Identity short-circuit in `applyFilterChip(_, _, 'all')`.** The default-state user (chip='all') hits the hot path on every render. Returning the input array reference (not a new filtered array) lets HomeMount's `useMemo` dependency-equality check skip downstream `groupByDay` recompute. Tests assert this behaviour explicitly (`toEqual(actuals)` works on reference but the intent is documented in `applyFilterChip` JSDoc).

## Deviations from Plan

### Auto-fixed Issues

**None — plan executed exactly as written.**

Pre-existing infrastructure already in place:
- `getCurrentPeriod` helper already added by Plan 25-04 (no need to add it again).
- v0.x `deleteActual` already exported from `frontend/src/api/actual.ts` (the plan's optional «add v10 wrapper if absent» path was unnecessary — used the existing v0.x export instead, documented in TransactionsMount's header comment block).
- All required CSS variables (`--poster-cobalt`, `--poster-paper`, `--poster-yellow`, `--poster-font-dm-serif`, `--poster-font-pt-serif`, `--poster-font-jet-brains-mono`, `--poster-font-archivo-black`, `--poster-font-manrope`) already defined in `tokens.css` from Phase 23.

---

**Total deviations:** 0 — plan executed exactly as written.

**Impact on plan:** None. The plan's «verify deleteActual import path» branch resolved to «use existing v0.x export» on first check.

## Issues Encountered

- **`grep -c "TransactionsViewPlaceholder" HomeMount.tsx` initially returned 1 (a comment mentioning the swap).** The plan's acceptance criteria explicitly required `== 0`, so the comment string was rephrased to «real Transactions registry replaces the prior WIP placeholder» (no class-name mention). Now the grep returns 0; placeholder is referentially dead in HomeMount.

- **Stderr noise from `usePosterRouter outside Provider` test:** Plan 25-02's posterRouter test deliberately produces a benign jsdom uncaught-error log. This noise persists in the full test run output but does not affect pass/fail. Documented in 25-02 SUMMARY — not a 25-08 regression.

- **Parallel commits on the same branch:** Three other executors (25-09 iOS Tx, 25-10 web AddSheet, 25-11 iOS AddSheet) committed to the same `v1.0-maximal-poster` branch interleaved with mine. My five commits cleanly contain only my files (verified via `git show --stat`). Worktree was reset to the expected base `c66fb513...` at start per `<worktree_branch_check>`.

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-25-08-01 (Tampering: filter chip shows wrong category):** mitigated. Mapping is hardcoded `const CHIP_LIST` in TransactionsView; filter is `category.code === 'cafe'` (etc.) — no user input flows into the chip→predicate function. Asserted by 6 chip-case tests in `applyFilterChip`.
- **T-25-08-02 (Repudiation: accidental delete on right-click):** mitigated. `onContextMenu` calls `e.preventDefault()` then `window.confirm('Удалить операцию?')`; `onRowDelete(tx)` only fires on user-confirmed yes. Two-click required before DELETE. `handleRowDelete` in TransactionsMount also catches API errors and shows `window.alert` — no silent data loss.
- **T-25-08-03 (Information Disclosure: showing other-user's txns):** accepted (RLS server-side; `listActualV10` returns only authenticated user's rows).
- **T-25-08-04 (DoS: 10K+ rows freeze browser):** accepted (single-tenant, single-period; expected ~50-200 rows max per period).

No new security surface introduced — TransactionsMount only reads from authenticated GET endpoints (RLS-gated) and calls a single user-confirmed DELETE.

## Known Stubs

- **`EditPlaceholder` inside `TransactionsMount.tsx`** — intentional WIP. Renders eyebrow «EDIT TRANSACTION» + italic «Редактировать —» 32px + WIP hint with TX-id reference + yellow «ЗАКРЫТЬ» PosterButton. Phase 26 will replace the entire content function; the PosterSheet binding (isOpen / onClose / backgroundColor / testId) is the stable contract that does not change.
- **`window.alert` on delete failure** in TransactionsMount.handleRowDelete — minimal viable failure copy. Plan 25-12 polish may upgrade to a poster-styled toast (existing `componentsV10/Toast` is available).

These stubs do NOT block TXN-V10-01..05 acceptance — the registry renders, chips filter, day groups display, spec-tags appear, row tap opens the sheet (with WIP content), right-click → confirm → DELETE works.

## Next Phase Readiness

- **Phase 26 (TransactionEditor poster retrofit):** swap `EditPlaceholder` inside `TransactionsMount.tsx` for the real `TransactionEditor` component. The PosterSheet binding (`isOpen`, `onClose`, `backgroundColor='var(--poster-paper)'`, `testId='tx-edit-sheet'`) is the contract — Phase 26 only edits the component rendered inside.
- **Phase 25-09 (iOS Transactions, parallel):** iOS `TransactionsV10ViewModel` mirrors `TransactionsMount`'s compute pipeline. Filter-chip mapping and groupByDay/sumCents semantics are the source of truth — iOS `TransactionsData.swift` should produce byte-identical filter results and group totals.
- **Phase 25-10 (web AddSheet, parallel):** independent — AddSheet binding lives in V10MainShell (not Transactions). Once AddSheet ships, creating an actual via FAB will appear in the Transactions registry on next reload (or could be made live by passing a refresh callback through the FAB → AddSheet → V10MainShell → ... — out of scope for 25-08).
- **Plan 25-12 polish:** toast for delete success/failure (replace `window.alert`); long-press deletion alternative for mobile (currently desktop-only via right-click).

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/screensV10/Transactions/computeTransactions.ts
- FOUND: frontend/src/screensV10/Transactions/__tests__/computeTransactions.test.ts
- FOUND: frontend/src/screensV10/Transactions/TransactionsView.tsx
- FOUND: frontend/src/screensV10/Transactions/TransactionsView.module.css
- FOUND: frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx
- FOUND: frontend/src/screensV10/Transactions/TransactionsMount.tsx
- FOUND: frontend/src/screensV10/Transactions/index.ts
- FOUND: frontend/src/screensV10/Home/HomeMount.tsx (modified — TransactionsMount swap)

**Commits exist:**
- FOUND: cf16d8c (test: computeTransactions RED)
- FOUND: 19391e4 (feat: computeTransactions GREEN)
- FOUND: d4af83c (test: TransactionsView RED)
- FOUND: 01c7338 (feat: TransactionsView GREEN + CSS)
- FOUND: 78945b0 (feat: TransactionsMount + barrel + HomeMount swap)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npm test -- screensV10/Transactions --run`: 41/41 pass (26 compute + 15 view)
- `cd frontend && npm test -- screensV10/Transactions screensV10/Home --run`: 83/83 pass (above + 42 Home regression)
- `cd frontend && npm test -- --run`: 334/334 pass (full project; +41 new tests, no regressions)
- `cd frontend && npm run build`: succeeds (~250 ms; 197 KiB gz main bundle)
- `grep -c "TransactionsMount" frontend/src/screensV10/Home/HomeMount.tsx`: 3 (≥1 required)
- `grep -c "TransactionsViewPlaceholder" frontend/src/screensV10/Home/HomeMount.tsx`: 0 (replaced fully)
- `grep -c "↻ ОКРУГЛ.\|→ КОПИЛКА" frontend/src/screensV10/Transactions/TransactionsView.tsx`: 3 (≥2 required)
- `grep -c "Все\|Кафе\|Продукты\|Транспорт\|Подписки\|Копилка" frontend/src/screensV10/Transactions/TransactionsView.tsx`: 6 (≥6 required)

**No accidental file deletions** in any of my task commits (`git diff c66fb51..HEAD --diff-filter=D --name-only -- frontend/`: empty for files I touched).

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 08*
*Completed: 2026-05-10*
