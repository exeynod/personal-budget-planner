# Plan 17-03: Bearer-token Fallback в get_current_user

**Status:** ✓ Complete
**Files:**
- `app/api/dependencies.py` — `_resolve_bearer` helper + extended `get_current_user`
- `tests/api/test_dependencies_bearer_auth.py` — pytest 4 cases

**Auth precedence (Phase 17):**
1. `Authorization: Bearer <token>` → lookup в auth_token (sha256 hash), проверка revoked_at IS NULL, role IN (owner, member). On success — update last_used_at.
2. `X-Telegram-Init-Data` → existing HMAC + role-based path (legacy, не сломан).
3. DEV_MODE bypass (если DEV_MODE=true) — без изменений.
4. Иначе → 403.

**Smoke verified:**
- `GET /me` с `Authorization: Bearer <token>` → 200, owner ✓
- `GET /me` без headers (DEV_MODE=true) → 200, owner (legacy) ✓
- `GET /me` с invalid Bearer + valid initData → 200, fallback на initData (test case)
- `GET /me` с revoked token → 403 (test case)

**Acceptance:** IOSAUTH-01 покрыт — Bearer работает, web-фронт не сломан.

**Checkpoint:** Backend часть Phase 17 (плэны 17-01, 17-02, 17-03) полностью завершена. Дальше — iOS-проект через Xcode.
