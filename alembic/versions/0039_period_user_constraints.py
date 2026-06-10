"""schema: invariant constraints on budget_period + app_user (Этап 2 WI-1)

Revision ID: 0039_period_user_constraints
Revises: 0038_recompute_balances
Create Date: 2026-06-10

WHY:
    Этап 2 (ревью 2026-06): защитить доменные инварианты на уровне схемы, а не
    только в сервис-слое. Три констрейнта:

      1a. Partial UNIQUE ``uq_budget_period_one_active`` — не более одного
          active-периода на пользователя. Инвариант close_period (старый→closed,
          новый→active) уже гарантирует ≤1, но без DB-констрейнта гонка/баг в
          сервис-слое может породить два active-периода (и расчёты дельты тогда
          молча выберут «не тот» период).
      1b. CHECK ``ck_budget_period_end_after_start`` — period_end >= period_start.
      1c. CHECK ``ck_app_user_cycle_start_day`` — cycle_start_day BETWEEN 1 AND 28
          (period_for требует день ≤ 28, чтобы все месяцы имели такой день).

GUARDS (прод-данные реальны — миграция, падающая на проде, ломает деплой):
    Перед созданием каждого констрейнта миграция проверяет, что существующие
    данные ему удовлетворяют, и падает с понятным RuntimeError (перечисляя
    нарушающие user_id/period_id), а не молча роняет CREATE INDEX/ALTER TABLE.

DOWNGRADE:
    Симметричный DROP INDEX / DROP CONSTRAINT (IF EXISTS). GRANT'ы не нужны —
    индексы/констрейнты наследуют права таблицы; новых таблиц не вводится.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0039_period_user_constraints"
down_revision = "0038_recompute_balances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- Guard 1a: no user already has >1 active period -------------------
    dup_active = conn.exec_driver_sql(
        "SELECT user_id, count(*) AS n FROM budget_period "
        "WHERE status = 'active' GROUP BY user_id HAVING count(*) > 1"
    ).fetchall()
    if dup_active:
        offenders = ", ".join(f"user_id={r[0]} (n={r[1]})" for r in dup_active)
        raise RuntimeError(
            "0039 guard: cannot add uq_budget_period_one_active — these users "
            f"already have >1 active budget_period: {offenders}. Resolve the "
            "duplicate active periods (keep one active, set others to closed) "
            "before re-running this migration."
        )

    # --- Guard 1b: no period with end < start -----------------------------
    bad_range = conn.exec_driver_sql(
        "SELECT id, user_id FROM budget_period WHERE period_end < period_start"
    ).fetchall()
    if bad_range:
        offenders = ", ".join(f"period_id={r[0]} (user_id={r[1]})" for r in bad_range)
        raise RuntimeError(
            "0039 guard: cannot add ck_budget_period_end_after_start — these "
            f"periods have period_end < period_start: {offenders}."
        )

    # --- Guard 1c: no user with cycle_start_day out of [1, 28] ------------
    bad_day = conn.exec_driver_sql(
        "SELECT id, cycle_start_day FROM app_user "
        "WHERE cycle_start_day < 1 OR cycle_start_day > 28"
    ).fetchall()
    if bad_day:
        offenders = ", ".join(f"app_user_id={r[0]} (day={r[1]})" for r in bad_day)
        raise RuntimeError(
            "0039 guard: cannot add ck_app_user_cycle_start_day — these users "
            f"have cycle_start_day outside [1, 28]: {offenders}."
        )

    # --- 1a. Partial UNIQUE: one active period per user -------------------
    op.create_index(
        "uq_budget_period_one_active",
        "budget_period",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    # --- 1b. CHECK: period_end >= period_start ----------------------------
    op.create_check_constraint(
        "ck_budget_period_end_after_start",
        "budget_period",
        "period_end >= period_start",
    )

    # --- 1c. CHECK: cycle_start_day BETWEEN 1 AND 28 ----------------------
    op.create_check_constraint(
        "ck_app_user_cycle_start_day",
        "app_user",
        "cycle_start_day BETWEEN 1 AND 28",
    )


def downgrade() -> None:
    op.drop_constraint("ck_app_user_cycle_start_day", "app_user", type_="check")
    op.drop_constraint(
        "ck_budget_period_end_after_start", "budget_period", type_="check"
    )
    op.drop_index("uq_budget_period_one_active", table_name="budget_period")
