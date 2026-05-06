"""Multi-tenancy isolation integration tests — Phase 11 (MUL-03, MUL-04).

GREEN phase (Plan 11-07): real assertions backed by the two_tenants fixture
seeded in tests/conftest.py and the user_id-scoped service layer (Plans
11-05/06). Each test sets the RLS GUC via set_tenant_scope() before issuing
queries.

Tests:
  1. test_user_a_does_not_see_user_b_categories
  2. test_user_a_cannot_get_user_b_category_by_id
  3. test_user_a_cannot_get_user_b_subscription_by_id
  4. test_user_a_cannot_see_user_b_planned_transactions
  5. test_user_a_cannot_see_user_b_actual_transactions
  6. test_unique_category_name_scoped_per_user
"""
from __future__ import annotations

import pytest
from sqlalchemy import select, text

from app.db.models import Category, Subscription
from app.db.session import set_tenant_scope


pytestmark = pytest.mark.asyncio


async def test_user_a_does_not_see_user_b_categories(two_tenants, db_session):
    """MUL-03: list_categories для user_a не должен возвращать категории user_b."""
    user_a = two_tenants["user_a"]
    user_b = two_tenants["user_b"]

    # Set tenant scope для user_a (defense-in-depth: RLS).
    await set_tenant_scope(db_session, user_a["id"])

    from app.services.categories import list_categories

    cats = await list_categories(db_session, user_id=user_a["id"])
    cat_ids = [c.id for c in cats]

    # Должны быть только user_a категории
    assert set(cat_ids) == set(user_a["category_ids"]), (
        f"user_a sees {cat_ids}, expected only {user_a['category_ids']}; "
        f"user_b's categories are {user_b['category_ids']}"
    )
    for cat_b_id in user_b["category_ids"]:
        assert cat_b_id not in cat_ids


async def test_user_a_cannot_get_user_b_category_by_id(two_tenants, db_session):
    """MUL-03: прямой get_or_404 user_a с category_id user_b → CategoryNotFoundError."""
    from app.services.categories import get_or_404, CategoryNotFoundError

    user_a = two_tenants["user_a"]
    user_b = two_tenants["user_b"]

    await set_tenant_scope(db_session, user_a["id"])

    foreign_cat_id = user_b["category_ids"][0]
    with pytest.raises(CategoryNotFoundError):
        await get_or_404(db_session, foreign_cat_id, user_id=user_a["id"])


async def test_user_a_cannot_get_user_b_subscription_by_id(
    two_tenants, db_session, _rls_test_role
):
    """MUL-03: subscription с чужим user_id невидим (RLS + app-side filter).

    Использует не-superuser ролью _rls_test_role, чтобы FORCE ROW LEVEL
    SECURITY реально применялась (см. test_rls_policy.py docstring caveat).
    """
    user_a = two_tenants["user_a"]
    user_b = two_tenants["user_b"]

    # Закрыть seed-trx и переключиться на не-superuser роль.
    await db_session.commit()
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
    await set_tenant_scope(db_session, user_a["id"])

    # Direct ORM query (test isolation at the lowest layer — RLS).
    result = await db_session.execute(
        select(Subscription).where(Subscription.id == user_b["sub_id"])
    )
    sub = result.scalar_one_or_none()
    # RLS должен блокировать row → None.
    assert sub is None, (
        f"Expected None (RLS blocked) but got Subscription for "
        f"user_b sub_id={user_b['sub_id']}"
    )


async def test_user_a_cannot_see_user_b_planned_transactions(
    two_tenants, db_session, _rls_test_role
):
    """MUL-03: select(PlannedTransaction) под user_a scope не видит rows user_b.

    Note: two_tenants fixture не seed'ит planned транзакции. Тест проверяет
    что под user_a scope, какие бы rows ни существовали (включая seed
    OWNER'а из dev_seed), все .user_id == user_a.id.
    """
    from app.db.models import PlannedTransaction

    user_a = two_tenants["user_a"]
    await db_session.commit()
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
    await set_tenant_scope(db_session, user_a["id"])

    result = await db_session.execute(select(PlannedTransaction))
    rows = result.scalars().all()
    for row in rows:
        assert row.user_id == user_a["id"], (
            f"Cross-tenant leak: row.user_id={row.user_id}, expected {user_a['id']}"
        )


async def test_user_a_cannot_see_user_b_actual_transactions(
    two_tenants, db_session, _rls_test_role
):
    """MUL-03: то же для actual_transaction."""
    from app.db.models import ActualTransaction

    user_a = two_tenants["user_a"]
    await db_session.commit()
    await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
    await set_tenant_scope(db_session, user_a["id"])

    result = await db_session.execute(select(ActualTransaction))
    rows = result.scalars().all()
    for row in rows:
        assert row.user_id == user_a["id"], (
            f"Cross-tenant leak: row.user_id={row.user_id}, expected {user_a['id']}"
        )


async def test_unique_category_name_scoped_per_user(two_tenants, db_session):
    """MUL-04: оба tenant имеют категорию 'Продукты' (already seeded в fixture).

    Если бы существовал глобальный UNIQUE(name) — fixture упал бы на втором
    INSERT. Тест явно проверяет что обе строки присутствуют, а scoped
    UNIQUE(user_id, name) при этом сохраняется.
    """
    # Bypass RLS чтобы видеть оба row из admin-perspective.
    await db_session.execute(text("SET LOCAL row_security = off"))

    result = await db_session.execute(
        select(Category).where(Category.name == "Продукты")
    )
    cats = result.scalars().all()
    user_ids_with_produkty = {c.user_id for c in cats}
    # Минимум 2 разных user_id с категорией 'Продукты' — fixture добавил
    # двух тестовых юзеров; OWNER из dev_seed может или не может иметь её.
    assert len(user_ids_with_produkty) >= 2, (
        f"Ожидалось 2+ юзера с 'Продукты' (per-user scoped unique). "
        f"Получено: {user_ids_with_produkty}"
    )
    # И обоих наших test users эти категории есть.
    assert two_tenants["user_a"]["id"] in user_ids_with_produkty
    assert two_tenants["user_b"]["id"] in user_ids_with_produkty
