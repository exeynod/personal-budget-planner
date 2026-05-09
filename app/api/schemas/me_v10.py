"""Pydantic v2 schemas for /api/v1/me v1.0 extensions (Phase 22, BE-01).

Adds the ``income_cents`` field to the ``/me`` contract without
breaking the legacy v0.x response shape (the route handler in plan
22.13 returns this richer model only when the client opts in via
``Accept: application/vnd.tg-budget-planner.v1+json`` or after the
v1.0 migration window — exact router behaviour is plan 22.13's
concern; the schema here is wire-stable from day one).

PATCH semantics (T-22-12-03):
    ``MePatchV10.income_cents`` is ``Optional`` with ``gt=0``. ``None``
    on the wire means "leave unchanged" — explicit nulling out of
    ``income_cents`` is reserved for the admin
    ``DELETE /api/v1/internal/onboarding/reset`` endpoint (plan 22.14).
    This keeps the PATCH path narrow and prevents accidentally
    invalidating a user's onboarding state through a typo.

Threat mitigations (plan 22.12 <threat_model>):
- T-22-12-01 / T-22-12-02: ``ConfigDict(strict=True, extra="forbid")``.
- T-22-12-03: ``income_cents`` bounded (0, 100M ₽] via the same
  :data:`INCOME_MAX_CENTS` constant the service-layer uses.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# Single source of truth for the income upper bound — re-using the
# constant exported from the service module keeps schema and service
# perfectly aligned. ``app.api.schemas.onboarding_v10`` itself imports
# it from ``app.services.onboarding_v10``, so the dependency chain is:
#     services.onboarding_v10 → schemas.onboarding_v10 → schemas.me_v10
from app.api.schemas.onboarding_v10 import INCOME_MAX_CENTS


class MePatchV10(BaseModel):
    """PATCH /api/v1/me request body — partial v1.0 update (BE-01).

    Currently only carries ``income_cents``. Future fields land here as
    nullable optionals to preserve the "omit = leave unchanged" PATCH
    contract.
    """

    model_config = ConfigDict(strict=True, extra="forbid")

    income_cents: Optional[int] = Field(
        default=None, gt=0, le=INCOME_MAX_CENTS
    )


class MeV10Response(BaseModel):
    """GET /api/v1/me response — v1.0 extension of the legacy /me payload.

    Existing fields (``tg_user_id``, ``cycle_start_day``, ``role``, ...)
    keep their v0.x shape. ``income_cents`` is the only added field
    (BE-01) — ``None`` for users that have not completed onboarding yet
    (DATA-MODEL §1.1 — ``income_cents`` nullable on ``app_user``).

    ``onboarded_at`` is a wire-string (ISO-8601). The legacy /me route
    serialises it through FastAPI's default JSON encoder so the format
    is already a string client-side; we type it as ``str`` here to
    match.
    """

    # ``extra="ignore"`` lets us add fields server-side without breaking
    # clients pinned to a strict schema (the response side of HTTP is
    # less hostile than the request side — extra keys cannot inject
    # state, only telemetry).
    model_config = ConfigDict(extra="ignore")

    tg_user_id: int
    tg_chat_id: Optional[int]
    cycle_start_day: int
    onboarded_at: Optional[str]
    chat_id_known: bool
    role: str
    ai_spend_cents: int
    ai_spending_cap_cents: int
    # ---- Phase 22 (BE-01) v1.0 extension ----
    income_cents: Optional[int]
