"""Pydantic schemas для admin endpoints (Phase 13 ADM-03..06).

Используются роутами в ``app/api/routes/admin.py``:
  - GET    /api/v1/admin/users          → list[AdminUserResponse]
  - POST   /api/v1/admin/users          ← AdminUserCreateRequest, → AdminUserResponse
  - DELETE /api/v1/admin/users/{user_id} (no body, no response)

Plan 13-05 расширит этот модуль AdminAiUsageResponse / AdminAiUsageRow.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class AdminUserResponse(BaseModel):
    """One whitelist row для GET /admin/users (ADM-03 + ADM-06).

    `last_seen_at` пока NULL для всех existing rows — Phase 14 обновит при
    bot bind / first /me. Поле добавлено заранее в alembic 0008 чтобы UI
    мог рендерить «Xd назад» как только данные начнут поступать.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    tg_user_id: int
    tg_chat_id: Optional[int] = None
    role: Literal["owner", "member", "revoked"]
    last_seen_at: Optional[datetime] = None
    onboarded_at: Optional[datetime] = None
    created_at: datetime


class AdminUserCreateRequest(BaseModel):
    """Body для POST /admin/users — invite by tg_user_id (ADM-04).

    `ge=10_000` enforces "min 5 digits" per CONTEXT decision; `@username`
    not supported in Phase 13. FastAPI returns 422 на валидационный fail
    (e.g., short id, non-int, missing field).

    `extra="forbid"` блокирует попытки передать произвольные поля
    (defence в depth: payload должен быть ровно `{tg_user_id: int}`).
    """

    model_config = ConfigDict(extra="forbid")

    tg_user_id: int = Field(..., ge=10_000)
