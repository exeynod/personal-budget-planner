# Plan 17-02: Backend dev-exchange Endpoint

**Status:** ✓ Complete
**Files:**
- `app/api/schemas/auth.py` — DevExchangeRequest (secret), DevExchangeResponse (token, tg_user_id)
- `app/api/routes/auth.py` — POST /api/v1/auth/dev-exchange + hash_token utility
- `app/api/router.py` — register auth_router в public_router
- `docker-compose.yml` — DEV_AUTH_SECRET environment forwarding
- `tests/api/test_auth_dev_exchange.py` — pytest 5 cases (valid, invalid, no-config, repeat, validation)

**Smoke verified:**
- `POST /auth/dev-exchange {secret:correct}` → 200 + 64-char token + tg_user_id == OWNER_TG_ID ✓
- `POST /auth/dev-exchange {secret:wrong}` → 403 "Invalid secret" ✓
- `POST /auth/dev-exchange` без env DEV_AUTH_SECRET → 503 ✓ (verified до setting в .env)

**Acceptance:** все 4 cases из IOSAUTH-02 покрыты тестами. Toкen-hash stored, plaintext одноразово.

**Checkpoint:** ready for plan 17-03 (Bearer fallback).
