"""GET /api/v1/home — single HOME bootstrap endpoint (F3).

Collapses the six authed calls the web HOME screen used to fire
(``/me``, ``/accounts``, ``/categories``, ``/periods/current``,
``/periods/{id}/actual``, ``/actual/balance``) into ONE request: one HMAC
validation (router-level ``get_current_user``), one ``SET LOCAL
app.current_user_id`` (``get_db_with_tenant_scope``), one pooled connection.

Every read reuses the existing service function on the shared tenant-scoped
session, so the response is composed from the same data the granular
endpoints serve — they are kept intact for other callers / tests.

Concurrency note: the reads run SEQUENTIALLY on the single ``AsyncSession``.
A SQLAlchemy AsyncSession multiplexes one DB connection and does NOT permit
concurrent operations — ``asyncio.gather``-ing queries on the same session
raises ``InterfaceError`` ("operation in progress"). The latency win here is
not query parallelism but the elimination of 5 extra HTTP round-trips, auth
validations and SET-LOCAL round-trips; the queries themselves would serialise
on one connection regardless.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.routes.me import build_me_response
from app.api.schemas.accounts import AccountRead
from app.api.schemas.actual import ActualRead, BalanceResponse
from app.api.schemas.categories import CategoryRead
from app.api.schemas.home import HomeResponse
from app.api.schemas.periods import PeriodRead
from app.db.models import AppUser
from app.services import accounts as acct_svc
from app.services import actual as actual_svc
from app.services import categories as cat_svc
from app.services import periods as period_svc


home_router = APIRouter(
    tags=["home"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@home_router.get("/home", response_model=HomeResponse)
async def get_home(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    current_user: Annotated[AppUser, Depends(get_current_user)],
) -> HomeResponse:
    """GET /api/v1/home — aggregated HOME bootstrap payload.

    Returns ``{ user, accounts, categories, period, balance, actuals }``. When
    the user has no active budget period (onboarding incomplete), ``period`` /
    ``balance`` are ``None`` and ``actuals`` is ``[]`` — ``user`` / ``accounts``
    / ``categories`` still resolve.
    """
    # All reads share the single tenant-scoped session (one SET LOCAL already
    # applied by get_db_with_tenant_scope). Sequential by necessity (see module
    # docstring) — the win is request-count collapse, not query parallelism.
    user_payload = await build_me_response(db, current_user)
    accounts = await acct_svc.list_accounts(db, user_id=user_id)
    categories = await cat_svc.list_categories(db, user_id=user_id)
    period = await period_svc.get_current_active_period(db, user_id=user_id)

    balance_payload: BalanceResponse | None = None
    actuals_rows: list = []
    if period is not None:
        bal = await actual_svc.compute_balance(db, period.id, user_id=user_id)
        balance_payload = BalanceResponse(**bal)
        actuals_rows = await actual_svc.list_actual_for_period(
            db, period.id, user_id=user_id
        )

    return HomeResponse(
        user=user_payload,
        accounts=[AccountRead.model_validate(a) for a in accounts],
        categories=[CategoryRead.model_validate(c) for c in categories],
        period=PeriodRead.model_validate(period) if period is not None else None,
        balance=balance_payload,
        actuals=[ActualRead.model_validate(r) for r in actuals_rows],
    )
