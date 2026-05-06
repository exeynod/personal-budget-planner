# Phase 10 — AI Categorization

**Milestone:** v0.3 — Analytics & AI
**Status:** Pending plan creation
**Depends on:** Phase 9 (LLM-client с `embed()` готов)

## Goal

AI-предложение категории в форме «Новая транзакция» через embeddings и cosine similarity, без LLM-вызова на каждой транзакции (только cheap embedding API на ~$0.02/M).

## Requirements

AICAT-01, AICAT-02, AICAT-03, AICAT-04, AICAT-05, AICAT-06, SET-03

## Reference Sketches

- `011-ai-categorization/` — winner: variant A (AI заменяет select)

## Locked Decisions (per PROJECT.md Key Decisions)

- **Embedding model:** `text-embedding-3-small` (1536-dim, $0.02/M)
- **Storage:** `pgvector` extension в Postgres 16 — добавляется в init
- **Confidence threshold:** ≥ 0.5 cosine similarity для показа AI-предложения; < 0.5 — обычный select
- **Toggle:** `enable_ai_categorization` в Settings (`SET-03`), default = on

## Files to Touch

**Backend:**
- `alembic/versions/000Y_pgvector_category_embedding.py` (NEW) — extension + table
- `app/models/category_embedding.py` (NEW) — SQLAlchemy с `Vector` column
- `app/services/category_embedding_service.py` (NEW) — генерация + cosine search
- `app/api/v1/ai_categorization.py` (NEW) — endpoint `POST /api/v1/ai/categorize` (input: description; output: top-1 category + confidence)
- `app/services/category.py` — hook на CRUD категории → перегенерация эмбеддинга
- `app/schemas/ai_categorization.py` (NEW)

**Frontend:**
- `frontend/src/components/ActualEditor.tsx` — добавить AI-suggestion box между описанием и select
- `frontend/src/components/ActualEditor.module.css` — стили aiBox + confidence-bar
- `frontend/src/api/ai.ts` — добавить `categorize(description)` метод
- `frontend/src/hooks/useAiCategorize.ts` (NEW) — debounced hook на input
- `frontend/src/screens/SettingsScreen.tsx` — добавить toggle SET-03

**Tests:**
- `tests/services/test_category_embedding_service.py` (NEW) — generate, cosine search, threshold
- `tests/api/test_ai_categorization.py` (NEW) — endpoint contract
- `tests/migrations/test_pgvector.py` (NEW) — extension installed correctly
- `frontend/tests/e2e/ai-categorization.spec.ts` (NEW)

## Open Questions (resolve in plan)

- Q-v0.3-2: pgvector index — HNSW vs IVFFlat? Для 14 категорий любой ок; HNSW проще, IVFFlat легче бэкапить.
- Backfill при первом запуске Phase 10 — заполнить `category_embedding` для всех 14 seed-категорий разово.
- Что если пользователь меняет имя категории во время активной формы? — invalidate cached suggestion.

## Plans

To be created via `/gsd-plan-phase 10`. Expected ~4 plans:
1. Wave 0: RED tests + pgvector migration
2. Service + endpoint + backfill
3. Frontend integration в ActualEditor + debounced hook
4. Verification + UAT
