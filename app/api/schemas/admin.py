"""Pydantic schemas для admin endpoints (Phase 13 ADM-03..06 + AIUSE-01..03).

Используются роутами в ``app/api/routes/admin.py``:
  - GET    /api/v1/admin/users          → list[AdminUserResponse]
  - POST   /api/v1/admin/users          ← AdminUserCreateRequest, → AdminUserResponse
  - DELETE /api/v1/admin/users/{user_id} (no body, no response)
  - GET    /api/v1/admin/ai-usage       → AdminAiUsageResponse (Phase 13 Plan 13-05)
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.schemas.ai import UsageBucket


class AdminUserResponse(BaseModel):
    """One whitelist row для GET /admin/users (ADM-03 + ADM-06).

    `last_seen_at` пока NULL для всех existing rows — Phase 14 обновит при
    bot bind / first /me. Поле добавлено заранее в alembic 0008 чтобы UI
    мог рендерить «Xd назад» как только данные начнут поступать.

    `spending_cap_cents` (Phase 15 AICAP-04) — текущий AI-расходный лимит
    юзера. Используется CapEditSheet (Plan 15-06) для prefill. Default
    в БД 46500 (alembic 0008 stub). Scale: USD-cents (USD * 100 per
    CONTEXT D-15-02 explicit code).
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    tg_user_id: int
    tg_chat_id: Optional[int] = None
    role: Literal["owner", "member", "revoked"]
    last_seen_at: Optional[datetime] = None
    onboarded_at: Optional[datetime] = None
    created_at: datetime
    spending_cap_cents: int = 0  # Phase 15 AICAP-04


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


class CapUpdate(BaseModel):
    """Body для PATCH /admin/users/{user_id}/cap (AICAP-04, D-15-03).

    `spending_cap_cents` — USD копейки (1 USD = 100 cents storage units, как
    `app_user.spending_cap_cents` BIGINT) per CONTEXT D-15-02 explicit code.

    Bounds:
      - ge=0: 0 разрешено = AI off (D-15-01 cap=0 semantics).
      - le=100_000_00: $100k, sanity-cap.

    `extra="forbid"` блокирует случайные/злонамеренные доп-поля.
    """

    model_config = ConfigDict(extra="forbid")

    spending_cap_cents: int = Field(..., ge=0, le=100_000_00)


# ---------- Phase 13 AI Usage Admin (AIUSE-01..03) ----------


class AdminAiUsageRow(BaseModel):
    """One user's AI usage breakdown row для GET /admin/ai-usage.

    `current_month` — bucket с 1-го числа текущего месяца Europe/Moscow.
    `last_30d` — bucket за последние 30 календарных дней (UTC).
    `est_cost_cents_current_month` — USD копейки (1 USD = 10000 storage units),
    используется для sort + UI cap percentage.
    `pct_of_cap` — float ≥ 0.0; 0.0 если cap == 0 (защита от div by zero);
    UI триггерит warn при ≥ 0.80, danger при ≥ 1.0.
    """

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    tg_user_id: int
    name: Optional[str] = None  # tg_chat_id-derived если известно (Phase 14)
    role: Literal["owner", "member", "revoked"]
    spending_cap_cents: int  # USD копейки; default 46500 ($5/мес)
    current_month: UsageBucket
    last_30d: UsageBucket
    est_cost_cents_current_month: int
    pct_of_cap: float


class AdminAiUsageResponse(BaseModel):
    """Wrapper для GET /admin/ai-usage — список юзеров + метаданные ответа."""

    model_config = ConfigDict(from_attributes=True)

    users: list[AdminAiUsageRow]
    generated_at: datetime  # UTC datetime когда aggregation выполнен
