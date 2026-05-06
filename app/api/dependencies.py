"""FastAPI dependencies for authentication and authorization.

Security design (HLD §7):

- Public endpoints (``/api/v1/*``): require valid Telegram initData +
  ``OWNER_TG_ID`` whitelist.
- Internal endpoints (``/api/v1/internal/*``): require ``X-Internal-Token``
  header.
- ``DEV_MODE=true``: bypasses initData HMAC check, injects mock owner user
  (decision D-05).
"""
from __future__ import annotations

import hmac
from typing import Annotated, AsyncGenerator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import validate_init_data
from app.core.settings import settings
from app.db.models import AppUser
from app.db.session import AsyncSessionLocal, set_tenant_scope


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session with automatic commit/rollback."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    x_telegram_init_data: str | None = Header(default=None),
) -> dict:
    """Validate Telegram initData and enforce ``OWNER_TG_ID`` whitelist.

    ``DEV_MODE=true`` (per D-05): skips HMAC check, returns mock owner user.
    """
    if settings.DEV_MODE:
        return {"id": settings.OWNER_TG_ID, "first_name": "Dev"}

    if not x_telegram_init_data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing X-Telegram-Init-Data header",
        )

    try:
        user = validate_init_data(x_telegram_init_data, settings.BOT_TOKEN)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    # AUTH-02: OWNER_TG_ID whitelist — reject non-owner users.
    if user.get("id") != settings.OWNER_TG_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized: owner only",
        )

    return user


async def verify_internal_token(
    x_internal_token: str | None = Header(default=None),
) -> None:
    """Validate ``X-Internal-Token`` for ``/api/v1/internal/*`` endpoints.

    Used exclusively by bot↔api internal communication (HLD §7.3).
    """
    if not x_internal_token or not hmac.compare_digest(
        x_internal_token, settings.INTERNAL_TOKEN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-Internal-Token",
        )


async def get_current_user_id(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> int:
    """Resolve ``app_user.id`` (PK) for the current Telegram user (Phase 11 MUL-03).

    FastAPI кэширует Depends-результаты в рамках одного request, так что
    cost — один SELECT на request. Возвращает int (PK), а не tg_user_id —
    чтобы service layer мог фильтровать ``Model.user_id == user_id`` по FK.

    Phase 11 поведение: ищет AppUser строку, raises 403 если не найдена.
    Это сохраняет существующую семантику OWNER_TG_ID-eq (Phase 12 заменит
    на role-check без изменения сигнатуры этой функции).

    Args:
        current_user: dict с ``id`` = tg_user_id (из get_current_user).
        db: AsyncSession для lookup AppUser строки.

    Returns:
        app_user.id (PK BIGINT).

    Raises:
        HTTPException 403: если AppUser строка не существует
            (например, юзер впервые открыл Mini App до /start в боте).
    """
    tg_user_id = current_user["id"]
    result = await db.execute(
        select(AppUser.id).where(AppUser.tg_user_id == tg_user_id)
    )
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AppUser not found for current Telegram user",
        )
    return user_id


async def get_db_with_tenant_scope(
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> AsyncGenerator[AsyncSession, None]:
    """Yield AsyncSession with ``SET LOCAL app.current_user_id`` set (Phase 11 MUL-02).

    Эта зависимость заменяет ``get_db`` в роутах, где запросы должны видеть
    только данные текущего юзера. SET LOCAL transaction-scoped: на COMMIT
    или ROLLBACK значение сбрасывается, нет утечки между requests.

    Использование в роутах::

        @router.get("/categories")
        async def list_categories(
            db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
            user_id: Annotated[int, Depends(get_current_user_id)],
        ):
            return await cat_svc.list_categories(db, user_id=user_id)

    Public/internal endpoints (не требующие user-scope) продолжают использовать
    обычный ``get_db``.
    """
    async with AsyncSessionLocal() as session:
        try:
            await set_tenant_scope(session, user_id)
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
