"""Admin users service-layer (Phase 13 ADM-03..06).

Service operations:
  - list_users(db) — owner-first sort, then last_seen_at desc NULLS LAST.
  - invite_user(db, tg_user_id) — create AppUser(role=member); 409 on dup.
  - purge_user(db, user_id) — cascade delete all 9 domain tables +
                              ai_usage_log + AppUser. RLS scope set
                              via set_config inside the transaction.

Self-revoke check is performed at route layer (HTTP-semantic concern):
service does not know caller identity; it only orchestrates DB writes.

Exceptions:
  - UserAlreadyExistsError → mapped to 409 in routes
  - UserNotFoundError → mapped to 404 in routes
"""
from __future__ import annotations

import logging

from sqlalchemy import desc, nulls_last, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser, UserRole

logger = logging.getLogger(__name__)


class UserAlreadyExistsError(Exception):
    """tg_user_id уже в whitelist (409)."""


class UserNotFoundError(Exception):
    """user_id не существует (404)."""


async def list_users(db: AsyncSession) -> list[AppUser]:
    """ADM-03: список whitelist'а — owner first, members by last_seen_at desc.

    NB: admin endpoint обходит per-user RLS scope (читает все строки app_user).
    `app_user` table — НЕ scoped по `user_id` (нет такой колонки), так что
    прямой SELECT работает вне зависимости от GUC.
    """
    # owner-first via boolean expression (False sorts before True).
    # nulls_last(desc(last_seen_at)) — наиболее-recent member вверху.
    stmt = (
        select(AppUser)
        .order_by(
            (AppUser.role != UserRole.owner),
            nulls_last(desc(AppUser.last_seen_at)),
            AppUser.id,
        )
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def invite_user(db: AsyncSession, *, tg_user_id: int) -> AppUser:
    """ADM-04: создать AppUser с role=member, onboarded_at=NULL.

    Phase 14 заполнит onboarded_at + tg_chat_id когда invitee сам пройдёт
    onboarding flow в Mini App.

    Raises UserAlreadyExistsError если tg_user_id уже существует (409).
    """
    existing = await db.execute(
        select(AppUser).where(AppUser.tg_user_id == tg_user_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise UserAlreadyExistsError(
            f"tg_user_id={tg_user_id} already in whitelist"
        )

    new_user = AppUser(
        tg_user_id=tg_user_id,
        role=UserRole.member,
        cycle_start_day=5,  # default; Phase 14 onboarding позволит изменить
    )
    db.add(new_user)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Race condition защита (один tg_user_id вставлен между select и insert).
        await db.rollback()
        raise UserAlreadyExistsError(
            f"tg_user_id={tg_user_id} already exists (race)"
        ) from exc
    await db.refresh(new_user)
    return new_user


# FK-safe order: children first, parents last. Each table is user_id-scoped.
# ai_message → ai_conversation: ai_message.conversation_id FK
# planned/actual → budget_period (period_id FK), category (category_id FK)
# subscription, plan_template_item → category (category_id FK)
# category_embedding → category (FK CASCADE — но удаляем явно для счёта)
# subscription, plan_template_item, planned_transaction, actual_transaction,
#   budget_period, category — domain tables (user_id RESTRICT FK)
# ai_usage_log — telemetry (CASCADE) — explicit для row count в audit log.
_PURGE_TABLES_ORDERED = (
    "ai_message",
    "ai_conversation",
    "category_embedding",
    "planned_transaction",
    "actual_transaction",
    "plan_template_item",
    "subscription",
    "budget_period",
    "category",
    "ai_usage_log",
)


async def purge_user(db: AsyncSession, *, user_id: int) -> dict[str, int]:
    """ADM-05: cascade-удалить все данные юзера + AppUser строку.

    Returns: dict {table_name: rows_deleted, "app_user": 1}.

    Raises UserNotFoundError если user_id не существует.

    Implementation: explicit DELETE per table в FK-safe порядке. Это даёт
    нам count rows для audit log + работает независимо от ON DELETE настройки.

    NB: handler уже под Depends(require_owner) → caller гарантированно owner.
    Self-revoke проверяется на route-уровне, не здесь.
    """
    # 1. Verify exists.
    user_exists = await db.execute(
        select(AppUser.id).where(AppUser.id == user_id)
    )
    if user_exists.scalar_one_or_none() is None:
        raise UserNotFoundError(f"user_id={user_id} not found")

    # 2. Set transaction-scoped tenant GUC so RLS policies allow our DELETE.
    # Pattern из Plan 11-06 (worker / AI scoping). is_local=true → автосброс
    # на commit / rollback. Domain tables используют RLS policies на user_id,
    # ai_usage_log — тоже (alembic 0008). app_user сам не имеет RLS policy
    # на user_id колонке (её нет), его DELETE проходит вне зависимости от GUC.
    await db.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(user_id)},
    )

    counts: dict[str, int] = {}
    for table in _PURGE_TABLES_ORDERED:
        result = await db.execute(
            text(f"DELETE FROM {table} WHERE user_id = :uid"),
            {"uid": user_id},
        )
        counts[table] = result.rowcount or 0

    # Last: app_user itself.
    final = await db.execute(
        text("DELETE FROM app_user WHERE id = :uid"),
        {"uid": user_id},
    )
    counts["app_user"] = final.rowcount or 0
    await db.flush()
    return counts


async def update_user_cap(
    db: AsyncSession,
    *,
    user_id: int,
    spending_cap_cents: int,
) -> AppUser:
    """AICAP-04: update AppUser.spending_cap_cents + invalidate cache.

    Per CONTEXT D-15-03: owner-only endpoint (handler enforces via
    Depends(require_owner)); service signature не валидирует caller —
    handler гарантирует.

    Behaviour:
    - 404 (UserNotFoundError) если user_id не существует.
    - SET app_user.spending_cap_cents = :new WHERE id = :user_id.
    - Returns refreshed AppUser ORM (для AdminUserResponse snapshot в handler).
    - Invalidates spend-cache для user_id (so следующий enforce_spending_cap
      запрос видит новый лимит без 60s TTL задержки).
    """
    from app.services.spend_cap import invalidate_user_spend_cache

    result = await db.execute(
        select(AppUser).where(AppUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise UserNotFoundError(f"user_id={user_id} not found")

    user.spending_cap_cents = int(spending_cap_cents)
    await db.flush()
    await db.refresh(user)
    await invalidate_user_spend_cache(user_id)
    logger.info(
        "audit.cap_updated user_id=%s new_cap_cents=%s",
        user_id, spending_cap_cents,
    )
    return user
