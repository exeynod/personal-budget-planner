"""Performance: composite + partial indexes matching real tenant predicates (F1).

The only tenant index added in 0006 was single-column ``ix_<table>_user_id``.
Every hot query, however, filters on a *composite* predicate — (user_id,
period_id, kind), (user_id, tx_date), (user_id, status, period_start),
(user_id, period_start, period_end) — so Postgres could only use the leading
``user_id`` column of the single-column index and then had to scan / filter all
of that user's rows for the remaining predicates. For a single-tenant-heavy
owner that is effectively a full table scan per request.

This migration adds 6 indexes whose column order matches the actual WHERE /
ORDER BY shapes (confirmed by reading the service layer):

* ``ix_actual_user_period_kind`` ON actual_transaction(user_id, period_id, kind)
    → compute_balance (services/actual.py ~466-478) groups by (category_id,
      kind) filtered on (user_id, period_id, kind IN (...)); analytics trend /
      top / cashflow filter on (user_id, period_id, kind).
* ``ix_actual_user_txdate`` ON actual_transaction(user_id, tx_date)
    → actuals_for_today + _get_trend_daily filter (user_id, tx_date).
* ``ix_period_user_status_start`` ON budget_period(user_id, status, period_start DESC)
    → get_current_active_period / _get_forecast_active / _get_cashflow filter
      (user_id, status) ORDER BY period_start DESC.
* ``ix_period_user_start_end`` ON budget_period(user_id, period_start, period_end)
    → _resolve_period_for_date (services/actual.py ~159-168) does a range
      lookup (user_id, period_start <= d, period_end >= d) ORDER BY
      period_start DESC; list_all_periods orders by (user_id, period_start).
* ``ix_planned_user_period_kind`` ON planned_transaction(user_id, period_id, kind)
    → analytics get_top_overspend / get_top_categories / _get_forecast_active
      filter (user_id, period_id, kind).
* ``ix_category_user_active`` ON category(user_id) WHERE NOT is_archived (partial)
    → the ubiquitous "active categories for this user" read (compute_balance
      cats_q, find_categories_by_query, categories list) filters
      (user_id, is_archived = false).

The existing single-column ``ix_<table>_user_id`` indexes are intentionally
KEPT — they are tiny, still serve plain user_id-only lookups (e.g. RLS-only
joins, cascade lookups), and dropping them carries no measurable benefit while
risking a plan regression for queries we did not audit. Conservative by design.

Expected plan improvement: the planner switches from
``Index Scan using ix_<t>_user_id`` + post-filter (reads every user row) to an
``Index Scan`` / ``Index Only Scan`` that satisfies the full composite predicate
in the index, eliminating the per-row filter and the sort for the period
ORDER BY clauses.

Downgrade drops only the 6 indexes added here (the single-column user_id
indexes from 0006 remain — they are owned by 0006's downgrade).
"""

from alembic import op

revision = "0027_perf_composite_indexes"
down_revision = "0026_ai_usage_cost_cents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_actual_user_period_kind",
        "actual_transaction",
        ["user_id", "period_id", "kind"],
    )
    op.create_index(
        "ix_actual_user_txdate",
        "actual_transaction",
        ["user_id", "tx_date"],
    )
    # period_start DESC matches the ORDER BY period_start.desc() in
    # get_current_active_period / _resolve_period_for_date so the index can
    # serve the ordering without a Sort node.
    op.create_index(
        "ix_period_user_status_start",
        "budget_period",
        ["user_id", "status", "period_start"],
        postgresql_ops={"period_start": "DESC"},
    )
    op.create_index(
        "ix_period_user_start_end",
        "budget_period",
        ["user_id", "period_start", "period_end"],
    )
    op.create_index(
        "ix_planned_user_period_kind",
        "planned_transaction",
        ["user_id", "period_id", "kind"],
    )
    # Partial index — only active (non-archived) categories, which is what
    # every domain read filters on. Smaller + always applicable to the hot path.
    op.create_index(
        "ix_category_user_active",
        "category",
        ["user_id"],
        postgresql_where="NOT is_archived",
    )


def downgrade() -> None:
    op.drop_index("ix_category_user_active", table_name="category")
    op.drop_index("ix_planned_user_period_kind", table_name="planned_transaction")
    op.drop_index("ix_period_user_start_end", table_name="budget_period")
    op.drop_index("ix_period_user_status_start", table_name="budget_period")
    op.drop_index("ix_actual_user_txdate", table_name="actual_transaction")
    op.drop_index("ix_actual_user_period_kind", table_name="actual_transaction")
