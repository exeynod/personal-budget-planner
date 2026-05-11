# Plan 35-02 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-35-02
**Commit:** `e161686`

## What was built

1. **`require_pro` dependency** в `app/api/dependencies.py` — composable
   FastAPI Depends; чтение текущего user, вычисление tier, raise 402
   PRO_TIER_REQUIRED с upgrade_url для free users.
2. **AI endpoints gated** — `POST /ai/chat`, `GET /ai/suggest-category`.
   Observation/usage остаются free (entry hook — user видит quota).
3. **`GET /api/v1/me/tier`** endpoint — UI payload `{tier, is_trial_active,
   trial_ends_at, pro_active_until}` для PaywallSheet / status badge.
4. **Tests** `tests/test_tier_gating.py` — 5 scenarios: /me/tier
   (free/trial/pro) + /ai/chat (blocks free, allows trial).

## Verification evidence

- `pytest tests/test_tier_gating.py -v` → **5 passed**.

## Decisions / surprises

- Observation endpoints (read-only) намеренно free — UX-cтратегия: дать
  user понять "вот сколько AI requests осталось" → conversion hook.
- `current_tier` в 402 detail — frontend renders contextually ("у вас
  free → upgrade to pro").

## Next plan

Plan 35-03 (PaywallSheet UI + 402 catch).
