"""Goal CRUD service (Phase 22, BE-11).

Service-layer surface for the Goal entity. Router layer (plan 22.13) wraps
these into REST endpoints under ``/api/v1/goals``.

Module surface:
    list_goals      — read all goals for a user, ordered created_at asc.
    get_or_404      — fetch one or raise GoalNotFoundError.
    create_goal     — insert with full validation (DATA-MODEL §6).
    update_goal     — partial update with re-validation per field.
    delete_goal     — hard delete; deposits referring to this goal stay
                      (their goal_id link is dropped at the API layer; on
                      DB level there is no FK from actual_transaction to
                      goal — deposits keep their kind=deposit semantic).

Validators (DATA-MODEL §6):
  * ``target_cents > 0``  (also enforced by DB CHECK ck_goal_target_positive)
  * ``len(name) ∈ [1, 80]``  (also enforced by DB CHECK ck_goal_name_length)
  * ``due > today (Europe/Moscow)`` if supplied; ``None`` allowed.

Phase 11 multi-tenancy contract: every public function takes ``user_id: int``
keyword-only and scopes its queries / inserts by that id. RLS
(``SET LOCAL app.current_user_id``) acts as defense-in-depth backstop.

NOTE on deposits and Goal deletion (BE-11):
    Deposits store no FK to Goal in the schema (Goal.id is referenced only
    transiently when the deposit is created via ``create_deposit(goal_id=…)``
    to bump ``Goal.current_cents``). Deleting a Goal therefore does NOT
    cascade-delete deposits — they remain as ``kind=deposit`` rows in
    ``actual_transaction``. This matches DATA-MODEL §6: a deleted goal is
    "gone" but the savings history is preserved.
"""
from __future__ import annotations

from datetime import date as date_type
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Goal
from app.services.periods import _today_in_app_tz


# ---------- Domain exceptions ----------


class GoalNotFoundError(Exception):
    """Raised when a Goal lookup by id returns no row, or row belongs to other tenant.

    Route layer maps to HTTPException(404). Cross-tenant id (goal exists
    but ``Goal.user_id != user_id``) also returns 404 (not 403) per REST
    convention — don't leak existence of resources outside scope.
    """

    def __init__(self, goal_id: int) -> None:
        self.goal_id = goal_id
        super().__init__(f"Goal {goal_id} not found")


class GoalValidationError(ValueError):
    """Raised when validators in DATA-MODEL §6 reject input.

    Subclass of ValueError so callers that catch the broader exception
    (e.g. router 422 mapping) keep working unchanged.
    """


# ---------- Validators ----------


def _validate_name(name: Any) -> None:
    """name length must be 1..80 chars (DATA-MODEL §6, DB CHECK ck_goal_name_length)."""
    if not isinstance(name, str):
        raise GoalValidationError(
            f"Goal name must be a string; got {type(name).__name__}"
        )
    n = len(name)
    if n < 1 or n > 80:
        raise GoalValidationError(
            f"Goal name length must be 1..80; got {n}"
        )


def _validate_target(target_cents: Any) -> None:
    """target_cents must be > 0 (DATA-MODEL §6, DB CHECK ck_goal_target_positive)."""
    if not isinstance(target_cents, int) or isinstance(target_cents, bool):
        raise GoalValidationError(
            f"Goal target_cents must be int; got {type(target_cents).__name__}"
        )
    if target_cents <= 0:
        raise GoalValidationError(
            f"Goal target_cents must be > 0; got {target_cents}"
        )


def _validate_due(due: Optional[date_type]) -> None:
    """due must be > today (Europe/Moscow) if set; None is OK (DATA-MODEL §6)."""
    if due is None:
        return
    if not isinstance(due, date_type):
        raise GoalValidationError(
            f"Goal due must be a date or None; got {type(due).__name__}"
        )
    today = _today_in_app_tz()
    if due <= today:
        raise GoalValidationError(
            f"Goal due must be in the future; got {due} (today={today})"
        )


# ---------- CRUD ----------


async def list_goals(db: AsyncSession, *, user_id: int) -> list[Goal]:
    """Return all goals for the user, oldest first (created_at asc, id asc).

    Tenant-scoped via explicit ``Goal.user_id == user_id`` filter (RLS
    backstop, app-side filter primary).
    """
    stmt = (
        select(Goal)
        .where(Goal.user_id == user_id)
        .order_by(Goal.created_at.asc(), Goal.id.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_goal(
    db: AsyncSession, *, user_id: int, goal_id: int
) -> Optional[Goal]:
    """Non-raising fetch — returns None if not found or cross-tenant.

    Use ``get_or_404`` when callers want exception semantics for HTTP 404
    mapping; use ``get_goal`` when None-on-miss is the intended contract.
    """
    return await db.scalar(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
    )


async def get_or_404(
    db: AsyncSession, goal_id: int, *, user_id: int
) -> Goal:
    """Raise ``GoalNotFoundError`` if the goal is missing or out-of-scope."""
    row = await get_goal(db, user_id=user_id, goal_id=goal_id)
    if row is None:
        raise GoalNotFoundError(goal_id)
    return row


async def create_goal(
    db: AsyncSession,
    *,
    user_id: int,
    name: str,
    target_cents: int,
    due: Optional[date_type] = None,
) -> Goal:
    """Create a new goal for ``user_id`` (BE-11).

    Validators (raise GoalValidationError before any DB write):
        - name length ∈ [1, 80]
        - target_cents > 0
        - due > today (Europe/Moscow) if supplied

    ``current_cents`` always starts at 0 — deposits with ``goal_id=…`` bump
    it via ``app.services.savings.create_deposit``.

    Returns:
        The newly created and refreshed ``Goal`` row.

    Raises:
        GoalValidationError: input violates DATA-MODEL §6 rules.
    """
    _validate_name(name)
    _validate_target(target_cents)
    _validate_due(due)

    row = Goal(
        user_id=user_id,
        name=name,
        target_cents=target_cents,
        current_cents=0,
        due=due,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_goal(
    db: AsyncSession,
    goal_id: int,
    *,
    user_id: int,
    **fields,
) -> Goal:
    """Partial update of a goal (BE-11).

    Recognised keyword fields: ``name``, ``target_cents``, ``current_cents``,
    ``due``. Each present field is re-validated per DATA-MODEL §6.

    DATA-MODEL does NOT forbid lowering ``target_cents`` below the current
    ``current_cents`` (R5: "цель достигнута" — UI just shows ≥100% progress),
    so we do not enforce that constraint here.

    Unknown fields are silently ignored to keep the surface forgiving for
    routers that pass-through Pydantic patches with extra keys.

    Raises:
        GoalNotFoundError: id not found / cross-tenant.
        GoalValidationError: any supplied field violates a validator.
    """
    row = await get_or_404(db, goal_id, user_id=user_id)

    if "name" in fields:
        _validate_name(fields["name"])
    if "target_cents" in fields:
        _validate_target(fields["target_cents"])
    if "due" in fields:
        _validate_due(fields["due"])

    allowed = {"name", "target_cents", "current_cents", "due"}
    for field, value in fields.items():
        if field in allowed:
            setattr(row, field, value)

    await db.flush()
    await db.refresh(row)
    return row


async def delete_goal(
    db: AsyncSession, goal_id: int, *, user_id: int
) -> Goal:
    """Hard-delete a goal (BE-11).

    Deposits previously created with this goal_id remain in
    ``actual_transaction`` as ``kind=deposit`` rows — the schema has no FK
    from actual_transaction to goal, so there is nothing to cascade. The
    savings aggregator counts them via the kind filter regardless of
    whether the goal still exists.

    Returns:
        The deleted (now-detached) Goal row, useful for response
        serialisation.

    Raises:
        GoalNotFoundError: id not found / cross-tenant.
    """
    row = await get_or_404(db, goal_id, user_id=user_id)
    await db.delete(row)
    await db.flush()
    return row


__all__ = [
    "GoalNotFoundError",
    "GoalValidationError",
    "list_goals",
    "get_goal",
    "get_or_404",
    "create_goal",
    "update_goal",
    "delete_goal",
]
