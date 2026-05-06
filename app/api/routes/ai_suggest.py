"""Route GET /ai/suggest-category — предложение категории по описанию (AICAT-03).

Использует EmbeddingService и cosine similarity через pgvector.
Требует ENABLE_AI_CATEGORIZATION=True, иначе 404.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.ai import SuggestCategoryResponse
from app.ai.embedding_service import get_embedding_service

router = APIRouter(
    prefix="",
    tags=["ai-categorization"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/suggest-category", response_model=SuggestCategoryResponse)
async def suggest_category(
    q: Annotated[str, Query(min_length=1, max_length=500, description="Описание транзакции")],
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuggestCategoryResponse:
    """Предлагает категорию для описания транзакции через AI cosine similarity.

    Возвращает ближайшую категорию если confidence >= 0.5.
    Иначе возвращает {category_id: null, name: null, confidence: <value>}.

    Требует ENABLE_AI_CATEGORIZATION=True (ENV) и enable_ai_categorization=True (user setting).
    """
    from app.core.settings import settings
    from app.services import settings as settings_svc

    if not settings.ENABLE_AI_CATEGORIZATION:
        raise HTTPException(status_code=404, detail="AI categorization is disabled")

    user_enabled = await settings_svc.get_enable_ai_categorization(db, current_user["id"])
    if not user_enabled:
        raise HTTPException(status_code=404, detail="AI categorization is disabled")

    service = get_embedding_service()
    result = await service.suggest_category(db=db, description=q)

    if result is None:
        # Нет подходящей категории или низкая уверенность
        return SuggestCategoryResponse(category_id=None, name=None, confidence=0.0)

    return SuggestCategoryResponse(
        category_id=result["category_id"],
        name=result["name"],
        confidence=result["confidence"],
    )
