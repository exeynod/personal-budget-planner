"""Auth route — POST /api/v1/auth/dev-exchange (Phase 17, IOSAUTH-02).

Выдаёт long-lived Bearer-токен для нативных клиентов (iOS).
В отличие от других public-endpoint-ов, этот НЕ требует TG initData —
он сам проверяет shared secret и идентифицирует пользователя как OWNER_TG_ID.

Status codes:
- 200: success — token + tg_user_id
- 403: invalid secret (timing-safe compare)
- 503: DEV_AUTH_SECRET не задан в env — endpoint отключён

В Phase 21 этот endpoint будет заменён или дополнен альтернативами:
- POST /auth/telegram-exchange (TG Login Widget callback verification)
- POST /auth/apple-exchange (Sign in with Apple identity token)
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.api.schemas.auth import DevExchangeRequest, DevExchangeResponse
from app.core.settings import settings
from app.db.models import AppUser, AuthToken, UserRole


auth_router = APIRouter(prefix="/auth", tags=["auth"])


def hash_token(token: str) -> str:
    """sha256(token) → 64-char hex. Используется и для записи, и для lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@auth_router.post(
    "/dev-exchange",
    response_model=DevExchangeResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Invalid secret"},
        503: {"description": "DEV_AUTH_SECRET not configured — endpoint disabled"},
    },
)
async def dev_exchange(
    body: DevExchangeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DevExchangeResponse:
    """POST /api/v1/auth/dev-exchange — обмен shared secret на Bearer-токен.

    Identification: OWNER_TG_ID. Сначала upsert app_user строку с role=owner
    (idempotent — на повторный exchange не ломает существующий setup).
    Потом генерируем 64-char hex-токен через secrets.token_hex(32),
    кладём sha256(token) в auth_token, отдаём plaintext клиенту.

    Plaintext токен виден один раз — БД хранит только hash.
    """
    if not settings.DEV_AUTH_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="dev-exchange disabled: DEV_AUTH_SECRET not set",
        )

    # Timing-safe compare защищает от timing-side-channel.
    if not hmac.compare_digest(body.secret, settings.DEV_AUTH_SECRET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid secret",
        )

    if not settings.OWNER_TG_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="dev-exchange disabled: OWNER_TG_ID not set",
        )

    # Upsert owner row. ON CONFLICT DO UPDATE на role гарантирует что
    # если row уже существует с role=member (test fixtures, edge cases) —
    # она поднимается до owner.
    upsert_stmt = (
        pg_insert(AppUser)
        .values(tg_user_id=settings.OWNER_TG_ID, role=UserRole.owner)
        .on_conflict_do_update(
            index_elements=["tg_user_id"],
            set_={"role": UserRole.owner},
        )
    )
    await db.execute(upsert_stmt)

    user = (
        await db.execute(
            select(AppUser).where(AppUser.tg_user_id == settings.OWNER_TG_ID)
        )
    ).scalar_one()

    # Генерируем токен. 32 байт random → 64 hex chars. secrets.token_hex
    # криптографически безопасен (использует os.urandom).
    plaintext = secrets.token_hex(32)
    token_record = AuthToken(token_hash=hash_token(plaintext), user_id=user.id)
    db.add(token_record)
    await db.flush()

    return DevExchangeResponse(token=plaintext, tg_user_id=user.tg_user_id)
