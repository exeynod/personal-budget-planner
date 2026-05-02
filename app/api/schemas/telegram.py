"""Pydantic schemas for internal telegram chat-bind endpoint (ONB-03)."""
from pydantic import BaseModel


class ChatBindRequest(BaseModel):
    """POST /api/v1/internal/telegram/chat-bind request body.

    Called by the bot service after ``/start`` is received from OWNER.
    Endpoint is protected by ``X-Internal-Token``
    (``verify_internal_token`` dep). The service performs UPSERT on
    ``app_user.tg_user_id``: creates the row if missing, otherwise
    updates ``tg_chat_id`` (CONTEXT.md D-11).
    """

    tg_user_id: int
    tg_chat_id: int
