---
phase: 24-onboarding-4-step
plan: 02
subsystem: ui
tags: [react, vitest, testing-library, css-modules, money-format, u202f]

# Dependency graph
requires:
  - phase: 23-poster-pixel-clone
    provides: Eyebrow + Mass + PosterButton components, tokens.css coral/paper palette, Archivo Black + JetBrains Mono fonts
  - phase: 24-onboarding-4-step (plan 24-01)
    provides: onboardingReducer + INITIAL_STATE + OnboardingAction, OnboardingDraft type, useOnboardingDraft hook, defaultCategories share table
provides:
  - OnboardingChrome reusable scaffold (header + body + footer with hint/dots/CTA) for all 4 onboarding steps
  - OnboardingFlow root component with useReducer + draft persist + lazy rehydrate from localStorage
  - Step01Income view (italic mass headline, Archivo Black 48px input, ₽ suffix, 4 preset chips)
  - format.ts — formatRubles (U+202F thin space) + parseIncomeInputToCents (cap 100M ₽)
affects:
  - 24-03 (iOS step 01) — symmetric props contract for SwiftUI port
  - 24-04 (web step 02 — Accounts) — consumes OnboardingChrome props + flow step switch
  - 24-06 (web step 03 — Plan) — consumes OnboardingChrome props
  - 24-08 (web step 04 — Goal/Final) — consumes OnboardingChrome with onSkip + final-step CTA hide
  - 24-10 (web wire-e2e) — mounts OnboardingFlow into AppV10 + wires onComplete to /onboarding/complete

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useReducer lazy initialiser reads localStorage draft on mount → no flash of INITIAL_STATE
    - useRef pin for hook-returned closures keeps useEffect deps stable when the hook returns a fresh object every render
    - OnboardingChrome is presentational; step views are dispatch-only (single source of truth = reducer)
    - Chip active state exposed via `data-active` attribute for testability without text-content matching

key-files:
  created:
    - frontend/src/screensV10/Onboarding/OnboardingChrome.tsx
    - frontend/src/screensV10/Onboarding/OnboardingChrome.module.css
    - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
    - frontend/src/screensV10/Onboarding/OnboardingFlow.module.css
    - frontend/src/screensV10/Onboarding/Step01Income.tsx
    - frontend/src/screensV10/Onboarding/Step01Income.module.css
    - frontend/src/screensV10/Onboarding/format.ts
    - frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx
  modified: []

key-decisions:
  - "U+202F (NARROW NO-BREAK SPACE) used for thousand grouping per DATA-MODEL §5.1 — distinct from existing fmtThousands (ASCII space) in hooks/useCountUp.ts; kept onboarding helper local to avoid breaking BigFig snapshots"
  - "BigInt arithmetic in parseIncomeInputToCents to safely handle 1e15+ paste values without IEEE 754 overflow"
  - "Active preset chip exposes data-active attribute for stable test queries (RTL text matchers do not reliably normalise U+202F across element boundaries)"
  - "Step 01 explicitly passes onBack=undefined → chrome renders muted disabled arrow per spec; placeholder steps 02..04 pass real onBack for QA convenience while their plans are pending"
  - "OnboardingFlow placeholder steps keep nextDisabled=true so the CTA cannot accidentally skip past unbuilt screens (they will be unlocked plan-by-plan in 24-04 / 24-06 / 24-08)"

patterns-established:
  - "Onboarding chrome contract: { step, total=4, label, onBack?, onSkip?, onNext?, nextLabel='ДАЛЕЕ →', nextDisabled?, hint?, children }"
  - "Step view contract: { incomeCents | accountsList | ...; dispatch: Dispatch<OnboardingAction> } — props derived from reducer state, no local form state"
  - "TDD gate sequence: test() RED commit → feat() GREEN commit (vitest globals=false → explicit afterEach(cleanup) per test file)"

requirements-completed: [ONB-V10-01, ONB-V10-02]

# Metrics
duration: 7min
completed: 2026-05-10
---

# Phase 24 Plan 02: Web Step 01 (Income) Summary

**Reusable poster-style onboarding chrome (header/dots/CTA) + reducer-driven OnboardingFlow root + Step 01 income input with U+202F thin-space formatter, 100M ₽ paste cap, and 4 preset chips (50/80/120/200K)**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-10T10:04:31Z
- **Completed:** 2026-05-10T10:11:04Z
- **Tasks:** 2 (TDD gates: 1 RED + 1 GREEN for Task 2)
- **Files created:** 8 (4 source TSX/CSS + 1 helper + 1 test + 2 chrome CSS)
- **Files modified:** 0

## Accomplishments

- **OnboardingChrome** locks the visual contract for steps 02/03/04 (Final has its own CTA layout — chrome auto-hides dots+CTA on step=5). Coral background, paper text, JetBrains Mono back/skip, Archivo Black CTA, 4-segment progress bar.
- **OnboardingFlow** owns the `useReducer(onboardingReducer)` state machine; lazy initialiser rehydrates from `localStorage['onboarding.v10.draft']` so returning users land on the step they left off. `useEffect([state])` persists every reducer transition.
- **Step01Income** renders italic 36px «Какой доход / в месяц?» headline, sub-eyebrow «ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ», Archivo Black 48px input + 32px ₽ suffix, and 4 preset chips (50/80/120/200K ₽) with active-state inversion (paper bg + coral text).
- **Format helper** isolated in `format.ts` — `formatRubles(cents)` uses U+202F NARROW NO-BREAK SPACE per DATA-MODEL §5.1 (test asserts the actual codepoint 0x202F to guard against silent regressions); `parseIncomeInputToCents(raw)` strips non-digits and clamps at 100M ₽ via BigInt to avoid IEEE 754 overflow on huge pastes.
- **NEXT-disabled** wired correctly: `state.income_cents <= 0` keeps the CTA muted on Step 01; placeholder steps 02..04 stay disabled until their plans ship.

## Task Commits

1. **Task 1: OnboardingChrome + OnboardingFlow root** — `1785af3` (feat)
2. **Task 2 (RED): failing tests for Step01Income + formatRubles** — `7821941` (test)
3. **Task 2 (GREEN): Step01Income view + format helper + flow wiring** — `da1ef6e` (feat)

_TDD gate sequence honoured: `test()` precedes `feat()` for the RED→GREEN cycle in Task 2. Task 1 had no RTL specs (per plan's `<verify>` block — tsc + lint only)._

## Files Created/Modified

- `frontend/src/screensV10/Onboarding/OnboardingChrome.tsx` — reusable chrome with header (back-arrow + eyebrow + optional skip), body slot, footer (optional hint + 4-dot progress + paper-on-coral CTA). Hides CTA + dots on step=5.
- `frontend/src/screensV10/Onboarding/OnboardingChrome.module.css` — coral bg / paper text, 56/22/28 paddings per prototype OnbChrome reference.
- `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx` — `useReducer(onboardingReducer, INITIAL_STATE, lazyDraftLoad)` + persistence effect + step switch. PlaceholderStep stub for steps 02..05 until subsequent plans land.
- `frontend/src/screensV10/Onboarding/OnboardingFlow.module.css` — full-viewport coral container + placeholder centering.
- `frontend/src/screensV10/Onboarding/Step01Income.tsx` — controlled input bound to `incomeCents`; preset chips dispatch `SET_INCOME` with cents; active chip flagged via `data-active`.
- `frontend/src/screensV10/Onboarding/Step01Income.module.css` — Archivo Black 48px input + 32px ₽ suffix, paper-on-coral preset chips with inversion on active state.
- `frontend/src/screensV10/Onboarding/format.ts` — `formatRubles` (U+202F) + `parseIncomeInputToCents` (BigInt-safe, capped at 100M ₽).
- `frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx` — 16 specs across formatter, render, input parsing, paste cap (T-24-02-02), tampering strip (T-24-02-01), preset clicks, active-chip swap.

## Decisions Made

- **Distinct formatter from existing fmtThousands.** `frontend/src/hooks/useCountUp.ts:fmtThousands` uses ASCII 0x20 (BigFig + count-up animations). Onboarding contract demands U+202F per DATA-MODEL §5.1 — added a local `format.ts` rather than retrofitting `fmtThousands`, which would silently change snapshot output across Phase 23 components.
- **BigInt parse path.** `1000000000000000` (1e15) literally typed into the input would overflow `parseInt * 100` past `Number.MAX_SAFE_INTEGER`. Used `BigInt(digits) * 100n` then capped at `INCOME_DISPLAY_CAP_CENTS = 100_000_000_00` to satisfy T-24-02-02 without losing precision.
- **`data-active` attribute on preset chips.** RTL `getByText` with ` ` inside textContent is unreliable across normalisation rules. Adding a stable `data-active="true|false"` attribute makes assertions deterministic without sacrificing the visible text.
- **`useRef` pin for `useOnboardingDraft` closure.** The hook returns a fresh `{load, save, clear}` object every call; pinning the latest value in a ref keeps `useEffect([state])` deps stable so persistence runs once per reducer action, not once per render.
- **Chrome step=5 contract.** Hides progress dots and CTA when `step === 5`, since the Final screen (plan 24-08) draws its own headline and «НАЧАТЬ →» button.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] RTL auto-cleanup not registered globally**
- **Found during:** Task 2 GREEN run (multiple `<input>` instances in DOM caused `getByRole('textbox')` to throw "found multiple elements")
- **Issue:** `vitest.config` has `globals: false`, which disables `@testing-library/react`'s auto-cleanup-on-import. Existing tests in the project don't hit this because they re-render rather than mount-then-mount.
- **Fix:** Added explicit `afterEach(cleanup)` inside `Step01Income.test.tsx` (in-scope per the deviation scope rule — only affects this plan's test file).
- **Files modified:** `frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx`
- **Verification:** All 16 specs pass on second run.
- **Committed in:** `da1ef6e` (Task 2 GREEN)

**2. [Rule 1 — Bug] ES2020 `Array.prototype.at` not in lib**
- **Found during:** `npm run build` (full project tsc -b emitted TS2550)
- **Issue:** `tsconfig.app.json` targets ES2020 lib; `dispatch.mock.calls.at(-1)` is ES2022.
- **Fix:** Replaced with `calls[calls.length - 1]?.[0]`.
- **Files modified:** `frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx`
- **Verification:** `npm run build` succeeds.
- **Committed in:** `da1ef6e` (Task 2 GREEN)

**3. [Rule 1 — Bug] STEP_LABELS index narrowing**
- **Found during:** `npm run build` (TS7053)
- **Issue:** `STEP_LABELS[state.step]` failed because `state.step` is `OnboardingStep` (1|2|3|4|5) but `STEP_LABELS` is `Record<1|2|3|4, string>`.
- **Fix:** Cast `state.step as 1|2|3|4` inside the non-final branch (already gated by `isFinal` ternary).
- **Files modified:** `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx`
- **Verification:** tsc clean + tests pass.
- **Committed in:** `da1ef6e` (Task 2 GREEN)

**4. [Rule 3 — Blocking] ESLint not installed**
- **Found during:** Task 1 verify step
- **Issue:** Plan's `<automated>` step calls `npx eslint`, but `eslint` is not in `package.json` and no config exists.
- **Fix:** Skipped eslint, ran `tsc --noEmit` only — matches the plan's stated acceptance criteria ("vitest tests, vite build, tsc clean"). Did NOT install eslint (out of scope).
- **Files modified:** none
- **Committed in:** N/A (documentation-only deviation)

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking).
**Impact on plan:** All deviations were build/tooling fixes — no behavioural change to the components, no scope creep, no requirement adjustments.

## Issues Encountered

- RTL text-content matching with U+202F across normalisation boundaries was finicky; resolved via `data-active` attribute + textContent equality in helper. Did not file as deviation since it was a test-design choice rather than a bug.

## Threat Model Coverage

| Threat ID  | Disposition | Status                                                                                                |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| T-24-02-01 | mitigate    | ✓ `parseIncomeInputToCents` strips `\D` and reducer clamps ≥0 (test: "strips non-digit chars")        |
| T-24-02-02 | mitigate    | ✓ Cap at 100M ₽ via BigInt arithmetic (test: "caps display at 100M ₽")                               |
| T-24-02-03 | accept      | Single-tenant, owner is the only user — value visibility in DOM is acceptable                         |

## Next Phase Readiness

- **24-03 (iOS step 01):** Symmetric `OnboardingFlowProps` and Step01Income contract documented; iOS port consumes the same reducer-state shape (`income_cents`, dispatch).
- **24-04 (web step 02 — Accounts):** Reuse `OnboardingChrome` with `step={2}` and `label="ШАГ 02 / 04 · СЧЕТА"`; replace `<PlaceholderStep step={2}/>` with the real Step02Accounts in OnboardingFlow.
- **24-10 (web wire-e2e):** OnboardingFlow not yet mounted into AppV10 — done explicitly in plan 24-10 along with the `/onboarding/complete` POST and onComplete navigation.

## OnboardingChrome Props Signature (for downstream plans)

```ts
export interface OnboardingChromeProps {
  step: OnboardingStep;          // 1|2|3|4|5  — drives dot fill, hides CTA on 5
  total?: number;                // default 4
  label: string;                 // eyebrow text, e.g. «ШАГ 01 / 04 · ДОХОД»
  onBack?: () => void;           // undefined → muted disabled arrow
  onSkip?: () => void;           // undefined → no skip link rendered
  onNext?: () => void;           // gated by nextDisabled
  nextLabel?: string;            // default «ДАЛЕЕ →»
  nextDisabled?: boolean;        // mutes CTA + suppresses onNext + aria-disabled
  hint?: string;                 // optional small hint above dots
  children: ReactNode;           // step body (flex:1)
}
```

## Self-Check: PASSED

- `frontend/src/screensV10/Onboarding/OnboardingChrome.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/OnboardingChrome.module.css` — FOUND
- `frontend/src/screensV10/Onboarding/OnboardingFlow.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/OnboardingFlow.module.css` — FOUND
- `frontend/src/screensV10/Onboarding/Step01Income.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/Step01Income.module.css` — FOUND
- `frontend/src/screensV10/Onboarding/format.ts` — FOUND
- `frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx` — FOUND
- Commit `1785af3` — FOUND
- Commit `7821941` — FOUND
- Commit `da1ef6e` — FOUND

---
*Phase: 24-onboarding-4-step*
*Completed: 2026-05-10*
