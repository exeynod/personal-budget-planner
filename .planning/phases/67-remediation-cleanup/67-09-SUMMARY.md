---
phase: 67-remediation-cleanup
plan: 09
subsystem: frontend-web
tags: [web, correctness, ux, money, dates, ai, toast]
requires: [67-02, 67-06]
provides:
  - parseWireDate (local-time wire DATE parser)
  - parseMoney (single money-parse import site: parseRublesToKopecks + parseRublesToKopecksOr0 + sanitizeMoneyInput)
  - useAiCategorize stale-guard
  - Toast-based mutation error surface across v10 mounts
affects:
  - frontend/src/screensV10 (Savings, Plan, Settings, CategoryDetail, Subscriptions, Transactions, Accounts)
tech-stack:
  added: []
  patterns:
    - "cancelled-flag stale-guard in async effects"
    - "single import site re-exporting the canonical validated money parser"
    - "Toast single-slot last-error-wins error surface (parity across mounts)"
key-files:
  created:
    - frontend/src/utils/parseWireDate.ts
    - frontend/src/utils/parseMoney.ts
    - frontend/src/utils/parseMoney.test.ts
  modified:
    - frontend/src/hooks/useAiCategorize.ts
    - frontend/src/screensV10/Subscriptions/computeSubscriptions.ts
    - frontend/src/screensV10/Savings/DepositSheet.tsx
    - frontend/src/screensV10/Savings/NewGoalSheet.tsx
    - frontend/src/screensV10/Subscriptions/SubscriptionMenuSheet.tsx
    - frontend/src/screensV10/Savings/SavingsMount.tsx
    - frontend/src/screensV10/Plan/PlanMount.tsx
    - frontend/src/screensV10/Management/SettingsMount.tsx
    - frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx
    - frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx
    - frontend/src/screensV10/Transactions/TransactionsMount.tsx
    - frontend/src/screensV10/Accounts/AccountsListMount.tsx
decisions:
  - "parseMoney.ts re-exports the existing canonical parseRublesToKopecks from format.ts (already unit-tested) rather than duplicating logic — adds a form-draft wrapper (Or0) + onChange sanitizer instead."
metrics:
  duration: ~22m
  completed: 2026-05-20
---

# Phase 67 Plan 09: Web P2-8/9/10/11 + R5 polish Summary

Stale-guard for AI category suggestions, local-time wire-date parsing (no UTC off-by-one), a single money parser that no longer drops kopecks, and Toast (not `window.alert`) for every v10 mutation error.

## What Was Built

**Task 1 — P2-8 + P2-9 (commit c60cc5d)**
- `useAiCategorize`: added a `let cancelled = false` guard inside the debounced effect. The `.then/.catch/.finally` resolutions now bail before `setState` when `cancelled`, and the cleanup flips `cancelled = true`. A slow in-flight `suggestCategory` response from a superseded query (or after unmount) can no longer overwrite a newer result.
- `parseWireDate.ts`: parses bare `YYYY-MM-DD` via `new Date(y, m-1, d)` (local midnight) so business dates do not shift a day backward in UTC+ zones (Europe/Moscow); full ISO strings fall through to native `new Date(s)`.
- `computeSubscriptions.formatCadenceRu` now uses `parseWireDate(sub.next_charge_date)` — the yearly cadence label («15 мая») stays on the correct day.

**Task 2 — P2-10 (commit 7989152)**
- `parseMoney.ts`: the single money-parse import site. It re-exports the canonical, already-unit-tested `parseRublesToKopecks` (`number | null`) from `format.ts`, plus:
  - `parseRublesToKopecksOr0` — form-draft wrapper mapping empty/invalid → `0` (save buttons gate validity separately).
  - `sanitizeMoneyInput` — `onChange` filter keeping digits + one comma + ≤2 fractional digits, round-tripping losslessly through the parser.
- `DepositSheet`, `NewGoalSheet`, `SubscriptionMenuSheet`: dropped the three divergent `parseInt(x, 10) * 100` snippets (which silently discarded kopecks). Their amount inputs now use `inputMode="decimal"` + `sanitizeMoneyInput`, so kopecks actually flow through to exact integer cents.
- `parseMoney.test.ts`: 15 cases covering the plan's `«1 234,56»→123456`, `«10»→1000`, `«0,1»→10`, plus sanitizer round-trips.

**Task 3 — P2-11 + R5 (commit 2f4b15c)**
- Replaced every `window.alert(...)` in the 7 listed v10 mounts with the existing `<Toast>` component (single slot, last-error-wins, 4s). Message text preserved. Added a `toastMsg` state + `<Toast>` host to mounts that lacked one (Savings, Settings, CategoryDetail, Transactions, Accounts); Plan already had Toast wired. Wrapped previously-bare returns (CategoryDetail, Settings) in a fragment for the Toast host.
- Reworded three comment lines that still contained the literal `window.alert` token so the verification grep registers a true zero.
- `grep -rl 'window.alert' src/screensV10` → 0 files.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 - Blocking] Avoided duplicating the money parser**
- **Found during:** Task 2
- **Issue:** The plan said to create `parseRublesToKopecks` in `parseMoney.ts`, but a canonical, validated, unit-tested `parseRublesToKopecks` already lived in `frontend/src/utils/format.ts`. Creating a second implementation would have *worsened* the very fragmentation P2-10 set out to fix.
- **Fix:** `parseMoney.ts` re-exports the canonical parser and adds the two sheet-facing helpers (`parseRublesToKopecksOr0`, `sanitizeMoneyInput`). The `parseMoney.ts` artifact + `parseRublesToKopecks` symbol requirement is still satisfied via re-export.
- **Files:** frontend/src/utils/parseMoney.ts
- **Commit:** 7989152

**2. [Rule 2 - Critical] Relaxed amount-input filters to accept kopecks**
- **Found during:** Task 2
- **Issue:** Deposit/NewGoal inputs stripped to digits-only (`[^0-9]`), so even with a kopeck-safe parser users could never enter kopecks.
- **Fix:** Switched to `inputMode="decimal"` + `sanitizeMoneyInput` so a decimal separator is allowed and round-trips losslessly.
- **Files:** DepositSheet.tsx, NewGoalSheet.tsx, SubscriptionMenuSheet.tsx
- **Commit:** 7989152

## Verification

- `npm run build` (tsc -b + vite) GREEN after each task.
- `npx vitest run` — 55 files / 738 tests pass (incl. new `parseMoney.test.ts` 15 cases).
- `grep cancelled src/hooks/useAiCategorize.ts` present; `grep parseWireDate computeSubscriptions.ts` present; `grep parseRublesToKopecks src/utils/parseMoney.ts` present; `window.alert` count in `src/screensV10` = 0.

## Known Stubs

None introduced. (The dead `theme==='v06'` shell remains deferred per 67-06 inventory — untouched.)

## Self-Check: PASSED

All created files exist (parseWireDate.ts, parseMoney.ts, parseMoney.test.ts); all three task commits present (c60cc5d, 7989152, 2f4b15c).
