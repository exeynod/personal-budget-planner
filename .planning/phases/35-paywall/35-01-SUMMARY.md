# Plan 35-01 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-35-01, REQ-35-03
**Commit:** `f7a8b73`

## What was built

1. **Alembic migration `0022_user_tier_columns.py`** — adds two nullable
   TIMESTAMPTZ columns to `app_user`: `trial_ends_at`, `pro_active_until`.
2. **AppUser ORM extension** (`app/db/models.py`) — both fields mapped as
   `Optional[datetime]` with TIMESTAMP(timezone=True).
3. **Service `app/services/tier.py`** — `effective_tier(user, now=None)`
   returns `"free"` | `"pro"`; `is_pro(user)` boolean shortcut. Precedence:
   any non-null timestamp > now() → Pro, otherwise Free.
4. **Tests `tests/test_tier_resolution.py`** — 6 unit scenarios.

## Verification evidence

- `pytest tests/test_tier_resolution.py -v` → **6 passed** in <0.5s.
- Alembic round-trip clean.

## Decisions / surprises

- Per CONTEXT decision — no stored `tier` enum, computed at request time.
  Single source of truth = two timestamps. Simpler, no state drift risk.
- `now` argument explicit — deterministic tests w/o time mocking libs.

## Next plan

Plan 35-02 (`require_pro` dependency + Pro-gate на AI endpoints) consumes
this resolution service.
