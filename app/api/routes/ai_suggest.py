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
    enforce_spending_cap,        # Plan 15-03 AICAP-02
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
    require_pro,                 # Phase 35 REQ-35-02 (Pro-gate AI suggest)
)
from app.api.schemas.ai import SuggestCategoryResponse
from app.ai.embedding_service import get_embedding_service

router = APIRouter(
    prefix="",
    tags=["ai-categorization"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_onboarded),
        Depends(require_pro),            # Phase 35 REQ-35-02
        Depends(enforce_spending_cap),   # Plan 15-03 AICAP-02
    ],
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

    Возвращает ближайшую категорию если confidence >= 0.35 (SUGGEST_THRESHOLD).
    Иначе возвращает {category_id: null, name: null, confidence: <value>} —
    Phase 67 P2-5: confidence несёт фактический cosine similarity (не 0.0),
    кроме случая когда у юзера вообще нет embeddings (тогда 0.0).

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
        # У юзера нет embeddings вовсе — нет реального confidence для отдачи.
        return SuggestCategoryResponse(category_id=None, name=None, confidence=0.0)

    # P2-7 (BE-F3): если был реальный embedding-вызов (а не бесплатный
    # substring-fast-path), логируем его est-стоимость в ai_usage_log как
    # cost_cents — иначе spend-cap не видит расход suggest-category.
    if result.get("embedding_used"):
        await _log_embedding_cost(db, user_id=user_id, description=q)

    # P2-5: result может быть hit (category_id заполнен) ИЛИ miss с реальным
    # confidence (category_id None). В обоих случаях отдаём как есть.
    return SuggestCategoryResponse(
        category_id=result["category_id"],
        name=result["name"],
        confidence=result["confidence"],
    )


async def _log_embedding_cost(
    db: AsyncSession, *, user_id: int, description: str
) -> None:
    """Записать ai_usage_log-строку для embedding-вызова (Phase 67 P2-7).

    Стоимость embedding'а маленькая, но без её учёта spend-cap не видит
    расход на suggest-category. cost_cents = ceil(est_usd * 100) — та же
    конвертация, что на /ai/chat write-path. Использует тот же tenant-scoped
    db-session (RLS уже выставлен get_db_with_tenant_scope). Любая ошибка
    глотается — телеметрия не должна ронять user-facing suggest.
    """
    import math

    from app.ai.embedding_service import estimate_embedding_cost_usd
    from app.core.settings import settings
    from app.db.models import AiUsageLog
    from app.services.spend_cap import invalidate_user_spend_cache

    try:
        est_usd = estimate_embedding_cost_usd(description)
        cost_cents = math.ceil(est_usd * 100.0)
        db.add(
            AiUsageLog(
                user_id=user_id,
                model=settings.EMBEDDING_MODEL,
                prompt_tokens=0,
                completion_tokens=0,
                cached_tokens=0,
                total_tokens=0,
                cost_cents=int(cost_cents),
            )
        )
        await db.flush()
        # Сбросить кэш spend, чтобы следующий cap-check учёл новый расход.
        await invalidate_user_spend_cache(user_id)
    except Exception:  # noqa: BLE001 — телеметрия не критична для suggest
        import logging

        logging.getLogger(__name__).warning(
            "ai_suggest.embedding_cost_log_failed user_id=%s", user_id
        )
