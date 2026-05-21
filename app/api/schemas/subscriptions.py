"""Pydantic schemas for /api/v1/subscriptions endpoints (SUB-01, D-72).

Threat mitigations:
- T-06-01: amount_cents Field(gt=0) rejects zero/negative values → 422
- T-06-03: notify_days_before Field(ge=0, le=30) limits range → 422
"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import SubCycle
from app.api.schemas.categories import CategoryRead


class SubscriptionCreate(BaseModel):
    """POST /subscriptions request body.

    WR-10 (Phase 22 review): ``extra="forbid"`` aligns this legacy schema
    with the new v1.0 schemas (T-22-12-02 — extra-key state injection).
    Service-layer code never splatted unknown keys into ORM kwargs, but
    enforcing forbid at the wire boundary makes the contract explicit.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    amount_cents: int = Field(..., gt=0)
    cycle: SubCycle
    next_charge_date: date
    category_id: int
    notify_days_before: Optional[int] = Field(None, ge=0, le=30)
    is_active: bool = True
    # v1.0 (BUG-2, phase 71): allow setting day_of_month / account_id at
    # creation so create-with-account works in one call. day_of_month bounded
    # to 1..28 (mirrors DB CHECK ck_subscription_day_of_month; iOS clamps too).
    # account_id is validated against the tenant in the route layer (→ 404 on
    # cross-tenant / missing, mirroring actuals).
    day_of_month: Optional[int] = Field(None, ge=1, le=28)
    account_id: Optional[int] = Field(None, gt=0)


class SubscriptionUpdate(BaseModel):
    """PATCH /subscriptions/{id} request body — all fields optional.

    WR-10 (Phase 22 review): ``extra="forbid"`` — see SubscriptionCreate.

    v1.0 (BUG-2, phase 71): ``day_of_month`` / ``account_id`` are now writable
    on the WRITE path. Previously the route was wired to this legacy schema with
    ``extra="forbid"``, so v1.0 PATCH bodies carrying these fields were rejected
    with 422 even though ``SubscriptionReadV10`` exposes them on read.
    """

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    amount_cents: Optional[int] = Field(None, gt=0)
    cycle: Optional[SubCycle] = None
    next_charge_date: Optional[date] = None
    category_id: Optional[int] = None
    notify_days_before: Optional[int] = Field(None, ge=0, le=30)
    is_active: Optional[bool] = None
    # v1.0 (BUG-2): day_of_month bounded 1..28; account_id tenant-validated in route.
    day_of_month: Optional[int] = Field(None, ge=1, le=28)
    account_id: Optional[int] = Field(None, gt=0)


class SubscriptionRead(BaseModel):
    """GET /subscriptions response item — also returned by POST/PATCH."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount_cents: int
    cycle: SubCycle
    next_charge_date: date
    category_id: int
    notify_days_before: int
    is_active: bool
    category: CategoryRead


class ChargeNowResponse(BaseModel):
    """POST /subscriptions/{id}/charge-now response (D-72).

    planned_id: ID of the created PlannedTransaction
    next_charge_date: updated next_charge_date after advancing cycle
    """

    planned_id: int
    next_charge_date: date


# ---- Phase 22 (v1.0) extensions: BE-12 / BE-13 ----
#
# These additions live below the legacy schemas so the v0.x routes (kept
# wire-compatible per CONTEXT D-04) are not perturbed. The v1.0 router in
# plan 22.13 wires the new fields into request bodies / responses without
# changing the existing classes above.
#
# Threat mitigations (plan 22.12 <threat_model>):
# - T-22-12-01 / T-22-12-02: ConfigDict(strict=True, extra="forbid") on
#   the new request models.
# - day_of_month bounded to 1..28 (mirrors DB CHECK ck_subscription_day_of_month
#   from migration 0014; clamps February automatically).


class SubscriptionV10Update(BaseModel):
    """PATCH /api/v1/subscriptions/{id} v1.0 extension (BE-12).

    Adds the day-of-month / account_id selector without disturbing the
    legacy ``SubscriptionUpdate`` shape. Routes that accept v1.0 clients
    layer this body **on top of** ``SubscriptionUpdate`` (the router in
    plan 22.13 merges both into a single payload).
    """

    model_config = ConfigDict(strict=True, extra="forbid")

    day_of_month: Optional[int] = Field(default=None, ge=1, le=28)
    account_id: Optional[int] = Field(default=None, gt=0)


class SubscriptionV10Extension(BaseModel):
    """Mixin-style read fields layered onto ``SubscriptionRead`` for v1.0.

    Plan 22.13 will define ``SubscriptionReadV10`` that inherits both
    :class:`SubscriptionRead` and this class so the v1.0 GET endpoints
    return ``day_of_month`` / ``account_id`` / ``posted_txn_id`` while
    legacy GET responses keep their original shape.
    """

    model_config = ConfigDict(from_attributes=True)

    day_of_month: Optional[int] = Field(default=None, ge=1, le=28)
    account_id: Optional[int] = None
    posted_txn_id: Optional[int] = None


class SubscriptionReadV10(SubscriptionRead, SubscriptionV10Extension):
    """v1.0 read shape: legacy ``SubscriptionRead`` + day_of_month/account_id/posted_txn_id.

    Closes P0-1 (review-doc BE-F1): the public ``/subscriptions`` GET/POST/PATCH
    routes previously returned :class:`SubscriptionRead`, which omitted the three
    v1.0 columns. iOS phase 63 writes ``day_of_month`` / ``account_id`` but read
    them back as ``nil``, and the posted-badge (``posted_txn_id``) never showed.

    The ORM ``Subscription`` model already carries ``day_of_month``, ``account_id``
    and ``posted_txn_id`` columns (migration 0014), so ``from_attributes`` proxies
    them directly. No new writable surface — request bodies keep their own shapes
    (``SubscriptionCreate`` / ``SubscriptionUpdate`` with ``extra="forbid"``).
    """

    model_config = ConfigDict(from_attributes=True)


class SubscriptionPostResponse(BaseModel):
    """POST /api/v1/subscriptions/{id}/post response (BE-13).

    Returned after a regular (subscription) charge is materialised into
    an ``ActualTransaction``. ``posted_at`` is the ISO-8601 wire string
    of ``ActualTransaction.created_at`` for the freshly inserted row.
    """

    model_config = ConfigDict(from_attributes=True)

    txn_id: int
    subscription_id: int
    posted_at: str
