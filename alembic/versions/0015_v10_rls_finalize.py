"""v1.0 RLS on goal/savings_config + composite FK on actual_transaction.parent_txn_id (Phase 22 BE-16)

Revision ID: 0015_v10_rls_finalize
Revises: 0014_v10_actual_goal_savings
Create Date: 2026-05-10

Phase 22 atomic migration #4 of 4 — финальный schema-closer (CONTEXT D-01).

Что делает upgrade:
  1. CREATE POLICY tenant_isolation_goal ON goal — RLS-policy для новой
     таблицы goal (BE-11 / T-22-04-01 mitigation). ENABLE/FORCE ROW LEVEL
     SECURITY уже выставлены в migration 0014 — здесь добавляем ТОЛЬКО
     policy. Используется verbatim паттерн из 0006_multitenancy.py с
     `coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)`
     defense — без выставленного GUC query возвращает 0 rows вместо
     InvalidTextRepresentationError.
  2. CREATE POLICY tenant_isolation_savings_config ON savings_config —
     идентично goal (BE-08 / T-22-04-02 mitigation).
  3. DROP simple FK fk_actual_parent_txn (созданный в 0014) и ADD CONSTRAINT
     fk_actual_parent_txn_composite (parent_txn_id, user_id) → (id, user_id)
     для cross-tenant защиты (BE-16 / T-22-04-03). Composite FK гарантирует,
     что DB отвергает попытку привязать child txn к parent другого пользователя
     даже если app-layer compromised.
  4. ADD CONSTRAINT ux_actual_id_user UNIQUE (id, user_id) на
     actual_transaction — required, потому что Postgres composite FK обязан
     ссылаться на UNIQUE/PK target. id уже PK сам по себе, но composite FK
     требует именно UNIQUE на пару колонок.

Naming convention: `tenant_isolation_<table>` (CONTEXT §Area 4 D-08) —
distinct от legacy `<table>_user_isolation` из 0006_multitenancy.py.
Новые таблицы Phase 22 (account/goal/savings_config) идут под новое имя;
account-policy создан в 0012_v10_user_account.py с тем же naming.

Composite FK через raw SQL (op.execute), потому что
op.create_foreign_key() не поддерживает composite FK на non-PK target —
паттерн идентичен 0013_v10_category_ext.py для category.parent_id.

Downgrade — симметричный, с idempotent `DROP POLICY IF EXISTS` /
`DROP CONSTRAINT IF EXISTS` для безопасного rollback в любом env.
Восстанавливает простой self-FK fk_actual_parent_txn для совместимости
с 0014.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa  # noqa: F401


revision = "0015_v10_rls_finalize"
down_revision = "0014_v10_actual_goal_savings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── Step 1: RLS на goal — ENABLE + FORCE + CREATE POLICY ───
    # ENABLE/FORCE ROW LEVEL SECURITY уже выставлены в 0014 при
    # CREATE TABLE goal — повторный ALTER ... ENABLE/FORCE идемпотентен
    # в PostgreSQL (no-op если уже set). Дублируем здесь как defensive
    # paranoia — если кто-то ручками отключит RLS между миграциями, эта
    # миграция повторно включит. (CONTEXT D-08 paranoid-pattern.)
    op.execute("ALTER TABLE goal ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE goal FORCE ROW LEVEL SECURITY")
    # `coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)`:
    #   - current_setting(..., true) → '' если GUC не set (вместо ошибки)
    #   - NULLIF('', '') → NULL
    #   - coalesce(NULL, -1)::bigint → -1 (sentinel, не матчит ни одну строку)
    #   - без NULLIF cast '' к bigint падает с InvalidTextRepresentationError
    # FORCE ROW LEVEL SECURITY → policy применяется даже к table owner.
    # (defense-in-depth: app-side filter + RLS backstop.)
    op.execute(
        "CREATE POLICY tenant_isolation_goal ON goal "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
        "WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )

    # ─── Step 2: RLS на savings_config — ENABLE + FORCE + CREATE POLICY ───
    # Идентичный паттерн. ENABLE/FORCE идемпотентны (уже выставлены в 0014).
    op.execute("ALTER TABLE savings_config ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE savings_config FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation_savings_config ON savings_config "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
        "WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )

    # ─── Step 2b: idempotent GRANTs на goal/savings_config к budget_app ───
    # GRANTs уже выполнены в 0014 (lines 225-226, 269-270) — здесь повторяем
    # для defense-in-depth: если в env кто-то revoke'нул privileges между
    # миграциями, эта миграция их восстановит. PostgreSQL GRANT
    # идемпотентен (no-op если уже granted).
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE goal TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE goal_id_seq TO budget_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE savings_config TO budget_app"
    )

    # ─── Step 3: drop simple FK fk_actual_parent_txn (создан в 0014) ───
    # Composite FK на (parent_txn_id, user_id) → (id, user_id) заменит
    # её ниже в Step 5. Сначала drop simple FK, потом ADD composite UNIQUE,
    # потом ADD composite FK — порядок важен (composite FK ищет UNIQUE
    # target, которого до Step 4 ещё нет).
    op.drop_constraint(
        "fk_actual_parent_txn",
        "actual_transaction",
        type_="foreignkey",
    )

    # ─── Step 4: composite UNIQUE на (id, user_id) — target для composite FK ───
    # Postgres composite FK обязан ссылаться на UNIQUE/PK target. id уже PK
    # сам по себе, но composite FK требует именно UNIQUE на пару колонок.
    # Паттерн идентичен ux_category_id_user из 0013_v10_category_ext.py.
    op.create_unique_constraint(
        "ux_actual_id_user",
        "actual_transaction",
        ["id", "user_id"],
    )

    # ─── Step 5: composite FK через raw SQL (op.create_foreign_key
    # не поддерживает composite FK на non-PK target) ───
    # ON DELETE CASCADE: parent expense удалён → roundup child удаляется
    # автоматически (DATA-MODEL §8). user_id-пара гарантирует, что parent
    # и child принадлежат одному пользователю (BE-16 / T-22-04-03).
    op.execute(
        "ALTER TABLE actual_transaction "
        "ADD CONSTRAINT fk_actual_parent_txn_composite "
        "FOREIGN KEY (parent_txn_id, user_id) "
        "REFERENCES actual_transaction (id, user_id) "
        "ON DELETE CASCADE"
    )


def downgrade() -> None:
    """Symmetric downgrade с idempotent DROP guards.

    Восстанавливает:
      - simple FK fk_actual_parent_txn (как в 0014)
      - drop composite FK + composite unique
      - drop policies на goal/savings_config (RLS остаётся ENABLE — это
        responsibility 0014's downgrade).
    """
    # ─── Step 2b reverse: REVOKE grants на goal/savings_config ───
    # Симметрично GRANT в upgrade. Безопасно: 0014's downgrade всё равно
    # дропает таблицы целиком — privileges испаряются вместе с tables.
    # REVOKE здесь для документации intent + clean rollback на goal still
    # existing (если кто-то вручную остановил downgrade на промежутке).
    op.execute(
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE savings_config FROM budget_app"
    )
    op.execute(
        "REVOKE USAGE, SELECT ON SEQUENCE goal_id_seq FROM budget_app"
    )
    op.execute(
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE goal FROM budget_app"
    )

    # ─── Step 5 reverse: drop composite FK ───
    op.execute(
        "ALTER TABLE actual_transaction "
        "DROP CONSTRAINT IF EXISTS fk_actual_parent_txn_composite"
    )

    # ─── Step 4 reverse: drop composite UNIQUE ───
    op.drop_constraint(
        "ux_actual_id_user",
        "actual_transaction",
        type_="unique",
    )

    # ─── Step 3 reverse: восстановить simple FK fk_actual_parent_txn ───
    # Имя/семантика идентичны 0014 — для clean roll-back на 0014.
    op.create_foreign_key(
        "fk_actual_parent_txn",
        "actual_transaction",
        "actual_transaction",
        ["parent_txn_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ─── Step 2 reverse: drop savings_config policy + NO FORCE + DISABLE ───
    # Симметрия upgrade: после drop policy выключаем FORCE и DISABLE RLS.
    # 0014's downgrade повторит DISABLE — это идемпотентно в PG.
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_savings_config ON savings_config"
    )
    op.execute("ALTER TABLE savings_config NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE savings_config DISABLE ROW LEVEL SECURITY")

    # ─── Step 1 reverse: drop goal policy + NO FORCE + DISABLE ───
    op.execute("DROP POLICY IF EXISTS tenant_isolation_goal ON goal")
    op.execute("ALTER TABLE goal NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE goal DISABLE ROW LEVEL SECURITY")
