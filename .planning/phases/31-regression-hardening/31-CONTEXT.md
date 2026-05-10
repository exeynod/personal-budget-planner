# Phase 31: Regression Hardening — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated.

<domain>
## Phase Boundary

Починить test infrastructure после v1.0 — Playwright fixtures, fix-up
acceptance + pixel snapshot specs, address pre-existing iOS test failures.

</domain>

<decisions>
## Implementation Decisions

### REG-01: Playwright onboarded-user fixture
- New `frontend/tests/e2e/fixtures/onboarded-user.ts` Playwright fixture.
- On `beforeEach`, calls `/api/v1/internal/onboarding/seed?tg_user_id=999000` (or via existing internal endpoint) to ensure user 999000 has onboarded_at + 8 default categories + period + 1 account.
- Sets cookie/header `X-Test-User: 999000` so dev-mode auth bypass uses this user.
- Reused by acceptance spec, pixel-snapshot spec, animations spec.
- Backend dev-mode auth bypass: check if `X-Test-User` header + `ENV=dev` → bypass initData validation, use header user_id. Add to `/api/v1/dependencies.py` или равнозначной точке auth.

### REG-02: §14 acceptance fix
- Test currently fails on `СОХРАНИТЬ` button look-up (CTA dynamic — empty/no-cat/ready states).
- Fix: regex match more flexibly: `/СОХРАНИТЬ|ВВЕДИТЕ СУММУ|ВЫБЕРИТЕ КАТЕГОРИЮ/i` OR fill-in amount first to drive ready state.
- Better: type in amount via Keypad clicks → assert «СОХРАНИТЬ» appears.

### REG-03: pixel-snapshots verification
- After REG-01 fixture works, run `--update-snapshots` to generate baselines.
- Then sanity-check: introduce intentional regression (e.g., mock delete a `font-weight: 800` → expect snapshot fail).

### REG-04: iOS pre-existing failures
- `testRoundRubles` — expects "10 000" but gets "100" — likely test bug (input value mismatch).
- `testCycleDayClampedInFebruary` — expects "2026-02-15" but gets "2026-01-31" — clamp logic bug or test expectation wrong.
- Either fix the underlying logic OR mark as `XCTSkipIf` with TODO.

</decisions>

<code_context>
- Existing tests: `frontend/tests/e2e/v10-acceptance-tz14.spec.ts`, `v10-pixel-snapshots.spec.ts`
- iOS tests: `ios/BudgetPlannerTests/MoneyFormatterTests.swift`, `ios/BudgetPlannerTests/PeriodTests.swift`
- Internal auth endpoint: `app/api/routes/internal_onboarding.py` (Phase 22 BE-15)
- Auth dependency: `app/api/dependencies.py` или эквивалент
</code_context>

<specifics>
## Specific Ideas

**Suggested plan structure:**
- 31-01: Playwright onboarded-user fixture + dev-mode auth bypass (REG-01)
- 31-02: Fix §14 acceptance + pixel-snapshots specs (REG-02 + REG-03)
- 31-03: iOS testRoundRubles + testCycleDayClampedInFebruary fix or skip (REG-04)

</specifics>

<deferred>
## Deferred Ideas

- CI/GitHub Actions pixel-diff integration (v1.1)
- iOS Point-Free SnapshotTesting setup (v1.1)
</deferred>
