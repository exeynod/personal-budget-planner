# Plan 17-01: Backend AuthToken Model + Migration

**Status:** ✓ Complete
**Files:**
- `app/core/settings.py` — добавлен `DEV_AUTH_SECRET: str | None = None`
- `app/db/models.py` — модель `AuthToken` (token_hash, user_id FK CASCADE, created_at, last_used_at, revoked_at)
- `alembic/versions/0011_auth_token.py` — новая миграция

**Acceptance:**
- Миграция применима: `alembic upgrade head` без ошибок
- Модель импортируется без круговых ссылок
- ON DELETE CASCADE на user_id (revoke flow Phase 13 совместимо)

**Checkpoint:** ready for plan 17-02 (endpoint).
