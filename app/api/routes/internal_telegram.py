"""Internal endpoint for bot → api chat-bind (ONB-03 / D-11).

Mounted under the parent ``internal_router`` whose router-level
``verify_internal_token`` dependency enforces the ``X-Internal-Token`` header.
The dependency is inherited by every route in this sub-router via
``include_router(internal_telegram_router)`` — that's why this module does
NOT declare its own ``dependencies=[]`` (would duplicate the same dep and
double-execute the validator on each request).

The bot service calls this endpoint after receiving ``/start`` from the
OWNER — it persists ``tg_chat_id`` so the worker (Phase 5/6) can send push
notifications. The endpoint is also additionally blocked from external
traffic at the Caddy edge (``/api/v1/internal/*`` denied — Phase 1 verified).

Per the Plan 02-04 threat register (T-chatbind-spoof, disposition: accept):
the endpoint trusts ``body.tg_user_id`` as supplied by the bot. Single-tenant
constraint means only the bot has the ``INTERNAL_TOKEN``, and the bot
filters ``OWNER_TG_ID`` before calling. If we ever go multi-tenant, add an
allow-list check here.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.api.schemas.telegram import ChatBindRequest
from app.services import telegram as telegram_svc


# No router-level dependencies here — they are inherited from the parent
# ``internal_router`` (``Depends(verify_internal_token)``) when included.
internal_telegram_router = APIRouter(
    prefix="/telegram",
    tags=["internal-telegram"],
)


@internal_telegram_router.post("/chat-bind", status_code=status.HTTP_200_OK)
async def chat_bind(
    body: ChatBindRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """POST /api/v1/internal/telegram/chat-bind — upsert ``AppUser.tg_chat_id``.

    Idempotent — re-issuing with the same ``(tg_user_id, tg_chat_id)`` is a
    no-op; with a different ``tg_chat_id`` the row is updated. Implemented in
    a single round-trip via PostgreSQL UPSERT in ``telegram.bind_chat_id``.
    """
    await telegram_svc.bind_chat_id(
        db,
        tg_user_id=body.tg_user_id,
        tg_chat_id=body.tg_chat_id,
    )
    return {"status": "ok", "tg_user_id": body.tg_user_id}
