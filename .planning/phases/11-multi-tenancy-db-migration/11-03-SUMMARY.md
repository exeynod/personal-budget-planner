---
phase: 11-multi-tenancy-db-migration
plan: 03
subsystem: orm-models
tags: [orm, models, multitenancy, role-enum, sqlalchemy]
requires:
  - alembic-revision: "0006_multitenancy_user_id_rls_role"
  - schema: "user_role enum + app_user.role + user_id BIGINT NOT NULL FK on 9 domain tables (already applied by Plan 11-02)"
provides:
  - orm-class: "UserRole(str, enum.Enum) with values owner/member/revoked"
  - orm-attr: "AppUser.role mapped to PgEnum(UserRole, name='user_role', create_type=False)"
  - orm-attr: "user_id: Mapped[int] BIGINT NOT NULL FK→app_user.id ON DELETE RESTRICT on 9 domain models"
  - orm-constraint: "uq_category_user_id_name (Category.__table_args__)"
  - orm-constraint: "uq_budget_period_user_id_period_start (BudgetPeriod.__table_args__)"
  - orm-constraint: "uq_subscription_user_id_name (Subscription.__table_args__)"
affects:
  - downstream Plan 11-04 (deps): can now resolve `Model.user_id` typed attr
  - downstream Plans 11-05 / 11-06 (services/routes refactor): typed `select(Model).where(Model.user_id == user_id)` available
  - downstream Plan 11-07 (verification): ORM matches DB schema after `alembic upgrade head`
tech-stack:
  added: []
  patterns:
    - "SQLAlchemy 2.x typed Mapped[int] columns with BigInteger + ForeignKey ondelete=RESTRICT"
    - "PgEnum (sqlalchemy.dialects.postgresql.ENUM) with create_type=False to reuse migration-created Postgres type"
    - "Scoped unique constraints in __table_args__ tuple for per-tenant uniqueness"
    - "Server-default + python-default duo on AppUser.role for both DDL and ORM-side default"
key-files:
  created: []
  modified:
    - app/db/models.py
decisions:
  - "Lowercase enum members (owner/member/revoked) — matches Postgres enum literals exactly (Plan 11-02 migration uses lowercase)"
  - "PgEnum(create_type=False) — type already created by 0006 migration; ORM must NOT attempt to recreate"
  - "user_id placed as last data column on each domain model (just before relationships) — keeps existing column order stable for Alembic autogen diff"
  - "BudgetPeriod.period_start: drop inline unique=True, add scoped UniqueConstraint in __table_args__ — mirrors migration drop+recreate"
  - "AppHealth not modified — system/heartbeat table, out of multi-tenant scope"
  - "No relationship back-refs from AppUser → domain models added — keep one-way (per planner discretion in execution_rules); can be added later if service layer needs them"
metrics:
  tasks_completed: 1
  files_created: 0
  files_modified: 1
  duration_min: ~3
  completed_date: "2026-05-06"
  commits:
    - "020fbe9: feat(11-03): add UserRole enum, AppUser.role, user_id FK on 9 domain ORM models"
---

# Phase 11 Plan 03: ORM Models Multi-Tenant Update Summary

Updated `app/db/models.py` to mirror the schema applied by Alembic revision `0006_multitenancy_user_id_rls_role` — added `UserRole` enum, `AppUser.role` column, `user_id` FK on 9 domain models, and three scoped unique constraints — so ORM mappings match DB shape exactly.

## What was built

**Single file modified:** `app/db/models.py` (+80 / -2 lines).

### 12 changes applied

| # | Change | Target | Effect |
|---|--------|--------|--------|
| 1 | Module docstring | `app/db/models.py` header | Replaced `Single-tenant MVP: NO user_id FK on any table.` with multi-tenant Phase 11 note + RLS policies pointer |
| 2 | New enum class | After `class SubCycle(str, enum.Enum)` | Added `UserRole(str, enum.Enum)` with three lowercase values: `owner`, `member`, `revoked` (mirrors Postgres enum from migration) |
| 3 | New column | `AppUser` | Added `role: Mapped[UserRole]` mapped to `PgEnum(UserRole, name='user_role', create_type=False)`, `nullable=False`, `server_default='member'`, `default=UserRole.member` |
| 4 | user_id + scoped unique | `Category` | Added `user_id` Mapped column + new `__table_args__ = (UniqueConstraint('user_id', 'name', name='uq_category_user_id_name'),)` |
| 5 | period_start unique → scoped + user_id | `BudgetPeriod` | Removed `unique=True` from `period_start` column; added `user_id` Mapped column; added `__table_args__ = (UniqueConstraint('user_id', 'period_start', name='uq_budget_period_user_id_period_start'),)` |
| 6 | user_id | `PlanTemplateItem` | Added `user_id` Mapped column (no scoped unique — not in CONTEXT) |
| 7 | user_id + extend __table_args__ | `Subscription` | Added `user_id` Mapped column; extended existing `__table_args__` with `UniqueConstraint('user_id', 'name', name='uq_subscription_user_id_name')` (kept existing `Index('ix_subscription_active_charge', ...)`) |
| 8 | user_id | `PlannedTransaction` | Added `user_id` Mapped column (existing `__table_args__` with `ix_planned_period_kind` and `uq_planned_sub_charge_date` left untouched) |
| 9 | user_id | `ActualTransaction` | Added `user_id` Mapped column (existing `__table_args__` with `ix_actual_period_kind` and `ix_actual_category_date` left untouched) |
| 10 | user_id | `AiConversation` | Added `user_id` Mapped column |
| 11 | user_id | `AiMessage` | Added `user_id` Mapped column (direct FK for query simplicity, not via conversation join) |
| 12 | user_id | `CategoryEmbedding` | Added `user_id` Mapped column (separate FK on app_user, distinct from existing CASCADE FK on category) |

### Pattern used for every user_id column

```python
user_id: Mapped[int] = mapped_column(
    BigInteger,
    ForeignKey("app_user.id", ondelete="RESTRICT"),
    nullable=False,
)
```

### Pattern used for AppUser.role

```python
role: Mapped[UserRole] = mapped_column(
    PgEnum(UserRole, name="user_role", create_type=False),
    nullable=False,
    server_default="member",
    default=UserRole.member,
)
```

## What was NOT touched (preserved as-is)

- **`AppHealth`** — system table (worker heartbeat per D-12), out of multi-tenant scope (no `user_id` added).
- **Imports** — `BigInteger`, `ForeignKey`, `UniqueConstraint`, `Index`, `PgEnum`, `Mapped`, `mapped_column`, `enum` already imported; no new imports required.
- **Existing enums** — `CategoryKind`, `PeriodStatus`, `PlanSource`, `ActualSource`, `SubCycle` unchanged.
- **Relationship back-refs from AppUser** — none added (one-way is sufficient; planner discretion per execution_rules).
- **Migration file `0006_multitenancy_user_id_rls_role.py`** — read-only reference, not modified.
- **Service / route / dep layer** — out of scope (Plans 11-04, 11-05, 11-06).
- **Other __table_args__ pre-existing entries** — `ix_planned_period_kind`, `uq_planned_sub_charge_date`, `ix_actual_period_kind`, `ix_actual_category_date`, `ix_subscription_active_charge`, `ix_ai_message_conversation` — all preserved (existing entries appended to, never replaced).

## Constraint / type names — match migration exactly

| Migration name (0006) | ORM `__table_args__` name | Status |
|---|---|---|
| `uq_category_user_id_name` | `uq_category_user_id_name` | ✓ exact match |
| `uq_budget_period_user_id_period_start` | `uq_budget_period_user_id_period_start` | ✓ exact match |
| `uq_subscription_user_id_name` | `uq_subscription_user_id_name` | ✓ exact match |
| `user_role` (Postgres enum type) | `name='user_role'` in PgEnum | ✓ exact match |
| FKs `fk_<table>_user_id_app_user` | (unnamed in ORM — SQLAlchemy auto-derives) | OK — Alembic autogen will not regenerate FK because target+ondelete match |

Note on FK names: ORM `ForeignKey(...)` does not specify the FK constraint name, but the migration created named FKs `fk_<table>_user_id_app_user`. SQLAlchemy will not attempt to rename them at autogenerate time as long as the target table/column and `ondelete` match.

## Pointer for downstream plans

**Plan 11-04 (`get_current_user_id` dependency):** Service layer can now access `Model.user_id` as a typed `Mapped[int]` attribute. Use `select(Model).where(Model.user_id == user_id)` pattern with `user_id: int` resolved via the new `Depends(get_current_user_id)` dep.

**Plan 11-05 / 11-06 (service & route refactor):** Each `*.py` in `app/services/` accepts `user_id: int` parameter and adds `.where(Model.user_id == user_id)` to every `select(...)`. ORM mapping now supports this without `getattr`-style attribute resolution.

**Plan 11-07 (verification):** Run `alembic upgrade head` on a fresh DB → `alembic check` (or autogenerate with no diff) confirms ORM matches DDL. The 22 `must_haves.truths` from this plan + 9 RLS policies + 9 FKs + 3 scoped uniques are all reproducible from `MetaData.create_all()` minus RLS (which alembic doesn't autogen).

## Threat model coverage

| Threat ID | Mitigated? | Where |
|-----------|-----------|-------|
| T-11-03-01 (ORM forgets user_id → IntegrityError) | Yes | All 9 domain classes verified via `getattr(cls, 'user_id')` and `inspect(cls).columns` |
| T-11-03-02 (Wrong FK ondelete CASCADE) | Yes | All 9 FKs verified with `ondelete='RESTRICT'` programmatically; grep count = 9 |
| T-11-03-03 (UserRole values mismatch) | Yes | `UserRole` members are ASCII literals `owner`/`member`/`revoked`, identical to migration `CREATE TYPE user_role AS ENUM ('owner', 'member', 'revoked')` |
| T-11-03-04 (Old period_start unique persists in ORM) | Yes | `unique=True` removed from `period_start` column inline; new scoped UniqueConstraint added in `__table_args__`; grep `period_start.*unique=True` returns 0 |
| T-11-03-05 (PgEnum tries to recreate user_role type) | Yes | `PgEnum(UserRole, name='user_role', create_type=False)` — verified via `role_col.type.create_type == False` |

## Deviations from Plan

None — plan executed exactly as written. No automatic Rule-1/Rule-2/Rule-3 fixes triggered. No checkpoints. No auth gates. No architectural decisions.

Note on plan inconsistency (does NOT affect execution): The `<execution_rules>` section's verification snippet writes `print(UserRole.OWNER)` (uppercase), while the migration and the plan body both prescribe lowercase enum members (`owner`/`member`/`revoked`) — the lowercase form is correct because Postgres enum literals are case-sensitive and the migration uses `'owner'`, `'member'`, `'revoked'`. The implementation uses lowercase `UserRole.owner` (consistent with migration). Per `<task><action>` Изменение 2 verbatim text and Изменение 3 `default=UserRole.member`, lowercase is the prescribed form.

## Verification status

All checks pass:

- `python3 -m py_compile app/db/models.py` — exit 0
- `python3 -c "import ast; ast.parse(open('app/db/models.py').read())"` — exit 0
- `python3 -c "from app.db import models"` — exit 0 (full import + all classes resolve)
- `python3 -c "from app.db.models import UserRole; assert UserRole.owner.value == 'owner'"` — exit 0
- `from sqlalchemy import inspect; cols=set(c.name for c in inspect(Category).columns); assert 'user_id' in cols` — exit 0
- All 9 domain models programmatically verified to have:
  - `user_id` Mapped column (BigInteger, NOT NULL, FK→app_user.id, ondelete=RESTRICT)
- `AppUser.role` PgEnum verified: `name='user_role'`, `create_type=False`, `enums=['owner','member','revoked']`, `server_default='member'`
- 3 scoped unique constraints verified by name in `cls.__table__.constraints`
- `grep -c "ondelete=.RESTRICT" app/db/models.py` = 9 (matches 9 domain tables)
- `grep -c "Single-tenant MVP: NO user_id"` = 0 (old comment removed)
- `grep "period_start.*unique=True"` = 0 matches (inline unique removed)
- `grep -c "class UserRole"` = 1
- 9 domain class definitions found via regex
- `AppHealth` verified to not have `user_id` (system table, correctly untouched)

### Frontmatter `must_haves.truths` audit (all 7 verified)

1. ✓ Все 9 ORM моделей доменных таблиц имеют `Mapped[int] user_id` колонку с `ForeignKey('app_user.id', ondelete='RESTRICT')`, `nullable=False` — verified programmatically.
2. ✓ AppUser ORM модель имеет `Mapped[UserRole] role` колонку с `PgEnum(UserRole, name='user_role', create_type=False)`, `nullable=False`, `default=UserRole.member` — verified.
3. ✓ Класс `UserRole(str, enum.Enum)` добавлен в models.py с тремя значениями `owner`/`member`/`revoked` — verified.
4. ✓ Существующие unique constraints в `__table_args__` обновлены: `budget_period` получает `UniqueConstraint('user_id', 'period_start', name='uq_budget_period_user_id_period_start')`; `category` получает `UniqueConstraint('user_id', 'name', name='uq_category_user_id_name')`; `subscription` получает `UniqueConstraint('user_id', 'name', name='uq_subscription_user_id_name')` — verified all 3 by name in `cls.__table__.constraints`.
5. ✓ Старый комментарий в docstring `Single-tenant MVP: NO user_id FK on any table` удалён, заменён на multi-tenant Phase 11 note — verified `grep -c` = 0 for old, replacement text present.
6. ✓ `from typing import Optional` не сломан; новые импорты не требовались (BigInteger, ForeignKey, UniqueConstraint, Index, PgEnum, Mapped, mapped_column уже импортированы) — verified by successful import.
7. ✓ Файл парсится как валидный Python — `py_compile` + `ast.parse` + actual runtime import all pass.

## Self-Check: PASSED

- [x] `app/db/models.py` modified (FOUND, status `M` in git).
- [x] Commit `020fbe9` exists (FOUND in `git log`): `feat(11-03): add UserRole enum, AppUser.role, user_id FK on 9 domain ORM models`.
- [x] All `<acceptance_criteria>` items pass (programmatically verified above).
- [x] All `<verification>` 5-step suite passes.
- [x] All 7 `must_haves.truths` verified.
- [x] Threat model T-11-03-01..05 — all mitigations in place.
