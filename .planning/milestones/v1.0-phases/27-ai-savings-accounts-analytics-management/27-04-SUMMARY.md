---
phase: 27-ai-savings-accounts-analytics-management
plan: 04
subsystem: web-accounts
tags: [react, typescript, vitest, accounts, account-detail, posterSheet, transfer-soon]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 2
    provides: PosterRouterProvider / usePosterRouter / PosterSheet
  - phase: 25-home-transactions-add-sheet
    plan: 3
    provides: listAccounts / listCategoriesV10 / listActualV10 + AccountResponse / CategoryV10 / ActualV10Read types
  - phase: 25-home-transactions-add-sheet
    plan: 8
    provides: TransactionsView formatTxAmount helper (re-used in AccountDetailView)
  - phase: 22-backend-v10-data-model
    plan: BE-02
    provides: POST /api/v1/accounts AccountCreate schema (bank/kind/mask/balance_cents/primary)
  - phase: 23-design-system-foundation
    provides: Eyebrow / Mass / BigFig / Chip / PosterButton + cream/ink/yellow/paper tokens

provides:
  - "Pure compute helpers (sumAccountsBalances / countAccounts / formatBankSubtitle / filterByAccount / sumPeriodOps / isValidNewAccountDraft) — no React, no fetch — unit-testable in isolation"
  - "AccountsListView pure presentational component (ACCT-V10-01..03: cream bg + ← НАЗАД (when canPop) + Eyebrow «ACCOUNTS / СЧЕТА» + Mass italic «Счета.» + dark СУММАРНО plate with BigFig + count + rows with bank UPPER + subtitle + balance + ОСНОВНОЙ yellow badge + CTA «+ ДОБАВИТЬ СЧЁТ» + disabled «ПЕРЕВОД SOON»)"
  - "AccountDetailView pure presentational component (ACCT-V10-04: black bg + ← НАЗАД + Mass italic bank-name + mono subtitle + 2 KPI plates («БАЛАНС» yellow + «В МАЕ · N ОПЕРАЦИЙ» dark) + ops list reusing Transactions row layout + empty state)"
  - "NewAccountSheet form (bank text + 3 kind chips + mask digits-only maxLength=4 + balance digits-only rubles + primary checkbox); isValidNewAccountDraft gate; rubles → cents conversion on save"
  - "AccountsListMount: listAccounts fetcher + reload-token + PosterSheet wrapping NewAccountSheet; createAccount on save → close sheet + refetch list"
  - "AccountDetailMount: parallel fetch (accounts/categories/period) + sequential listActualV10 + client-side filterByAccount; period propagated to view for «В МАЕ» KPI"
  - "Accounts/index.ts barrel re-exporting all 5 components + 6 helpers + 5 prop-type aliases"
  - "AccountCreatePayload type added to api/types.ts; createAccount(POST /accounts) wrapper added to api/v10/accounts.ts; both re-exported from api/v10/index.ts (append-only with sibling 27-03/27-05 additions)"

affects:
  - 27-05-web-accounts-ios   (parallel iOS counterpart — same compute formulas, same kind chips)
  - 27-06-web-mgmt-hub       (V10MainShell wiring — Mgmt «02 СЧЕТА» row will router.push(<AccountsListMount />))

# Tech tracking
tech-stack:
  added: []   # all dependencies already present (react 18, vitest, @testing-library/react)
  patterns:
    - "Pure-helpers + presentational-view + mount-fetcher triad (mirrors HomeView/TransactionsView/SubscriptionsView pattern from Phases 25/26): computeAccounts.ts (no React) → AccountsListView.tsx + AccountDetailView.tsx (no fetch) → AccountsListMount.tsx + AccountDetailMount.tsx (router + sheet-bound, side-effectful)"
    - "PosterSheet wrap for create-flow (parallel to TransactionsMount EditPlaceholder pattern from 25-08): isOpen={sheet === 'newAccount'}, onClose={onSheetClose}, backgroundColor='var(--poster-paper)', testId='new-account-poster-sheet' — submitting prop bridges Sheet ⇄ Mount loading state"
    - "Two-bg pattern within one feature: list (cream/ink) for browsing + detail (black/paper) for focused viewing; mirrors prototype/poster-screens.jsx PosterAccounts and PosterAccountDetail respectively"
    - "Mass/Form rubles→cents conversion in NewAccountSheet (string digits → Number → ×100) — mirrors AddSheet keypad in plan 25-10"
    - "Russian month preposition lookup in AccountDetailView («МАЕ» from period_start) — small inline MONTHS_RU_PREP array; reused MONTHS_RU_GENITIVE from common/format for tx_date day labels"

key-files:
  created:
    - frontend/src/screensV10/Accounts/computeAccounts.ts
    - frontend/src/screensV10/Accounts/__tests__/computeAccounts.test.ts
    - frontend/src/screensV10/Accounts/AccountsListView.tsx
    - frontend/src/screensV10/Accounts/AccountsListView.module.css
    - frontend/src/screensV10/Accounts/__tests__/AccountsListView.test.tsx
    - frontend/src/screensV10/Accounts/AccountDetailView.tsx
    - frontend/src/screensV10/Accounts/AccountDetailView.module.css
    - frontend/src/screensV10/Accounts/__tests__/AccountDetailView.test.tsx
    - frontend/src/screensV10/Accounts/NewAccountSheet.tsx
    - frontend/src/screensV10/Accounts/NewAccountSheet.module.css
    - frontend/src/screensV10/Accounts/__tests__/NewAccountSheet.test.tsx
    - frontend/src/screensV10/Accounts/AccountsListMount.tsx
    - frontend/src/screensV10/Accounts/AccountDetailMount.tsx
    - frontend/src/screensV10/Accounts/__tests__/AccountsListMount.test.tsx
    - frontend/src/screensV10/Accounts/index.ts
  modified:
    - frontend/src/api/types.ts                  # append AccountCreatePayload interface
    - frontend/src/api/v10/accounts.ts           # add createAccount wrapper
    - frontend/src/api/v10/index.ts              # append createAccount + AccountCreatePayload exports

key-decisions:
  - "Surface-split view-vs-mount (parity with 25-04/25-08/26-06): AccountsListView and AccountDetailView are router-agnostic (props-only); the two Mounts own fetch + state + router glue + sheet binding. Each View tests cleanly without a router provider."
  - "Sheet sibling-of-View, not child: NewAccountSheet is a separate file (~150 LOC) wrapped by PosterSheet inside AccountsListMount. Same forward-compat pattern as TransactionsMount's EditPlaceholder + PosterSheet binding contract — Phase 28 polish can swap inner content without touching Mount logic."
  - "ACCT-V10 wire-shape doubled: AccountCreatePayload added to api/types.ts (mirrors backend AccountCreate Pydantic schema). createAccount() wrapper does a plain POST — backend already enforces all validation (bank length 1..40, mask ≤16, kind enum, balance ±100M ₽). UI layer only adds the digits-only mask + balance gates + isValidNewAccountDraft for button enable state (T-27-04-01 / T-27-04-02 mitigations)."
  - "ПЕРЕВОД disabled with «SOON» badge per plan threat T-27-04-04 mitigation (DF-V11-01 deferred): the button is rendered disabled with a SOON eyebrow tag so users see the future capability without it being clickable. onTransfer handler is wired through but no-op."
  - "AccountDetailView reuses TransactionsView formatTxAmount (yellow positive, paper negative, U+2212 minus sign) — single source of truth for tx-amount typography across the Accounts screen and the Transactions registry. Same applies to formatTimeHM from common/format."
  - "Russian month preposition («В МАЕ», «В ИЮНЕ») hardcoded inline in AccountDetailView via MONTHS_RU_PREP array — separate from MONTHS_RU_GENITIVE because preposition form differs (МАЕ vs мая). 12-element ReadonlyArray, no i18n layer."
  - "Mount uses listAccounts() to find the focused account (find by id) instead of a dedicated GET /accounts/{id} — backend doesn't expose a single-id read today; payload size is small (~10 accounts max for single-tenant MVP) so this is more efficient than a per-detail-view round trip with no caching."
  - "Mock-based smoke test for AccountsListMount: vi.mock the api/v10 module so PosterRouter+PosterSheet+fetch all work without network. Three tests cover the happy fetch path, the sheet save round trip, and the error sub-view."

requirements-completed:
  - ACCT-V10-01    # Mass italic «Счета.» + dark СУММАРНО plate + count
  - ACCT-V10-02    # «+ ДОБАВИТЬ СЧЁТ» bottom-sheet → POST /accounts via createAccount
  - ACCT-V10-03    # bank rows + бейдж ОСНОВНОЙ + tap → push Account Detail; «ПЕРЕВОД» disabled with SOON
  - ACCT-V10-04    # Account Detail (black bg) — bank Mass + 2 KPI plates («БАЛАНС» yellow + «В МАЕ · N ОПЕРАЦИЙ» dark) + ops list

# Metrics
duration: ~7m
completed: 2026-05-10
---

# Phase 27 Plan 04: Web Accounts List + Account Detail Summary

**Built the V10 web Accounts feature end-to-end (ACCT-V10-01..04) — cream-bg list with Mass italic «Счета.» + dark СУММАРНО plate (BigFig sum + N счетов), bank rows with ОСНОВНОЙ yellow badge + tap-to-push, «+ ДОБАВИТЬ СЧЁТ» PosterSheet form (bank/kind chips/mask/balance/primary → POST /accounts) + disabled «ПЕРЕВОД SOON» CTA; black-bg Account Detail with Mass italic bank-name + 2 KPI plates («БАЛАНС» yellow + «В МАЕ · N ОПЕРАЦИЙ» dark) + per-account ops list — split into 6 pure compute helpers, 2 props-only Views, 1 form Sheet, and 2 router-bound Mounts; api/v10 surface extended with createAccount wrapper + AccountCreatePayload type.**

## Performance

- **Duration:** ~7 min wall-clock from `git log` of plan commits
- **Tasks:** 3 of 3 (4 commits — TDD RED/GREEN split for Task 1; Tasks 2-3 atomic)
- **Files created:** 15 (3 production source + 1 sheet + 2 CSS modules + 4 test files + 2 mount files + 1 detail view + 1 detail CSS + 1 barrel)
- **Files modified:** 3 (api/types.ts + api/v10/accounts.ts + api/v10/index.ts — append-only edits, merge-safe with sibling 27-03/27-05)

## Accomplishments

- **6 pure compute helpers** unit-tested with 22 cases covering happy path + edge cases + threat mitigations:
  - `sumAccountsBalances` (Σ balance_cents, handles negatives)
  - `countAccounts` (list.length)
  - `formatBankSubtitle` (4 paths: card+mask / card / cash / savings)
  - `filterByAccount` (account_id matching, drops nulls)
  - `sumPeriodOps` (range-inclusive Σ |amount| + count)
  - `isValidNewAccountDraft` (bank trim + kind validity + balance ≥0)
- **AccountsListView (~150 LOC + ~140 CSS LOC)** renders all 3 ACCT-V10-* list requirements: optional ← НАЗАД, eyebrow «ACCOUNTS / СЧЕТА», Mass italic «Счета.», ink-bg СУММАРНО plate (BigFig sum size 64 + count line), bank rows with bank UPPER (Archivo Black 14px) + mono subtitle + history hint + ОСНОВНОЙ yellow badge for primary + balance mono semibold, vertical CTA stack «+ ДОБАВИТЬ СЧЁТ» (primary) and disabled «ПЕРЕВОД SOON».
- **AccountDetailView (~190 LOC + ~130 CSS LOC)** — black bg, Mass italic bank-name, mono subtitle, 2-column KPI row (yellow «БАЛАНС» + dark «В МЕСЯЦЕ · N ОПЕРАЦИЙ»), ops list reusing Transactions row layout (mono time + description + sub-line «cat · day-month» + signed yellow/paper amount with formatTxAmount).
- **NewAccountSheet (~140 LOC)** — TextInput bank, 3-chip kind selector with RU labels («карта»/«наличные»/«накопит.»), conditional mask input (digits-only maxLength=4) only when kind='card', balance digits-only input with rubles→cents conversion on save, primary checkbox, disabled-when-invalid СОХРАНИТЬ button, ОТМЕНА.
- **AccountsListMount (~120 LOC)** orchestrates listAccounts fetch + reload-token + PosterSheet wrap of NewAccountSheet + createAccount POST handler with submitting state + cancellation guard against unmount race.
- **AccountDetailMount (~100 LOC)** parallel-fetches listAccounts + listCategoriesV10 + getCurrentPeriod, then sequential listActualV10(period.id), client-filters via filterByAccount, propagates period to view.
- **58/58 Accounts tests pass** (22 compute + 12 list view + 12 detail view + 9 sheet + 3 mount smoke); **660/660 full-project tests pass**; tsc strict clean.

## Filter & lookup formulas

| Helper | Input | Output |
|--------|-------|--------|
| `sumAccountsBalances(list)` | `AccountResponse[]` | `Σ balance_cents` |
| `countAccounts(list)` | `AccountResponse[]` | `list.length` |
| `formatBankSubtitle(a)` | `AccountResponse` | `'наличные'` / `'накопит. счёт'` / `'карта ·· {mask}'` / `'карта'` |
| `filterByAccount(actuals, id)` | `(ActualV10Read[], number)` | rows where `tx.account_id === id` (drops nulls) |
| `sumPeriodOps(actuals, ps, pe)` | `(ActualV10Read[], string, string)` | `{ count, sumCents = Σ |amount| }` for `ps ≤ tx_date ≤ pe` |
| `isValidNewAccountDraft({...})` | `{ bank, kind, balance_cents }` | `bank.trim().length > 0 && kind ∈ {card,cash,savings} && balance_cents ≥ 0` |

## NewAccountSheet form contract

| Field | Input type | Validation / sanitization |
|-------|-----------|--------------------------|
| Bank | text, maxLength=40 | `.trim().length > 0` |
| Kind | 3-chip select | exactly one of `card`/`cash`/`savings` |
| Mask | text, inputMode=numeric | only when kind=`card`; `replace(/\D/g, '').slice(0, 4)` (T-27-04-02) |
| Balance | text, inputMode=numeric | `replace(/\D/g, '')` then `Number × 100` cents (T-27-04-01: ≥0 enforced by isValidNewAccountDraft) |
| Primary | checkbox | boolean default false |

Save payload = `{ bank: trimmed, kind, mask: kind==='card' && mask.length>0 ? mask : null, balance_cents, primary }`.

## KPI plates (Account Detail)

| Plate | Tone | Eyebrow | Value |
|-------|------|---------|-------|
| Left  | yellow on ink text | «БАЛАНС» | BigFig `Math.floor(account.balance_cents/100)` size 56 + ₽ |
| Right | dark on paper text | `«В {MONTH_PREP} · {N} ОПЕРАЦИЙ»` | BigFig `Math.floor(sumPeriodOps.sumCents/100)` size 56 + ₽ |

`MONTH_PREP` is derived from `period.period_start` month index via inline `MONTHS_RU_PREP` array. Falls back to `«В МЕСЯЦЕ»` when period is null (loading / no current period).

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1 RED: failing tests for computeAccounts helpers** — `81eb0ec` (test)
2. **Task 1 GREEN: implement helpers + extend api/v10 surface** — `34f6dec` (feat)
3. **Task 2: views + sheet + tests** — `459708c` (feat)
4. **Task 3: mounts + barrel + smoke tests** — `9f312ad` (feat)

Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol.

## Files Created/Modified

### Created

- `frontend/src/screensV10/Accounts/computeAccounts.ts` (~95 LOC) — 6 pure helpers + 2 type imports.
- `frontend/src/screensV10/Accounts/__tests__/computeAccounts.test.ts` (~225 LOC, 22 tests) — sumAccountsBalances (3) + countAccounts (2) + formatBankSubtitle (4) + filterByAccount (3) + sumPeriodOps (3) + isValidNewAccountDraft (7).
- `frontend/src/screensV10/Accounts/AccountsListView.tsx` (~165 LOC) — pure presenter, all 3 ACCT-V10-01..03 requirements, optional ← НАЗАД, dark plate with BigFig + count, rows with badge + balance, vertical CTA stack.
- `frontend/src/screensV10/Accounts/AccountsListView.module.css` (~145 LOC) — cream-bg layout, dark summary plate, list row grid, primary badge yellow, SOON badge, CTA row.
- `frontend/src/screensV10/Accounts/__tests__/AccountsListView.test.tsx` (~175 LOC, 12 tests) — headline / eyebrow / summary / rows / primary badge / row tap / +ДОБАВИТЬ click / disabled ПЕРЕВОД / canPop / empty state / loading / error.
- `frontend/src/screensV10/Accounts/AccountDetailView.tsx` (~200 LOC) — pure presenter, all ACCT-V10-04 requirements, KPI row, ops list reusing Transactions row layout, empty state.
- `frontend/src/screensV10/Accounts/AccountDetailView.module.css` (~140 LOC) — black-bg layout, KPI plates row, mono row layout, paper sub-line, yellow positive amounts.
- `frontend/src/screensV10/Accounts/__tests__/AccountDetailView.test.tsx` (~210 LOC, 12 tests) — headline / subtitle (3 kinds) / БАЛАНС plate / В МАЕ plate / ops list / empty state / back / row tap / loading / error.
- `frontend/src/screensV10/Accounts/NewAccountSheet.tsx` (~145 LOC) — bank/kind/mask/balance/primary form, isValidNewAccountDraft gate, rubles→cents on save.
- `frontend/src/screensV10/Accounts/NewAccountSheet.module.css` (~75 LOC) — paper-bg form layout.
- `frontend/src/screensV10/Accounts/__tests__/NewAccountSheet.test.tsx` (~155 LOC, 9 tests) — fields render / mask hidden when kind=cash / mask sanitization / balance sanitization / save disabled when invalid / save with rubles→cents / cash save with mask=null / cancel / submitting state.
- `frontend/src/screensV10/Accounts/AccountsListMount.tsx` (~125 LOC) — fetch + reload-token + sheet wrap + createAccount handler + cancellation guard.
- `frontend/src/screensV10/Accounts/AccountDetailMount.tsx` (~105 LOC) — parallel fetch + sequential actuals + filterByAccount + view glue.
- `frontend/src/screensV10/Accounts/__tests__/AccountsListMount.test.tsx` (~140 LOC, 3 tests) — happy path renders rows, sheet save calls createAccount, error sub-view.
- `frontend/src/screensV10/Accounts/index.ts` (~30 LOC) — barrel: 5 components + 5 prop-type aliases + 6 helpers.

### Modified

- `frontend/src/api/types.ts` — append `AccountCreatePayload` interface (after `AccountResponse`).
- `frontend/src/api/v10/accounts.ts` — add `createAccount(payload)` POST wrapper; re-export `AccountCreatePayload`.
- `frontend/src/api/v10/index.ts` — extend `accounts` re-export to include `createAccount` + `AccountCreatePayload`.

(Sibling 27-03 and 27-05 also touched `api/v10/index.ts` with append-only savings/goals/analytics exports — merge clean.)

## Decisions Made

(See `key-decisions` in frontmatter.)

Highlights:

- **Surface-split view-vs-mount (parity with 25-04/25-08/26-06).** Both Views are router-agnostic; both Mounts own router + fetch + state. Same triad applied to the new-account flow — NewAccountSheet is a stateless form with onSave callback; AccountsListMount owns sheet open/close + submitting state + createAccount call.

- **PosterSheet wrap stays in the Mount, not the View.** AccountsListView never imports PosterSheet — it just calls `onAddAccount()` which the Mount maps to `setSheet('newAccount')`. Same boundary as TransactionsMount/EditPlaceholder. Forward-compat: any Phase 28 polish (animation tweaks, multi-step new-account form) only touches Mount + Sheet — View stays stable.

- **ПЕРЕВОД disabled with SOON badge per T-27-04-04.** The button is rendered disabled, the SOON eyebrow tag sits inline next to «ПЕРЕВОД» text, and `onTransfer` handler is wired through but no-op. This makes the future capability discoverable without it being clickable; DF-V11-01 (account-to-account transfer endpoint) will swap the disabled prop and the SOON tag will be removed.

- **NewAccountSheet rubles→cents on save.** Balance input is a digits-only string (rubles); the save handler does `Number(digits) * 100` to produce `balance_cents`. Mirrors AddSheet keypad rubles→cents convention from plan 25-10 — consistent UX across V10 forms.

- **AccountDetailMount uses listAccounts + find().** No GET `/accounts/{id}` exists on the backend today (and payload is small). Faster + simpler than adding a single-id endpoint. If accounts list ever grows past ~50 a per-id read could be added without touching the View.

- **Append-only edits to shared barrels (Wave 2 convention).** `api/v10/index.ts` and `api/types.ts` are touched by multiple sibling Wave 2 plans (27-03 added savings/goals; 27-05 added analytics). Each plan only appends new exports — no rewrites — so worktree merges resolve cleanly without conflict markers, mirroring the Phase 26 pattern (26-04/26-06).

## Deviations from Plan

### Auto-fixed Issues

**None — plan executed exactly as written.**

Pre-existing infrastructure already in place:
- All required CSS variables (`--poster-cream`, `--poster-ink`, `--poster-paper`, `--poster-yellow`, `--poster-black`, font tokens) already defined in `tokens.css` from Phase 23.
- `MONTHS_RU_GENITIVE` already exported from `screensV10/common` (Phase 25-02).
- `formatTxAmount` already exported from `screensV10/Transactions/computeTransactions` (Phase 25-08) — reused in AccountDetailView.
- `getCurrentPeriod` already in `api/periods.ts` (Phase 25-04).

Test calibration tweak (not a deviation):
- Initial `AccountsListView.test.tsx` summary-plate assertion expected `'35000'` but BigFig formats with U+202F thin-space (`'35 000'`). Fixed assertion to check for `'35'` + `'000'` substrings — the visible text is correct, the test was over-precise about whitespace.
- Initial `AccountsListMount.test.tsx` used a non-existent `initialEntry` prop on PosterRouterProvider. Fixed to use the actual `root` prop (per PosterRouter.tsx contract) — straightforward API alignment.

---

**Total deviations:** 0 — plan executed exactly as written.

## Issues Encountered

- **Parallel commits on the same branch:** Three other executors (27-03 Savings, 27-05 Analytics, 27-06 Mgmt-hub) committed to the same `v1.0-maximal-poster` branch interleaved with mine. My four commits cleanly contain only my Accounts/* files plus append-only edits to the three shared barrel files (verified via `git show --stat`). Worktree was reset to the expected base `4d3e7e0...` at start per `<worktree_branch_check>`.

- **Linter touched `api/v10/index.ts` after my Task 1 GREEN edit.** Sibling 27-05 appended `analytics` exports while I was writing views. My `createAccount` + `AccountCreatePayload` exports remained intact (verified by re-reading the file before appending). No conflict — both lived in different sections of the barrel.

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-27-04-01 (Tampering: createAccount with negative balance):** mitigated. UI gate `isValidNewAccountDraft` requires `balance_cents >= 0` (digits-only input cannot produce negatives anyway, but the gate is explicit). Backend Pydantic AccountCreate independently enforces `ge=-100M ₽` (signed), and the UI's stricter `>= 0` keeps savings-positive convention.
- **T-27-04-02 (Tampering: mask spoofing 5+ chars):** mitigated. Mask input has `maxLength={4}`, `inputMode="numeric"`, and the change handler does `.replace(/\D/g, '').slice(0, 4)` so any paste/keyboard input is sanitized to ≤4 digits. Backend AccountCreate also has `max_length=16` as defence-in-depth.
- **T-27-04-03 (Information Disclosure: Account Detail cross-tenant):** accepted (RLS server-side; `listAccounts` returns only authenticated user's rows; the find-by-id is a client-side lookup over that already-filtered set).
- **T-27-04-04 (Repudiation: accidental ПЕРЕВОД on disabled CTA):** mitigated. Button has `disabled` prop set unconditionally; `onTransfer` callback is wired but a no-op. SOON badge is visible next to the button text. DF-V11-01 deferred per CONTEXT/plan.

No new security surface introduced — both Mounts only read from authenticated GET endpoints (RLS-gated) and call a single user-initiated POST `/accounts` that is gated by both UI form validation and backend Pydantic strict mode (`extra="forbid"`).

## Known Stubs

- **`onTxRowTap` in `AccountDetailView`** intentionally no-op in `AccountDetailMount` — wired through View → Mount but the handler is a comment-only `() => {}`. Future polish: deep-link to Transactions registry filtered to this account, OR open the same edit-PosterSheet stub used by TransactionsMount. Does NOT block ACCT-V10-04 acceptance — the row is still keyboard-focusable and visible.
- **`window.alert` on createAccount failure** in AccountsListMount — minimal viable failure copy. Plan 28 polish may upgrade to a poster-styled toast (existing `componentsV10/Toast` is available).

These stubs do NOT block ACCT-V10-01..04 acceptance — the list renders, sum + count are correct, rows tap to detail, СОХРАНИТЬ creates the account and refetches the list.

## Next Phase Readiness

- **Phase 27-05 (iOS Accounts, paired):** iOS `AccountsViewModel` mirrors `AccountsListMount`'s compute pipeline. `sumAccountsBalances`/`formatBankSubtitle`/`sumPeriodOps`/`isValidNewAccountDraft` are the source of truth — iOS `AccountsData.swift` should produce byte-identical formulas. KPI plates (BigFig + Eyebrow) and SOON-badged disabled ПЕРЕВОД button must match.
- **Phase 27-06 (Mgmt-hub, parallel):** `02 СЧЕТА` numbered row should `router.push(<AccountsListMount canPop />)`. The barrel re-exports `AccountsListMount` + `AccountsListMountProps` so 27-06 can `import { AccountsListMount } from '../Accounts'` without reaching into individual files.
- **V10MainShell wiring (deferred):** if Accounts becomes a tab target (e.g. tab='savings' shows the AccountsListMount when Savings is empty), the tab-handler push needs to use `<AccountsListMount canPop={false} />` so the ← НАЗАД chrome doesn't render at the root.
- **Plan 28 polish:** poster-styled toast for create success/failure (replace `window.alert`); deep-link from AccountDetail tx row → Transactions registry filtered to account_id; «ПЕРЕВОД» activation when DF-V11-01 lands (account-to-account transfer endpoint).

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/screensV10/Accounts/computeAccounts.ts
- FOUND: frontend/src/screensV10/Accounts/__tests__/computeAccounts.test.ts
- FOUND: frontend/src/screensV10/Accounts/AccountsListView.tsx
- FOUND: frontend/src/screensV10/Accounts/AccountsListView.module.css
- FOUND: frontend/src/screensV10/Accounts/__tests__/AccountsListView.test.tsx
- FOUND: frontend/src/screensV10/Accounts/AccountDetailView.tsx
- FOUND: frontend/src/screensV10/Accounts/AccountDetailView.module.css
- FOUND: frontend/src/screensV10/Accounts/__tests__/AccountDetailView.test.tsx
- FOUND: frontend/src/screensV10/Accounts/NewAccountSheet.tsx
- FOUND: frontend/src/screensV10/Accounts/NewAccountSheet.module.css
- FOUND: frontend/src/screensV10/Accounts/__tests__/NewAccountSheet.test.tsx
- FOUND: frontend/src/screensV10/Accounts/AccountsListMount.tsx
- FOUND: frontend/src/screensV10/Accounts/AccountDetailMount.tsx
- FOUND: frontend/src/screensV10/Accounts/__tests__/AccountsListMount.test.tsx
- FOUND: frontend/src/screensV10/Accounts/index.ts
- FOUND: frontend/src/api/types.ts (modified — AccountCreatePayload added)
- FOUND: frontend/src/api/v10/accounts.ts (modified — createAccount added)
- FOUND: frontend/src/api/v10/index.ts (modified — append-only re-exports)

**Commits exist:**
- FOUND: 81eb0ec (test: computeAccounts RED)
- FOUND: 34f6dec (feat: GREEN — accounts API ext + helpers)
- FOUND: 459708c (feat: views + sheet + tests)
- FOUND: 9f312ad (feat: mounts + barrel + smoke tests)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npm test -- screensV10/Accounts --run`: 58/58 pass (22 compute + 12 list view + 12 detail view + 9 sheet + 3 mount smoke)
- `cd frontend && npm test -- --run`: 660/660 pass (full project; +58 new tests, no regressions)
- `grep -c "Счета\|СУММАРНО\|ДОБАВИТЬ СЧЁТ\|ПЕРЕВОД\|SOON\|ОСНОВНОЙ" frontend/src/screensV10/Accounts/AccountsListView.tsx`: 13 (≥6 required)
- `grep -c "БАЛАНС\|В МАЕ\|ОПЕРАЦИЙ" frontend/src/screensV10/Accounts/AccountDetailView.tsx`: 6 (≥3 required)
- `grep -c "listAccounts\|createAccount\|listActualV10" frontend/src/screensV10/Accounts/AccountsListMount.tsx frontend/src/screensV10/Accounts/AccountDetailMount.tsx`: 12 (≥4 required)
- V10MainShell.tsx UNCHANGED in this plan (verified via `git status`).

**No accidental file deletions** in any of my four task commits (`git diff 4d3e7e0..HEAD --diff-filter=D --name-only`: empty).

---
*Phase: 27-ai-savings-accounts-analytics-management*
*Plan: 04*
*Completed: 2026-05-10*
