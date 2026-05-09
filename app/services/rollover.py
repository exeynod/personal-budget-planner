"""Period-end rollover service (BE-14).

Called from ``close_period_job`` between ``compute_balance`` and the new-period
creation. Implements DATA-MODEL §3 rollover rules with CONTEXT §Area 3
idempotency requirements.

Public entrypoint:
    do_period_rollover(session, *, period_id, user_id, next_period_id=None)
        Acquires ``pg_try_advisory_xact_lock(hashtext('close_period:'||pid))``.
        Returns ``False`` immediately on lock contention.
        Inside lock: if ``period.rollover_processed_at IS NOT NULL`` → no-op,
        return ``True`` (idempotency layer 2).
        Otherwise iterates non-paused, non-archived, non-savings categories:
            remainder = max(0, plan_cents − Σ |expense.amount_cents| in period)
            if cat.rollover == 'savings':
                INSERT ActualTransaction(kind=deposit, amount=−remainder,
                    category=savings_cat, account=primary, description=...)
                apply_balance_delta(primary, −remainder)
            elif cat.rollover == 'misc':
                accumulate remainder for the bulk UPDATE on next_period.misc_rollover_cents
        Finally: ``period.rollover_processed_at = now()`` (idempotency layer 1
        — the column is the durable barrier; advisory lock auto-releases on
        commit).

Idempotency layers (CONTEXT §Area 3):
    1. ``pg_try_advisory_xact_lock`` keyed on period_id — prevents concurrent
       runs across worker restarts. Lock auto-releases on COMMIT/ROLLBACK.
    2. ``rollover_processed_at IS NOT NULL`` gate — survives across runs.
    3. defensive UNIQUE INDEX ``uq_period_rolled`` (alembic 0014) — DB-level
       last-resort against double-write race.

Threats addressed (PLAN §threat_model):
    T-22-10-01 Tampering — double rollover producing duplicate deposits.
    T-22-10-02 DoS — lock starvation across users (lock keyed per period).
    T-22-10-03 Information Disclosure — cross-tenant rollover (all queries
       scoped by user_id; RLS backstop).
    T-22-10-04 Tampering — misc rollover applied to wrong next period
       (UPDATE WHERE id = next_period_id AND user_id = user_id).
    T-22-10-05 Repudiation — rollover_processed_at not set on failure
       (flushed last; ROLLBACK undoes).
    T-22-10-06 DoS — no primary account → repeated failures
       (RolloverConfigError surfaces; close_period_job catches per-user).
    T-22-10-07 Tampering — account balance corruption (apply_balance_delta is
       single-statement atomic UPDATE … RETURNING).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Account,
    ActualKind,
    ActualSource,
    ActualTransaction,
    BudgetPeriod,
    Category,
    RolloverPolicy,
)

logger = structlog.get_logger(__name__)


class RolloverConfigError(Exception):
    """Raised when rollover configuration is invalid (e.g. no primary account
    for a user that has savings-rollover categories with non-zero remainder).

    Surfaces in ``close_period_job`` per-user exception handler — logged as
    ``close_period.failed_for_user`` and the per-user transaction is rolled
    back so a retry on the next worker tick is clean (T-22-10-06 mitigation).
    """

    def __init__(self, user_id: int, reason: str) -> None:
        self.user_id = user_id
        self.reason = reason
        super().__init__(f"Rollover config error for user_id={user_id}: {reason}")


async def _try_advisory_xact_lock(session: AsyncSession, period_id: int) -> bool:
    """Try to acquire ``pg_try_advisory_xact_lock(hashtext('close_period:'||pid))``.

    Returns ``True`` if acquired, ``False`` on contention. The lock auto-
    releases on COMMIT/ROLLBACK — no manual unlock needed. Single-arg variant
    accepts a 32-bit int; we hash the string key on the DB side for stable
    keys per period.
    """
    result = await session.execute(
        text("SELECT pg_try_advisory_xact_lock(hashtext(:k))"),
        {"k": f"close_period:{period_id}"},
    )
    return bool(result.scalar())


async def do_period_rollover(
    session: AsyncSession,
    *,
    period_id: int,
    user_id: int,
    next_period_id: Optional[int] = None,
) -> bool:
    """Run the BE-14 rollover for one period of one user.

    Args:
        session: AsyncSession inside a transaction. Caller is responsible for
            commit/rollback (close_period_job wraps the whole per-user work in
            a single ``session.begin()``).
        period_id: closing period id.
        user_id: tenant scope.
        next_period_id: id of the freshly-created next period to receive
            misc accumulation. If ``None``, misc remainders are computed but
            not persisted (used by tests that exercise the savings branch in
            isolation).

    Returns:
        ``True`` — rollover ran or was already processed (no-op).
        ``False`` — advisory lock contention; caller should not retry inside
        this transaction. close_period_job's per-user retry on the next tick
        will see ``rollover_processed_at IS NOT NULL`` (if the holder
        succeeded) or pick up a fresh lock (if the holder rolled back).

    Raises:
        RolloverConfigError: a savings-rollover category has remainder > 0
            but the user has no primary account.
        SavingsCategoryMissingError (from app.services.roundup): a
            savings-rollover category has remainder > 0 but the system
            ``code='savings'`` Category is not seeded for the user (config
            drift — onboarding-complete is the only path that should seed
            it).
    """
    if not await _try_advisory_xact_lock(session, period_id):
        logger.info(
            "rollover.skipped.lock_contention",
            period_id=period_id,
            user_id=user_id,
        )
        return False

    period = await session.scalar(
        select(BudgetPeriod).where(
            BudgetPeriod.id == period_id,
            BudgetPeriod.user_id == user_id,
        )
    )
    if period is None:
        logger.warning(
            "rollover.period_not_found",
            period_id=period_id,
            user_id=user_id,
        )
        return True  # nothing to do; treat as already-processed

    if period.rollover_processed_at is not None:
        logger.info(
            "rollover.already_processed",
            period_id=period_id,
            user_id=user_id,
            processed_at=period.rollover_processed_at,
        )
        return True

    # Active categories for the user (excluding archived). We will skip paused
    # and the system 'savings' category inside the loop.
    cats_q = select(Category).where(
        Category.user_id == user_id,
        Category.is_archived.is_(False),
    )
    cats = (await session.execute(cats_q)).scalars().all()

    # Resolved lazily — only fetch primary / savings_cat if we need them.
    primary: Optional[Account] = None
    savings_cat: Optional[Category] = None
    primary_resolved = False
    savings_resolved = False

    misc_total: int = 0
    deposits_created: int = 0
    processed_categories: int = 0

    for cat in cats:
        if cat.paused:
            continue
        if cat.code == "savings":
            # Never roll the savings category into itself.
            continue

        # Σ |expense.amount_cents| for this period+category. Expenses are
        # stored as positive amounts in this codebase (see test_balance and
        # compute_balance — D-02), but use abs() defensively for any legacy
        # rows.
        fact = await session.scalar(
            select(
                func.coalesce(
                    func.sum(func.abs(ActualTransaction.amount_cents)), 0
                )
            ).where(
                ActualTransaction.user_id == user_id,
                ActualTransaction.period_id == period_id,
                ActualTransaction.category_id == cat.id,
                ActualTransaction.kind == ActualKind.expense,
            )
        )
        plan_cents = int(cat.plan_cents or 0)
        remainder = max(0, plan_cents - int(fact or 0))
        if remainder == 0:
            continue

        processed_categories += 1

        if cat.rollover == RolloverPolicy.savings:
            # Resolve primary + savings_cat lazily (first savings-rollover
            # category with non-zero remainder triggers the lookup).
            if not savings_resolved:
                savings_cat = await session.scalar(
                    select(Category).where(
                        Category.user_id == user_id,
                        Category.code == "savings",
                    )
                )
                savings_resolved = True
            if savings_cat is None:
                # Defer to roundup's exception class so onboarding /
                # roundup / rollover all surface the same error type
                # (T-22-10 mitigation: single source of truth).
                from app.services.roundup import SavingsCategoryMissingError
                raise SavingsCategoryMissingError(user_id)

            if not primary_resolved:
                primary = await session.scalar(
                    select(Account).where(
                        Account.user_id == user_id,
                        Account.is_primary.is_(True),
                    )
                )
                primary_resolved = True
            if primary is None:
                raise RolloverConfigError(
                    user_id,
                    "no primary account; cannot create rollover deposit",
                )

            description = f"Остаток {cat.name} → копилку"
            deposit = ActualTransaction(
                user_id=user_id,
                period_id=period_id,
                kind=ActualKind.deposit,
                amount_cents=-remainder,
                description=description,
                category_id=savings_cat.id,
                tx_date=period.period_end,
                source=ActualSource.mini_app,
                account_id=primary.id,
            )
            session.add(deposit)
            await session.flush()
            deposits_created += 1

            # Apply balance delta on the primary account atomically
            # (single-statement UPDATE … RETURNING — no read-modify-write
            # race per T-22-10-07).
            from app.services.accounts import apply_balance_delta
            await apply_balance_delta(
                session,
                account_id=primary.id,
                user_id=user_id,
                delta_cents=-remainder,
            )

        else:
            # RolloverPolicy.misc — accumulate; no txn.
            misc_total += remainder

    # Apply misc accumulation onto next_period (if provided).
    if misc_total > 0 and next_period_id is not None:
        await session.execute(
            text(
                "UPDATE budget_period "
                "SET misc_rollover_cents = misc_rollover_cents + :amt "
                "WHERE id = :pid AND user_id = :uid"
            ),
            {"amt": misc_total, "pid": next_period_id, "uid": user_id},
        )

    # Mark the closing period as rolled-over. Set this LAST so that any prior
    # exception leaves processed_at NULL — next worker tick will retry cleanly
    # (T-22-10-05 mitigation).
    period.rollover_processed_at = datetime.now(timezone.utc)
    await session.flush()

    logger.info(
        "rollover.done",
        user_id=user_id,
        period_id=period_id,
        next_period_id=next_period_id,
        processed_categories=processed_categories,
        deposits_created=deposits_created,
        misc_carry_cents=misc_total,
    )
    return True


__all__ = [
    "RolloverConfigError",
    "do_period_rollover",
]
