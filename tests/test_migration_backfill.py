"""Migration backfill integration test — Phase 11 (MUL-05).

RED phase (Plan 11-01): тест raise NotImplementedError. Заполнение в Plan 11-07.

Что проверяет:
  1. После alembic upgrade head все user_id колонки доменных таблиц
     НЕ NULL (миграция backfill'нула).
  2. Все user_id равны id у app_user строки с tg_user_id == OWNER_TG_ID
     (backfill через subquery работает).
  3. app_user.role существует и равен 'owner' для OWNER_TG_ID-юзера.
  4. Unique constraint category(user_id, name) существует, старый
     глобальный unique (если был) убран.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text


pytestmark = pytest.mark.asyncio


async def test_user_id_backfilled_to_owner(db_session):
    """MUL-05: после миграции все user_id == app_user.id WHERE tg_user_id = OWNER_TG_ID."""
    raise NotImplementedError(
        "Plan 11-07: для каждой из 9 таблиц SELECT count(*) WHERE user_id != "
        "(SELECT id FROM app_user WHERE tg_user_id = OWNER_TG_ID) — должно "
        "быть 0. Также SELECT count(*) WHERE user_id IS NULL — 0. "
        "Запускается на seed-БД где dev_seed создал OWNER + образцы данных."
    )


async def test_role_owner_assigned_to_owner_tg_id(db_session):
    """ROLE-01: app_user.role = 'owner' для существующего OWNER_TG_ID юзера."""
    raise NotImplementedError(
        "Plan 11-07: SELECT role FROM app_user WHERE tg_user_id = OWNER_TG_ID — "
        "ожидать строковое значение 'owner'."
    )


async def test_user_role_enum_type_exists(db_session):
    """ROLE-01: postgres enum user_role существует с тремя значениями."""
    raise NotImplementedError(
        "Plan 11-07: SELECT enumlabel FROM pg_enum e JOIN pg_type t ON "
        "e.enumtypid = t.oid WHERE t.typname = 'user_role' ORDER BY enumsortorder — "
        "ожидать ['owner', 'member', 'revoked']."
    )


async def test_category_unique_scoped_per_user(db_session):
    """MUL-04: unique constraint category(user_id, name) — old global unique (если был) удалён."""
    raise NotImplementedError(
        "Plan 11-07: SELECT con.conname FROM pg_constraint con "
        "JOIN pg_class cl ON con.conrelid = cl.oid WHERE cl.relname = 'category' "
        "AND con.contype = 'u' — ожидать имя содержащее 'user_id' (например "
        "'uq_category_user_id_name'). Старый uq_category_name (глобальный) "
        "не должен существовать (его в 0001 не было — но проверяем что "
        "новый scoped есть)."
    )
