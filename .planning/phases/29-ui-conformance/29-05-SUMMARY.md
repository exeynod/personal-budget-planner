---
phase: 29-ui-conformance
plan: 05
subsystem: ui
tags: [ui-conformance, pixel-baselines, divergences, v1.0.1-handoff, phase-closure]

# Dependency graph
requires:
  - phase: 29-ui-conformance
    provides: "29-04 BLOCKER fix wave (10 commits, 28 BLOCKERs closed) + FIX-LOG.md manifest + UI-REVIEW.md WARNING/INFO inventory"
provides:
  - "7 of 8 V10 pixel baselines regenerated and re-verified deterministically green (8/8 passed in 5.0s without --update-snapshots)"
  - "15 new DIVERGENCES.md v1.0.1 accepted-deviation entries (W-06..W-17 web, I-06..I-08 iOS) covering every WARNING/INFO finding from Phase 29 audit"
  - "Phase 29 ui-conformance milestone CLOSED — all UICONF-01..05 requirements satisfied; ready for v1.0.1 release prep / regression suite (Phase 31)"
affects: [31-regression-suite, v1.1-design-polish-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DIVERGENCES.md numbering schema confirmed: namespace by PLATFORM (W- web, I- iOS, X- cross-platform), NOT by severity. WARNING and INFO findings share the same platform namespace; severity is captured inside the entry body."
    - "Two-step pixel-baseline regeneration: (1) `--update-snapshots` to capture new state; (2) immediate re-run WITHOUT the flag to verify the new baselines are deterministic. Re-run-green is the actual acceptance criterion, not the regen itself."
    - "Cross-link UI-REVIEW.md findings to DIVERGENCES.md entries with `_Logged as DIVERGENCES.md §X-NN_` footers — preserves audit traceability when WARNING/INFO findings are pushed to v1.1 backlog rather than fixed inline"
    - "v1.1 backlog clustering by work-type tag (ui-polish / tech-debt / e2e-determinism / i18n / audit-artefact / no-op) instead of per-screen — enables batched v1.1 polish-phase planning"

key-files:
  created:
    - .planning/phases/29-ui-conformance/29-05-SUMMARY.md
  modified:
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/add-sheet-chromium-mobile-darwin.png (22 161B → 26 629B; keypad-LAST + account row redesign)
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/ai-initial-chromium-mobile-darwin.png (45 138B → 50 472B; cream/ink palette + zero-radius bubbles + observation hero)
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/category-detail-chromium-mobile-darwin.png (31 813B → 32 879B; state eyebrow + BigFig 64 + dark rollover + asymmetric CTAs)
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/plan-month-chromium-mobile-darwin.png (28 971B → 39 069B; FIRST actual PlanMonth capture via W-05 hardening; headline 56/two-line + asymmetric aggregates + regulars dark plate + surplus OK badge)
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/savings-chromium-mobile-darwin.png (2 374B → 39 023B; was crash-blank PNG before fixture mock; now composite plate + single roundup plate)
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/subscriptions-chromium-mobile-darwin.png (30 051B → 26 900B; paper-on-coral text sweep + BigFig 56 + paper-25% separator)
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/transactions-chromium-mobile-darwin.png (33 152B → 31 061B; eyebrow swap + Mass 70 + token canonicalisation)
    - .planning/v1.0-handoff/DIVERGENCES.md (header date + Audit basis extended; W-05 status note; +263 lines / -4 lines net; 15 new W-/I- entries; Future Work section extended)
    - .planning/phases/29-ui-conformance/UI-REVIEW.md (15 `_Logged as DIVERGENCES.md §X-NN_` cross-link footers; §5 PlanMonth surplus-plate WARNING flipped to [RESOLVED] with 29-04 commit reference)

key-decisions:
  - "Home baseline NOT re-staged: 29-04 made no changes to Home screen, byte hash identical to pre-29-04 baseline. Skipping it from the commit avoids spurious diff noise. 7 of 8 PNGs regenerated reflects the actual visual delta."
  - "PlanMonth §5 surplus-plate WARNING flipped to [RESOLVED] in UI-REVIEW.md rather than migrated to DIVERGENCES.md — was auto-fixed in plan 29-04 commit `46a8bcc` as part of the PlanMonth cluster (documented as Rule-2 deviation in 29-04-SUMMARY.md). Logging a resolved finding to the backlog would be misleading."
  - "DIVERGENCES.md numbering: web INFOs (W-13..W-17) share the W- prefix with web WARNINGs (W-06..W-12) — namespace is by platform, not severity. Confirmed against existing W-01..W-05 which mixes ADR-001 / W-04 baseline-PNG-deferral (operational) with W-03 animation-zeroing (test infra) — no severity convention exists. Severity is captured in entry body via «(WARNING)» / «(INFO)» suffix in the title."
  - "Web INFO «AddSheet description input CSS-exact» (originally PASS pending) logged as W-15 rather than dropped. Even though baseline renders correctly post-29-04 fix `3c180ce`, the formal CSS-level audit was deferred — capturing the deferral keeps the v1.1 polish scope honest."
  - "v1.1 backlog grouped by work-type cluster in Future Work section instead of per-screen — enables batched v1.1 planning (a single `ui-polish` ticket can pick up 8 W-NN entries across 6 screens cheaper than 6 per-screen tickets)."

patterns-established:
  - "Closure-phase plans follow a regen-then-verify two-step protocol: never trust `--update-snapshots` output alone; always re-run without the flag to confirm new baselines are deterministic. Time cost is +7s; correctness gain is ~100% confidence vs the 70%-confidence of update-only."
  - "Audit-finding migration to DIVERGENCES.md is a one-way move — once an entry has a W-/I-/X- ID, future audits should reference the ID, not re-flag the finding. UI-REVIEW.md becomes a historical capture; DIVERGENCES.md is the living tracker."

requirements-completed: [UICONF-04, UICONF-05]

# Metrics
duration: ~6min
completed: 2026-05-11
---

# Phase 29 Plan 05: Pixel-Baseline Refresh & DIVERGENCES.md Migration Summary

**Phase 29 ui-conformance milestone CLOSED.** Plan 29-05 regenerated 7
of 8 V10 pixel baselines after Phase 29-04's 28-BLOCKER fix wave shifted
the visual surface, and migrated 15 WARNING/INFO findings from
`UI-REVIEW.md` to `DIVERGENCES.md` as formal v1.0.1 accepted deviations.
All UICONF-01..05 requirements satisfied; v1.0.1 ready for regression
suite (Phase 31) or v1.1 design-polish planning (Phase 30+).

## Performance

- **Duration:** ~6 minutes
- **Started:** 2026-05-11T23:02:07Z (≈02:02 MSK 12 мая)
- **Completed:** 2026-05-11T23:08:00Z (≈02:08 MSK 12 мая)
- **Tasks executed:** 2 (Task 1 pixel regen + Task 2 DIVERGENCES.md migration)
- **Commits:** 2 atomic — `test(29-05): regenerate 7 V10 pixel baselines…` (`25de942`), `docs(29-05): append WARNING/INFO findings to DIVERGENCES.md v1.1 backlog` (`9af576c`)
- **Files modified:** 9 (7 PNG baselines + DIVERGENCES.md + UI-REVIEW.md)

## Accomplishments

### Task 1 — Pixel baselines regenerated (commit `25de942`)

- Ran `npx playwright test v10-pixel-snapshots --project=chromium-mobile --update-snapshots` → 8 PNGs regenerated.
- Re-ran WITHOUT `--update-snapshots` → 8 passed (5.0s) deterministically green.
- **7 of 8 baselines** changed bytes (Home unchanged — 29-04 didn't touch Home):
  - `transactions`: 33 152B → 31 061B (eyebrow swap + Mass 70 + token canonicalisation).
  - `add-sheet`: 22 161B → 26 629B (keypad-LAST element order + account row redesign).
  - `category-detail`: 31 813B → 32 879B (state eyebrow + BigFig 64 + dark rollover + asymmetric CTAs).
  - `plan-month`: 28 971B → 39 069B — **FIRST baseline that actually captures PlanMonth** (previously captured Home via W-05 selector bug; 29-04 commit `510c798` introduced `data-nav="plan"` selector). Headline 56/two-line, asymmetric aggregate plates, regulars dark summary plate, surplus dark plate with OK/OVER badge.
  - `subscriptions`: 30 051B → 26 900B (paper-on-coral text sweep + BigFig 56 + paper-25% separator).
  - `savings`: 2 374B → 39 023B — **was crash-blank PNG** (`[]` destructure TypeError on `snap.config`) before 29-04 fixture mock (commit `510c798`); now renders composite two-column plate + single inline roundup plate per prototype.
  - `ai-initial`: 45 138B → 50 472B (cream/ink palette + zero-radius bubbles + ink composer plate + observation hero rendered).
- `home` baseline byte-identical to pre-29-04 — not re-staged.

### Task 2 — DIVERGENCES.md migration (commit `9af576c`)

- **15 new entries** appended to `DIVERGENCES.md`:
  - **Web (12, W-06..W-17):** 7 WARNINGs (Home VOL plural, Transactions chip-bar, AddSheet keypad opacity, CategoryDetail Mass 70, Subscriptions Mass 70, Subscriptions empty-state font literal, AI chip border-direction) + 5 INFOs (Home BigFig rAF, Transactions empty-state copy, AddSheet description CSS-exact, Subscriptions `···` plate, AI chip copy).
  - **iOS (3, I-06..I-08):** 1 WARNING (iOS-2 back-chevron — covered by I-02) + 2 INFOs (iOS-7 «В MAY» locale, iOS-8 audit-artefact error-state).
  - **Cross-platform (0, X-03+):** none — the only cross-platform WARNING/INFO candidates (Subscriptions ink-on-coral, AI bg=black) were BLOCKER-resolved in 29-04, not pending.
- **Header update:** `Last updated:` 2026-05-10 (Phase 28-03) → 2026-05-11 (Phase 29-05); `Audit basis:` extended with «Phase 29 conformance audit (web Playwright + iOS XcodeBuildMCP) 2026-05-11».
- **W-05 status note added:** `data-nav="plan"` half of the v1.1 follow-up closed by 29-04 commit `510c798`; `nav-subscriptions` half remains in v1.1 scope.
- **Future Work section extended** with Phase 29 v1.1 backlog clusters by work-type tag (`ui-polish`, `tech-debt`, `e2e-determinism`, `i18n`, `audit-artefact`, `no-op`).
- **UI-REVIEW.md cross-linked:** 15 `_Logged as DIVERGENCES.md §X-NN_` footers added. §5 PlanMonth surplus-plate WARNING flipped to [RESOLVED] in-line (was auto-fixed in 29-04 commit `46a8bcc`).

## New DIVERGENCES.md entries (by ID)

| ID | Screen | Severity | One-liner | v1.1 tag |
|----|--------|----------|-----------|----------|
| W-06 | Home | WARNING | VOL counter pluralization grammatical vs prototype literal «ДНЯ» | ui-polish |
| W-07 | Transactions | WARNING | Chip-bar `overflow-x:auto` vs `flexWrap:wrap` | ui-polish |
| W-08 | AddSheet | WARNING | Keypad `.` cell opacity 1 vs 0.45 | ui-polish |
| W-09 | CategoryDetail | WARNING | Mass headline 70 vs 68 (2px) | ui-polish |
| W-10 | Subscriptions | WARNING | Mass headline 70 vs 68 (2px) | ui-polish |
| W-11 | Subscriptions | WARNING | Empty-state font literal vs token chain | tech-debt |
| W-12 | AI | WARNING | Suggestion chip `border-bottom` vs `borderTop` | ui-polish |
| W-13 | Home | INFO | BigFig count-up captured mid-rAF in baseline | e2e-determinism |
| W-14 | Transactions | INFO | Empty-state copy «Реестр пуст —» (impl supersedes prototype) | n/a (no-op) |
| W-15 | AddSheet | INFO | Description input CSS-exact comparison deferred | ui-polish |
| W-16 | Subscriptions | INFO | Row trailing `···` `<button>` vs `<span>` plate | ui-polish |
| W-17 | AI | INFO | Suggestion chip copy diverges (product decision) | n/a (no-op) |
| I-06 | iOS Transactions | WARNING | Back-chevron alongside eyebrow (per I-02 contract) | n/a (no-op) |
| I-07 | iOS Savings | INFO | «В MAY» Latin month abbreviation | i18n |
| I-08 | iOS AI | INFO | Error-state captured in audit screenshot | audit-artefact |

## UICONF-01..05 Traceability Table

| Req | Description | Satisfied in plan | Evidence |
|-----|-------------|-------------------|----------|
| UICONF-01 | E2E fixture infrastructure (onboarded-user) + baseline PNGs committed | 29-01 | `frontend/tests/e2e/fixtures/onboarded-user.ts`, 8 PNGs in `__screenshots__/v10-pixel-snapshots.spec.ts-snapshots/` (refreshed in 29-05) |
| UICONF-02 | Web pixel audit against prototype (26 BLOCKERs surfaced) | 29-02 | `UI-REVIEW.md` § Web sections 1-8 |
| UICONF-03 | iOS XcodeBuildMCP audit against DESIGN-SYSTEM/SCREENS (2 BLOCKERs surfaced) | 29-03 | `UI-REVIEW.md` § iOS sections iOS-1..iOS-8 |
| UICONF-04 | BLOCKER fix wave + re-snapshot verification (28 BLOCKERs closed; 7 baselines regenerated; spec re-run green) | 29-04 + 29-05 | `29-04-FIX-LOG.md` (28 BLOCKERs × commit hash); `25de942` (7 PNGs); `npx playwright test v10-pixel-snapshots` 8 passed (5.0s) |
| UICONF-05 | WARNING/INFO migration to DIVERGENCES.md v1.1 backlog | 29-05 | `9af576c` (15 new entries, header updated); `grep -c "^### [WIX]-[0-9]"` = 27 |

## Files Created/Modified

### Created
- `.planning/phases/29-ui-conformance/29-05-SUMMARY.md` (this file)

### Modified
- 7 PNG baselines under `frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/` (see frontmatter `key-files.modified` for per-file byte deltas).
- `.planning/v1.0-handoff/DIVERGENCES.md` (+263 / -4 lines; 15 new entries + header + Future Work extension).
- `.planning/phases/29-ui-conformance/UI-REVIEW.md` (15 cross-link footers + 1 [WARNING]→[RESOLVED] flip on §5 PlanMonth surplus-plate).

## Deviations from Plan

None — plan executed exactly as written across both tasks. No deviation
rules (Rule 1-4) triggered. No authentication gates encountered (all
operations local: Playwright + filesystem edits).

The plan-prescribed Task 1 case-A branch (snapshots regenerated because
29-04 modified visual surface) was the realised path; Task 1 case-B
(no-op snapshots) was unreached because 29-04 closed 28 BLOCKERs
affecting 7 of 8 V10 web screens.

### Authentication gates

None — Playwright runs against local Vite dev server (already up on
`localhost:5173`); no external services, no auth required.

## Verification

- ✅ **Playwright pixel suite re-run (without `--update-snapshots`):** 8/8 passed in 5.0s (deterministic green).
- ✅ **Plan verify gate 1** (`cd frontend && npx playwright test v10-pixel-snapshots --project=chromium-mobile` → 8 passed): PASSED.
- ✅ **Plan verify gate 2** (`grep -c "^### [WIX]-[0-9]" DIVERGENCES.md` ≥ 12): 27 entries (12 baseline + 15 new).
- ✅ **Plan verify gate 3** (`grep "Phase 29 conformance audit" DIVERGENCES.md` present): match found in `**Audit basis:**` line.
- ✅ **Plan verify gate 4** (`grep -c "Logged as DIVERGENCES.md" UI-REVIEW.md` equals WARNING+INFO count): 15 cross-links (= 12 web migrated + 3 iOS migrated; the lone non-migrated WARNING — §5 PlanMonth surplus-plate — was flipped to [RESOLVED] inline with a 29-04 commit reference, not a DIVERGENCES.md link).
- ⏭️ **Snapshot byte-hash determinism beyond v1.0.1:** the `W-13` finding (Home BigFig mid-rAF capture) means Home baseline may drift on subsequent regens; tracked for v1.1 (`POL-V11-13`). 2% tolerance absorbs it for v1.0.1.

## Issues Encountered

None — plan ran clean from start to finish in ~6 minutes wall-clock.

The Vite dev server was already running at `localhost:5173` when Task 1
started (existing developer process, pid 53267); Playwright's
`reuseExistingServer: !process.env.CI` config picked it up without
re-spawn, saving ~5s on first run.

## User Setup Required

None — Phase 29 milestone closure is complete. The DIVERGENCES.md v1.1
backlog entries are tagged for future planning but require no action
on the user's part for v1.0.1.

## Next Phase Readiness

- **Phase 29 status:** **CLOSED**. All UICONF-01..05 requirements
  satisfied. Plans 29-01..29-05 complete with per-plan SUMMARY.md
  artefacts.
- **v1.0.1 milestone:** UI conformance audit + BLOCKER fix complete.
  Remaining v1.0.1 work (Phases 30/31 per ROADMAP) is regression-suite
  authoring + tech-debt sweep — orthogonal to UI conformance.
- **Recommendation:** Run `/gsd-verify-phase 29` to validate Phase
  closure (all 5 plans have SUMMARY.md, UICONF-01..05 marked complete
  in REQUIREMENTS.md, ROADMAP.md progress row reflects 5/5 plans).
  Then proceed with `/gsd-plan-phase 30` for the next v1.0.1 phase.
- **v1.1 polish phase** (deferred): 15 DIVERGENCES.md backlog items
  clustered by work-type tag in Future Work section. Pick up as a single
  v1.1 design-polish phase once the v1.0.1 milestone closes.

## Self-Check

Files verified:
- ✅ FOUND: `.planning/phases/29-ui-conformance/29-05-SUMMARY.md` (this file).
- ✅ FOUND: `.planning/v1.0-handoff/DIVERGENCES.md` (modified; 27 entries).
- ✅ FOUND: `.planning/phases/29-ui-conformance/UI-REVIEW.md` (modified; 15 cross-link footers + 1 [RESOLVED] flip).
- ✅ FOUND: 7 of 8 regenerated PNGs under `frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/` (home baseline byte-identical, intentionally not re-committed).

Commits verified in `git log --oneline`:
- ✅ FOUND: `25de942 test(29-05): regenerate 7 V10 pixel baselines after BLOCKER fixes`
- ✅ FOUND: `9af576c docs(29-05): append WARNING/INFO findings to DIVERGENCES.md v1.1 backlog`

Verification gates re-run after summary write:
- ✅ Playwright suite 8/8 passed in 5.0s (deterministic green, no `--update-snapshots`).
- ✅ `grep -c "^### [WIX]-[0-9]" DIVERGENCES.md` = 27 (≥ 12).
- ✅ `grep "Phase 29 conformance audit" DIVERGENCES.md` = 1 match.
- ✅ `grep -c "Logged as DIVERGENCES.md" UI-REVIEW.md` = 15.

## Self-Check: PASSED

---
*Phase: 29-ui-conformance*
*Completed: 2026-05-11*
