"""Bot-side authorization helpers (Phase 12 ROLE-02 / ROLE-03).

Bot is a separate process from api but shares the async SQLAlchemy engine
via app/db/session.py (single Postgres pool, multiple consumers). For
role-aware command handlers we perform a direct AppUser lookup rather
than calling the api over HTTP — keeps latency low (single SELECT) and
avoids a network round-trip + initData synthesis just to read a column.

Trust boundary note: bot already trusts settings.BOT_TOKEN to authenticate
Telegram updates. Role enforcement here is the second gate (after Telegram
sender identity) — ensures revoked / non-whitelisted Telegram accounts
cannot send /add etc. via the bot even if they reach the long-poll stream.

Threat mitigations (Phase 12-04 threat model):
- T-12-04-01: Fresh SELECT every command — no caching; revoked propagates
  within one command turnaround.
- T-12-04-02: Same "Бот приватный" reply for ALL non-allowed roles
  (revoked + unknown + None); structured log distinguishes for ops only.
- T-12-04-04: No OWNER_TG_ID-eq in this module; role check is DB-based.
"""
from __future__ import annotations

from sqlalchemy import select

from app.db.models import AppUser, UserRole
from app.db.session import AsyncSessionLocal


async def bot_resolve_user_role(tg_user_id: int) -> UserRole | None:
    """Return AppUser.role for tg_user_id; None if no AppUser row exists.

    Opens a fresh AsyncSession (bot is its own asyncio loop; cannot reuse
    FastAPI request-scoped session). Read-only query — no commit needed,
    session closes via context manager.

    Args:
        tg_user_id: Telegram user id from message.from_user.id /
            callback.from_user.id.

    Returns:
        UserRole enum if the user exists in app_user; None for unknown
        tg_user_id (Phase 14 onboarding will pre-create rows for invitees).
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppUser.role).where(AppUser.tg_user_id == tg_user_id)
        )
        return result.scalar_one_or_none()
