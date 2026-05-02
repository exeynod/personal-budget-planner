"""Telegram chat-bind service (ONB-03).

Called by the bot service when ``/start`` is received from OWNER. Stores
``tg_chat_id`` so the worker (Phase 5/6) can send push notifications.
"""
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser


async def bind_chat_id(
    db: AsyncSession,
    *,
    tg_user_id: int,
    tg_chat_id: int,
) -> None:
    """Upsert ``AppUser.tg_chat_id`` by ``tg_user_id`` (idempotent).

    Two cases handled atomically by a single PostgreSQL UPSERT:

    - **User row already exists** (created by ``/me`` upsert per Phase 1
      D-11): UPDATE ``tg_chat_id`` to the new value.
    - **User row does not exist yet** (bot received ``/start`` before user
      opened Mini App): INSERT new row with ``tg_chat_id`` set.

    Commit happens via ``get_db`` dependency on successful handler exit.
    """
    stmt = (
        pg_insert(AppUser)
        .values(tg_user_id=tg_user_id, tg_chat_id=tg_chat_id)
        .on_conflict_do_update(
            index_elements=["tg_user_id"],
            set_={"tg_chat_id": tg_chat_id},
        )
    )
    await db.execute(stmt)
