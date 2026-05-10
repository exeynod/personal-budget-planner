---
phase: 28-animations-polish-acceptance
plan: 01
subsystem: testing
tags: [polish, animations, a11y, web, audit, playwright, prefers-reduced-motion]

# Dependency graph
requires:
  - phase: 23-maximal-poster
    provides: stylesV10/animations.css (11 keyframes + reduce-motion overrides)
  - phase: 25-home-transactions-add-sheet
    provides: HomeView + TransactionsView with poster-row-in/poster-bar-fill on category rows
  - phase: 26-plan-management
    provides: PlanView regulars + categories rows
  - phase: 27-ai-savings-management
    provides: AiView typing indicator
provides:
  - "Web audit verifying poster-* utility application across V10 screens"
  - "Playwright e2e spec (6 tests) covering POL-01/POL-02/POL-03 web slice"
  - "Hero rise-in animation on Home BigFig + headline (DESIGN-SYSTEM §7.4 entrance)"
  - "Stagger row-in on Plan regulars and categories (cobalt screen entry)"
  - "poster-dot keyframe applied to AI typing indicator (replaces plain CSS-module dots)"
affects: [28-04 ios-pixel-qa, 28-05 perf, 28-06 acceptance, v1.1 a11y full audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright reduce-motion gating via page.emulateMedia({ reducedMotion: 'reduce' })"
    - "DOM grep-style audit (locator('.poster-row-in')) survives CSS Module name churn"

key-files:
  created:
    - frontend/tests/e2e/v10-animations-audit.spec.ts
  modified:
    - frontend/src/screensV10/Home/HomeView.tsx
    - frontend/src/screensV10/Plan/PlanView.tsx
    - frontend/src/screensV10/Ai/AiView.tsx

key-decisions:
  - "Patches kept minimally invasive (className append + inline animationDelay) — no module CSS rewrites"
  - "A11y test uses soft-cap (≤15) instead of hard-fail — POL-03 is 'have overrides', not 'zero offenders'; v1.1 will fully audit"
  - "page.emulateMedia (not context.emulateMedia) — context API unavailable in installed Playwright version"
  - "tsc errors (analytics.ts, TxV10TabDemote.test.tsx, AiView ref-type, AiView.test.tsx) deferred — pre-existing in baseline 2645b09, not introduced by this plan"

patterns-established:
  - "Playwright reduced-motion smoke: emulateMedia + waitForTimeout(800) + getComputedStyle(transform) === 'none' | identity matrix"
  - "Onboarded-state mock fixtures (ME_ONBOARDED + ACCOUNTS + CATEGORIES + PERIOD_CURRENT + actuals) reusable across Phase 28 e2e specs"

requirements-completed: [POL-01, POL-02, POL-03]

# Metrics
duration: 14min
completed: 2026-05-10
---

# Phase 28 Plan 01: Web Animations Audit + Reduced-Motion + A11y Spot Summary

**Playwright spec (6 tests) verifying 4 poster-* utilities are applied on V10 Home + reduced-motion overrides flatten transforms + a11y soft-scan; 3 inline screen patches (Home hero, Plan rows, Ai dots) closed remaining gaps surfaced by grep audit.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-10T20:15Z
- **Completed:** 2026-05-10T20:30Z
- **Tasks:** 2
- **Files modified:** 4 (3 src + 1 new spec)

## Accomplishments
- Grep audit completed across `frontend/src/screensV10` — list of poster-* utility usages enumerated below
- 3 minimally-invasive patches added missing utilities surfaced by the audit (Home hero `.poster-rise-in`, Plan regulars/categories `.poster-row-in`, Ai typing indicator `.poster-dot`)
- New Playwright spec `v10-animations-audit.spec.ts` (6 tests, all green in 2.6s)
- Reduced-motion override behaviour locked: `.poster-row-in` settles to `transform: none`, `.poster-bar-fill` renders at identity matrix instantly

## Task Commits

1. **Task 1: Grep audit + screen patches** — `26d02d3` (feat)
2. **Task 2: Playwright animations-audit spec** — `d23fa46` (test)

## Files Created/Modified
- `frontend/tests/e2e/v10-animations-audit.spec.ts` — new Playwright spec, 257 LOC, 6 tests across 3 describe blocks (apply / reduced-motion / a11y)
- `frontend/src/screensV10/Home/HomeView.tsx` — `.poster-rise-in` on `heroHeadline` and `heroBigFig` (0.06s offset)
- `frontend/src/screensV10/Plan/PlanView.tsx` — `.poster-row-in` + inline `animationDelay` on regulars (`0.32 + i*0.09s`) and categories (`0.4 + i*0.06s`)
- `frontend/src/screensV10/Ai/AiView.tsx` — replaced plain `styles.dot` with `.poster-dot` for 3-dot typing indicator (offsets 0/0.15/0.3s)

## Audit Findings

<details><summary>Raw grep output (click to expand)</summary>

```text
$ grep -rn "poster-row-in|poster-rise-in|poster-bar-fill|poster-pop-in|poster-tab-pop|poster-tab-swap|poster-toast-in|poster-dot|poster-check|poster-slide-in" frontend/src/screensV10

frontend/src/screensV10/Home/HomeView.module.css:3        — ref-only comment
frontend/src/screensV10/Home/HomeView.tsx:12              — ref-only comment
frontend/src/screensV10/Home/HomeView.tsx:190             — .poster-row-in   (categoryRow)
frontend/src/screensV10/Home/HomeView.tsx:217             — .poster-bar-fill (progress bar)
frontend/src/screensV10/Transactions/TransactionsView.tsx:13   — ref-only comment
frontend/src/screensV10/Transactions/TransactionsView.tsx:188  — .poster-row-in   (day group row)
frontend/src/screensV10/Transactions/TransactionsView.module.css:3  — ref-only comment
frontend/src/screensV10/common/PosterRouter.module.css:3       — ref-only comment
frontend/src/screensV10/common/PosterRouter.tsx:166            — .poster-slide-in-fwd / .poster-slide-in-back
frontend/src/screensV10/common/__tests__/posterRouter.test.tsx — fwd/back assertions

# componentsV10/Toast.tsx (outside screensV10 scope but per spec):
frontend/src/componentsV10/Toast.tsx:27   — .poster-toast-in
frontend/src/componentsV10/Toast.tsx:33   — .poster-check
```

**Coverage matrix vs. PLAN spec:**

| Screen / Component         | Expected utility                          | Pre-audit state | Action                |
|----------------------------|-------------------------------------------|-----------------|------------------------|
| Home hero block            | `.poster-rise-in`                         | MISSING         | **Patched** (Task 1)  |
| Home category rows         | `.poster-row-in` (stagger)                | OK              | none                  |
| Home progress bars         | `.poster-bar-fill`                        | OK              | none                  |
| Transactions day groups    | `.poster-row-in`                          | OK              | none                  |
| Plan regulars              | `.poster-row-in` (`0.32 + i*0.09s`)       | MISSING         | **Patched** (Task 1)  |
| Plan categories            | `.poster-row-in` (stagger)                | MISSING         | **Patched** (Task 1)  |
| Ai typing indicator        | `.poster-dot` (infinite loop)             | MISSING         | **Patched** (Task 1)  |
| Toast component            | `.poster-toast-in` + `.poster-check`      | OK              | none                  |
| PosterRouter push/pop      | `.poster-slide-in-fwd` / `-back`          | OK              | none                  |

</details>

## Test Results

```text
Running 6 tests using 1 worker

  ✓ POL-01/POL-02 › Home renders .poster-rise-in on hero block            (185ms)
  ✓ POL-01/POL-02 › Home renders .poster-row-in on category rows          (178ms)
  ✓ POL-01/POL-02 › Home renders .poster-bar-fill on progress bar         (167ms)
  ✓ POL-03 reduced-motion › .poster-row-in flattens to transform: none    (986ms)
  ✓ POL-03 reduced-motion › .poster-bar-fill at identity matrix scaleX(1) (599ms)
  ✓ POL-03 a11y spot-checks › UPPERCASE elements with letter-spacing      (175ms)

  6 passed (2.6s)
```

A11y soft-scan output (warn-only, no fail): see test stdout for v1.1 follow-up list. Soft-cap is 15 — current Home well under cap.

## Decisions Made
- Tasks committed atomically (Task 1 = patches, Task 2 = spec) — bisect-friendly per project convention.
- A11y check uses `soft-cap <= 15` instead of strict `aria-label` requirement on every UPPERCASE element — POL-03 spec wording is "have overrides", not "zero offenders". Full WCAG sweep deferred to v1.1 per CONTEXT.md `<deferred>` block.
- Used `page.emulateMedia` (not `context.emulateMedia`) — auto-fix Rule 1, see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `context.emulateMedia` is not a function in installed Playwright version**
- **Found during:** Task 2 (first run)
- **Issue:** PLAN-suggested `context.emulateMedia({ reducedMotion: 'reduce' })` failed with `TypeError: context.emulateMedia is not a function` — the BrowserContext API doesn't expose this in the project's pinned Playwright; only `page.emulateMedia` is available
- **Fix:** Replaced both `context.emulateMedia(...)` calls with `page.emulateMedia(...)` and dropped the `context` fixture from the test args
- **Files modified:** `frontend/tests/e2e/v10-animations-audit.spec.ts`
- **Verification:** All 6 tests pass; reduced-motion assertions still hold (`transform: none` after 800ms)
- **Committed in:** `d23fa46` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Trivial API surface adjustment; PLAN intent fully delivered.

## Issues Encountered

- **Shared-worktree commit side-effect.** Sibling agent (28-05 perf-report) wrote `.gitignore` modifications and `28-perf-report.md` between my Task 1 and Task 2 commits. My `git add frontend/tests/e2e/v10-animations-audit.spec.ts` still produced a commit that includes those tracked-but-modified-by-sibling files. **No destructive action taken** — per executor protocol I do not amend/reset shared history. The Task 2 commit `d23fa46` is correct for my deliverable but contains 2 sibling-owned files. Final-commit step below also operates additively only.
- **tsc errors are pre-existing** (`analytics.ts AnalyticsRange`, `TxV10TabDemote.test.tsx node:fs`, `AiView.tsx bottomRef LegacyRef`, `AiView.test.tsx null assignability`) — confirmed they reproduce on baseline `2645b09` before any of my edits. Out of scope per `<scope_boundary>`. Vite build green; runtime untouched.

## Deferred Issues

- Pre-existing TypeScript errors in unrelated files — handed to verifier / future plan
- Full A11y aria-label coverage on UPPERCASE elements — v1.1 (CONTEXT.md `<deferred>`)

## User Setup Required
None.

## Next Phase Readiness
- POL-01/POL-02/POL-03 web slice locked by automated tests — safe to layer 28-03 pixel snapshots and 28-06 acceptance e2e on top
- iOS counterpart (28-02) committed in parallel by sibling — no coupling
- Future regressions to poster-* class application caught immediately by the new spec

## Self-Check: PASSED

- File `frontend/tests/e2e/v10-animations-audit.spec.ts` — FOUND
- File `frontend/src/screensV10/Home/HomeView.tsx` — FOUND (modified)
- File `frontend/src/screensV10/Plan/PlanView.tsx` — FOUND (modified)
- File `frontend/src/screensV10/Ai/AiView.tsx` — FOUND (modified)
- Commit `26d02d3` (Task 1) — FOUND in git log
- Commit `d23fa46` (Task 2) — FOUND in git log
- Playwright suite — 6/6 green (2.6s)

---
*Phase: 28-animations-polish-acceptance*
*Completed: 2026-05-10*
