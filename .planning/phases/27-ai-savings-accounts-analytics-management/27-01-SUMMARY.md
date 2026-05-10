---
phase: 27-ai-savings-accounts-analytics-management
plan: 01
subsystem: backend
tags: [backend, fastapi, ai, rule-engine, cache]
requirements: [AI-V10-03]
dependency-graph:
  requires:
    - "Phase 22 v1.0 schema: Category.plan_cents/code/paused, Subscription.day_of_month, ActualKind.{roundup,deposit}, AppUser.income_cents"
    - "Phase 11 dependency stack: get_current_user, require_onboarded, get_db_with_tenant_scope"
  provides:
    - "GET /api/v1/ai/observation → ObservationResponse {text, generated_at}"
    - "app.services.ai_observation.build_observation(db, user_id, now) — async pure-Python rule-engine"
    - "OBSERVATION_CACHE: dict[int, ObservationResult] — per-process, 1h TTL"
  affects:
    - "Wave 2: 27-02 web AI screen (consumer)"
    - "Wave 2/3: 27-07 iOS AI screen (consumer)"
tech-stack:
  added: []
  patterns:
    - "Pure-Python rule priority chain (no LLM, no template DSL — straight if-return)"
    - "In-memory per-process cache with TTL via dataclass(frozen=True)"
    - "Separate sub-router on /ai prefix for non-LLM endpoints (observation_router skips enforce_spending_cap)"
key-files:
  created:
    - "app/services/ai_observation.py"
    - "tests/api/test_ai_observation.py"
  modified:
    - "app/api/schemas/ai.py (added ObservationResponse)"
    - "app/api/routes/ai.py (added observation_router + GET /observation handler)"
    - "app/api/router.py (registered observation_router on public_router)"
decisions:
  - "Separate observation_router (no enforce_spending_cap dep) so a user with exhausted AI USD-cap still sees observation — it's not an LLM call."
  - "Cache keyed by AppUser.id (PK), TTL 1h via dataclass(frozen=True) instance comparison; cleared on process restart (acceptable for single-tenant)."
  - "Money rendered as integer-rubles (no kopecks) in the conversational text; thousand separator = regular space (not non-breaking — UI text is short)."
  - "Subscription rule requires day_of_month NOT NULL — legacy next_charge_date-only rows are scheduler's job, not the daily-summary observation."
  - "+N% rule rounds to nearest integer with floor of +1% (avoids '+0%' on tiny overshoots)."
metrics:
  duration: "~2h 15m (planning + read + RED + GREEN + verify)"
  tasks: 2
  files-touched: 5
  tests-added: 9
  completed: 2026-05-10
---

# Phase 27 Plan 01: Backend AI Observation Rule-Engine Summary

GET /api/v1/ai/observation rule-engine endpoint with 1h per-user in-memory cache — pure-Python summary text for the AI screen initial-state, no LLM call.

## What Was Built

A single new endpoint `GET /api/v1/ai/observation` that returns one short Russian sentence describing the user's current financial state. The text is computed server-side by a 4-rule priority chain over Phase 22 v1.0 tables (category/actual_transaction/subscription/app_user.income_cents) and cached per-user for 1 hour.

### Rule Priority

1. **Over-limit category** (fact > plan): `"{Name} уже +N% к лимиту"` — picks the category with the largest fact/plan ratio (single SQL query, GROUP BY + HAVING + ORDER BY ratio DESC LIMIT 1).
2. **Tomorrow subscription charge** (cycle=monthly, day_of_month == (now+1).day): `"Завтра списание подписок на X ₽"`.
3. **Last-7-days savings** (ActualKind in {roundup, deposit}, tx_date in last 7d): `"За неделю экономия Y ₽"`.
4. **Month surplus** (income - Σ|expense fact| > 0): `"{Month} в плюсе на Z ₽"` with month name in nominative.
5. **Fallback**: `"Веди учёт регулярно — {today}"` where today = `"9 мая"` (genitive).

### Architecture

- `app/services/ai_observation.py` — pure-Python service. Public surface: `build_observation(db, *, user_id, now=None)` and module-level `OBSERVATION_CACHE: dict[int, ObservationResult]`.
- `app/api/routes/ai.py` — added a **separate** `observation_router` (own `/ai` prefix sub-router) so the new endpoint inherits `get_current_user + require_onboarded` but **NOT** `enforce_spending_cap` — observation is not an LLM call and should not be blocked by the LLM USD-cap.
- `app/api/router.py` — registers `observation_router` on `public_router` after the existing `ai_router`.
- `app/api/schemas/ai.py` — added `ObservationResponse(text: str, generated_at: datetime)`.

### Cache Semantics

- **Key:** `AppUser.id` (PK). No cross-user mixing possible (T-27-01-01 mitigation).
- **TTL:** 1 hour. Calls within TTL return the same `ObservationResult` instance (text + generated_at unchanged). Calls after TTL re-execute the rule chain and overwrite the cache entry.
- **Scope:** per-process. Cleared on api/worker container restart. Acceptable for single-tenant pet app per plan threat disposition T-27-01-04.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | TDD RED — pytest cases for ObservationService rule-engine + endpoint | `f02d733` | `tests/api/test_ai_observation.py` (9 cases) |
| 2 | TDD GREEN — implementation (service + schema + route) | `779be38` | `app/services/ai_observation.py`, `app/api/schemas/ai.py`, `app/api/routes/ai.py`, `app/api/router.py` |

## Verification

Inside docker test stack (`docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml exec -T api pytest …`):

- `pytest tests/api/test_ai_observation.py -v` → **8 passed, 1 skipped** in 1.17s.
  - The single skip is `test_observation_requires_auth` — documented contract: under `DEV_MODE=true` (test override) the conftest auto-skip rule covers tests asserting 403 without initData. Auth path is covered by dedicated `tests/test_auth.py` against direct calls.
- `pytest tests/api/test_ai_chat.py -v` → **4 passed, 3 skipped** — confirmed the new sub-router does not regress the existing chat router (skips are the same DEV_MODE auth-test pattern).

### Grep Gates (per plan §verification)

| Gate | Expected | Actual |
| ---- | -------- | ------ |
| `@router.get("/observation"` in `app/api/routes/ai.py` | 1 | 1 (`@observation_router.get("/observation"`) |
| `OBSERVATION_CACHE` in `app/services/ai_observation.py` | ≥3 | 4 |
| `build_observation` in `app/services/ai_observation.py` | ≥2 | 3 |
| `class ObservationResponse` in `app/api/schemas/ai.py` | 1 | 1 |

## Decisions Made

1. **Separate `observation_router` instead of adding to `router`.** The existing `ai_router` carries `Depends(enforce_spending_cap)` at router level so every chat/history/usage handler 429s when the user has exhausted their AI USD cap. Observation is pure-Python and doesn't use the LLM — blocking it on cap exhaustion would be a degraded UX with no upside. Defining a sibling sub-router with the same auth gates but no cap dep keeps both correct.
2. **Cache TTL via simple dataclass instance comparison** (no LRU, no async-lock). Single-tenant pet, ≤2 active processes (api + worker, but worker doesn't read this), TTL=1h — race window is trivially bounded and benign (worst case: same observation computed twice and the second write wins). Avoids dependency on `cachetools.TTLCache` and its quirks.
3. **`+N%` rounding floor at +1%.** A fact 10_001 ₽ vs plan 10_000 ₽ would round to 0%, which would render `"Кафе уже +0% к лимиту"` — confusing. Floor at 1% so the message is always meaningful when the rule fires.
4. **Subscription rule requires `day_of_month NOT NULL`.** Phase 22 added `day_of_month` to subscriptions; legacy next_charge_date-only rows are handled by the scheduler's `notify_subscriptions` job (09:00 MSK), not by the daily observation. Mixing both sources would surface duplicates.

## Deviations from Plan

### Plan-driven adjustments (no Rule N flag — explicit during implementation)

1. **Subscription rule day_of_month edge case in test** — when "today" happens to be the 27th or 28th of the month, `tomorrow.day` could be 29..31, which fails the `day_of_month BETWEEN 1 AND 28` DB CHECK constraint. The `test_observation_tomorrow_subs_charge` test detects this and shifts the simulated `now` down by a few days to avoid the boundary. Plan did not call this out — it surfaced during writing the test and was a clear correctness issue (test would fail nondeterministically by calendar date), so I added the guard inline.

2. **Schema name handling for non-existent income** — `test_observation_fallback` explicitly nulls `AppUser.income_cents` so the month-surplus rule cannot fire (otherwise the surplus rule wins by default since `db_setup` seeds `income_cents=100_000_00`). The service handles `income_cents IS NULL` correctly (skips rule 4). Plan §test 5 didn't spell this out — added defensively in test setup.

### No Rule 1/2/3/4 deviations triggered

The implementation followed the plan's rule-priority order, return-text templates, file layout, and cache-TTL semantics verbatim. No bugs found, no missing critical functionality, no blocking infrastructure issues that required diverging from the plan.

## Test Coverage

9 test cases under `tests/api/test_ai_observation.py`:

| Test | Purpose |
| ---- | ------- |
| `test_observation_requires_auth` | 403 without initData header (skipped in DEV_MODE per conftest contract) |
| `test_observation_over_limit_category` | Rule 1 fires when fact > plan |
| `test_observation_tomorrow_subs_charge` | Rule 2 fires when monthly sub due tomorrow |
| `test_observation_week_savings` | Rule 3 fires when roundup+deposit > 0 in last 7 days |
| `test_observation_month_surplus` | Rule 4 fires when income > Σfact in current MSK month |
| `test_observation_fallback` | Fallback "Веди учёт регулярно — {today}" when no rule matches |
| `test_observation_cache_returns_same_text` | Two consecutive calls within TTL return identical text + generated_at |
| `test_observation_cache_expires_after_1h` | After 1h+ elapsed, the cache recomputes (generated_at moves forward) |
| `test_observation_endpoint_returns_200` | Smoke: GET /api/v1/ai/observation → 200 + JSON shape |

## Threat Surface Scan

No new attack surface introduced beyond the plan's `<threat_model>`. The endpoint:
- Uses the same auth gates (`get_current_user + require_onboarded`) as the rest of `/ai/*`.
- Does not accept user input (read-only GET, no query params).
- All SQL queries filter by `user_id` (cross-tenant isolation per T-27-01-01); existing RLS policies on category/actual_transaction/subscription/app_user provide defense-in-depth.
- `OBSERVATION_CACHE` is keyed by integer `user_id` only — no string concatenation, no eval-able input.

No `## Threat Flags` section needed.

## Known Stubs

None. The endpoint is fully wired and returns real computed data; no placeholders, mocks, or "TODO" markers in the production code path.

## Auth Gates

None encountered. All work was code-only against an already-running test stack.

## Self-Check: PASSED

Files exist:
- `app/services/ai_observation.py` ✓
- `tests/api/test_ai_observation.py` ✓
- `app/api/schemas/ai.py` (modified) ✓
- `app/api/routes/ai.py` (modified) ✓
- `app/api/router.py` (modified) ✓

Commits exist:
- `f02d733` test(27-01): RED — ✓
- `779be38` feat(27-01): GREEN — ✓

Test verification: 8 passed, 1 skipped (documented).
