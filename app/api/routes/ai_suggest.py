"""Route GET /ai/suggest-category — предложение категории по описанию (AICAT-03).

Использует EmbeddingService и cosine similarity через pgvector.
Требует ENABLE_AI_CATEGORIZATION=True, иначе 404.

Phase 11 (Plan 11-06): handler использует ``get_db_with_tenant_scope`` +
``get_current_user_id``; embedding lookup scoped по user_id (только эмбеддинги
текущего юзера учитываются при cosine similarity).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.ai import SuggestCategoryResponse
from app.ai.embedding_service import get_embedding_service

router = APIRouter(
    prefix="",
    tags=["ai-categorization"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@router.get("/suggest-category", response_model=SuggestCategoryResponse)
async def suggest_category(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    q: Annotated[
        str,
        Query(
            min_length=3,
            max_length=500,
            description="Описание транзакции (≥3 символа — Phase 10.1 backend guard)",
        ),
    ],
) -> SuggestCategoryResponse:
    """Предлагает категорию для описания транзакции через AI cosine similarity.

    Phase 11: scoped по user_id — embedding lookup только среди категорий
    текущего юзера.

    Возвращает ближайшую категорию если confidence >= 0.5.
    Иначе возвращает {category_id: null, name: null, confidence: <value>}.

    Требует ENABLE_AI_CATEGORIZATION=True (ENV) и enable_ai_categorization=True (user setting).
    """
    from sqlalchemy import select

    from app.core.settings import settings
    from app.db.models import AppUser

    if not settings.ENABLE_AI_CATEGORIZATION:
        raise HTTPException(status_code=404, detail="AI categorization is disabled")

    # Phase 11: читаем enable_ai_categorization напрямую через PK (user_id).
    # Plan 11-05 оставил app.services.settings с tg_user_id-сигнатурой.
    user_enabled = await db.scalar(
        select(AppUser.enable_ai_categorization).where(AppUser.id == user_id)
    )
    if not user_enabled:
        raise HTTPException(status_code=404, detail="AI categorization is disabled")

    service = get_embedding_service()
    result = await service.suggest_category(db=db, description=q, user_id=user_id)

    if result is None:
        # Нет подходящей категории или низкая уверенность
        return SuggestCategoryResponse(category_id=None, name=None, confidence=0.0)

    return SuggestCategoryResponse(
        category_id=result["category_id"],
        name=result["name"],
        confidence=result["confidence"],
    )
