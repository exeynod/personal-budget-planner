"""FastAPI dependencies for authentication and authorization.

Security design (HLD §7):

- Public endpoints (``/api/v1/*``): require valid Telegram initData +
  ``OWNER_TG_ID`` whitelist.
- Internal endpoints (``/api/v1/internal/*``): require ``X-Internal-Token``
  header.
- ``DEV_MODE=true``: bypasses initData HMAC check, injects mock owner user
  (decision D-05).
"""
from typing import AsyncGenerator

from fastapi import Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import validate_init_data
from app.core.settings import settings
from app.db.session import AsyncSessionLocal


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
    if not x_internal_token or x_internal_token != settings.INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-Internal-Token",
        )
