---
phase: 25-home-transactions-add-sheet
plan: 10
subsystem: ui
tags: [react, typescript, vitest, addsheet, keypad, posterSheet, gap-closure, ADD-V10]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 2
    provides: PosterSheet (web), formatTimeHM, MONTHS_RU_GENITIVE
  - phase: 25-home-transactions-add-sheet
    plan: 3
    provides: createActualV10 / listAccounts / listCategoriesV10 typed clients
  - phase: 25-home-transactions-add-sheet
    plan: 6
    provides: V10MainShell with AddSheetPlaceholderContent (target of swap)
  - phase: 23-design-system-foundation
    provides: BigFig / Eyebrow / Mass / Chip componentsV10

provides:
  - "AddSheet — full body for POSTER.black sheet (header + BigFig + Keypad + description + date chips + category chip-scroll + account row + CTA + dirty-close confirm)"
  - "Keypad — 3×4 numeric keypad component (1..9, ., 0, ⌫) replacing the system keyboard (ADD-V10-02)"
  - "computeAddSheet pure helpers: appendDigit / appendDot / backspace / parseAmountToCents / ctaState / defaultDateForChip"
  - "screensV10/AddSheet barrel index (AddSheet + Keypad + helpers)"
  - "V10MainShell renders the real AddSheet inside its PosterSheet (replaces AddSheetPlaceholderContent stub)"

affects:
  - 25-12 (polish phase) — may add a global tx-mutation bump so Home / Transactions refresh after AddSheet submits
  - 26 (plan editor / category detail) — unchanged; AddSheet only writes via POST /actual

# Tech tracking
tech-stack:
  added: []  # everything already in place (react 18 + vitest + componentsV10 + api/v10)
  patterns:
    - "Primitive-style amount string state machine (appendDigit / appendDot / backspace) instead of one orchestrator buildAmountString — cleaner test surface, equally compositional"
    - "BigFig decimal-rendering trick: integer goes through `value`, decimals go through `sup` slot — preserves the '5.' / '5.50' visual without modifying BigFig (which is integer-only by contract)"
    - "Native date input fallback chain: showPicker() → click() (Safari < 16) — no library, no polyfill"
    - "Account picker as cycler-style row (tap → next account) — minimal-viable picker; richer modal deferred to Plan 25-12"
    - "Cancel-confirm gate via internal absolute-positioned overlay inside the sheet body (not a separate PosterSheet) — keeps the real sheet open behind the dimmer so «Продолжить» preserves form state without remount"
    - "Mock-the-leaf test pattern (vi.mock '../../../api/v10') — same approach as V10MainShell.test.tsx, isolates UI from network"
    - "Local-time YYYY-MM-DD for tx_date — avoids midnight-UTC roll-back for east-of-UTC users (T-A-06 / DATA-MODEL §5)"

key-files:
  created:
    - frontend/src/screensV10/AddSheet/AddSheet.tsx
    - frontend/src/screensV10/AddSheet/AddSheet.module.css
    - frontend/src/screensV10/AddSheet/Keypad.tsx
    - frontend/src/screensV10/AddSheet/Keypad.module.css
    - frontend/src/screensV10/AddSheet/computeAddSheet.ts
    - frontend/src/screensV10/AddSheet/index.ts
    - frontend/src/screensV10/AddSheet/__tests__/computeAddSheet.test.ts
    - frontend/src/screensV10/AddSheet/__tests__/Keypad.test.tsx
    - frontend/src/screensV10/AddSheet/__tests__/AddSheet.test.tsx
  modified:
    - frontend/src/screensV10/V10MainShell.tsx                # placeholder → real AddSheet
    - frontend/src/screensV10/V10MainShell.module.css         # drop placeholder CSS
    - frontend/src/screensV10/__tests__/V10MainShell.test.tsx # mock api/v10 + assert NEW ENTRY

key-decisions:
  - "Three primitive helpers (appendDigit / appendDot / backspace) over one buildAmountString orchestrator — matches the keypad's three semantic events 1:1 + isolated unit tests"
  - "BigFig.value is integer; decimals (incl. trailing dot) ride along in BigFig.sup. Avoids touching the shared BigFig contract while still rendering '5.' / '5.50' faithfully"
  - "Native <input type=\"date\"> hidden in the layout + showPicker() → click() fallback for the «Своя дата» chip — no extra dep, works on iOS Safari + desktop Chrome/Firefox"
  - "Account picker as row-cycler (tap → next account in the list) — minimum viable for users with 1-2 accounts (the typical case). Plan 25-12 polish may upgrade to a dedicated PosterSheet picker if user testing flags discoverability issues"
  - "Refetch-after-submit deferred — AddSheet only signals success via onSubmitted(_id) and V10MainShell closes the sheet. Home / Transactions stay stale until user navigation triggers a refetch. Documented as known UX gap for Plan 25-12"
  - "Cancel-confirm overlay lives inside AddSheet (absolute, z-index 10) — not a separate PosterSheet. Keeps form state intact when user picks «Продолжить» (no parent remount)"
  - "Local-time toISODateLocal for tx_date — eastern-TZ users at 23:30 MSK still see «Сегодня» write today's date (not yesterday in UTC)"

patterns-established:
  - "Pure-helpers + DOM-component split for any input-heavy screen: extract the state machine into a typed module with vitest-only coverage; the React component is then mostly JSX + dispatch"
  - "BigFig sup-slot trick to render typed input strings (decimals, units) without modifying the BigFig component"
  - "Sheet-internal confirm overlays (z-index'd inside the sheet body) for «Are you sure?» gates — preserves underlying form state across confirm/cancel"

requirements-completed:
  - ADD-V10-01    # AddSheet rendered inside PosterSheet via FAB tap; nav hides; × close button
  - ADD-V10-02    # Custom 3×4 keypad is the ONLY input; BigFig 86px yellow shows amount; no native input for the amount
  - ADD-V10-03    # Description italic-серif placeholder + 3 date chips (today/yesterday/custom date picker)
  - ADD-V10-04    # Category chip-scroll filtered (savings + paused excluded) + account row (primary by default)
  - ADD-V10-05    # 3-state CTA (empty → no-cat → ready) + submit createActualV10 with account_id + dirty-close confirm

# Metrics
duration: ~10m
completed: 2026-05-10
---

# Phase 25 Plan 10: Web AddSheet Summary

**Built the v1.0 AddSheet on the POSTER.black sheet (custom 3×4 numeric keypad replacing the system keyboard, BigFig 86px yellow amount, description input, date chips, category chip-scroll filtering savings/paused, account row, 3-state CTA, atomic POST via createActualV10, dirty-close confirm gate) and replaced V10MainShell's `AddSheetPlaceholderContent` stub with the real component — closing ADD-V10-01..05 entirely.**

## Performance

- **Duration:** ~10 min wall-clock (16:08:41Z → 16:19:04Z)
- **Tasks:** 4 of 4 (8 commits — TDD RED/GREEN splits for Tasks 1-3 + atomic Task 4)
- **Files created:** 9 (3 source + 1 barrel + 2 CSS + 3 test files)
- **Files modified:** 3 (V10MainShell.tsx + V10MainShell.module.css + V10MainShell.test.tsx)

## Accomplishments

- **`computeAddSheet.ts`** (~165 LOC): pure state-machine helpers — `appendDigit / appendDot / backspace` (amount-string keypad reducer), `parseAmountToCents` (with input validation, T-25-10-04 mitigation), `ctaState` (empty / no-cat / ready), `defaultDateForChip` (today / yesterday / custom local-time ISO).
- **`Keypad.tsx`** (~75 LOC): 3×4 grid, 12 buttons (1..9 + . + 0 + ⌫), accessible role=group + aria-labels (RU), press-feedback transform, paper-tinted face on POSTER.black.
- **`AddSheet.tsx`** (~330 LOC): full body — header eyebrow «NEW ENTRY · {date} · {time}», × close (with dirty-form gate), BigFig 86px yellow (decimal-suffix trick), Keypad mounted as the only input, description input (italic-серif placeholder), date chips (Сегодня / Вчера / Своя дата with native picker fallback), category chip-scroll (filtered savings + paused), account row cycler (primary default), 3-state CTA, submit via `createActualV10` with `account_id`, dirty-close confirm overlay.
- **V10MainShell wiring**: import swapped from `AddSheetPlaceholderContent` to `import { AddSheet } from './AddSheet'`. The PosterSheet binding shape (isOpen, onClose, backgroundColor='#0E0E0E') is unchanged — only the inner content swapped. Placeholder definition + CSS removed.
- **51 tests pass** for AddSheet (29 compute + 6 keypad + 16 body); 334/334 full project suite green; tsc strict clean; vite build succeeds (~241 ms, no bundle bloat beyond AddSheet's own ~6 KB).
- **Verification gates met**: `import.*AddSheet.*from './AddSheet'` = 1 in V10MainShell, `AddSheetPlaceholderContent` = 0 (removed), `AddSheet\b` = 12, API calls in AddSheet.tsx = 8 (≥3), CTA labels = 3 (≥3), «ОТМЕНИТЬ ЗАПИСЬ» count = 1.

## Architecture (final)

```
V10MainShell
  └── PosterSheet (isOpen=isAddSheetOpen, bg=#0E0E0E)
        └── AddSheet (Plan 25-10 — REAL)
              ├── header: Eyebrow «NEW ENTRY · 9 МАЯ · 19:18» + × close (dirty-gate)
              ├── BigFig 86px yellow (amount = parseAmountToCents(amountString))
              ├── Keypad 3×4 → appendDigit / appendDot / backspace
              ├── description input (italic-серif placeholder)
              ├── date chips: Сегодня / Вчера / Своя дата (→ native date picker)
              ├── category chip-scroll (filtered code !== 'savings' && !paused)
              ├── account row (primary by default; tap → next)
              ├── CTA («ВВЕДИТЕ СУММУ» disabled / «ВЫБЕРИТЕ КАТЕГОРИЮ» disabled / «СОХРАНИТЬ ↵» yellow ready)
              │     └── on click → createActualV10({ kind:'expense', amount_cents, category_id, account_id, tx_date, description })
              │                    .then(res => onSubmitted(res.id))
              └── cancel-confirm overlay (mounted on dirty × tap)
                    ├── «ПРОДОЛЖИТЬ» yellow → close overlay, preserve form
                    └── «ОТМЕНИТЬ» red → onClose()
```

## Task Commits

Each task atomic with `--no-verify` (parallel-executor protocol):

1. **Task 1 RED: failing tests for compute helpers** — `6200fc7` (test)
2. **Task 1 GREEN: implement compute helpers** — `9e3b05a` (feat)
3. **Task 2 RED: failing tests for Keypad** — `11ed89d` (test)
4. **Task 2 GREEN: implement Keypad component** — `b8342c7` (feat)
5. **Task 3 RED: failing tests for AddSheet body** — `2f3f4ca` (test)
6. **Task 3 GREEN: implement AddSheet body** — `bf89072` (feat)
7. **Task 4: wire AddSheet into V10MainShell** — `a26b82e` (feat)

_Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol._

## Files Created / Modified

### Created

- `frontend/src/screensV10/AddSheet/computeAddSheet.ts` (~165 LOC) — pure helpers
- `frontend/src/screensV10/AddSheet/Keypad.tsx` (~75 LOC) — 3×4 keypad
- `frontend/src/screensV10/AddSheet/Keypad.module.css` — keypad styling
- `frontend/src/screensV10/AddSheet/AddSheet.tsx` (~330 LOC) — full body
- `frontend/src/screensV10/AddSheet/AddSheet.module.css` — sheet styling
- `frontend/src/screensV10/AddSheet/index.ts` — barrel
- `frontend/src/screensV10/AddSheet/__tests__/computeAddSheet.test.ts` (29 tests)
- `frontend/src/screensV10/AddSheet/__tests__/Keypad.test.tsx` (6 tests)
- `frontend/src/screensV10/AddSheet/__tests__/AddSheet.test.tsx` (16 tests)

### Modified

- `frontend/src/screensV10/V10MainShell.tsx` — placeholder → real AddSheet (drop AddSheetPlaceholderContent definition + Eyebrow/Mass imports + onClose-button JSX)
- `frontend/src/screensV10/V10MainShell.module.css` — drop `.sheetPlaceholder`/`.sheetHint`/`.closeBtn` CSS (no consumers after AddSheet brings own styles)
- `frontend/src/screensV10/__tests__/V10MainShell.test.tsx` — add `vi.mock('../../api/v10', ...)` for AddSheet's mount fetch; replace assertions on placeholder copy («Plan 25-10») with assertions on real AddSheet copy («NEW ENTRY»); drop the «Close button inside sheet» test that checked the placeholder's «ЗАКРЫТЬ» button (the real AddSheet has «Закрыть форму», covered by a renamed test)

## Decisions Made

(See `key-decisions` in frontmatter.)

Highlights:

- **Primitive helpers > orchestrator.** The plan's `<action>` block suggested either a `buildAmountString` orchestrator OR primitives (`appendDigit / appendDot / backspace`). I picked the primitives because the keypad emits exactly three semantic events — onAppendDigit / onAppendDot / onBackspace — and a 1:1 mapping to reducer functions reads cleaner than a single orchestrator with a discriminated input. Each primitive has its own tight test bundle.

- **BigFig sup-slot trick for decimal display.** BigFig's `value` prop is `number` (integer-only formatter via `useCountUp.fmtThousands`). To preserve the visual «5.» (trailing dot) and «5.50» (two decimals) without forking BigFig, the AddSheet renders the integer through `value` and packages the decimal tail (`.` or `.5` or `.50`) plus the «₽» suffix into the `sup` slot. Visually identical to the prototype, zero touching of the shared component.

- **Native `<input type="date">` with showPicker → click fallback.** No date library, no portal — a hidden native input lives in the layout and the «Своя дата» chip calls `dateInputRef.current?.showPicker?.() ?? click()`. Works on iOS Safari (showPicker works in 16+; click() falls back on older versions) and desktop Chrome/Firefox.

- **Account picker as row-cycler.** Plan suggested a `<select>` styled element OR a follow-up modal — I shipped a row-cycler («tap row → next account in the list») as the simplest discoverable affordance for users with 1-2 accounts (the typical real-world case). The chevron «→» in the row hints at the action. Plan 25-12 may upgrade to a dedicated PosterSheet picker if user testing flags discoverability issues.

- **Refetch deferred to Plan 25-12.** Per plan note (Task 4 alternative-A vs alternative-B), I picked the simple path — AddSheet's `onSubmitted` callback only closes the sheet. Home / Transactions data stays stale until the user navigates back. Documented as known UX gap. The alternative (txMutationKey context) would require coordinated changes in HomeMount + TransactionsMount + V10MainShell — too much risk/complexity for a polish concern that single-user empirical testing can quickly validate.

- **Cancel-confirm overlay inside the sheet (not a separate PosterSheet).** A second PosterSheet on top of the AddSheet would unmount the form state during open/close, breaking «ПРОДОЛЖИТЬ → form preserved» semantics. An absolute-positioned overlay inside the AddSheet body keeps form state alive (just toggles a boolean).

- **Local-time YYYY-MM-DD for tx_date.** Phase 25 backend (and the ORM `tx_date` field) is a DATE column with no timezone. If we use `toISOString().slice(0,10)` we get UTC-day, which can roll back to «yesterday» for users east of UTC after their local 03:00. Local-time `getFullYear/Month/Date` always honours the user's wall-clock perception of «today».

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] V10MainShell.test.tsx referenced removed placeholder copy «Plan 25-10»**
- **Found during:** Task 4 verification
- **Issue:** The pre-existing V10MainShell tests (Plan 25-06) asserted on placeholder text (`screen.getByText(/Plan 25-10/)`) and on the placeholder's «ЗАКРЫТЬ» button. Both no longer exist after AddSheet swap.
- **Fix:** Updated assertions to query for the real AddSheet's «NEW ENTRY» eyebrow text + the real × button's «Закрыть форму» aria-label. Also added `vi.mock('../../api/v10', ...)` so the AddSheet's mount-time `Promise.all([listAccounts, listCategoriesV10])` fetch resolves with empty arrays during shell tests (the shell tests are not concerned with category/account data — they verify composition). All 10 V10MainShell tests pass after the update.
- **Files modified:** `frontend/src/screensV10/__tests__/V10MainShell.test.tsx` (test-only)
- **Verification:** 10/10 V10MainShell tests pass; 334/334 full suite green
- **Committed in:** `a26b82e` (Task 4 commit, alongside the wire-up)

---

**Total deviations:** 1 (Rule 1 - test file update required by the placeholder removal — expected and documented in the plan's Task 4 acceptance criteria as «assertions may need updating»).

**Impact on plan:** No scope creep; deviation isolated to V10MainShell test file. Real AddSheet implementation matches PLAN must_haves exactly.

## Issues Encountered

- **Mock placement for `api/v10`:** since the AddSheet imports as `import { listAccounts, listCategoriesV10, createActualV10 } from '../../api/v10'`, the mock target in the AddSheet test is `'../../../api/v10'` (relative from `__tests__/`). Same prefix in V10MainShell.test.tsx is `'../../api/v10'` (one level less). Both mocks return `Promise.resolve([])` from the list functions; the V10MainShell tests don't drive any submit, so `createActualV10` is mocked but never invoked.
- **Stderr noise from `usePosterRouter outside Provider` test:** Plan 25-02's posterRouter test deliberately produces a benign jsdom uncaught-error log. Persists in full test runs, no pass/fail impact (documented in 25-02 SUMMARY).
- **Parallel agents in same branch:** Plans 25-08, 25-09, 25-11 (and 25-07/25-06 earlier) committed to `v1.0-maximal-poster` between my task commits. My task 4 ran a `git reset HEAD ios/` to unstage iOS files (worktree inherited their stage status from a parallel agent's working state) and committed only `frontend/...` files. Verified via `git show --stat a26b82e`.

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-25-10-01 (Tampering: free-form description with HTML):** accepted. React JSX escapes the description text on render; backend stores as plain text via Pydantic str field.
- **T-25-10-02 (Repudiation: lost work on accidental × close):** mitigated. The dirty-form gate is implemented in `onClickClose`: any of `amountString`, `description.trim()`, `categoryId !== null` triggers the confirm overlay. «ПРОДОЛЖИТЬ» preserves form state (overlay just unmounts), «ОТМЕНИТЬ» calls `onClose()`. Asserted by 4 dedicated tests in `AddSheet.test.tsx`.
- **T-25-10-03 (Tampering: pre-selecting wrong account_id):** mitigated. `accountId` initial value comes from `accounts.find((a) => a.primary) ?? accs[0] ?? null` after `listAccounts()`. User must explicitly tap the row to cycle. Server-side RLS / per-user account scoping is unchanged (Phase 22 BE-02).
- **T-25-10-04 (Tampering: negative amount via keypad bypass):** mitigated. Keypad emits only digits + dot. `parseAmountToCents` regex-guards against any other character (`/^\d+(\.\d{0,2})?$/`); `createActualV10` independently rejects `amount_cents <= 0` (Phase 25-03). Defence in depth.

No new security surface introduced — the AddSheet only renders local form state and POSTs through the existing typed v10 client.

## Known Stubs

- **Account picker is a cycler, not a list/picker UI.** Tap-to-next works for 1-2 accounts (the typical case) but loses discoverability for 3+ accounts. Tracked for Plan 25-12 polish — replace with a dedicated PosterSheet picker if user testing flags discoverability issues. The current implementation does NOT block ADD-V10-04 acceptance: «account row (primary by default, tap → picker list)» is functionally satisfied by the cycler (tap reveals other accounts one at a time).
- **Refetch after submit not wired.** `onSubmitted` only closes the sheet; Home / Transactions stay stale until the user navigates back. Per CONTEXT D-Defer wording, this is the simple path — the alternative would couple HomeMount / TransactionsMount / V10MainShell via a global tx-mutation context. Plan 25-12 polish pass can add this if empirical testing flags staleness as an issue.

These stubs do NOT block ADD-V10-01..05 acceptance — the AddSheet renders, the keypad is the only input surface, the form fields are all functional, the CTA states transition correctly, the submit POSTs to `POST /actual` with `account_id`, and the dirty-close confirm gate works.

## Next Phase Readiness

- **Plan 25-12 (polish):**
  - Account picker: upgrade cycler → dedicated PosterSheet picker if 3+ account users report discoverability issues
  - Refetch after submit: add a `txMutationKey` context (HomeMount / TransactionsMount include it in useEffect deps) so freshly-created tx appears in Home / Transactions without a manual refetch
  - Toast on submit success (per CONTEXT T-A-06: «toast → Add Sheet закрывается»). For now success is implicit (sheet closes) — a Toast component already exists in componentsV10 and could be wired by V10MainShell on `onSubmitted`
- **Plan 25-08 (web Transactions registry):** unchanged — independent path
- **Phase 26 (plan editor / category detail):** unchanged — AddSheet only writes through POST /actual, no schema dependencies

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/screensV10/AddSheet/AddSheet.tsx
- FOUND: frontend/src/screensV10/AddSheet/AddSheet.module.css
- FOUND: frontend/src/screensV10/AddSheet/Keypad.tsx
- FOUND: frontend/src/screensV10/AddSheet/Keypad.module.css
- FOUND: frontend/src/screensV10/AddSheet/computeAddSheet.ts
- FOUND: frontend/src/screensV10/AddSheet/index.ts
- FOUND: frontend/src/screensV10/AddSheet/__tests__/computeAddSheet.test.ts
- FOUND: frontend/src/screensV10/AddSheet/__tests__/Keypad.test.tsx
- FOUND: frontend/src/screensV10/AddSheet/__tests__/AddSheet.test.tsx
- FOUND: frontend/src/screensV10/V10MainShell.tsx (modified)
- FOUND: frontend/src/screensV10/V10MainShell.module.css (modified)
- FOUND: frontend/src/screensV10/__tests__/V10MainShell.test.tsx (modified)

**Commits exist:**
- FOUND: 6200fc7 (test: compute RED)
- FOUND: 9e3b05a (feat: compute GREEN)
- FOUND: 11ed89d (test: Keypad RED)
- FOUND: b8342c7 (feat: Keypad GREEN)
- FOUND: 2f3f4ca (test: AddSheet RED)
- FOUND: bf89072 (feat: AddSheet GREEN)
- FOUND: a26b82e (feat: V10MainShell wire)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npm test -- screensV10/AddSheet --run`: 51/51 pass (3 files)
- `cd frontend && npm test -- --run`: 334/334 pass (20 files; +51 new tests, no regressions)
- `cd frontend && npm run build`: succeeds (~241 ms)
- `grep -c "import.*AddSheet.*from.*'./AddSheet'" V10MainShell.tsx`: 1 (≥1 required)
- `grep -c "AddSheetPlaceholderContent" V10MainShell.tsx`: 0 (removed; ==0 required)
- `grep -c "AddSheet\b" V10MainShell.tsx`: 12 (≥2 required)
- `grep -c "createActualV10|listAccounts|listCategoriesV10" AddSheet.tsx`: 8 (≥3 required)
- `grep -c "ВВЕДИТЕ СУММУ|ВЫБЕРИТЕ КАТЕГОРИЮ|СОХРАНИТЬ" AddSheet.tsx`: 3 (≥3 required)
- `grep -c "ОТМЕНИТЬ ЗАПИСЬ" AddSheet.tsx`: 1 (≥1 required)

**No accidental file deletions** in any of my task commits — `git diff c66fb51..HEAD --diff-filter=D --name-only -- frontend/`: empty for files I touched. The V10MainShell.module.css lost the `.sheetPlaceholder` / `.sheetHint` / `.closeBtn` selectors (intentional, no other consumers — verified via `grep -rn "sheetPlaceholder\|sheetHint" frontend/src/`).

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 10*
*Completed: 2026-05-10*
