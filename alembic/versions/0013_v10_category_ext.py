"""v1.0 category extension + composite FK + drop plan_template_item (Phase 22 BE-04, BE-05, BE-16)

Revision ID: 0013_v10_category_ext
Revises: 0012_v10_user_account
Create Date: 2026-05-10

Phase 22 atomic migration #2 of 4 (CONTEXT D-01, D-02).

Adds:
  - category.plan_cents BIGINT NOT NULL DEFAULT 0      (BE-04, replaces PlanTemplateItem)
  - category.code VARCHAR(40) NOT NULL                  (BE-04, BE-05 — slug like 'food', 'cafe')
  - category.ord CHAR(2) NOT NULL                       (BE-04 — '01'..'99' display ordinal)
  - category.rollover VARCHAR(8) NOT NULL DEFAULT 'misc' (BE-04: 'misc' | 'savings')
  - category.paused BOOL NOT NULL DEFAULT false         (BE-04 — distinct from is_archived)
  - category.parent_id BIGINT NULL                      (BE-04 — R3 future subcategories)

Composite uniqueness + FK (BE-16):
  - UNIQUE(category.id, category.user_id) named ux_category_id_user — required so
    composite FK can target it (PG: composite FK must reference a unique/PK).
  - category.parent_id → (category.id, category.user_id) composite FK ON DELETE
    SET NULL (constraint name fk_category_parent_composite) — cross-tenant защита:
    нельзя сослаться parent_id на категорию другого tenant'а.

Drops PlanTemplateItem table entirely (CONTEXT D-02):
  - data backfill в Category.plan_cents from latest PlanTemplateItem per
    (user_id, category_id) выполняется до drop.

Backfill (CONTEXT §Area 1):
  - code = transliterate(lower(name)) с deterministic cyrillic→latin map
    + collision suffix '-2', '-3' per user_id
  - ord = lpad(sort_order::text, 2, '0')
  - rollover = 'misc' (server_default)
  - paused = is_archived
  - plan_cents = COALESCE((SELECT amount_cents FROM plan_template_item
    WHERE category_id = c.id AND user_id = c.user_id ORDER BY id DESC LIMIT 1), 0)

Note: CONTEXT D-04 — V0.x backward compat dropped. Legacy 14-cat seed gone;
backfill только касается existing rows, не trigger'ит future onboarding (handled
in plan 22.11 — system 'savings' Category seeding).

Downgrade is best-effort symmetric: re-creates plan_template_item table with
original schema + RLS policy (same as 0001+0006), drops new category columns,
composite FK and unique. Plan_template_item data is NOT restored (lost on drop).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0013_v10_category_ext"
down_revision = "0012_v10_user_account"
branch_labels = None
depends_on = None


# Best-effort cyrillic→latin transliteration map для backfill кодов категорий.
# Покрывает существующие seed-имена (Продукты, Кафе и рестораны, Транспорт, ...).
# CONTEXT §Area 1: collision handling = append '-2', '-3' suffix per user_id.
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _transliterate(name: str) -> str:
    """Lowercase + cyrillic→latin + replace non-alphanumerics with '_'.

    Collapse repeated underscores и strip leading/trailing.
    Если результат пустой — return 'cat' (защитный fallback).
    """
    out: list[str] = []
    for ch in name.lower():
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append("_")
    s = "".join(out)
    # Collapse repeated '_' и strip trailing
    while "__" in s:
        s = s.replace("__", "_")
    s = s.strip("_")
    return s or "cat"


def upgrade() -> None:
    # ─── Step 1: ADD COLUMN — 6 new fields на category ───
    # plan_cents — server_default '0' позволит существующим rows получить
    # ноль без upfront-backfill; затем пересчитаем из plan_template_item.
    op.add_column(
        "category",
        sa.Column("plan_cents", sa.BigInteger(), nullable=False, server_default="0"),
    )
    # code и ord initially NULLable — backfill ниже заполнит, после чего SET NOT NULL.
    op.add_column(
        "category",
        sa.Column("code", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "category",
        sa.Column("ord", sa.CHAR(length=2), nullable=True),
    )
    op.add_column(
        "category",
        sa.Column(
            "rollover",
            sa.String(length=8),
            nullable=False,
            server_default="misc",
        ),
    )
    op.add_column(
        "category",
        sa.Column(
            "paused",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "category",
        sa.Column("parent_id", sa.BigInteger(), nullable=True),
    )

    # CHECK constraints: rollover enum + ord 2-digit format (T-22-02-03/04 mitigation).
    op.create_check_constraint(
        "ck_category_rollover_enum",
        "category",
        "rollover IN ('misc', 'savings')",
    )
    op.create_check_constraint(
        "ck_category_ord_format",
        "category",
        "ord ~ '^[0-9]{2}$'",
    )

    # ─── Step 2: data backfill для существующих rows ───
    conn = op.get_bind()

    # 2a. ord = lpad(sort_order::text, 2, '0').
    # Используем least(sort_order, 99) clamp — sort_order INTEGER, теоретически
    # может быть >99; в реальной seed-data максимум '80'.
    conn.execute(
        sa.text(
            "UPDATE category SET ord = lpad(least(sort_order, 99)::text, 2, '0') "
            "WHERE ord IS NULL"
        )
    )

    # 2b. paused = is_archived (legacy archived → paused).
    conn.execute(
        sa.text(
            "UPDATE category SET paused = is_archived WHERE is_archived = true"
        )
    )

    # 2c. plan_cents from latest PlanTemplateItem per (user_id, category_id).
    # При отсутствии строки в plan_template_item — остаётся 0 (default).
    conn.execute(
        sa.text(
            "UPDATE category c SET plan_cents = COALESCE(("
            "  SELECT p.amount_cents FROM plan_template_item p "
            "  WHERE p.category_id = c.id AND p.user_id = c.user_id "
            "  ORDER BY p.id DESC LIMIT 1"
            "), 0)"
        )
    )

    # 2d. code = transliterate(name) с per-user collision handling.
    # Считываем все категории, генерим код в Python (чтобы deterministic
    # transliteration map применилась identically на любом окружении), при
    # коллизии (user_id, base_code) — добавляем '-2', '-3', ...
    rows = conn.execute(
        sa.text("SELECT id, user_id, name FROM category ORDER BY user_id, id")
    ).fetchall()
    seen: dict[tuple[int, str], int] = {}  # (user_id, base) → count
    for row in rows:
        base = _transliterate(row.name)
        key = (row.user_id, base)
        seen[key] = seen.get(key, 0) + 1
        code = base if seen[key] == 1 else f"{base}-{seen[key]}"
        # Truncate to 40 chars (same as column type) just in case.
        code = code[:40]
        conn.execute(
            sa.text("UPDATE category SET code = :code WHERE id = :id"),
            {"code": code, "id": row.id},
        )

    # ─── Step 3: SET NOT NULL для code/ord после backfill ───
    op.alter_column("category", "code", nullable=False)
    op.alter_column("category", "ord", nullable=False)

    # ─── Step 4: composite uniqueness + composite FK для cross-tenant защиты ───
    # 4a. UNIQUE(id, user_id) — Postgres-specific требование: composite FK
    # должен ссылаться на уникальный набор колонок (PK или UNIQUE constraint).
    # id уже PK, но для composite FK на (id, user_id) нужна именно пара.
    op.create_unique_constraint(
        "ux_category_id_user",
        "category",
        ["id", "user_id"],
    )

    # 4b. Composite FK self-reference. SQLAlchemy не позволяет напрямую через
    # ForeignKeyConstraint в op.create_foreign_key с self-reference + composite
    # на ту же таблицу при существовании rows — используем raw DDL.
    # ON DELETE SET NULL: при удалении parent — у child parent_id обнуляется.
    op.execute(
        "ALTER TABLE category "
        "ADD CONSTRAINT fk_category_parent_composite "
        "FOREIGN KEY (parent_id, user_id) "
        "REFERENCES category (id, user_id) "
        "ON DELETE SET NULL"
    )

    # ─── Step 5: partial unique index uq_category_user_code ───
    # Active categories must have unique code per user. Archived (is_archived=true)
    # excluded from uniqueness — same pattern as uq_category_user_id_name (0010).
    op.create_index(
        "uq_category_user_code",
        "category",
        ["user_id", "code"],
        unique=True,
        postgresql_where=sa.text("NOT is_archived"),
    )

    # ─── Step 6: drop plan_template_item table ───
    # CONTEXT D-02 — Category.plan_cents становится source of truth.
    # Сначала disable RLS + drop policy, потом drop FK + index, потом table.
    op.execute("DROP POLICY IF EXISTS plan_template_item_user_isolation ON plan_template_item")
    op.execute("ALTER TABLE plan_template_item NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE plan_template_item DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_plan_template_item_user_id", table_name="plan_template_item")
    op.drop_constraint(
        "fk_plan_template_item_user_id_app_user",
        "plan_template_item",
        type_="foreignkey",
    )
    op.drop_table("plan_template_item")


def downgrade() -> None:
    # Симметрия upgrade — reverse order. NOT lossless: plan_template_item
    # данные потеряны на drop, restore только структура.

    # ─── Step 6 reverse: re-create plan_template_item table ───
    op.create_table(
        "plan_template_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("category.id"),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("day_of_period", sa.Integer(), nullable=True),
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
    )
    op.create_foreign_key(
        "fk_plan_template_item_user_id_app_user",
        source_table="plan_template_item",
        referent_table="app_user",
        local_cols=["user_id"],
        remote_cols=["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_plan_template_item_user_id",
        "plan_template_item",
        ["user_id"],
    )
    # Re-enable RLS (matching 0006 pattern).
    op.execute("ALTER TABLE plan_template_item ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE plan_template_item FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY plan_template_item_user_isolation ON plan_template_item "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
        "WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )
    # Grant matches 0007 pattern (default privileges should auto-grant, but
    # explicit grant is idempotent and protects against manually-revoked envs).
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE plan_template_item TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE plan_template_item_id_seq TO budget_app")

    # ─── Step 5 reverse: drop partial unique index ───
    op.drop_index("uq_category_user_code", table_name="category")

    # ─── Step 4 reverse: drop composite FK + composite unique ───
    op.execute("ALTER TABLE category DROP CONSTRAINT IF EXISTS fk_category_parent_composite")
    op.drop_constraint("ux_category_id_user", "category", type_="unique")

    # ─── Step 1 reverse: drop check constraints + columns (reverse order) ───
    op.drop_constraint("ck_category_ord_format", "category", type_="check")
    op.drop_constraint("ck_category_rollover_enum", "category", type_="check")
    op.drop_column("category", "parent_id")
    op.drop_column("category", "paused")
    op.drop_column("category", "rollover")
    op.drop_column("category", "ord")
    op.drop_column("category", "code")
    op.drop_column("category", "plan_cents")
