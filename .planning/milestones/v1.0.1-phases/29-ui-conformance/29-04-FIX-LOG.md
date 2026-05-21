---
phase: 29
plan: 04
created_at: 2026-05-11T02:00:00Z
total_blockers_initial: 28
fixed_count: 28
downgraded_count: 0
pre_condition_count: 3
---

# 29-04 Fix Log

Per UICONF-04 BLOCKER closure manifest. **All 28 BLOCKERs from
`UI-REVIEW.md` (26 web + 2 iOS) were fixed inline in plan 29-04**
across 9 atomic commits (1 pre-conditions + 7 per-web-screen
clusters + 1 iOS cluster). No findings were downgraded — autonomous
authority from the user («не спрашивай меня ни о чём») let the
executor pick option `fix-all-blockers` as the checkpoint resolution.

## Manifest

| # | Finding (UI-REVIEW.md §) | Screen | Initial → Final | Action | Reference |
|----|--------------------------|--------|-----------------|--------|-----------|
| Pre-1 | §5 PlanMonth #1 (W-05 selector gate) | Home / PlanMonth | BLOCKER → resolved | FIX | `510c798` (pre-conditions; added `data-nav="plan"` + updated `gotoPlanMonth` E2E helper) |
| Pre-2 | §7 Savings #1 (empty render) | Savings | BLOCKER → resolved | FIX | `510c798` (mocked `GET /api/v1/savings` with `SAVINGS_SNAPSHOT_V10`) |
| Pre-3 | §8 AI #3 (observation null) | AI | BLOCKER → resolved | FIX | `510c798` (mocked `GET /api/v1/ai/observation` with `AI_OBSERVATION_V10`) |
| 1 | §2 Transactions #1 (eyebrow position swap) | Transactions | BLOCKER → resolved | FIX | `a760467` |
| 2 | §2 Transactions #2 (Mass size 88 → 70) | Transactions | BLOCKER → resolved | FIX | `a760467` |
| 3 | §2 Transactions #3 (broken token refs in `.dayLabel`/`.emptyHeadline`) | Transactions | BLOCKER → resolved | FIX | `a760467` |
| 4 | §3 AddSheet #1 (element-order swap — keypad LAST) | AddSheet | BLOCKER → resolved | FIX | `3c180ce` |
| 5 | §3 AddSheet #2 (account row styling — eyebrow above, plate inline) | AddSheet | BLOCKER → resolved | FIX | `3c180ce` |
| 6 | §3 AddSheet #3 (account display: BANK uppercased, single mid-dot) | AddSheet | BLOCKER → resolved | FIX | `3c180ce` |
| 7 | §4 CategoryDetail #1 (eyebrow state-driven: IN PLAN / OVERDRAFT · CAT) | CategoryDetail | BLOCKER → resolved | FIX | `e408277` |
| 8 | §4 CategoryDetail #2 (BigFig size 88 → 64) | CategoryDetail | BLOCKER → resolved | FIX | `e408277` |
| 9 | §4 CategoryDetail #3 (two-segment bar caption: «из X ₽ · N over/осталось») | CategoryDetail | BLOCKER → resolved | FIX | `e408277` |
| 10 | §4 CategoryDetail #4 (rollover plate dark + two-line content) | CategoryDetail | BLOCKER → resolved | FIX | `e408277` |
| 11 | §4 CategoryDetail #5 (CTA pair asymmetric pills) | CategoryDetail | BLOCKER → resolved | FIX | `e408277` |
| 12 | §4 CategoryDetail #6 (broken token refs in `.dayLabel`) | CategoryDetail | BLOCKER → resolved | FIX | `e408277` |
| 13 | §5 PlanMonth #2 (headline `PLAN<br/>{MONTH}.` 56px) | PlanMonth | BLOCKER → resolved | FIX | `46a8bcc` |
| 14 | §5 PlanMonth #3 (asymmetric aggregate plates: ghost + yellow) | PlanMonth | BLOCKER → resolved | FIX | `46a8bcc` |
| 15 | §5 PlanMonth #4 (eyebrow «ОСТАТОК ПО ИТОГУ МЕСЯЦА» added) | PlanMonth | BLOCKER → resolved | FIX | `46a8bcc` |
| 16 | §5 PlanMonth #5 (regulars dark summary plate «N ждут проведения») | PlanMonth | BLOCKER → resolved | FIX | `46a8bcc` |
| 17 | §5 PlanMonth surplus-plate WARNING (style cleanup, dark plate + badge) | PlanMonth | WARNING → resolved | FIX | `46a8bcc` (auto-fixed as part of the same commit; not a re-flag) |
| 18 | §6 Subscriptions #1 (text color ink → paper on coral) | Subscriptions | BLOCKER → resolved | FIX | `b99e171` |
| 19 | §6 Subscriptions #2 (BigFig size 86 → 56) | Subscriptions | BLOCKER → resolved | FIX | `b99e171` |
| 20 | §6 Subscriptions #3 (row separator paper-25% not ink-12%) | Subscriptions | BLOCKER → resolved | FIX | `b99e171` |
| 21 | §7 Savings #3 (composite plate two-column layout) | Savings | BLOCKER → resolved | FIX | `f4ffd7c` |
| 22 | §7 Savings #4 (roundup section single inline plate) | Savings | BLOCKER → resolved | FIX | `f4ffd7c` |
| 23 | §8 AI #1 (background black → cream) | AI | BLOCKER → resolved | FIX | `7cb55ea` |
| 24 | §8 AI #2 (text paper → ink across surface) | AI | BLOCKER → resolved | FIX | `7cb55ea` |
| 25 | §8 AI #4 (border-radius 4px → 0 on bubbles + composer input) | AI | BLOCKER → resolved | FIX | `7cb55ea` |
| 26 | §8 AI #5 (composer single ink-plate structure) | AI | BLOCKER → resolved | FIX | `7cb55ea` |
| 27 | §iOS-6 Subscriptions BLOCKER (ink → paper text on coral) | iOS Subscriptions | BLOCKER → resolved | FIX | `cfc957c` |
| 28 | §iOS-8 AI BLOCKER (black → cream background, paper → ink text) | iOS AI | BLOCKER → resolved | FIX | `cfc957c` |

## Net result

- **Total initial BLOCKERs:** 28 (26 web + 2 iOS).
- **Pre-condition BLOCKERs** (W-05 selector, Savings fixture, AI fixture):
  3 fixed in commit `510c798` BEFORE per-screen fixes — unblocked
  visual verification of PlanMonth/Savings/AI baselines.
- **Fixed inline:** 28 commits totalling 9 atomic clusters
  (`510c798`, `a760467`, `3c180ce`, `e408277`, `46a8bcc`, `b99e171`,
  `f4ffd7c`, `7cb55ea`, `cfc957c`).
- **Downgraded to WARNING:** 0. User-provided autonomous authority
  («не спрашивай меня ни о чём») permitted `fix-all-blockers`
  scope on the Task 1 checkpoint — no triage required.
- **Remaining BLOCKERs in UI-REVIEW.md:** 0 (verified via
  `grep -c "\[BLOCKER\]"`; all replaced with `[RESOLVED]`).

## Pre-existing WARNINGs / INFOs (NOT in scope)

Per Phase 29 CONTEXT.md scope guardrail, plan 29-04 fixes ONLY
BLOCKER-level deviations. The following WARNING/INFO findings remain
in `UI-REVIEW.md` for plan 29-05 to fold into `DIVERGENCES.md` v1.1
backlog:

- **Home (1 W + 1 I)** — VOL counter pluralization; BigFig rAF
  count-up non-determinism in baselines.
- **Transactions (1 W + 1 I)** — chip-bar overflow scroll vs wrap;
  empty-state copy.
- **AddSheet (1 W + 1 I)** — `.` keypad cell opacity; BigFig
  description input details.
- **CategoryDetail (1 W)** — Mass headline size 70 vs spec 68 (2px,
  within WARNING tier).
- **Subscriptions (2 W + 1 I)** — Mass size 70 vs 68; empty-state
  font literal vs token; trailing `···` button vs `span` plate.
- **AI (1 W + 2 I)** — suggestion chip border-direction; chip copy;
  error-state screenshot captured wrong state.
- **iOS-2 Transactions (1 W)** — back-chevron rendered alongside
  eyebrow (acceptable per I-02).
- **iOS-7 Savings (1 I)** — «В MAY» Latin month abbreviation
  (locale formatting).
- **iOS-8 AI (1 I)** — error-state screenshot captured wrong state.

## Verification gates

- ✅ Frontend unit tests: 683/683 passed (`npx vitest run`).
- ✅ TypeScript strict check: 0 errors (`npx tsc --noEmit`).
- ✅ iOS build: succeeded (`cd ios && make build`). Pre-existing
  warning at AiV10View.swift:122 (`where` clause pattern) is
  unrelated to plan 29-04 and tracked under DEBT-06.

## Next

Plan 29-05:

1. Re-snapshot pixel baselines (the per-screen fixes shifted visuals
   on Transactions, AddSheet, CategoryDetail, PlanMonth, Subscriptions,
   Savings, AI). The fixed PlanMonth baseline can finally render the
   actual PlanMonth screen (W-05 hardening complete).
2. Append WARNING + INFO findings (see "Pre-existing WARNINGs / INFOs"
   above) to `.planning/v1.0-handoff/DIVERGENCES.md` for the v1.1
   backlog.
