"""Savings service (Phase 22, BE-08 / BE-09 / BE-10).

Service-layer write/read paths for the savings domain. The router layer
(plan 22.13) wraps these into REST endpoints under ``/api/v1/savings``.

Module surface:
    get_savings_snapshot  — read-side aggregator (BE-09, DATA-MODEL §2.4).
    upsert_config         — partial-PATCH SavingsConfig (BE-08).
    create_deposit        — manual deposit transaction (BE-10).

Aggregator formulas (DATA-MODEL §2.4):

    total_cents      = Σ |txn.amount_cents|
                       where kind in ('roundup', 'deposit')
    month_in_cents   = Σ |txn.amount_cents|
                       where kind in ('roundup', 'deposit')
                       AND tx_date >= first day of current MSK month

Sign convention (D-02): roundup AND deposit txns are stored with NEGATIVE
``amount_cents`` because they reduce the source account balance (savings is
"spent" out of the card / cash). The aggregator therefore takes ``abs()`` to
expose magnitudes to the UI.

Phase 11 multi-tenancy contract: every public function takes ``user_id: int``
keyword-only and scopes its queries / inserts by that id. RLS
(``SET LOCAL app.current_user_id``) acts as defense-in-depth backstop, but
app-side filtering is the primary defense.

Atomicity:
    create_deposit MUST run in a single DB transaction so that
    (1) the actual_transaction insert,
    (2) the account balance delta,
    (3) the optional Goal.current_cents bump,
    all commit together. The caller (FastAPI request handler / worker job)
    owns the transaction boundary; this service does NOT call ``commit()``.

Threat dispositions: see plan 22.08 PLAN.md threat_model. Key invariants
enforced here:
  * Cross-tenant isolation: all queries filter by user_id (T-22-08-01).
  * roundup_base ∈ {10, 50, 100}: pre-validation in upsert_config rejects
    bad values before hitting the DB CHECK (T-22-08-06).
  * Goal-bump atomicity: same DB transaction as the txn insert; UPDATE …
    WHERE id=:gid AND user_id=:uid is single-statement atomic.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActualKind,
    ActualSource,
    ActualTransaction,
    Goal,
    SavingsConfig,
)


# ---------- Constants ----------

_DEFAULT_CONFIG: dict[str, object] = {
    "roundup_enabled": False,
    "roundup_base": 10,
}
_VALID_BASES: tuple[int, ...] = (10, 50, 100)


# ---------- Internal helpers ----------


def _first_of_msk_month() -> "datetime.date":  # noqa: F821
    """First day of the current MSK month (Europe/Moscow).

    Used as the lower bound for the ``month_in_cents`` aggregator. CLAUDE.md
    convention: period расчёты — Europe/Moscow, БД UTC.
    """
    today = datetime.now(ZoneInfo("Europe/Moscow")).date()
    return today.replace(day=1)


# ---------- BE-09: read-side aggregator ----------


async def get_savings_snapshot(db: AsyncSession, *, user_id: int) -> dict:
    """Return the full savings snapshot for a user (BE-09).

    Shape (matches DATA-MODEL §2.4 + §1.6/§1.7):

    ``{``
    ``  "total_cents":     int,    # Σ |amount| where kind in (roundup, deposit)``
    ``  "month_in_cents":  int,    # same filter + tx_date >= first_of_month MSK``
    ``  "config":          {``
    ``      "roundup_enabled": bool,``
    ``      "roundup_base":    int,  # 10 | 50 | 100``
    ``  },``
    ``  "goals":           list[dict],  # serialised Goal rows``
    ``}``

    When ``SavingsConfig`` is missing for the user, ``config`` falls back to
    defaults ``{roundup_enabled: False, roundup_base: 10}`` — this matches
    the seed values used in onboarding (plan 22.11) so a missing row
    behaves identically to a default-seeded row.

    Goals list is ordered by ``created_at`` ascending (oldest first).
    """
    # Σ ABS — both roundup and deposit are stored as negative amounts.
    base_filter = (
        ActualTransaction.user_id == user_id,
    ) + (
        # SQLAlchemy passes through `where` *args; build a list and unpack.
    )

    total_q = select(
        func.coalesce(func.sum(func.abs(ActualTransaction.amount_cents)), 0)
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.kind.in_([ActualKind.roundup, ActualKind.deposit]),
    )
    total = (await db.execute(total_q)).scalar_one()

    month_start = _first_of_msk_month()
    month_q = select(
        func.coalesce(func.sum(func.abs(ActualTransaction.amount_cents)), 0)
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.kind.in_([ActualKind.roundup, ActualKind.deposit]),
        ActualTransaction.tx_date >= month_start,
    )
    month_in = (await db.execute(month_q)).scalar_one()

    cfg = await db.scalar(
        select(SavingsConfig).where(SavingsConfig.user_id == user_id)
    )
    if cfg is None:
        config_dict: dict[str, object] = dict(_DEFAULT_CONFIG)
    else:
        config_dict = {
            "roundup_enabled": bool(cfg.roundup_enabled),
            "roundup_base": int(cfg.roundup_base),
        }

    goals_rows = (
        await db.execute(
            select(Goal)
            .where(Goal.user_id == user_id)
            .order_by(Goal.created_at.asc(), Goal.id.asc())
        )
    ).scalars().all()

    goals_list: list[dict] = []
    for g in goals_rows:
        goals_list.append(
            {
                "id": g.id,
                "name": g.name,
                "target_cents": g.target_cents,
                "current_cents": g.current_cents,
                "due": g.due.isoformat() if g.due else None,
                "created_at": g.created_at.isoformat() if g.created_at else None,
            }
        )

    return {
        "total_cents": int(total),
        "month_in_cents": int(month_in),
        "config": config_dict,
        "goals": goals_list,
    }


# ---------- BE-08: write-side config upsert ----------


async def upsert_config(
    db: AsyncSession,
    *,
    user_id: int,
    roundup_enabled: Optional[bool] = None,
    roundup_base: Optional[int] = None,
) -> SavingsConfig:
    """Insert-or-update SavingsConfig for the user (BE-08).

    PATCH semantics — only fields explicitly passed are written:
        upsert_config(user_id=1, roundup_enabled=True)
            → toggles only roundup_enabled; leaves roundup_base intact.
        upsert_config(user_id=1, roundup_base=50)
            → updates only roundup_base; leaves roundup_enabled intact.

    Args:
        roundup_enabled: ``True`` to enable auto-roundup hook; ``False`` to
            disable. ``None`` = no change.
        roundup_base: One of ``{10, 50, 100}``. Pre-validated here so callers
            get a ``ValueError`` (mapped to 422 by the route layer) BEFORE
            hitting the DB CHECK constraint ``ck_savings_config_base_enum``.

    Returns:
        The refreshed ``SavingsConfig`` row (always non-None).

    Raises:
        ValueError: if ``roundup_base`` is supplied and not in {10, 50, 100}.

    Atomicity:
        Uses a single ``INSERT … ON CONFLICT (user_id) DO UPDATE`` so the
        upsert is race-free at the DB level (T-22-08-06). ``updated_at`` is
        bumped to ``now()`` on every update path.

    Edge case — empty patch (no fields supplied):
        Returns the existing row if present, otherwise creates a row with
        the default values (roundup_enabled=False, roundup_base=10) so that
        a "GET-then-modify" flow always sees a row to operate on.
    """
    if roundup_base is not None and roundup_base not in _VALID_BASES:
        raise ValueError(
            f"roundup_base must be in {_VALID_BASES}; got {roundup_base!r}"
        )

    # Build values dict for the INSERT side — only include explicitly-supplied
    # fields; SQLAlchemy fills the rest from column defaults / server defaults.
    values: dict[str, object] = {"user_id": user_id}
    if roundup_enabled is not None:
        values["roundup_enabled"] = roundup_enabled
    if roundup_base is not None:
        values["roundup_base"] = roundup_base

    # UPDATE-side set: same field subset minus user_id, plus updated_at bump.
    update_set: dict[str, object] = {
        k: v for k, v in values.items() if k != "user_id"
    }

    if not update_set:
        # No-op patch: return existing row if any; otherwise create one with
        # defaults so the caller can rely on a non-None return.
        existing = await db.scalar(
            select(SavingsConfig).where(SavingsConfig.user_id == user_id)
        )
        if existing is not None:
            return existing
        # Insert default row (roundup_enabled defaults to False / 10 via
        # column server_default).
        row = SavingsConfig(user_id=user_id)
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return row

    update_set["updated_at"] = func.now()

    stmt = (
        pg_insert(SavingsConfig)
        .values(**values)
        .on_conflict_do_update(
            index_elements=["user_id"],
            set_=update_set,
        )
        .returning(SavingsConfig.user_id)
    )
    await db.execute(stmt)
    await db.flush()

    # Re-fetch the full row so the caller sees committed-state values
    # (server_default for fields not supplied in INSERT, updated_at).
    cfg = await db.scalar(
        select(SavingsConfig).where(SavingsConfig.user_id == user_id)
    )
    # Refresh ORM attribute cache in case session has a stale instance
    # (e.g. a prior get_savings_snapshot() call loaded the row before this
    # upsert ran).
    if cfg is not None:
        await db.refresh(cfg)
    assert cfg is not None  # ON CONFLICT … DO UPDATE always leaves a row
    return cfg


# ---------- BE-10: manual deposit ----------


async def create_deposit(
    db: AsyncSession,
    *,
    user_id: int,
    amount_cents: int,
    account_id: int,
    goal_id: Optional[int] = None,
    description: Optional[str] = None,
    source: ActualSource = ActualSource.mini_app,
) -> ActualTransaction:
    """Create a manual deposit ActualTransaction (BE-10, POST /savings/deposit).

    Side effects (all in the caller's transaction):
      1. Insert an ``ActualTransaction(kind=deposit, amount_cents=-|amount|,
         category_id=savings_cat.id, account_id=account_id, …)``.
      2. Decrement ``account.balance_cents`` by ``|amount|`` via
         ``apply_balance_delta`` (single source of truth for balance updates,
         CONTEXT §Area 2 D-04).
      3. If ``goal_id`` is supplied, increment ``Goal.current_cents`` by
         ``|amount|`` via a single-statement UPDATE (atomic with the rest of
         the transaction).

    Args:
        amount_cents: Deposit magnitude. Caller may pass positive or negative;
            both are normalised to the negative storage convention. Zero
            rejected.
        account_id: Source account that loses the funds. Must belong to
            ``user_id`` — ``apply_balance_delta`` raises ``AccountNotFoundError``
            on mismatch.
        goal_id: Optional Goal to credit. Validated to belong to the same
            user before any state changes.
        description: User-supplied description (e.g. "Бонус с зарплаты").
            Defaults to "Пополнение копилки".
        source: ``ActualSource.mini_app`` (REST) or ``ActualSource.bot``
            (bot command). Routes set this explicitly per D-53.

    Returns:
        The freshly inserted parent ``ActualTransaction``. No roundup child
        is generated for deposit kinds (roundup gate refuses ``kind != expense``,
        T-22-07-01).

    Raises:
        ValueError: amount_cents == 0.
        SavingsCategoryMissingError: user has no system Category with
            ``code='savings'`` (config drift — onboarding-complete is the
            only path that should seed this row).
        GoalNotFoundError: goal_id supplied but not found / cross-tenant.
        AccountNotFoundError: account_id not found / cross-tenant
            (propagates from ``apply_balance_delta``).

    NOTE: We do NOT call ``create_actual_v10`` here — that path runs the
    roundup hook (a no-op for ``kind=deposit`` but adds an extra DB query)
    and applies the balance delta itself. Open-coding the insert lets us
    control the description, avoid the noop hook, and keep the goal_id bump
    in the same flush window.
    """
    if amount_cents == 0:
        raise ValueError("amount_cents must be non-zero")
    # Normalise to negative storage (D-02): deposits debit the source account.
    signed_amount = -abs(int(amount_cents))

    # Validate account_id BEFORE writing anything so a bad id surfaces a clean
    # AccountNotFoundError (route → 404) rather than an FK IntegrityError on
    # the txn insert. Local import to avoid module-import cycle with accounts.py.
    from app.services.accounts import (
        AccountNotFoundError,  # noqa: F401  (re-export for caller)
        get_or_404 as get_account_or_404,
    )
    await get_account_or_404(db, user_id=user_id, account_id=account_id)

    # Validate goal_id BEFORE writing anything so a bad id can't leave a
    # half-created txn / balance delta behind.
    if goal_id is not None:
        goal_exists = await db.scalar(
            select(Goal.id).where(
                Goal.id == goal_id, Goal.user_id == user_id
            )
        )
        if goal_exists is None:
            # Local import — avoids circular dep at module import time.
            from app.services.goals import GoalNotFoundError

            raise GoalNotFoundError(goal_id)

    # Resolve the system 'savings' Category. Reuses roundup's helper for
    # consistency (T-22-07-05 uses the same lookup).
    from app.services.roundup import (
        SavingsCategoryMissingError,
        get_savings_category,
    )

    savings_cat = await get_savings_category(db, user_id=user_id)
    if savings_cat is None:
        raise SavingsCategoryMissingError(user_id)

    # Resolve a budget period for today (MSK). Reuse the actual-service helper
    # so deposit txns end up in the correct period and create one if missing
    # (D-52 lookup-or-create).
    from app.services.actual import (
        _get_cycle_start_day,
        _resolve_period_for_date,
    )
    from app.services.periods import _today_in_app_tz

    today = _today_in_app_tz()
    cycle_start_day = await _get_cycle_start_day(db, user_id=user_id)
    period_id = await _resolve_period_for_date(
        db, today, cycle_start_day=cycle_start_day, user_id=user_id
    )

    parent = ActualTransaction(
        user_id=user_id,
        period_id=period_id,
        kind=ActualKind.deposit,
        amount_cents=signed_amount,
        description=description or "Пополнение копилки",
        category_id=savings_cat.id,
        tx_date=today,
        source=source,
        account_id=account_id,
    )
    db.add(parent)
    await db.flush()
    await db.refresh(parent)

    # Apply balance delta (negative — account loses money).
    from app.services.accounts import apply_balance_delta

    await apply_balance_delta(
        db,
        account_id=account_id,
        user_id=user_id,
        delta_cents=signed_amount,
    )

    # Bump Goal.current_cents (positive, magnitude only). Single-statement
    # UPDATE for race-safety; same transaction as the txn insert.
    if goal_id is not None:
        bump = abs(signed_amount)
        await db.execute(
            text(
                "UPDATE goal SET current_cents = current_cents + :amt "
                "WHERE id = :gid AND user_id = :uid"
            ),
            {"amt": bump, "gid": goal_id, "uid": user_id},
        )

    return parent


__all__ = [
    "get_savings_snapshot",
    "upsert_config",
    "create_deposit",
]
