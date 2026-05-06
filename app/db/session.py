"""Async SQLAlchemy engine + session factory.

Per Pattern 1 in 01-RESEARCH.md: shared async engine, session per request via
``get_db`` dependency. Commits on successful exit, rolls back on exception.
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.settings import settings

async_engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def set_tenant_scope(session: AsyncSession, user_id: int) -> None:
    """Установить app.current_user_id GUC для текущей transaction (Phase 11 MUL-02).

    Должно быть вызвано до любого query, который затрагивает доменные таблицы
    (категории, периоды, транзакции, подписки, AI tables) — иначе RLS policy
    coalesce(current_setting('app.current_user_id', true)::bigint, -1) даст -1
    и query вернёт 0 строк.

    SET LOCAL — transaction scope: при COMMIT/ROLLBACK значение сбрасывается.
    Используется в:
      - app/api/dependencies.py::get_db_with_tenant_scope (per-request).
      - app/worker/jobs/* (per-tenant iteration через explicit set + commit per tenant).

    Implementation note: PostgreSQL `SET LOCAL` does NOT accept bind parameters
    ($N placeholders), so we use `set_config(setting, value, is_local)` which
    is a regular function call and accepts parameters safely. We coerce
    ``user_id`` to int and stringify it before passing — preventing any
    injection regardless of SQL layer assumptions.

    Args:
        session: AsyncSession в открытой transaction.
        user_id: app_user.id (PK), не tg_user_id.
    """
    from sqlalchemy import text

    # Defense-in-depth: hard-validate that user_id is a non-negative int —
    # paranoia against future call sites passing untrusted input.
    if not isinstance(user_id, int) or user_id < 0:
        raise ValueError(f"set_tenant_scope: invalid user_id={user_id!r}")

    # set_config(name, value, is_local=true) — функция Postgres, безопасно
    # принимает параметры (в отличие от SET LOCAL).
    await session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(user_id)},
    )
