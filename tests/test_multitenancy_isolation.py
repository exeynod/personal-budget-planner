"""Multi-tenancy isolation integration tests — Phase 11 (MUL-03).

RED phase (Plan 11-01): эти тесты намеренно падают с NotImplementedError;
они заполняются реальной логикой в Plan 11-07 после того как:
  - 11-02 применил миграцию с user_id + RLS
  - 11-03 обновил ORM модели
  - 11-04..06 добавил user_id фильтрацию во всех queries

Каждый тест проверяет одно из:
  1. test_user_a_does_not_see_user_b_categories — list_categories(user_a)
     НЕ возвращает категории user_b
  2. test_user_a_cannot_get_user_b_category_by_id — direct GET category/{B_id}
     от user_a возвращает 404, не 200 (или 403 — выбрать)
  3. test_user_a_cannot_get_user_b_subscription_by_id — то же для subscription
  4. test_user_a_cannot_see_user_b_planned_transactions — list query изолирован
  5. test_user_a_cannot_see_user_b_actual_transactions — list query изолирован
  6. test_unique_category_name_scoped_per_user — оба tenant могут иметь
     категорию "Продукты" одновременно (MUL-04)
"""
from __future__ import annotations

import pytest


pytestmark = pytest.mark.asyncio


async def test_user_a_does_not_see_user_b_categories(two_tenants, db_session):
    """MUL-03: list_categories для user_a не должен возвращать категории user_b."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: implement after services accept user_id parameter "
        "(11-05/11-06). Call list_categories(db_session, user_id=user_a_id) "
        "and assert no row has user_id == user_b_id."
    )


async def test_user_a_cannot_get_user_b_category_by_id(two_tenants, db_session):
    """MUL-03: прямой GET category by id user_b от имени user_a → 404."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: после refactor get_or_404(db, category_id, user_id) "
        "вызвать с user_id=user_a и category_id принадлежащим user_b — "
        "ожидать CategoryNotFoundError."
    )


async def test_user_a_cannot_get_user_b_subscription_by_id(two_tenants, db_session):
    """MUL-03: subscription lookup by id у чужого юзера → not found."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: вызвать get_subscription(db, sub_id, user_id) и "
        "ожидать SubscriptionNotFoundError или None."
    )


async def test_user_a_cannot_see_user_b_planned_transactions(two_tenants, db_session):
    """MUL-03: list_planned для user_a не возвращает строки user_b."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: list_planned_for_period(db, period_id, user_id=user_a) — "
        "assert все returned rows .user_id == user_a_id."
    )


async def test_user_a_cannot_see_user_b_actual_transactions(two_tenants, db_session):
    """MUL-03: list_actuals для user_a не возвращает строки user_b."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: list_actuals_for_period(db, period_id, user_id=user_a) — "
        "assert все returned rows .user_id == user_a_id."
    )


async def test_unique_category_name_scoped_per_user(two_tenants, db_session):
    """MUL-04: оба tenant могут иметь категорию 'Продукты' (unique scoped per user_id)."""
    user_a_id, user_b_id = two_tenants
    raise NotImplementedError(
        "Plan 11-07: создать Category(name='Продукты', user_id=user_a_id) и "
        "Category(name='Продукты', user_id=user_b_id) — обе должны успешно "
        "INSERT'нуться без IntegrityError."
    )
