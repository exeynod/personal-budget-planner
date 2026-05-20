---
phase: 68-tech-debt-cleanup
verified: 2026-05-20T20:05:00Z
status: passed
score: 4/4 success criteria verified
resolved: 2026-05-21
resolution: >
  Criterion-1 gap (full backend suite not green) was CLOSED by plan 68-05
  (extends the 68-02 systemic seed/contract migration suite-wide; test-only).
  Triage confirmed all 126 failures were TEST-DEBT, zero product bugs.
  Final full-suite run (docker test stack, 2026-05-21): 774 passed, 34 skipped,
  1 xpassed, 0 failed, 0 errors. 68-05 code-review verdict: TRUSTWORTHY (no
  weakened/no-op tests). WR-01 (RLS regression guard) fixed in c7a1b91 — guard
  now asserts all 14 FORCE-RLS tenant tables. All 4 criteria now PASS.
overrides_applied: 0
gaps_resolved:
  - truth: "Backend pytest fully green — no pre-existing failures"
    status: partial
    reason: >
      The 4 named test groups in the criterion ALL pass green (12 tests:
      test_ai_cap_integration 4 + test_spend_cap_concurrent 2 +
      test_seed_creates_14_categories / test_categories 10 +
      test_e2e_multi_user_lifecycle 6 — verified in isolation and together).
      The pro-over-cap→429 / non-pro→402 behavior is genuinely seeded and
      asserted. HOWEVER the criterion's own wording is "Backend pytest FULLY
      GREEN — no pre-existing failures", and the full suite is NOT green:
      `pytest tests/` → 62 failed, 651 passed, 32 skipped, 64 errors.
      These failures are pre-existing (confirmed identical at parent commit
      3ad115d, before Phase 68) and were left UNFIXED. Phase 68 touched none
      of the failing test files and only changed app/services/admin_users.py.
      The dominant failure classes are exactly the tech-debt the systemic
      seed-helper was meant to retire: (a) raw `Category(...)` constructors
      with code=None/ord=None → NotNullViolationError (test_planned,
      test_templates, test_actual_crud, test_snapshot, test_apply_template,
      test_subscriptions, test_worker_charge, …); (b) onboarding fixtures
      missing pdn_consent_at → PdnConsentRequiredError (test_onboarding_v10
      24 fails, test_onboarding, test_onboarding_v10_api). The systemic
      helper EXISTS and works, but the broad existing suite was not migrated
      onto it, so "fully green baseline before phases 69/70" is not achieved.
    artifacts:
      - path: "tests/test_planned.py / tests/test_templates.py / tests/test_actual_crud.py / tests/test_snapshot.py / tests/test_apply_template.py / tests/test_subscriptions.py / tests/test_worker_charge.py / tests/api/* / tests/services/*"
        issue: "Raw Category(...) constructors without code/ord → NotNullViolationError (~26 raw constructors remain across the suite)"
      - path: "tests/services/test_onboarding_v10.py (24 failed) / tests/test_onboarding.py / tests/api/test_onboarding_v10_api.py"
        issue: "Onboarding fixtures do not set app_user.pdn_consent_at → PdnConsentRequiredError (Phase 33 gate)"
    missing:
      - "Migrate remaining raw Category(...) test seeds onto seed_category() so code/ord are always populated"
      - "Set pdn_consent_at in onboarding-v10 test fixtures (or seed_user) so the Phase 33 consent gate is satisfied"
      - "Run full `pytest tests/` to 0 failed / 0 errors, OR formally re-scope criterion 1 to the 4 named groups via an override if full-suite-green is out of scope for this phase"
deferred: []
---

# Phase 68: Tech-Debt Cleanup Verification Report

**Phase Goal:** Устранить pre-existing tech-debt (Phase 67 deferred-items + отложенные косметические находки ревью) чтобы получить полностью зелёный baseline всех трёх стеков перед архитектурными фазами 69/70. Covers A1 (backend 402-vs-429), A2 (seed-drift + onboarding 422), A3 (web tsc test-gate), A4 (stale doc-comment 0.5→0.35).
**Verified:** 2026-05-20T20:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria

| # | Criterion | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | Backend pytest fully green; named tests pass; pro-over-cap→429, non-pro→402 | ✗ FAILED (partial) | 4 named groups GREEN (12 tests); but full suite = **62 failed, 64 errors** (pre-existing, unfixed). See below. |
| 2 | Seed-helper systemically sets NOT-NULL code+ord; no future test needs inline hack | ✓ VERIFIED | `seed_category()` auto-derives `code` (slug+monotonic) + `ord` (sort_order clamped 00..99, matches CHECK `^[0-9]{2}$`). Named files route through it with zero inline hacks. |
| 3 | Web: `npm run build` + `typecheck:test` + `npx vitest run` all green | ✓ VERIFIED | build exit 0 (✓ built 276ms); `tsc -p tsconfig.test.json --noEmit` exit 0; vitest 738 passed (55 files) exit 0. |
| 4 | A4 cosmetic comment closed (0.5→0.35) | ✓ VERIFIED | AISuggestCategoryAPI.swift lines 5, 23-24 show 0.35; zero matches for "0.5 threshold"; backend `SUGGEST_THRESHOLD = 0.35` (embedding_service.py:39). |

**Score:** 3/4 success criteria verified

### Criterion 1 — Detailed Evidence

**Named test groups (the 4 the criterion enumerates) — ALL GREEN:**

```
$ docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml \
    exec -T api /app/.venv/bin/python -m pytest \
    tests/test_ai_cap_integration.py tests/test_spend_cap_concurrent.py -q
→ 6 passed in 2.36s        (test_ai_cap_integration 4 + test_spend_cap_concurrent 2)

$ ... -m pytest tests/test_categories.py tests/test_e2e_multi_user_lifecycle.py -q
→ 16 passed in 34.31s      (test_categories 10 incl. test_seed_creates_14_categories
                            + test_e2e_multi_user_lifecycle 6)
```

- pro-over-cap→429 genuinely asserted: `seed_user(... pro_active_until=now+30d ...)` then `assert resp.status_code == 429` (test_ai_cap_integration.py:93,121). Pro seeding is the actual fix — not a comment.
- non-pro→402 ordering documented + relied upon (require_pro precedes enforce_spending_cap).

**Full suite — NOT green (the criterion says "fully green"):**

```
$ ... -m pytest tests/ -q
→ 62 failed, 651 passed, 32 skipped, 1 xpassed, 64 errors in 93.94s
```

Failure breakdown (top): test_onboarding_v10 24F, test_planned 14E, test_actual_crud 10E,
test_templates 9E+3F, test_worker_charge 6F, test_onboarding 6F, test_multitenancy_isolation 6E,
test_internal_bot 6E, test_apply_template 5E, test_security_probes 4F, test_roundup 4F, …

Root causes (sampled):
- `null value in column "code" of relation "category" violates not-null constraint` — raw `Category(...)` test constructors (test_templates.py:105, test_planned.py, etc.) that bypass `seed_category()`.
- `PdnConsentRequiredError: ПДн consent ... is required before onboarding-complete (Phase 33 gate)` — onboarding-v10 fixtures don't set `pdn_consent_at`.

**Regression check:** Failures persist when each file is run in isolation (not a cross-test contamination artifact). Confirmed identical at parent commit 3ad115d (before Phase 68: `27 failed, 23 errors` on the same sampled files), so these are **pre-existing** — Phase 68 neither caused nor fixed them. Phase 68 commits touched no failing test file (only `app/services/admin_users.py`).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `tests/helpers/seed.py` | seed_category sets code+ord, seed_user Pro params | ✓ VERIFIED | `_default_code` (slug+monotonic), `_default_ord` (clamp→2-digit); `seed_user(pro_active_until, trial_ends_at)` |
| `app/ai/embedding_service.py` | SUGGEST_THRESHOLD = 0.35 | ✓ VERIFIED | line 39 |
| `ios/.../AISuggestCategoryAPI.swift` | comment 0.35, no "0.5 threshold" | ✓ VERIFIED | lines 5, 23-24 = 0.35; 0 matches for stale text |
| `frontend/tsconfig.test.json` | separate test type-check project | ✓ VERIFIED | exists; `typecheck:test` script wired |
| `frontend/package.json` | @types/node + typecheck:test | ✓ VERIFIED | @types/node ^22.19.19; script present |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| AI cap tests (named) | pytest test_ai_cap_integration test_spend_cap_concurrent | 6 passed | ✓ PASS |
| Categories + e2e (named) | pytest test_categories test_e2e_multi_user_lifecycle | 16 passed | ✓ PASS |
| Full backend suite | pytest tests/ | 62 failed / 64 errors | ✗ FAIL |
| Web prod build | npm run build | exit 0, built | ✓ PASS |
| Web test typecheck | npm run typecheck:test | exit 0 | ✓ PASS |
| Web unit tests | npx vitest run | 738 passed, exit 0 | ✓ PASS |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| ~26 test files | raw `Category(...)` w/o code/ord | ⚠️ Warning | NotNullViolationError; blocks full-suite-green |
| onboarding-v10 test fixtures | missing `pdn_consent_at` | ⚠️ Warning | PdnConsentRequiredError; blocks full-suite-green |

### Human Verification Required

None — all gates were runnable and were executed.

### Gaps Summary

Criteria 2, 3, 4 are fully verified by running the actual gates: the systemic seed helper exists and works (code+ord auto-defaults, named files have zero inline hacks), all three web gates pass (build + typecheck:test + vitest 738), and the A4 comment is corrected to 0.35 with no stale text.

The single gap is Criterion 1. The phase reached its narrow objective — the 4 named previously-failing test groups are now green and the 402-vs-429 behavior is genuinely fixed via Pro seeding. But the criterion is literally worded "Backend pytest **fully green** — no pre-existing failures", positioned as "полностью зелёный baseline ... перед фазами 69/70". The full suite is NOT green (62 failed, 64 errors), and those failures are the very tech-debt class the systemic seed helper was built to retire (raw `Category(...)` seeds + missing pdn_consent fixtures). The helper exists but the broad suite was never migrated onto it. Either the suite must be brought to 0/0 (migrate remaining seeds + set pdn_consent_at) or Criterion 1 must be formally re-scoped to the 4 named groups via a VERIFICATION override.

---

_Verified: 2026-05-20T20:05:00Z_
_Verifier: Claude (gsd-verifier)_
