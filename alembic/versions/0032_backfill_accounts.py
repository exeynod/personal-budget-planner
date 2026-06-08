"""data: backfill one primary account per user that has none

Revision ID: 0032_backfill_accounts
Revises: 0031_remove_savings_etc
Create Date: 2026-06-08

WHY (data migration — INSERT rows only, no DDL):
    The accounts feature (Phase 22, alembic 0012) shipped WITHOUT backfilling
    users that already existed at the time. Onboarding seeds a first Account for
    NEW users, but pre-existing users were left with zero ``account`` rows.

    Consequences in the Mini App:
      * "Остаток на счёте" (wallet) = Σ account.balance_cents → showed 0 because
        the user simply had no account rows to sum.
      * The add-expense flow requires a *primary* account to attach the txn to;
        with no account the user could not record a fact-spend at all.

    This migration seeds exactly ONE primary account for each user that has none,
    pre-filling balance_cents from that user's current period balance so the
    wallet shows a sensible non-zero number immediately.

BALANCE SOURCE (mirrors app.services.actual.compute_balance, "balance_now_cents"):
    balance_cents = starting_balance_cents
                    + Σ abs(amount) of income actuals
                    − Σ abs(amount) of expense actuals
    over the user's ACTIVE period (budget_period.status = 'active').
      * Uses func.abs() on amount_cents because v1.0 stores expense as NEGATIVE
        while legacy v0.x rows may hold POSITIVE — magnitudes only, sign applied
        explicitly here (income +, expense −) — identical to compute_balance.
      * Restricts actuals to kind IN ('expense','income') so savings
        deposit/roundup rows never leak into the wallet balance.
      * Fallback: no active period → latest period's starting_balance_cents by
        period_start DESC. No period at all → 0 (COALESCE).

    The whole thing is one INSERT ... SELECT with a NOT EXISTS guard, so it is
    idempotent: re-running creates no duplicates and never touches users that
    already own an account.

CONSTRAINTS SATISFIED (account table, alembic 0012):
      * bank = 'Основной'        → ck_account_bank_length (char_length 1..40) ✓
      * mask = NULL              → nullable column ✓
      * kind = 'card'            → enum account_kind ∈ {card, cash, savings} ✓
      * balance_cents (clamped 0..0 not needed; period balances are realistic but
        we still rely on the data being inside ck_account_balance_range
        ±100_000_000_000; compute_balance never produces anything outside it) ✓
      * "primary" = TRUE         → ix_account_user_primary_one (≤1 primary/user):
        guaranteed by NOT EXISTS (we only insert for users with ZERO accounts,
        so this is their only — and therefore only-primary — row) ✓
      * created_at = now()       → NOT NULL ✓
"""
from __future__ import annotations

from alembic import op

revision = "0032_backfill_accounts"
down_revision = "0031_remove_savings_etc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One INSERT...SELECT. For every app_user with NO account rows, insert a
    # single primary 'Основной' card account whose balance is the user's current
    # active-period balance (fallback: latest period start balance, else 0).
    #
    # NOTE on "primary": the DB column is the reserved word ``primary`` — it MUST
    # be double-quoted everywhere it appears.
    op.execute(
        """
        INSERT INTO account (user_id, bank, mask, kind, balance_cents, "primary", created_at)
        SELECT
            u.id,
            'Основной',
            NULL,
            'card'::account_kind,
            COALESCE(
                -- 1) current balance from the ACTIVE period
                (
                    SELECT bp.starting_balance_cents
                           + COALESCE((
                               SELECT SUM(ABS(at.amount_cents))
                               FROM actual_transaction at
                               WHERE at.user_id = u.id
                                 AND at.period_id = bp.id
                                 AND at.kind = 'income'
                           ), 0)
                           - COALESCE((
                               SELECT SUM(ABS(at.amount_cents))
                               FROM actual_transaction at
                               WHERE at.user_id = u.id
                                 AND at.period_id = bp.id
                                 AND at.kind = 'expense'
                           ), 0)
                    FROM budget_period bp
                    WHERE bp.user_id = u.id
                      AND bp.status = 'active'
                    ORDER BY bp.period_start DESC
                    LIMIT 1
                ),
                -- 2) fallback: latest period's starting balance
                (
                    SELECT bp2.starting_balance_cents
                    FROM budget_period bp2
                    WHERE bp2.user_id = u.id
                    ORDER BY bp2.period_start DESC
                    LIMIT 1
                ),
                -- 3) fallback: no period at all
                0
            ) AS balance_cents,
            TRUE,
            now()
        FROM app_user u
        WHERE NOT EXISTS (
            SELECT 1 FROM account a WHERE a.user_id = u.id
        )
        """
    )


def downgrade() -> None:
    # No-op by design. This is a DATA backfill: the seeded accounts become real
    # user accounts the moment the Mini App reads/edits them (balance is mutated
    # by add-txn, the account may be renamed, more accounts added, etc). There is
    # no safe, precise way to identify "rows this migration created" after the
    # fact — deleting by bank='Основной' would clobber legitimately user-owned
    # accounts. Backfilled data is intentionally NOT auto-removed on downgrade.
    pass
