"""Pydantic schema for the GET /api/v1/home bootstrap endpoint (F3).

The web HOME screen previously fired SIX authed requests on load
(``/me``, ``/accounts``, ``/categories``, ``/periods/current``,
``/periods/{id}/actual``, ``/actual/balance``) — six HMAC validations, six
``SET LOCAL`` round-trips and six pooled connections before the screen could
render. ``HomeResponse`` is the single aggregated payload that one
tenant-scoped request returns instead, reusing the exact sub-schemas the
individual endpoints already emit so the wire shapes stay byte-identical and
the frontend can adopt it incrementally.

``period`` / ``balance`` / ``actuals`` are nullable: a user who has not
completed onboarding has no active budget period, so those three are ``None``
(mirrors the 404 the individual ``/periods/current`` + ``/actual/balance``
endpoints return in that state) while ``user`` / ``accounts`` / ``categories``
still resolve.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.api.schemas.accounts import AccountRead
from app.api.schemas.actual import ActualRead, BalanceResponse
from app.api.schemas.categories import CategoryRead
from app.api.schemas.me_v10 import MeV10Response
from app.api.schemas.periods import PeriodRead
from app.api.schemas.planned import PlannedRead


class HomeResponse(BaseModel):
    """Aggregated HOME bootstrap payload (F3).

    Each field reuses the response model of the endpoint it replaces, so a
    client can drop a field straight into the slot it already consumes from
    the granular endpoints.
    """

    model_config = ConfigDict(extra="ignore")

    user: MeV10Response
    accounts: list[AccountRead]
    categories: list[CategoryRead]
    # None when no active budget period exists (onboarding incomplete) —
    # matches the 404 the individual endpoints return in that state.
    period: Optional[PeriodRead]
    balance: Optional[BalanceResponse]
    actuals: list[ActualRead]
    # ALL budget periods, newest-first — identical shape/order to
    # GET /api/v1/periods (the list endpoint backing listPeriods). Lets the
    # PeriodSwitcher boot without a separate /periods round-trip.
    periods: list[PeriodRead]
    # The active period's planned rows — identical shape to
    # GET /api/v1/periods/{period_id}/planned. ``[]`` when no active period
    # exists. Lets the plan ladder boot without a separate /planned round-trip.
    planned: list[PlannedRead]
    # ADR-0008 (monthly planning gate): True when an active period exists but
    # has not been planned yet (``period.planned_at IS NULL``) — lets the shell
    # gate on the first bootstrap without a separate request.
    needs_planning: bool
