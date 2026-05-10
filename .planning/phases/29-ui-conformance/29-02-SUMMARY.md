---
phase: 29-ui-conformance
plan: 02
subsystem: ui

tags: [audit, ui-conformance, web, playwright, prototype-diff, design-system]

# Dependency graph
requires:
  - phase: 29-ui-conformance
    provides: "29-01 — 8 baseline PNGs + onboarded fixture; UI-REVIEW.md skeleton with iOS section (29-03 landed first in this worktree's history)"
  - phase: 28-polish
    provides: "v10-pixel-snapshots.spec.ts scaffold and accepted DIVERGENCES.md W-01..W-05 / X-01..X-02 baseline"
provides:
  - "UI-REVIEW.md `## Web` section — 8 per-screen audits with 26 BLOCKERs / 7 WARNINGs / 6 INFOs / 1 PASS"
  - "Three setup-issue BLOCKERs explicitly called out as plan 29-04 pre-conditions (W-05 selector, missing /savings fixture, missing /ai/observation fixture)"
  - "Severity counts merged into Summary table alongside iOS counts from 29-03"
affects: [29-04-blocker-fixes, 29-05-divergences-update, 31-regression-suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Side-by-side audit method: read baseline PNG (visual) + prototype JSX (source-of-truth) + impl TSX/CSS module (current state); compare 3 surfaces per finding"
    - "Setup-issue BLOCKERs (fixture deficits) flagged in audit when render is gated by missing fixture mocks — separate from pure visual divergence findings"

key-files:
  created:
    - .planning/phases/29-ui-conformance/UI-REVIEW.md (effective net effect — the file existed via 29-03 but ## Web placeholder was empty; this plan filled in the 8 subsections and updated Summary table)
  modified: []

key-decisions:
  - "Token reference broken: `var(--poster-font-dm-serif)` / `var(--poster-font-pt-serif)` resolve to empty across Transactions, CategoryDetail, AI modules — flagged as BLOCKER per rubric («broken animation reference» generalised to «broken token reference»)"
  - "DESIGN-SYSTEM §4 «Радиусы: 0 на 95% компонентов» enforced for AI message bubbles + composer input — 4px border-radius is a direct DS violation, BLOCKER"
  - "PlanMonth audit relies on source-code comparison because baseline PNG captured Home (W-05 risk realised). Code-only findings recorded; visual re-audit deferred to 29-04 after W-05 selector hardening"
  - "Savings + AI baseline rendering issues classified as setup-issue BLOCKERs (fixture deficits), not implementation bugs — surfaced so plan 29-04 fixes fixtures BEFORE attempting BLOCKER fixes on these screens"
  - "Cross-platform observation: web Subscriptions ink-on-coral BLOCKER == iOS-6 ink-on-coral BLOCKER; web AI bg=black BLOCKER == iOS-8 bg=black BLOCKER. Single DESIGN-SYSTEM §1 enforcement pass per platform would close both pairs"

patterns-established:
  - "When a fixture deficit makes a screen unrenderable, do NOT classify it as a PASS by omission — record it as a setup-issue BLOCKER with a concrete fixture-extension recipe (`extraRoutes` entry shape) for the next plan"
  - "Audit findings cite three coordinates: severity, where (file:line OR token name), and what the prototype expects vs what the impl actually does"

requirements-completed: [UICONF-02]

# Metrics
duration: 6min
completed: 2026-05-11
---

# Phase 29 Plan 02: UI Conformance Audit (Web) Summary

**8 V10 web screens audited side-by-side vs `prototype/index.html` — 26 BLOCKERs across 7 screens, only Home passing; three setup-issue BLOCKERs (W-05 selector, /savings fixture, /ai/observation fixture) gate plan 29-04 pre-conditions.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-10T22:38:11Z (timezone-equivalent 2026-05-11T01:38:11+03:00 in MSK)
- **Completed:** 2026-05-10T22:44:05Z (~01:44:05 MSK)
- **Tasks:** 1
- **Files modified:** 1 (`.planning/phases/29-ui-conformance/UI-REVIEW.md` — 741 lines net; the placeholder `## Web` section from 29-03's seed file was replaced with the full audit)

## Accomplishments

- Read all 8 baseline PNGs (`home`, `transactions`, `add-sheet`, `category-detail`, `plan-month`, `subscriptions`, `savings`, `ai-initial`) and visually compared each against the corresponding prototype JSX section in `poster-screens.jsx`.
- Read the implementation TSX + CSS module for each screen and cross-referenced token usage against `frontend/src/stylesV10/tokens.css` (the V10 poster token file — NOT the legacy Liquid-Glass `frontend/src/styles/tokens.css`).
- Produced 8 per-screen audit subsections in `UI-REVIEW.md` `## Web`, each with: Status (PASS/BLOCKER/WARNING/INFO), Findings list with severity-prefixed entries, exact `file:line` or token-name citations, and prototype reference.
- Detected and dedupe-flagged the 7 known DIVERGENCES.md rows (W-01..W-05, X-01..X-02) — none re-opened.
- Surfaced 3 setup-issue BLOCKERs that gate audit completeness (cannot pixel-audit PlanMonth/Savings/AI until their fixtures + selector are fixed by 29-04).
- Discovered cross-platform symmetry of two BLOCKERs (Subscriptions ink-on-coral and AI bg=black) — one DS §1 enforcement pass closes 4 BLOCKERs (2 web + 2 iOS).
- Merged severity counts into the file-level Summary table that already had the iOS counts from 29-03.

## Task Commits

1. **Task 1: Per-screen side-by-side audit + write UI-REVIEW.md (web section)** — `de45310` (docs)

_Note: this is a single-task audit plan; no plan-metadata commit will follow until the final state-update commit at the end of this summary._

## Files Created/Modified

- `.planning/phases/29-ui-conformance/UI-REVIEW.md` — 741 lines total. The `## Web` section (lines 12 → just before `## iOS`) is the new content; iOS section (already present from 29-03) preserved; final Summary table merged with both Web and iOS counts.

## Audit results — counts by severity (Web)

| Severity | Web Count | Web Screens                                                                                          |
| -------- | --------- | ---------------------------------------------------------------------------------------------------- |
| BLOCKER  | 26        | Transactions (3), AddSheet (3), CategoryDetail (6), PlanMonth (6), Subscriptions (3), Savings (4), AI (5) |
| WARNING  | 7         | Home (1), Transactions (1), AddSheet (1), CategoryDetail (1), PlanMonth (1), Subscriptions (2)       |
| INFO     | 6         | Home (1), Transactions (1), AddSheet (1), Subscriptions (1), AI (2)                                  |
| PASS     | 1         | Home (overall)                                                                                       |

## Screens requiring fix-plan in 29-04 (web)

1. **Transactions** — eyebrow position swap; Mass size 88 vs spec 70; broken `--poster-font-dm-serif`/`--poster-font-pt-serif` token refs.
2. **AddSheet** — Keypad rendered BEFORE description/date/category/account rows (element-order swap); account row styling and content-format both diverge.
3. **CategoryDetail** — eyebrow copy («CATEGORY · 01» vs «IN PLAN · CAT»); BigFig 88 vs spec 64; missing «N осталось» bar-caption right-half; wrong rollover plate style (paper-outline vs dark plate with money line); CTA pair style (full-width ghosts vs yellow+ghost compact pills); broken token refs.
4. **PlanMonth** — baseline PNG captured Home (W-05 setup gate); headline copy («PLAN МЕСЯЦА.» 70px single-line vs «PLAN<br/>МАЯ.» 56px two-line); symmetric agg-plates (should be asymmetric); missing «ОСТАТОК ПО ИТОГУ МЕСЯЦА» eyebrow; missing «N ждут проведения» dark plate above regulars list.
5. **Subscriptions** — text color ink on coral (spec is paper); BigFig 86 vs spec 56; separator color paper→ink follow-on.
6. **Savings** — baseline empty due to /savings fixture deficit; composite yellow-plate layout split into separate plate + separate eyebrow strip; roundup section split into separate flex rows vs single inline plate.
7. **AI initial-state** — bg color black vs spec cream (DS §1 violation, every hex digit differs); inverted text palette; observation 36px DM Serif missing due to /ai/observation fixture deficit; bubble/composer border-radius 4px violates DS §4 «0 on 95%»; composer structure split into two layers.

## Screens with PASS status (no work for 29-04 web wave)

- **Home** — overall PASS. The WARNING («21 ДЕНЬ» pluralization) and INFO (BigFig rAF non-determinism) are deferred to 29-05 → DIVERGENCES.md → v1.1 backlog.

## Plan 29-04 pre-conditions (must run BEFORE BLOCKER fixes for those screens)

1. **W-05 selector hardening:** add `data-testid="nav-plan"` to Home `PLAN МАЯ` plate or to the management-hub entry; update `gotoPlanMonth` helper to use the testid; re-run `--update-snapshots --project=chromium-mobile` so `plan-month-chromium-mobile-darwin.png` shows actual PlanMonth.
2. **Savings fixture extension:** extend `frontend/tests/e2e/fixtures/onboarded-user.ts` `installOnboardedFixture` to default-route `**/api/v1/savings` → `{ total_cents: 0, month_in_cents: 0, config: { roundup_enabled: false, roundup_base: 50 }, goals: [] }`. Without this, SavingsView crashes on `[]`-shaped catch-all response (TypeError on `snap.config.roundup_enabled`).
3. **AI fixture extension:** mock `**/api/v1/ai/observation` (or the actual endpoint AiMount calls — confirm from `AiMount.tsx` source) with a deterministic observation payload so the 36px DM Serif hero renders.
4. **(optional, INFO)** BigFig deterministic snapshot — extend `freezeMotion` to monkey-patch `BigFig` count-up to terminal value synchronously before snapshot capture.

## Cross-platform alignment with iOS (carried from 29-03)

- **iOS-6 Subscriptions BLOCKER** (ink on coral) === Web `### 6. Subscriptions` BLOCKER #1 — single DS §1 enforcement pass per platform closes both.
- **iOS-8 AI bg=black BLOCKER** === Web `### 8. AI initial-state` BLOCKER #1 — same DS §1 enforcement.

These overlapping defects suggest a systemic DS §1 palette-rule lapse during V10 implementation, NOT independent regressions per surface. Plan 29-04 should consider a single "DS §1 palette audit" sub-plan that fixes both screens on both platforms in one pass.

## Decisions Made

- **Token reference broken** (`--poster-font-dm-serif`, `--poster-font-pt-serif`) — these tokens are NEVER defined in `frontend/src/stylesV10/tokens.css`. The font-family chain falls through to literal `'PT Serif'` / `'DM Serif Display'` strings (which work because W-01 dual-font is globally injected). Classified BLOCKER per rubric ("broken animation reference" extended to "broken token reference") — silent breakage on token rename/removal.
- **DESIGN-SYSTEM §4 enforcement (border-radius)** — AI message bubbles + composer input use 4px. DS rule is «0 на 95%», so 4px is a direct DS violation → BLOCKER (not WARNING). The 4px is not justified by any DS exception.
- **W-05 setup-issue treatment** — the W-05 row in DIVERGENCES.md is accepted, BUT its risk has materialised (PlanMonth baseline is Home). The audit surfaces this as a screen-level BLOCKER inside § 5 PlanMonth — NOT a re-open of W-05; rather an explicit "the accepted-risk has happened, plan 29-04 must mitigate" signal.
- **Setup-issue vs implementation BLOCKER distinction** — three of the 26 BLOCKERs are setup-issues (fixture/selector), not implementation bugs. Recorded inline with concrete remediation recipes so plan 29-04 can branch fixture work vs code-fix work.

## Deviations from Plan

None — plan executed exactly as written. All 8 screens audited; Excluded block correctly enumerates W-01..W-05 + X-01..X-02; Summary contains BLOCKER count matching `[BLOCKER]` occurrences in body; every BLOCKER/WARNING/INFO finding cites concrete file:line or token reference.

(One coordination detail worth noting: plan 29-03 had already created `UI-REVIEW.md` with iOS content in this worktree's parent branch lineage. Per the plan's frontmatter `key_links` row («Audit report с web-секцией; iOS-секция будет добавлена plan 29-03 (append, не overwrite)»), this plan replaced the `## Web` placeholder with the full audit and preserved the iOS section. Final Summary table contains both Web and iOS counts.)

## Issues Encountered

- The `frontend/src/styles/tokens.css` referenced in the plan's `<context>` block is the LEGACY Liquid-Glass token file with NO `--poster-*` variables. The actual V10 poster tokens live in `frontend/src/stylesV10/tokens.css`. The audit verified token values from the correct file; the plan's context block should be updated by 29-04 to point at the correct path (recorded as a minor note, not a re-flag).
- Three baseline PNGs require fixture/selector fixes BEFORE a clean re-audit is possible: `plan-month` (W-05 captured Home), `savings` (empty due to /savings catch-all), `ai-initial` (missing observation). The audit nevertheless extracted source-only findings for those screens so plan 29-04 has fix-targets ready.

## User Setup Required

None — audit-only plan; no external service configuration involved.

## Next Phase Readiness

- **29-03 (iOS audit)** is already done (its content is preserved in `UI-REVIEW.md` `## iOS` section).
- **29-04 (BLOCKER fix wave)** — ready, with pre-conditions (W-05 selector + 2 fixture extensions) clearly enumerated above. Recommend 29-04 ordering: (a) pre-conditions first (cheap, unblocks visual verification), (b) DS §1 palette pass (closes Subscriptions + AI on both platforms in one move), (c) per-screen layout/typography fixes per-screen sub-plan.
- **29-05 (DIVERGENCES.md update)** — has clear list of WARNING + INFO entries to fold into v1.1 backlog (7 WARNING + 6 INFO web items + iOS-2 WARNING + iOS-7 + iOS-8 INFO).

## Self-Check: PASSED

Files verified:
- FOUND: `.planning/phases/29-ui-conformance/UI-REVIEW.md` (741 lines, 8 `### N.` web subsections present, `## Web` heading present, `### Excluded — known DIVERGENCES.md` present with W-01..W-05/X-01..X-02 IDs, `## Summary` present with merged Web+iOS counts)

Commits verified in `git log --oneline`:
- FOUND: `de45310 docs(29-02): add web section to UI-REVIEW.md — 26 BLOCKERs across 7 screens`

Plan-defined automated verify (`test -f ... && wc -l ≥ 120 && grep -c '^### ' returns [8-19] && grep -q '## Excluded' && grep -q '## Summary'`) — exit code 0.

---
*Phase: 29-ui-conformance*
*Completed: 2026-05-11*
