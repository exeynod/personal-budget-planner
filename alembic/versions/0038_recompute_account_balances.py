"""data: recompute account.balance_cents after v1.2 balance-fix

Revision ID: 0038_recompute_balances
Revises: 0037_period_planned_at
Create Date: 2026-06-10

WHY (data migration — UPDATE rows only, no DDL):
    Pre-v1.2 delta-accounting was broken in three ways, so every account
    balance that ever received a transaction has drifted:

      1. ``create_actual_v10`` applied ``apply_balance_delta(delta=amount_cents)``
         without deriving the sign from ``kind`` — clients always send POSITIVE
         ``amount_cents`` (API schema ``gt=0``), so a 500 ₽ EXPENSE *increased*
         the account by +500 instead of −500.
      2. ``DELETE /actual/{id}`` was routed through legacy ``delete_actual``
         which never restored the balance.
      3. ``PATCH /actual/{id}`` (``update_actual``) changed amount/kind without
         adjusting the balance.

    v1.2 fixes the write paths (single source of truth:
    ``app.services.actual.signed_delta`` — income +, expense/roundup/deposit −),
    but the historical corruption baked into ``account.balance_cents`` must be
    repaired once. This migration recomputes it.

BALANCE SOURCE (the 0032 canon — mirrors app.services.actual.compute_balance,
"balance_now_cents"; deterministic from current actual_transaction rows):
    F(user) = starting_balance_cents (ACTIVE period)
              + Σ ABS(amount) of income actuals in that period
              − Σ ABS(amount) of expense actuals in that period
      * ABS() because legacy rows may hold either sign (pre-v1.2
        ``reconcile_balance`` wrote negative expense adjustments) — magnitudes
        only, sign applied explicitly (income +, expense −).
      * Restricts to kind IN ('expense','income'); historical savings
        deposit/roundup rows stay out of the wallet (identical to 0032).
      * INCLUDES the system 'adjustment'-category rows created by the
        balance-reconcile flow — that is exactly how reconcile makes the
        displayed balance equal the entered value.
      * Fallback: no active period → latest period's starting_balance_cents;
        no period at all → 0 (COALESCE chain, same as 0032).

WRITE TARGET:
    The user's PRIMARY account is set to
        F(user) − Σ balance_cents of the user's NON-primary accounts
    so that the wallet total (Σ account.balance_cents — what the Mini App
    shows) equals F(user) exactly. Non-primary accounts are left untouched:
    all app write-paths (Mini App add-txn, bot, reconcile, onboarding) attach
    transactions to the primary account, so the drift lives there; for the
    common one-account case the subtraction term is 0 and primary := F(user).

IDEMPOTENT:
    F(user) depends only on budget_period/actual_transaction rows; the
    subtraction term reads only NON-primary rows, which this UPDATE never
    touches. Re-running recomputes the exact same value.

NOTE on "primary": the DB column is the reserved word ``primary`` — it MUST
be double-quoted everywhere it appears.
"""

from __future__ import annotations

from alembic import op

revision = "0038_recompute_balances"
down_revision = "0037_period_planned_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One UPDATE over primary accounts. DML inside a migration is fine
    # (check-no-manual-ddl guards app/ + main_*.py, and this is not DDL).
    op.execute(
        """
        UPDATE account a
        SET balance_cents =
            COALESCE(
                -- 1) current balance from the ACTIVE period (0032 canon)
                (
                    SELECT bp.starting_balance_cents
                           + COALESCE((
                               SELECT SUM(ABS(at.amount_cents))
                               FROM actual_transaction at
                               WHERE at.user_id = a.user_id
                                 AND at.period_id = bp.id
                                 AND at.kind = 'income'
                           ), 0)
                           - COALESCE((
                               SELECT SUM(ABS(at.amount_cents))
                               FROM actual_transaction at
                               WHERE at.user_id = a.user_id
                                 AND at.period_id = bp.id
                                 AND at.kind = 'expense'
                           ), 0)
                    FROM budget_period bp
                    WHERE bp.user_id = a.user_id
                      AND bp.status = 'active'
                    ORDER BY bp.period_start DESC
                    LIMIT 1
                ),
                -- 2) fallback: latest period's starting balance
                (
                    SELECT bp2.starting_balance_cents
                    FROM budget_period bp2
                    WHERE bp2.user_id = a.user_id
                    ORDER BY bp2.period_start DESC
                    LIMIT 1
                ),
                -- 3) fallback: no period at all
                0
            )
            -- Keep wallet total == F(user): non-primary balances are
            -- preserved as-is, the primary absorbs the difference.
            - COALESCE((
                SELECT SUM(b.balance_cents)
                FROM account b
                WHERE b.user_id = a.user_id
                  AND b.id <> a.id
            ), 0)
        WHERE a."primary" = true
        """
    )


def downgrade() -> None:
    # No-op by design (same as 0032/0033). This is a DATA repair: the
    # pre-migration balances were corrupted by the sign bug and are neither
    # worth restoring nor reconstructible after the fact (subsequent
    # transactions mutate balance_cents in place). Downgrade intentionally
    # leaves the recomputed values as-is.
    pass
