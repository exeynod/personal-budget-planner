# Plan 35-04 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-35-04
**Commit:** `0637ab6`

## What was built

1. **Reverse-trial grant on INSERT** в `_dev_mode_resolve_test_user` +
   `_dev_mode_resolve_owner` (app/api/dependencies.py). `pg_insert` values
   include `trial_ends_at = NOW() + 14d`; `on_conflict_do_update` set_ только
   меняет `role`, оставляет `trial_ends_at` нетронутым (idempotency
   invariant).
2. **`tests/test_reverse_trial.py`** — integration test через httpx
   ASGITransport: cleanup row → GET /me с X-Test-User → assert trial_ends_at
   ≈ NOW()+14d (±60s tolerance).

## Verification evidence

- `pytest tests/test_reverse_trial.py -v` → **1 passed**.
- `pytest tests/test_tier_resolution.py tests/test_tier_gating.py -v` → 11
  passed (no regressions).

## Decisions / surprises

- ON CONFLICT path намеренно НЕ обновляет `trial_ends_at` — иначе
  re-resolve существующего user'a продлевал бы триал на каждом запросе.
  Single-grant-on-create semantics — единственно корректный invariant.
- Production telegram-bot `/start` chat-bind path (services/telegram.py)
  пока НЕ grant'ит триал (bind_chat_id может создать row без trial).
  Acceptable для v1.1: production onboarding flow для real users
  планируется через web Mini App; bot-only entry — edge case, добавим в
  follow-up если flag flow станет основным.

## Next

Phase 35 finalize (35-VERIFICATION.md + close в STATE/ROADMAP/REQUIREMENTS).
