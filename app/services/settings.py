"""User-level settings (cycle_start_day, notify_days_before) — SET-01, SET-02.

Note (SET-01 / D-17): updating cycle_start_day does NOT recompute existing
periods. Only newly-created periods (next period boundary, Phase 5 worker)
will use the new value. This module deliberately does NOT import
``BudgetPeriod`` to make the boundary explicit and grep-able.

SET-02 (D-76): notify_days_before global default for subscription notifications.
is_bot_bound: derived from AppUser.tg_chat_id is not None.

Service layer is HTTP-framework-agnostic: raises ``UserNotFoundError`` for
unknown ``tg_user_id``; the route layer (Plan 02-04) maps it to HTTP 404.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser


class UserNotFoundError(Exception):
    """Raised when no AppUser row exists for the given tg_user_id.

    Per Phase 1 D-11, ``GET /me`` upserts the AppUser row, so settings
    endpoints should always find one. If they don't, the caller likely
    skipped the bootstrap call — route layer maps this to HTTP 404 with a
    helpful message.
    """

    def __init__(self, tg_user_id: int) -> None:
        self.tg_user_id = tg_user_id
        super().__init__(
            f"AppUser with tg_user_id={tg_user_id} not found "
            "— call GET /me first to bootstrap"
        )


async def _get_user_or_404(db: AsyncSession, tg_user_id: int) -> AppUser:
    result = await db.execute(
        select(AppUser).where(AppUser.tg_user_id == tg_user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise UserNotFoundError(tg_user_id)
    return user


async def get_cycle_start_day(db: AsyncSession, tg_user_id: int) -> int:
    user = await _get_user_or_404(db, tg_user_id)
    return user.cycle_start_day


async def update_cycle_start_day(
    db: AsyncSession,
    tg_user_id: int,
    cycle_start_day: int,
) -> int:
    """Persist the new cycle_start_day on the user row.

    Pydantic validates 1..28 upstream (``SettingsUpdate.cycle_start_day``).
    This function trusts the caller and does not re-validate.

    Existing budget_period rows are NOT modified — they retain the
    period_start/period_end values computed at their creation time
    (SET-01 / D-17). Note: this module does not import BudgetPeriod by
    design — verify with `grep -c BudgetPeriod app/services/settings.py`.
    """
    user = await _get_user_or_404(db, tg_user_id)
    user.cycle_start_day = cycle_start_day
    await db.flush()
    return user.cycle_start_day


async def get_notify_days_before(db: AsyncSession, tg_user_id: int) -> int:
    """Return notify_days_before setting for the given user (SET-02 / D-76)."""
    user = await _get_user_or_404(db, tg_user_id)
    return user.notify_days_before


async def update_notify_days_before(
    db: AsyncSession,
    tg_user_id: int,
    value: int,
) -> int:
    """Persist the new notify_days_before on the user row (SET-02 / D-76).

    Pydantic validates 0..30 upstream (``SettingsUpdate.notify_days_before``).
    This function trusts the caller and does not re-validate.
    """
    user = await _get_user_or_404(db, tg_user_id)
    user.notify_days_before = value
    await db.flush()
    return user.notify_days_before


async def get_is_bot_bound(db: AsyncSession, tg_user_id: int) -> bool:
    """Return True if the user has bound their Telegram chat (tg_chat_id is set).

    Used in GET /settings to surface bot binding status to the frontend.
    """
    user = await _get_user_or_404(db, tg_user_id)
    return user.tg_chat_id is not None


async def get_enable_ai_categorization(db: AsyncSession, tg_user_id: int) -> bool:
    """Return enable_ai_categorization setting for the given user (AICAT-05, SET-03)."""
    user = await _get_user_or_404(db, tg_user_id)
    return user.enable_ai_categorization


async def update_enable_ai_categorization(
    db: AsyncSession,
    tg_user_id: int,
    value: bool,
) -> bool:
    """Persist the new enable_ai_categorization on the user row (AICAT-05, SET-03)."""
    user = await _get_user_or_404(db, tg_user_id)
    user.enable_ai_categorization = value
    await db.flush()
    return user.enable_ai_categorization
