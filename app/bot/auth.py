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

Phase 14 (MTONB-01): bot_resolve_user_status sibling helper returns
(role, onboarded_at) for the cmd_start branching logic — distinguishes
"ready to use" from "invited, pending onboarding".
"""
from __future__ import annotations

from datetime import datetime

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


async def bot_resolve_user_status(
    tg_user_id: int,
) -> tuple[UserRole | None, datetime | None]:
    """Return (role, onboarded_at) for a Telegram user (Phase 14 MTONB-01).

    Single SELECT — same DB pattern as bot_resolve_user_role. Used by
    ``cmd_start`` to distinguish "already onboarded" (regular greeting)
    from "invited but pending onboarding" (D-14-02 invite-flow copy).

    Args:
        tg_user_id: Telegram user id from the incoming message.

    Returns:
        (role, onboarded_at) tuple. Either or both elements can be None:
        - (None, None) when the AppUser row doesn't exist (revoked /
          non-whitelisted Telegram account — handler replies "Бот приватный").
        - (UserRole.<x>, None) when whitelisted but pre-onboarding
          (Phase 14 invite scenario).
        - (UserRole.<x>, <datetime>) when fully onboarded.

    Threat note: same fresh-SELECT-per-command guarantee as
    bot_resolve_user_role — revoked status and onboarded transitions
    propagate within one command turnaround (no caching).
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppUser.role, AppUser.onboarded_at)
            .where(AppUser.tg_user_id == tg_user_id)
        )
        row = result.first()
        if row is None:
            return (None, None)
        return (row.role, row.onboarded_at)
