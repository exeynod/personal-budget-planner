"""RED tests for Phase 14 MTONB-03 — backfill_user_embeddings helper.

Tests fail with ModuleNotFoundError until Plan 14-03 creates
app/services/ai_embedding_backfill.py:backfill_user_embeddings.

Helper contract (from Phase 14 CONTEXT D-14-03):
    backfill_user_embeddings(db: AsyncSession, *, user_id: int) -> int
    - Creates CategoryEmbedding rows for each active, non-embedded category.
    - Skips categories that already have an embedding row.
    - Skips archived categories (is_archived=True).
    - Returns count of embeddings created.
    - Swallows provider exceptions (RuntimeError, OpenAI errors) → returns 0.
    - Scoped to caller user_id (does not touch other tenants).
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from app.services.ai_embedding_backfill import backfill_user_embeddings  # RED: ModuleNotFoundError until 14-03


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def db_session():
    """Fresh AsyncSession with truncate before yield."""
    _require_db()

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"DB not reachable at {db_url}: {exc}")

    await truncate_db()

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        try:
            yield session
        finally:
            await session.rollback()

    await engine.dispose()


def _make_embed_service_mock(n_vectors: int = 3):
    """Return a MagicMock(spec=EmbeddingService) whose embed_texts AsyncMock
    returns deterministic vectors matching the requested count."""
    from app.ai.embedding_service import EmbeddingService, EMBEDDING_DIM

    svc = MagicMock(spec=EmbeddingService)

    async def _embed_texts(texts):
        return [[0.1 * i] * EMBEDDING_DIM for i in range(len(texts))]

    svc.embed_texts = AsyncMock(side_effect=_embed_texts)
    return svc


async def test_backfill_creates_embeddings_for_all_user_categories(db_session):
    """3 categories, no prior embeddings → helper returns 3, table has 3 rows."""
    from sqlalchemy import func, select
    from app.db.models import CategoryEmbedding, CategoryKind
    from tests.helpers.seed import seed_user, seed_category

    user = await seed_user(db_session, tg_user_id=9_400_000_001)
    c1 = await seed_category(db_session, user_id=user.id, name="Продукты", kind=CategoryKind.expense)
    c2 = await seed_category(db_session, user_id=user.id, name="Транспорт", kind=CategoryKind.expense)
    c3 = await seed_category(db_session, user_id=user.id, name="Развлечения", kind=CategoryKind.expense)
    await db_session.commit()

    mock_svc = _make_embed_service_mock(3)

    with patch("app.services.ai_embedding_backfill.get_embedding_service", return_value=mock_svc):
        count = await backfill_user_embeddings(db_session, user_id=user.id)

    assert count == 3, f"Expected 3 embeddings created, got {count}"

    row_count = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user.id)
        )
    ).scalar_one()
    assert row_count == 3, f"Expected 3 rows in category_embedding, got {row_count}"


async def test_backfill_skips_categories_with_existing_embedding(db_session):
    """2 categories, 1 already has embedding → helper returns 1, table has 2 rows."""
    from sqlalchemy import func, select
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.db.models import Category, CategoryEmbedding, CategoryKind
    from app.ai.embedding_service import EMBEDDING_DIM
    from tests.helpers.seed import seed_user, seed_category

    user = await seed_user(db_session, tg_user_id=9_400_000_002)
    c1 = await seed_category(db_session, user_id=user.id, name="Здоровье", kind=CategoryKind.expense)
    c2 = await seed_category(db_session, user_id=user.id, name="Спорт", kind=CategoryKind.expense)
    await db_session.flush()

    # Pre-insert embedding for c1
    existing_vector = [0.5] * EMBEDDING_DIM
    stmt = pg_insert(CategoryEmbedding).values(
        category_id=c1.id,
        user_id=user.id,
        embedding=existing_vector,
    ).on_conflict_do_nothing()
    await db_session.execute(stmt)
    await db_session.commit()

    mock_svc = _make_embed_service_mock(1)

    with patch("app.services.ai_embedding_backfill.get_embedding_service", return_value=mock_svc):
        count = await backfill_user_embeddings(db_session, user_id=user.id)

    assert count == 1, f"Expected 1 new embedding (skipped existing), got {count}"

    row_count = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user.id)
        )
    ).scalar_one()
    assert row_count == 2, f"Expected 2 total rows in category_embedding, got {row_count}"


async def test_backfill_skips_archived_categories(db_session):
    """2 categories, second is archived → helper returns 1 (only active)."""
    from sqlalchemy import func, select
    from app.db.models import CategoryEmbedding, CategoryKind
    from tests.helpers.seed import seed_user, seed_category

    user = await seed_user(db_session, tg_user_id=9_400_000_003)
    c1 = await seed_category(db_session, user_id=user.id, name="Кафе", kind=CategoryKind.expense, is_archived=False)
    c2 = await seed_category(db_session, user_id=user.id, name="Архив", kind=CategoryKind.expense, is_archived=True)
    await db_session.commit()

    mock_svc = _make_embed_service_mock(1)

    with patch("app.services.ai_embedding_backfill.get_embedding_service", return_value=mock_svc):
        count = await backfill_user_embeddings(db_session, user_id=user.id)

    assert count == 1, f"Expected 1 embedding (archived skipped), got {count}"

    row_count = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user.id)
        )
    ).scalar_one()
    assert row_count == 1, f"Expected 1 row in category_embedding, got {row_count}"


async def test_backfill_returns_zero_when_no_categories(db_session):
    """User with no categories → helper returns 0, no embedding rows."""
    from sqlalchemy import func, select
    from app.db.models import CategoryEmbedding
    from tests.helpers.seed import seed_user

    user = await seed_user(db_session, tg_user_id=9_400_000_004)
    await db_session.commit()

    mock_svc = _make_embed_service_mock(0)

    with patch("app.services.ai_embedding_backfill.get_embedding_service", return_value=mock_svc):
        count = await backfill_user_embeddings(db_session, user_id=user.id)

    assert count == 0, f"Expected 0 embeddings, got {count}"

    row_count = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user.id)
        )
    ).scalar_one()
    assert row_count == 0, f"Expected 0 rows in category_embedding, got {row_count}"


async def test_backfill_swallows_provider_exception_and_returns_zero(db_session):
    """When embed_texts raises RuntimeError → helper returns 0, no rows created.

    D-14-03 fallback: onboarding callers depend on graceful failure when
    OpenAI is unavailable; on-demand suggest used instead.
    """
    from sqlalchemy import func, select
    from app.db.models import CategoryEmbedding, CategoryKind
    from tests.helpers.seed import seed_user, seed_category

    user = await seed_user(db_session, tg_user_id=9_400_000_005)
    await seed_category(db_session, user_id=user.id, name="Зарплата", kind=CategoryKind.income)
    await db_session.commit()

    from app.ai.embedding_service import EmbeddingService
    mock_svc = MagicMock(spec=EmbeddingService)
    mock_svc.embed_texts = AsyncMock(side_effect=RuntimeError("OpenAI down"))

    with patch("app.services.ai_embedding_backfill.get_embedding_service", return_value=mock_svc):
        # Must NOT raise — graceful fallback
        count = await backfill_user_embeddings(db_session, user_id=user.id)

    assert count == 0, f"Expected 0 on provider exception, got {count}"

    row_count = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user.id)
        )
    ).scalar_one()
    assert row_count == 0, f"Expected 0 rows after provider exception, got {row_count}"


async def test_backfill_scopes_to_caller_user_id(db_session):
    """Two users (A, B) each with 1 category; backfill for A → 1 row for A, 0 for B."""
    from sqlalchemy import func, select
    from app.db.models import CategoryEmbedding, CategoryKind
    from tests.helpers.seed import seed_user, seed_category

    user_a = await seed_user(db_session, tg_user_id=9_400_000_006)
    user_b = await seed_user(db_session, tg_user_id=9_400_000_007)
    await seed_category(db_session, user_id=user_a.id, name="Подарки", kind=CategoryKind.expense)
    await seed_category(db_session, user_id=user_b.id, name="Подарки", kind=CategoryKind.expense)
    await db_session.commit()

    mock_svc = _make_embed_service_mock(1)

    with patch("app.services.ai_embedding_backfill.get_embedding_service", return_value=mock_svc):
        count = await backfill_user_embeddings(db_session, user_id=user_a.id)

    assert count == 1, f"Expected 1 embedding for user A, got {count}"

    count_a = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user_a.id)
        )
    ).scalar_one()
    assert count_a == 1, f"Expected 1 row for user A, got {count_a}"

    count_b = (
        await db_session.execute(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user_b.id)
        )
    ).scalar_one()
    assert count_b == 0, f"Expected 0 rows for user B (not scoped), got {count_b}"
