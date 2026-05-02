"""API routers for TG Budget Planner.

Phase 1 routes:
- ``/me`` (public_router) — returns current user info; protected by
  ``get_current_user`` (Telegram initData + OWNER_TG_ID whitelist).
- ``/internal/health`` (internal_router) — internal service-to-service health
  probe; protected by ``verify_internal_token`` (X-Internal-Token).

D-11: ``app_user`` row is upserted on the first valid ``GET /me`` request
(``INSERT ... ON CONFLICT DO NOTHING`` on ``tg_user_id``) — no migration seed.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, verify_internal_token
from app.db.models import AppUser


# ---- Public router (requires initData auth) ----
public_router = APIRouter()


class MeResponse(BaseModel):
    tg_user_id: int
    tg_chat_id: int | None
    cycle_start_day: int
    onboarded_at: str | None
    chat_id_known: bool


@public_router.get("/me", response_model=MeResponse)
async def get_me(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeResponse:
    """Return current user info; upsert ``app_user`` on first request (D-11)."""
    tg_user_id = current_user["id"]

    # D-11: upsert app_user on first valid request (no migration seed).
    stmt = (
        insert(AppUser)
        .values(tg_user_id=tg_user_id)
        .on_conflict_do_nothing(index_elements=["tg_user_id"])
    )
    await db.execute(stmt)

    result = await db.execute(
        select(AppUser).where(AppUser.tg_user_id == tg_user_id)
    )
    user = result.scalar_one()

    return MeResponse(
        tg_user_id=user.tg_user_id,
        tg_chat_id=user.tg_chat_id,
        cycle_start_day=user.cycle_start_day,
        onboarded_at=user.onboarded_at.isoformat() if user.onboarded_at else None,
        chat_id_known=user.tg_chat_id is not None,
    )


# ---- Internal router (requires X-Internal-Token) ----
internal_router = APIRouter(
    prefix="/internal",
    dependencies=[Depends(verify_internal_token)],
)


@internal_router.get("/health")
async def internal_health() -> dict:
    """Health check for internal service-to-service communication (bot↔api)."""
    return {"status": "ok", "service": "api-internal"}
