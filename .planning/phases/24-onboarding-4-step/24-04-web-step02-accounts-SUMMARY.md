---
phase: 24-onboarding-4-step
plan: 04
subsystem: ui
tags: [react, vitest, testing-library, css-modules, ru-pluralisation, chip-list]

# Dependency graph
requires:
  - phase: 23-poster-pixel-clone
    provides: Eyebrow + Mass components, tokens.css coral/paper palette, Archivo Black + JetBrains Mono fonts
  - phase: 24-onboarding-4-step (plan 24-01)
    provides: onboardingReducer (ADD_ACCOUNT / REMOVE_ACCOUNT / SET_PRIMARY actions, first-account auto-primary), OnboardingAccount type
  - phase: 24-onboarding-4-step (plan 24-02)
    provides: OnboardingChrome (label/onBack/onNext/nextDisabled/hint/children), OnboardingFlow root, format.ts (formatRubles + THIN_SPACE)
provides:
  - Step02Accounts view (italic mass headline, chip-list, existing accounts grid, inline form mounting)
  - AccountBalanceForm component (reusable inline form: editable bank input + balance + ОТМЕНА/ДОБАВИТЬ)
  - format.ts pluralAccounts() — RU plural rules (счёт / счёта / счётов)
  - format.ts pluraliseHint() — '«нужен минимум один счёт»' or '«{n} {plural} · {sum} ₽»'
affects:
  - 24-05 (iOS step 02) — symmetric chip-list + balance-sheet contract for SwiftUI port
  - 24-10 (web wire-e2e) — OnboardingV10Body.accounts already populated correctly by Step02Accounts dispatches

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Inline form pattern: parent owns {formMode | null} state; child calls onSave/onCancel; parent dispatches reducer + closes form (no shared form state)'
    - 'Predefined chips dispatch with `bankEditable=false` (read-only header); free-text «+ Добавить» chip dispatches with `bankEditable=true`'
    - 'RU pluralisation table tested at edge cases (1, 11, 21, 22, 25, 100) — guards against the "21 → счётов" bug in naïve `n === 1 ? singular : plural` checks'
    - 'aria-label encodes index context («Удалить счёт: Т-БАНК») → tests use `getAllByRole("button", { name: /Удалить счёт/ })` to locate by index without textContent matching'

key-files:
  created:
    - frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx
    - frontend/src/screensV10/Onboarding/AccountBalanceForm.module.css
    - frontend/src/screensV10/Onboarding/Step02Accounts.tsx
    - frontend/src/screensV10/Onboarding/Step02Accounts.module.css
    - frontend/src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx
  modified:
    - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
    - frontend/src/screensV10/Onboarding/format.ts

key-decisions:
  - "Form state lives in parent (Step02Accounts), not in OnboardingFlow reducer — saves a round-trip and keeps draft persistence shape stable (form is transient UI, not part of the wire payload)"
  - "AccountBalanceForm bank trim+uppercase happens inside the component, not in the reducer — matches prototype line 1389 (`name.toUpperCase()`) and lets the reducer stay value-pure"
  - "Russian pluralisation helpers exported from format.ts (not a new module) — reuses existing import surface; adds one cross-import (types.ts → OnboardingAccount) which is acyclic"
  - "Step02Accounts uses `<button>` elements for predefined chips, not the existing Chip component, because Chip renders `<span role=\"button\">` which is harder to query with `getByText` + click semantics in RTL — and chips here don't need active/inactive state"
  - "Balance digit cap = 9 (max 999_999_999 ₽) — well below 100M ₽ server limit; prevents accidental exponential pastes from generating absurd cents counts"
  - "Plan 24-04 advances NEXT-disabled gate for step 2 (`accounts.length === 0`); steps 3..4 still placeholder so they remain disabled until plans 24-06 / 24-08 ship"

patterns-established:
  - 'Step view contract (extends 24-02): { accounts: ReadonlyArray<OnboardingAccount>; dispatch: Dispatch<OnboardingAction> } — reducer is single source of truth, view owns transient form state only'
  - 'Inline form contract: { initialBank: string; initialKind: AccountKind; bankEditable: boolean; onSave: (payload) => void; onCancel: () => void }'
  - 'Hint computation lives in format.ts (next to formatRubles) — chrome consumes string only'
  - 'TDD gate sequence: test() RED commit → feat() GREEN commit (Task 2). Task 1 had no isolated tests per plan (`<verify>` block — tsc only)'

requirements-completed: [ONB-V10-01, ONB-V10-03]

# Metrics
duration: 4min
completed: 2026-05-10
---

# Phase 24 Plan 04: Web Step 02 (Accounts) Summary

**Chip-list account entry (Т-Банк / Сбер / Наличные / + Добавить) with reusable AccountBalanceForm and Russian pluralisation helpers (счёт / счёта / счётов) wired into OnboardingFlow step 2**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-10T10:20:40Z
- **Completed:** 2026-05-10T10:24:49Z
- **Tasks:** 2 (TDD gates: 1 RED + 1 GREEN for Task 2)
- **Files created:** 5 (2 source TSX + 2 module CSS + 1 test)
- **Files modified:** 2 (OnboardingFlow.tsx wiring + format.ts pluralisation helpers)

## Accomplishments

- **AccountBalanceForm** is reusable across both entry paths — predefined chip taps render the bank as read-only italic DM Serif (`bankEditable=false`); «+ Добавить» renders an editable input. Save normalises bank to trimmed+uppercased per prototype line 1389; balance digits sanitised to ≤9 digits before `× 100` cents conversion. ДОБАВИТЬ button disabled when trimmed bank is empty.
- **Step02Accounts** renders the italic mass headline «Где лежат / деньги?», eyebrow «ВСЕ КАРТЫ И НАЛИЧНЫЕ», existing accounts grid (1fr | auto | auto rows with bank name + balance + «· основной» suffix when primary, star button paper-bg-when-primary, × remove button), the four predefined chips (3 solid + 1 dashed «+ Добавить»), and mounts AccountBalanceForm when `formMode !== null`.
- **Russian pluralisation** isolated in `format.ts:pluralAccounts(n)`: one (1, 21, 31, 101) → «счёт»; few (2-4, 22-24) → «счёта»; many (0, 5+, 11-14, 25, 100) → «счётов». `pluraliseHint(accounts)` returns «нужен минимум один счёт» when empty, else «{n} {plural} · {sum} ₽» with U+202F thin-space grouping.
- **OnboardingFlow wiring** advances the step-2 NEXT gate (`state.accounts.length === 0` → disabled) and threads `pluraliseHint(state.accounts)` into chrome `hint`. Step 1 gate unchanged. Steps 3-4 remain disabled placeholders pending plans 24-06 / 24-08.
- **Test coverage** (19 specs total): 12 pluralisation specs (one/few/many edge cases + 0/empty hint + thin-space sum formatting), 3 chip-list render specs, 2 form-open specs (read-only vs editable bank input), 3 save-flow specs (predefined save dispatch + free-text save dispatch + cancel without dispatch), 4 existing-row specs (rows render, star dispatches `SET_PRIMARY {index:1}`, × dispatches `REMOVE_ACCOUNT {index:0}`, primary row shows «· основной»).

## Task Commits

1. **Task 1: AccountBalanceForm component** — `92e60d4` (feat)
2. **Task 2 (RED): failing tests for Step02Accounts + pluralisation** — `a6eecfc` (test)
3. **Task 2 (GREEN): Step02Accounts + format helpers + flow wiring** — `4d7808d` (feat)

_TDD gate sequence honoured: `test()` precedes `feat()` for the RED→GREEN cycle in Task 2. Task 1 had no RTL specs (per plan's `<verify>` block — tsc only)._

## Files Created/Modified

- `frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx` — controlled inputs (bank text + balance digits), trim+uppercase + cents conversion at save, ДОБАВИТЬ disabled when bank empty.
- `frontend/src/screensV10/Onboarding/AccountBalanceForm.module.css` — bordered box (1px paper opacity 0.45), DM Serif italic 18px bank input/display, Archivo Black 24px balance, paper-bg coral-text ДОБАВИТЬ button.
- `frontend/src/screensV10/Onboarding/Step02Accounts.tsx` — `useState<FormMode | null>` form-mode toggle; PRESET_BANKS array; existing accounts grid with star/× buttons; aria-labelled buttons for stable RTL queries.
- `frontend/src/screensV10/Onboarding/Step02Accounts.module.css` — coral inheritance, grid rows with `1fr | auto | auto`, dashed-border «+ Добавить» chip variant, paper-bg star when primary.
- `frontend/src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx` — 19 specs across pluralisation, render, form open/close, save, star, remove.
- `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx` — adds `case state.step === 2` rendering Step02Accounts; threads `pluraliseHint(state.accounts)` into chrome `hint`; advances NEXT gate to `accounts.length === 0`.
- `frontend/src/screensV10/Onboarding/format.ts` — adds `import type { OnboardingAccount }` + `pluralAccounts(n)` + `pluraliseHint(accounts)`.

## Decisions Made

- **Native `<button>` for predefined chips** rather than the existing `Chip` component — Chip renders `<span role="button">`, which is harder to query in RTL; chips here have no active/inactive state to track. Visual parity preserved via local `.chip` style (paper border + Archivo Black 11px + 0.16em tracking).
- **`bankEditable` boolean** instead of two separate components for read-only vs editable bank — simpler API, single state machine in the form, single CSS module.
- **Pluralisation in `format.ts`, not a new module** — keeps the import surface flat and tests the helpers alongside `formatRubles` (they share the U+202F thin-space contract).
- **Form state lives in Step02Accounts, not the reducer** — form mode is transient UI, not part of the wire payload (`OnboardingV10Body`). The reducer stays focused on persistable state. Closes side-stepping any need to add `formMode` to `OnboardingDraft`.
- **`bank.trim().toUpperCase()` happens inside AccountBalanceForm.save**, mirroring prototype's `name.toUpperCase()` (line 1389). Reducer receives already-normalised payload.

## Deviations from Plan

### None

The plan was executed exactly as written. No bug fixes, no missing-functionality additions, no blocking issues, no architectural pivots.

A note on the plan's `<verify>` step calling `npx eslint`: ESLint is not installed in this project (already documented as a deviation in plan 24-02 SUMMARY); skipped per the same rationale, replaced with `tsc --noEmit` which the plan also specifies. No new files needed for this plan to pick up that delta.

## Issues Encountered

None.

## Threat Model Coverage

| Threat ID  | Disposition | Status                                                                                              |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------- |
| T-24-04-01 | mitigate    | ✓ AccountBalanceForm: `bank.slice(0, 40)` on every change + `bank.trim()` before save               |
| T-24-04-02 | mitigate    | ✓ AccountBalanceForm: `sanitiseBalanceDigits` caps at 9 digits → max 999_999_999 ₽ << 100M cap      |
| T-24-04-03 | mitigate    | ✓ All bank renders flow through `{bank}` JSX expression (no `dangerouslySetInnerHTML`); React escapes |
| T-24-04-04 | mitigate    | ✓ Reducer-level (plan 24-01): ADD_ACCOUNT first-account auto-primary; SET_PRIMARY clears others     |

## Next Phase Readiness

- **24-05 (iOS step 02):** Symmetric SwiftUI port consumes the same chip-list + balance-input contract; predefined banks (`Т-Банк`/`Сбер`/`Наличные`) and «+ Добавить» free-text mirror this plan exactly. RU pluralisation rules need to be ported (Swift: `String.localizedStringWithFormat` or manual switch).
- **24-06 (web step 03 — Plan):** Reuse OnboardingChrome with `step={3}`; replace `<PlaceholderStep step={3}/>` with the real Step03Plan in OnboardingFlow.
- **24-10 (web wire-e2e):** Step02Accounts dispatches already produce correctly-shaped `OnboardingAccount` payloads (`bank`, `kind`, `balance_cents`, `mask: null`, `primary` set by reducer) — `serialiseDraft` will pass them straight through to `POST /onboarding/complete`.

## Pluralisation Reference Table

| n   | rule                              | form    |
| --- | --------------------------------- | ------- |
| 0   | (handled by hint short-circuit)   | n/a     |
| 1   | mod10=1, mod100≠11                | счёт    |
| 2-4 | mod10∈2..4, mod100∉12..14         | счёта   |
| 5+  | many (default)                    | счётов  |
| 11  | mod100=11                         | счётов  |
| 12  | mod100=12                         | счётов  |
| 13  | mod100=13                         | счётов  |
| 14  | mod100=14                         | счётов  |
| 21  | mod10=1, mod100=21                | счёт    |
| 22  | mod10=2, mod100=22                | счёта   |
| 25  | mod10=5                           | счётов  |
| 100 | mod10=0                           | счётов  |
| 101 | mod10=1, mod100=1                 | счёт    |

## Self-Check: PASSED

- `frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/AccountBalanceForm.module.css` — FOUND
- `frontend/src/screensV10/Onboarding/Step02Accounts.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/Step02Accounts.module.css` — FOUND
- `frontend/src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx` — MODIFIED
- `frontend/src/screensV10/Onboarding/format.ts` — MODIFIED
- Commit `92e60d4` (Task 1 feat) — FOUND
- Commit `a6eecfc` (Task 2 RED test) — FOUND
- Commit `4d7808d` (Task 2 GREEN feat) — FOUND
- All 108 tests pass (19 new in this plan, 89 pre-existing) — VERIFIED
- `npm run build` succeeds — VERIFIED
- `npx tsc --noEmit` clean — VERIFIED

---
*Phase: 24-onboarding-4-step*
*Completed: 2026-05-10*
