# Plan 32-03 Summary: Owner-Role Backfill Migration + Production-Path Audit

**Phase:** 32 — Multi-tenant Production Enablement
**Plan:** 03
**Status:** Complete
**Date:** 2026-05-11
**Requirements:** REQ-32-02, REQ-32-06

## What shipped

- `alembic/versions/0019_owner_role_backfill.py` — new migration `0019_owner_backfill`:
  - Idempotent UPDATE: sets `role='owner'` для existing user с `tg_user_id=$OWNER_TG_ID` если `role <> 'owner'`.
  - OWNER_TG_ID берётся из ENV; если =0 / unset → RAISE NOTICE + skip (dev-safe).
  - Downgrade: no-op (cannot recover previous role state).
- `app/api/dependencies.py:get_current_user` — docstring sharpened. ⇩ Phase 32 REQ-32-02 audit comment явно говорит «NO production branch compares tg_user_id with OWNER_TG_ID directly». Zero behaviour change.
- `tests/test_owner_role_backfill.py` — 3 tests (member→owner, idempotent already-owner, no-row-safe).
- `tests/test_no_owner_tg_id_in_prod.py` — 2 tests (production path 403 for unknown tg_user_id, role-based-only resolution).

## Migration audit

```
Upgrade  : 0018_cap_500 → 0019_owner_backfill
Downgrade: 0019_owner_backfill → 0018_cap_500 (no-op pass)
Round-trip: clean (verified)
```

## Behaviour confirmation

- DEV_MODE=true: `_dev_mode_resolve_owner` continues to auto-upsert OWNER row (unchanged).
- DEV_MODE=false + initData с unknown `tg_user_id` (incl. tg_user_id==OWNER_TG_ID без app_user row): **403 Not authorized**.
- DEV_MODE=false + initData с известным `tg_user_id`, `role='member'`: returns AppUser ORM, role preserved (NOT promoted to owner via OWNER_TG_ID comparison).

## Verification

```
$ pytest tests/test_owner_role_backfill.py tests/test_no_owner_tg_id_in_prod.py -v
============================ 5 passed in 0.36s =============================

$ pytest tests/test_auth.py tests/test_role_based_auth.py -v
======================== 11 passed, 2 skipped in 1.23s =====================
```

Zero regression on existing auth tests (incl. `test_owner_tg_id_eq_no_longer_in_get_current_user` from Phase 12).

## Files changed

- `alembic/versions/0019_owner_role_backfill.py` (new, 67 LOC)
- `app/api/dependencies.py` (docstring +14 lines; zero behaviour change)
- `tests/test_owner_role_backfill.py` (new, 80 LOC)
- `tests/test_no_owner_tg_id_in_prod.py` (new, 93 LOC)
