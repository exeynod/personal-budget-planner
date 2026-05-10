---
phase: 27-ai-savings-accounts-analytics-management
plan: 03
subsystem: web-savings
tags: [react, typescript, vitest, savings, posterSheet, roundup-toggle, goals, tdd]

# Dependency graph
requires:
  - phase: 22-v10-data-model
    provides: "GET /api/v1/savings (BE-09), PATCH /api/v1/savings/config (BE-08), POST /api/v1/savings/deposit (BE-10), GET/POST/DELETE /api/v1/goals (BE-11), AccountResponse via /api/v1/accounts (BE-02)"
  - phase: 23-design-system-foundation
    provides: "Eyebrow / Mass / BigFig / Plate / Chip / PosterButton + posterBarFill keyframe + colour tokens"
  - phase: 25-home-transactions-add-sheet
    plan: 02
    provides: "PosterRouterProvider / usePosterRouter / PosterSheet / common barrel"
  - phase: 25-home-transactions-add-sheet
    plan: 03
    provides: "listAccounts wrapper + AccountResponse type (reused for DepositSheet account picker)"
  - phase: 26-category-detail-plan-subscriptions
    plan: 06
    provides: "Pattern reference for stacked bottom-sheet + standalone form components (NewGoalSheet/DepositSheet mirror SubscriptionMenuSheet editor pattern)"

provides:
  - "fetchSavingsSummary / patchSavingsConfig / postDeposit — typed wrappers for /api/v1/savings (used by SavingsMount + Plan 27-06 wiring)"
  - "listGoals / createGoal / deleteGoal — typed wrappers for /api/v1/goals"
  - "SavingsSnapshot / SavingsConfig / SavingsConfigPatchPayload / DepositCreatePayload (account_id non-null) / DepositResponse / GoalRead / GoalCreatePayload — wire shapes mirroring app/api/schemas/savings.py + goals.py"
  - "Pure helpers (computeProgressPct / formatDueRu / isValidGoalDraft / isValidDepositDraft) — no React, deterministic, drive progress bars + СОХРАНИТЬ gates"
  - "SavingsView presentational component (SAV-V10-01..04: poster-black bg, Mass italic «Копилка.», yellow Plate «НАКОПЛЕНО ВСЕГО · X ₽», eyebrow «В <MONTH> + Y ₽», ОКРУГЛЕНИЕ ТРАТ toggle ВКЛ/ВЫКЛ + 3 base chips 10/50/100 ₽, ЦЕЛИ section with goal cards + posterBarFill, empty state, CTAs «+ НОВАЯ ЦЕЛЬ» / «ПОПОЛНИТЬ»)"
  - "NewGoalSheet — name + target (rubles → cents) + due date form, СОХРАНИТЬ gated by isValidGoalDraft"
  - "DepositSheet — amount + account chip-picker + optional goal chip-picker (with initialGoalId pre-select), СОХРАНИТЬ gated by isValidDepositDraft"
  - "SavingsMount — parallel Promise.all([fetchSavingsSummary, listAccounts]); reload-token refetch; sheet state machine; optimistic config PATCH; POST /goals + POST /savings/deposit; window.alert on error"
  - "Savings/index.ts barrel re-exporting Mount/View/sheets/helpers"

affects:
  - 27-06 (V10MainShell wires SavingsMount via _externalMountStubs swap once barrel ships — landed in parallel commit 14b841d)
  - 28 (Phase 28 polish: replace window.alert with PosterToast for config-PATCH failures; pixel-perfect tweaks; goal-edit/delete UX)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Triad of pure-helpers + props-only View + router-bound Mount (continued from Phase 25/26 — now applied to Savings)."
    - "Standalone bottom-sheet form components — parent wraps in <PosterSheet>; sheet gets backgroundColor='paper' (cream), form body inherits via SavingsSheets.module.css — mirrors SubscriptionMenuSheet pattern."
    - "Optimistic UI for low-risk config toggles — toggle/base flip locally, then PATCH; on error show alert + reload-token to re-sync from server (T-27-03-04 mitigation)."
    - "Discriminated union for sheet state ({kind:'none'} | {kind:'newGoal'} | {kind:'deposit', goalId}) — eliminates the 'multiple booleans get inconsistent' class of bug + lets DepositSheet receive initialGoalId from a goal-card tap."
    - "BigFig animate=true default + bigFigAnimate?: false override — tests pass false to assert the final value synchronously; production renders count-up motion."

key-files:
  created:
    - frontend/src/api/v10/savings.ts
    - frontend/src/api/v10/goals.ts
    - frontend/src/screensV10/Savings/computeSavings.ts
    - frontend/src/screensV10/Savings/__tests__/computeSavings.test.ts
    - frontend/src/screensV10/Savings/SavingsView.tsx
    - frontend/src/screensV10/Savings/SavingsView.module.css
    - frontend/src/screensV10/Savings/__tests__/SavingsView.test.tsx
    - frontend/src/screensV10/Savings/NewGoalSheet.tsx
    - frontend/src/screensV10/Savings/__tests__/NewGoalSheet.test.tsx
    - frontend/src/screensV10/Savings/DepositSheet.tsx
    - frontend/src/screensV10/Savings/__tests__/DepositSheet.test.tsx
    - frontend/src/screensV10/Savings/SavingsSheets.module.css
    - frontend/src/screensV10/Savings/SavingsMount.tsx
    - frontend/src/screensV10/Savings/__tests__/SavingsMount.test.tsx
    - frontend/src/screensV10/Savings/index.ts
  modified:
    - frontend/src/api/types.ts          # +7 types: SavingsConfig, GoalRead, SavingsSnapshot, SavingsConfigPatchPayload, DepositCreatePayload, DepositResponse, GoalCreatePayload
    - frontend/src/api/v10/index.ts      # +6 fn re-exports + 7 type re-exports for savings/goals (append-only — coexists with parallel-wave additions from 27-04/27-05)

key-decisions:
  - "DepositCreatePayload.account_id is non-null (number, not number|null). Backend's app/api/schemas/savings.py DepositCreate.account_id = Field(gt=0) is REQUIRED — UI's DepositSheet enforces this via isValidDepositDraft (СОХРАНИТЬ disabled until an account chip is picked). Default-pick first account on mount + re-seed via useEffect when accounts arrive late."
  - "Sheet state as a discriminated union ({kind:'none'} | {kind:'newGoal'} | {kind:'deposit', goalId}) instead of two booleans + a separate goalId state. Eliminates the 'flip newGoal=true while deposit was open with goalId' inconsistency and lets DepositSheet's initialGoalId prop be derived directly from the union."
  - "Optimistic PATCH /savings/config for the toggle and base chips (snapshot.config updates immediately, then awaits server response). On failure: alert + reload-token to re-sync from server. Mitigation for T-27-03-04 (DoS via rapid spam): no extra debounce — backend can absorb rapid PATCHes per CLAUDE.md."
  - "Goal cards are buttons (not divs with onClick) for keyboard-accessibility + proper :focus styling. data-testid=goal-card-{id} per spec; click delegates to onContributeToGoal(id) → Mount sets sheet={kind:'deposit', goalId:id} → DepositSheet pre-selects via initialGoalId."
  - "BigFig in SavingsView animates by default (production motion); test props pass bigFigAnimate=false. SavingsMount smoke-test (which doesn't override) asserts adjacent-rendered values like the month-in eyebrow «+ 500 ₽» that don't go through count-up — keeps the smoke test deterministic without bypassing production code paths."
  - "Goal due is YYYY-MM-DD on the wire (Pydantic date serializer). formatDueRu parses with /^(\\d{4})-(\\d{2})-(\\d{2})$/ — invalid/null returns null so the View renders no «срок ·» line for goals without a deadline."
  - "month_label derived from new Date().getMonth() (UI's local TZ — same as user's screen) rather than period_start (which would require an extra fetch). Acceptable trade-off: the user always sees the current month name regardless of period_start drift, matching the static UI mock."

patterns-established:
  - "Discriminated-union sheet state for screens with multiple bottom-sheet variants. Reusable for Plan 27-04 (account-detail edit sheet) and Plan 27-06 (mgmt-hub if it ever needs sheets)."
  - "Three-form-field bottom-sheet pattern (label + text/number/date input + ОТМЕНА/СОХРАНИТЬ row) — reusable for any future POST-form sheet. Shared CSS via SavingsSheets.module.css."

requirements-completed:
  - SAV-V10-01     # Mass italic «Копилка.» + yellow Plate «НАКОПЛЕНО ВСЕГО X ₽» + eyebrow «В <MONTH> + Y ₽»
  - SAV-V10-02     # Toggle ВКЛ/ВЫКЛ + 3 chips базы 10/50/100 ₽ через PATCH /savings/config + optimistic UI
  - SAV-V10-03     # Goal cards (name · «срок · {due}» · «{cur}/{tgt}» · «{pct}%») с posterBarFill + CTA «+ НОВАЯ ЦЕЛЬ» → bottom-sheet → POST /goals
  - SAV-V10-04     # «ПОПОЛНИТЬ» CTA → DepositSheet (amount + account picker + goal picker) → POST /savings/deposit; goal-card tap pre-selects via initialGoalId

# Metrics
duration: ~9m
completed: 2026-05-10
---

# Phase 27 Plan 03: Web Savings Summary

**Built the V10 web Копилка screen end-to-end (SAV-V10-01..04) — poster-black push-stack screen with Mass italic «Копилка.», yellow Plate «НАКОПЛЕНО ВСЕГО · X ₽» (BigFig with ₽ suffix), eyebrow «В <MONTH> + Y ₽» (current local-month inflows), ОКРУГЛЕНИЕ ТРАТ toggle (ВКЛ/ВЫКЛ) + 3 base chips (10/50/100 ₽) wired to optimistic PATCH /savings/config, ЦЕЛИ section with goal cards (name UPPER · «срок · {due}» · «{cur}/{tgt} ₽» · «{pct}%») using posterBarFill animation, empty state, and primary/ghost CTA pair («+ НОВАЯ ЦЕЛЬ» → NewGoalSheet → POST /goals; «ПОПОЛНИТЬ» → DepositSheet → POST /savings/deposit) — split into 2 typed API wrappers (savings + goals), 4 pure compute helpers (progress %, RU date format, 2 form-validation gates), props-only View, 2 standalone bottom-sheet form components, and a Mount data-fetcher with discriminated-union sheet state machine + reload-token refetch + window.alert error fallback; V10MainShell wiring resolved by parallel Plan 27-06 (MainShell now imports SavingsMountStub which Plan 27-06 will swap for SavingsMount once barrel exports stabilize).**

## Performance

- **Duration:** ~9 min (~530s wall-clock from worktree base reset to final task commit)
- **Started:** 2026-05-10T22:27:00Z (after worktree branch reset)
- **Completed:** 2026-05-10T22:35:00Z
- **Tasks:** 3 of 3 (4 commits — TDD RED/GREEN split for Task 1; Tasks 2/3 atomic)
- **Files created:** 15 (2 API wrappers + 1 compute + 1 view + 1 view CSS + 2 sheet components + 1 sheet CSS + 1 mount + 4 test files + 1 barrel)
- **Files modified:** 2 (types.ts append, v10/index.ts append — both append-only, merge-clean with parallel 27-04/27-05/27-06 plans)

## Accomplishments

- **4 pure compute helpers** unit-tested with 20 cases covering happy + edge (clamp 0..100, target<=0 / negative current guards, NBSP-tolerant formatter, gen-month names, name-trim + target>0 / amount>0 + account_id-required gates).
- **SavingsView (~240 LOC + ~190 CSS LOC)** renders all 4 SAV-V10-* requirements: header row with optional ← НАЗАД (canPop) + Eyebrow «SAVINGS / КОПИЛКА», Mass italic «Копилка.» (PosterSerifItalic / DM Serif Display), yellow Plate with Eyebrow «НАКОПЛЕНО ВСЕГО» + BigFig value + ₽ sup, eyebrow «В <MONTH> + Y ₽» (RU prepositional case month from current local date), section eyebrow «ОКРУГЛЕНИЕ ТРАТ» + toggle button (ВКЛ inverted / ВЫКЛ ghost) + 3 Chip components for base, section eyebrow «ЦЕЛИ» + goal cards (button, data-testid=goal-card-{id}) with name + dueRu + numbers row + 6px-tall posterBarFill bar, italic empty state «Нет целей — добавьте первую», CTAs row with primary «+ НОВАЯ ЦЕЛЬ» + ghost «ПОПОЛНИТЬ»; loading/error sub-views with the same header chrome.
- **NewGoalSheet (~95 LOC)** — three labeled inputs (name text · target digits-only-rubles · due date) + ОТМЕНА/СОХРАНИТЬ pair; СОХРАНИТЬ disabled until isValidGoalDraft (name trim + target_cents > 0); rubles → cents conversion on save; submitting state shows «СОХРАНЯЕМ…».
- **DepositSheet (~130 LOC)** — amount input + account chip-row (auto-picks first / primary on mount, useEffect re-seeds when accounts arrive late) + goal chip-row («БЕЗ ЦЕЛИ» chip + N goal chips, initialGoalId prop pre-selects); СОХРАНИТЬ gated by isValidDepositDraft (amount > 0 + account_id != null); rubles → cents conversion.
- **SavingsMount (~190 LOC)** — Promise.all parallel fetch (snapshot + accounts), reload-token effect dep for refetch after mutations, discriminated-union sheet state with goalId carry, 4 mutation handlers (optimistic toggle/base PATCH with on-error revert via reload, POST /goals + POST /savings/deposit with submitting flag + sheet-close + reload on success); window.alert on failure (Phase 28 → PosterToast); router.canPop / router.pop wired to View's back chrome.
- **API surface extension**: `fetchSavingsSummary` / `patchSavingsConfig` / `postDeposit` + `listGoals` / `createGoal` / `deleteGoal` typed wrappers + 7 wire-shape interfaces (SavingsConfig, GoalRead, SavingsSnapshot, SavingsConfigPatchPayload, DepositCreatePayload, DepositResponse, GoalCreatePayload). Backend's DepositCreate.account_id is non-null (Field(gt=0)) — DepositCreatePayload.account_id is `number` not `number | null` per backend contract.
- **20 compute tests + 16 view tests + 7 NewGoalSheet tests + 9 DepositSheet tests + 3 SavingsMount smoke tests = 55 Savings tests; 0 regressions in 657-test project suite**; tsc strict clean.

## Compute formulas (final shapes)

```
computeProgressPct(currentCents, targetCents)
  if targetCents <= 0: return 0
  if currentCents <= 0: return 0
  return clamp(round(currentCents / targetCents * 100), 0, 100)

formatDueRu(iso: 'YYYY-MM-DD' | null | undefined)
  null/undefined/non-matching → null
  '2026-12-31' → 'до 31 декабря 2026' (RU genitive month)

isValidGoalDraft({name, target_cents, due?})
  return name.trim().length > 0 && target_cents > 0

isValidDepositDraft({amount_cents, account_id, goal_id?})
  return amount_cents > 0 && account_id != null
```

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1 RED: failing computeSavings tests** — `aab527e` (test)
2. **Task 1 GREEN: savings/goals API + computeSavings helpers (20/20 pass)** — `792a54f` (feat)
3. **Task 2: SavingsView + NewGoalSheet + DepositSheet + tests** — `b0c22ee` (feat)
4. **Task 3: SavingsMount + barrel + smoke tests** — `8ea9c3f` (feat)

Plan-level metadata commit (this SUMMARY) follows separately.

## Files Created/Modified

### Created

- `frontend/src/api/v10/savings.ts` (~75 LOC) — 3 typed wrappers (fetchSavingsSummary / patchSavingsConfig / postDeposit) for /api/v1/savings; documents 200/201/422/404/500 contracts.
- `frontend/src/api/v10/goals.ts` (~40 LOC) — 3 typed wrappers (listGoals / createGoal / deleteGoal); documents future-due-date validation in backend.
- `frontend/src/screensV10/Savings/computeSavings.ts` (~80 LOC) — 4 pure helpers + MONTHS_RU_GEN constant.
- `frontend/src/screensV10/Savings/__tests__/computeSavings.test.ts` (~140 LOC, 20 tests).
- `frontend/src/screensV10/Savings/SavingsView.tsx` (~240 LOC) — pure presenter; loading/error sub-views; renders all 4 SAV-V10-* requirements; bigFigAnimate prop for test determinism.
- `frontend/src/screensV10/Savings/SavingsView.module.css` (~190 LOC) — poster-black root + paper text; .totalPlate yellow + .totalFig; .toggleBtn/.toggleOn/.toggleOff; .baseChip; .goalCard with .goalProgressTrack/.goalProgressFill (posterBarFill animation); .ctasRow.
- `frontend/src/screensV10/Savings/__tests__/SavingsView.test.tsx` (~250 LOC, 16 tests) — header, total plate value, month-in eyebrow, toggle ON/OFF + click, base chips render + click, goal cards (rendered name + dueRu + pct + click), empty state, CTAs, ← НАЗАД when canPop true/false, loading + error sub-views.
- `frontend/src/screensV10/Savings/NewGoalSheet.tsx` (~95 LOC) — form with name + target + due; СОХРАНИТЬ gate + ОТМЕНА.
- `frontend/src/screensV10/Savings/__tests__/NewGoalSheet.test.tsx` (~120 LOC, 7 tests) — render, disabled-until-valid, save with cents conversion, due passthrough, digit-strip, cancel, submitting state.
- `frontend/src/screensV10/Savings/DepositSheet.tsx` (~130 LOC) — amount + account chip-row + goal chip-row + initialGoalId; СОХРАНИТЬ gate.
- `frontend/src/screensV10/Savings/__tests__/DepositSheet.test.tsx` (~150 LOC, 9 tests) — render, disabled-until-valid, save with cents + account_id + goal_id, goal selection, digit-strip, no-accounts hint, cancel, initialGoalId pre-select.
- `frontend/src/screensV10/Savings/SavingsSheets.module.css` (~70 LOC) — shared styles for both sheet bodies (label + text input + chips row + actions footer).
- `frontend/src/screensV10/Savings/SavingsMount.tsx` (~190 LOC) — parallel Promise.all fetch + reload-token + discriminated-union sheet state + 4 mutation handlers + 2 PosterSheet wrappers.
- `frontend/src/screensV10/Savings/__tests__/SavingsMount.test.tsx` (~95 LOC, 3 smoke tests) — vi.mock api/v10; loading state, post-fetch render, toggle PATCH invocation.
- `frontend/src/screensV10/Savings/index.ts` (~16 LOC) — barrel re-exporting Mount/View/sheets/4 compute helpers + Props types.

### Modified

- `frontend/src/api/types.ts` — appended Phase 27-03 V1.0 Savings/Goals section: 7 interfaces (SavingsConfig, GoalRead, SavingsSnapshot, SavingsConfigPatchPayload, DepositCreatePayload with account_id non-null per backend Field(gt=0), DepositResponse with signed amount_cents, GoalCreatePayload). Append-only — coexists cleanly with the parallel-wave additions from sibling 27-04 plans.
- `frontend/src/api/v10/index.ts` — appended Phase 27-03 re-exports: 6 functions (fetchSavingsSummary/patchSavingsConfig/postDeposit + listGoals/createGoal/deleteGoal) + 7 types. The sibling 27-04 plan added `createAccount` + `AccountCreatePayload` and 27-05 added `fetchTopCategories` to the same file — all three append-only sections coexist; no merge conflicts.

## Decisions Made

(See `key-decisions` in frontmatter for the full list.)

Highlights:

- **DepositCreatePayload.account_id is non-null on the wire.** Backend's `app/api/schemas/savings.py DepositCreate.account_id = Field(gt=0)` enforces this; UI gates СОХРАНИТЬ via `isValidDepositDraft` until a chip is selected; DepositSheet auto-picks first account on mount.
- **Discriminated-union sheet state.** `{kind:'none'} | {kind:'newGoal'} | {kind:'deposit', goalId}` eliminates the bug where flipping newGoal=true forgets to clear deposit's pending goalId. Lets DepositSheet receive `initialGoalId` derived directly from the active sheet variant.
- **Optimistic UI for config PATCH.** Toggle / base flip immediately in local state, then await server. On error: alert + reload-token to re-sync. T-27-03-04 mitigation (no extra debounce; backend absorbs rapid PATCHes).
- **BigFig animates by default; tests pass bigFigAnimate=false.** Mount smoke-test asserts non-animated text (month-in eyebrow «+ 500 ₽», section labels) instead of overriding production behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan said DepositCreatePayload.account_id is optional; backend says required**

- **Found during:** Task 1 (reading app/api/schemas/savings.py for wire-shape verification).
- **Issue:** Plan's <interfaces> comment + <action> snippet typed `account_id?: number | null` but backend's `DepositCreate.account_id = Field(gt=0)` is non-null required.
- **Fix:** Made TS type `account_id: number` (non-null). DepositSheet enforces via isValidDepositDraft + auto-picks first account. Documented in JSDoc + key-decisions.
- **Files modified:** frontend/src/api/types.ts, frontend/src/screensV10/Savings/DepositSheet.tsx, isValidDepositDraft.
- **Verification:** isValidDepositDraft test asserts null account_id → false; sheet test confirms auto-pick of first account makes the form valid.

**2. [Rule 1 — Bug] BigFig count-up animation broke initial smoke-test value assertion**

- **Found during:** Task 3 (SavingsMount smoke test).
- **Issue:** Initial test asserted `text` contains `12345` (from total_cents=1_234_500). BigFig defaults to animate=true → useCountUp starts at 0 and tweens via RAF; first synchronous render shows `0`, not `12345`. The `waitFor` only awaited the «Копилка.» text (which renders synchronously) — by then BigFig had not finished its 900ms count-up.
- **Fix:** Re-targeted assertions to text rendered synchronously (section labels «НАКОПЛЕНО ВСЕГО», «ОКРУГЛЕНИЕ ТРАТ», «ЦЕЛИ») + month-in eyebrow value «+ 500 ₽» (which doesn't go through count-up). Production behaviour unchanged. Added comment explaining the trade-off.
- **Files modified:** frontend/src/screensV10/Savings/__tests__/SavingsMount.test.tsx.
- **Verification:** 3/3 smoke tests pass deterministically without RAF timing dependencies.

---

**Total deviations:** 2 auto-fixed (2× Rule 1 plan-spec / runtime mismatches; no scope creep).

**Impact on plan:** No scope creep. All 15 created files map 1:1 to the plan's <action> blocks. The two modifications (types.ts, v10/index.ts) are append-only sections that coexist with sibling parallel plans. SavingsSheets.module.css is the only file beyond the plan's `files_modified` list — added because both sheet components share identical layout primitives (label + text input + chips + actions footer); split avoids duplication and is internal to the Savings/ directory (no import surface change).

## Issues Encountered

- **Pre-existing benign test stderr noise:** `usePosterRouter outside Provider` test (Plan 25-02) emits a known error log to stderr during the full project test run. Not a regression; same noise as documented in 25-04 / 26-02 / 26-04 SUMMARYs. Plus 1 React-DOM error from another tested screen — same pre-existing noise (reported in 657/657 pass run).
- **Parallel commits on same branch:** plans 27-04/05/06 are running concurrently in other worktrees — `git log --oneline` shows their commits interleaved with mine. My four commits cleanly contain only my files (frontend/src/api/v10/{savings,goals}.ts, frontend/src/screensV10/Savings/*, plus append-only edits to types.ts + v10/index.ts which I made before the parallel agents added their own append-only sections at different line offsets — no merge conflicts).
- **V10MainShell.tsx was modified by parallel Plan 27-06**, swapping the placeholders for `SavingsMountStub` / `AiMountStub` / `MgmtHubMount`. This is expected — Plan 27-06 will swap `SavingsMountStub` for `SavingsMount` once both plans land; my plan deliberately did NOT touch V10MainShell.tsx per <action> spec.

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-27-03-01 (Tampering: roundup_base arbitrary):** mitigated. TS literal `10 | 50 | 100` on the wire type + Pydantic Literal on backend (Phase 22) + DB CHECK constraint (alembic).
- **T-27-03-02 (Tampering: deposit amount_cents negative):** mitigated. isValidDepositDraft gate UI-side (>0); backend Pydantic `Field(gt=0, le=_AMOUNT_MAX)` is the second layer.
- **T-27-03-03 (Repudiation: accidental goal create):** accept. СОХРАНИТЬ disabled for empty draft; user can DELETE later via deleteGoal (wrapper exists; UI delete deferred to Phase 28).
- **T-27-03-04 (DoS: rapid toggleRoundup spam):** mitigated. Optimistic UI; on API error, reload-token bumps to re-sync from server. No extra client-side debounce.
- **T-27-03-05 (Information Disclosure: cross-tenant goals):** accept. RLS server-side (Phase 22 dependencies); listGoals → only authenticated user's goals.

No new security surface introduced — SavingsMount only reads from authenticated GET endpoints (RLS-gated) and calls user-initiated PATCH/POST per explicit interaction.

## Known Stubs

- **Goal delete UX absent in this plan.** `deleteGoal` API wrapper exists in the barrel for completeness, but there's no UI affordance to invoke it. Phase 28 polish should add a long-press / 3-dot menu on goal cards to expose the action; out of scope for SAV-V10-01..04.
- **Goal-card tap pre-selects DepositSheet but doesn't pre-fill amount.** `initialGoalId` carries the chosen goal id, but the user still has to enter the deposit amount manually. This matches the SAV-V10-04 spec (no amount pre-fill mentioned).
- **window.alert on PATCH/POST failure** in SavingsMount — mirrors SubscriptionsMount + Plan 26-02 minimum-viable convention. Plan 28 polish may upgrade to `componentsV10/Toast`.

These stubs do NOT block SAV-V10-01..04 acceptance — the screen renders, total + month-in display, toggle + chips PATCH config optimistically, goals render with progress bars, and CTAs open functional sheets that POST to the backend.

## Next Phase Readiness

- **Plan 27-06 (V10MainShell wiring):** already in flight — landed in commit 14b841d which imports `SavingsMountStub` from `_externalMountStubs.tsx`. Once both plans merge, swap that import for `import { SavingsMount } from './Savings'` and the savings tab routes to the real screen.
- **Phase 28 polish:** replace window.alert with `componentsV10/Toast`; add goal delete UI (long-press / 3-dot menu); BigFig count-up tuning; pixel-perfect spacing per prototype.
- **Symmetry plan (iOS Savings):** would mirror this Mount's pipeline — `SavingsAPI.summary() / patchConfig() / postDeposit() + GoalsAPI.list() / create() / delete()` Swift wrappers; `SavingsView`/`SavingsViewModel` mirror; iOS PosterSheet stacking for NewGoal/Deposit; same optimistic PATCH semantics.

## Self-Check: PASSED

**Files exist (15 created + 2 modified):**
- FOUND: frontend/src/api/v10/savings.ts
- FOUND: frontend/src/api/v10/goals.ts
- FOUND: frontend/src/screensV10/Savings/computeSavings.ts
- FOUND: frontend/src/screensV10/Savings/__tests__/computeSavings.test.ts
- FOUND: frontend/src/screensV10/Savings/SavingsView.tsx
- FOUND: frontend/src/screensV10/Savings/SavingsView.module.css
- FOUND: frontend/src/screensV10/Savings/__tests__/SavingsView.test.tsx
- FOUND: frontend/src/screensV10/Savings/NewGoalSheet.tsx
- FOUND: frontend/src/screensV10/Savings/__tests__/NewGoalSheet.test.tsx
- FOUND: frontend/src/screensV10/Savings/DepositSheet.tsx
- FOUND: frontend/src/screensV10/Savings/__tests__/DepositSheet.test.tsx
- FOUND: frontend/src/screensV10/Savings/SavingsSheets.module.css
- FOUND: frontend/src/screensV10/Savings/SavingsMount.tsx
- FOUND: frontend/src/screensV10/Savings/__tests__/SavingsMount.test.tsx
- FOUND: frontend/src/screensV10/Savings/index.ts
- FOUND: frontend/src/api/types.ts (modified — +7 V10/savings/goals interfaces)
- FOUND: frontend/src/api/v10/index.ts (modified — +6 fn re-exports + 7 type re-exports)

**Commits exist (verified via `git log --oneline`):**
- FOUND: aab527e (test: RED computeSavings)
- FOUND: 792a54f (feat: GREEN api + helpers)
- FOUND: b0c22ee (feat: View + sheets + tests)
- FOUND: 8ea9c3f (feat: Mount + barrel)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npm test -- screensV10/Savings --run`: 55/55 pass (20 compute + 16 view + 7 newgoal + 9 deposit + 3 mount)
- `cd frontend && npm test -- --run`: 657/657 pass (full project; +55 new tests, 0 regressions)
- `grep -c "Копилка\|НАКОПЛЕНО\|ОКРУГЛЕНИЕ ТРАТ\|ЦЕЛИ\|НОВАЯ ЦЕЛЬ\|ПОПОЛНИТЬ" frontend/src/screensV10/Savings/SavingsView.tsx`: 13 (≥6 required)
- `grep -E "fetchSavingsSummary|patchSavingsConfig|postDeposit|createGoal|listGoals|deleteGoal" frontend/src/api/v10/index.ts`: all 6 present (fn re-exports), plus 7 type re-exports
- `grep -c "fetchSavingsSummary\|patchSavingsConfig\|postDeposit\|createGoal" frontend/src/screensV10/Savings/SavingsMount.tsx`: 10 (≥4 required)
- V10MainShell.tsx UNCHANGED by this plan (Plan 27-06 modified it independently — verified via git log)

**No accidental file deletions** in any of my four task commits (verified — all four task commits are pure additions/modifications; no `D` lines in `git show --stat`).

## TDD Gate Compliance

- Plan 27-03 Task 1 marked `tdd="true"` — followed RED → GREEN cycle:
  - Task 1 RED: `aab527e` (test, 20 failing — module didn't exist) → GREEN: `792a54f` (feat, 20 passing)
- Tasks 2 & 3 — atomic feat commits (View + 32 view/sheet tests landed alongside the components in the same commit; pattern from Phase 26-02 Task 3 mirrored).
- Plan-level `type: execute` (not `tdd`) — RED gate enforcement applies only to the explicitly-marked Task 1.

---
*Phase: 27-ai-savings-accounts-analytics-management*
*Plan: 03*
*Completed: 2026-05-10*
