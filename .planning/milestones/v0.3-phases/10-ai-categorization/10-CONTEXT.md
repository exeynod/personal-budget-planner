# Phase 10: AI Categorization - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — discuss skipped per user instruction)

<domain>
## Phase Boundary

AI-предложение категории в форме «Новая транзакция» через embeddings (text-embedding-3-small) + cosine similarity против cached category-embeddings в pgvector. Нет LLM-вызова на каждой транзакции — только embedding API.

Вне скоупа: multi-category suggestions; online learning; re-ranking; обучение на транзакциях пользователя (только category names).

</domain>

<decisions>
## Implementation Decisions

### Векторное хранилище
- Новая таблица `category_embedding(category_id PK, vector(1536) NOT NULL, updated_at TIMESTAMPTZ)` — pgvector extension
- Миграция 0004; pgvector включён через `CREATE EXTENSION IF NOT EXISTS vector` в init-SQL
- HNSW индекс (проще, лучше recall) — для 14 категорий любой вариант ок, HNSW предпочтительнее

### Similarity API
- `GET /api/v1/ai/suggest-category?q=<description>` — принимает текст, возвращает `{category_id, name, confidence}` или `{category_id: null}` если confidence < 0.5
- Порог confidence: 0.5 (cosine similarity ≥ 0.5 → показываем AI-suggestion)
- Debounce: 500ms на frontend стороне

### Embeddings lifecycle
- При создании/переименовании категории → background task (FastAPI BackgroundTasks) перегенерирует embedding
- При старте api (lifespan) → generate missing embeddings для категорий без записи в category_embedding
- Пустое имя категории не эмбеддируется

### Frontend UX
- В ActualEditor: при вводе description (≥3 символов) → debounce 500ms → GET suggest-category
- confidence ≥ 0.5: AI-suggestion box (имя + confidence-bar в фиолетовом #a78bfa) заменяет select
- Кнопка «Сменить» → показывает обычный select
- confidence < 0.5 или пустой ответ: обычный select без изменений
- Toggle `enable_ai_categorization` в Settings → GET /settings возвращает флаг, frontend пропускает suggest-запрос если false

### Settings
- Новое поле `enable_ai_categorization: bool = True` в Settings model
- PATCH /settings принимает `enable_ai_categorization`
- SettingsScreen добавляет Toggle для этого поля

### Claude's Discretion
- SQL для cosine search: `ORDER BY embedding <=> query_vec LIMIT 1` (pgvector оператор)
- Конкретная реализация BackgroundTasks vs celery — BackgroundTasks (уже используется FastAPI)
- CSS для confidence-bar — простой linear-gradient в фиолетовом

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/ai/llm_client.py` — `get_llm_client()` имеет метод `embed()` (или добавим в OpenAIProvider)
- `app/api/routes/categories.py` — CRUD категорий с POST/PATCH хуками для embedding regeneration
- `app/services/analytics.py` — паттерн async service с SQLAlchemy
- `frontend/src/screens/ActualEditor.tsx` — форма транзакции для интеграции AI suggestion
- `app/core/settings.py` — уже содержит OPENAI_API_KEY, LLM_MODEL; добавим enable_ai_categorization

### Established Patterns
- ORM с Mapped[] + mapped_column() (app/db/models.py)
- Alembic migrations: 0004 следует за 0003_ai_tables
- FastAPI BackgroundTasks для async side-effects
- CSS modules для стилей компонентов

### Integration Points
- `app/api/routes/categories.py` PATCH endpoint → trigger embedding refresh
- `frontend/src/screens/ActualEditor.tsx` description field → useDebounce → suggest-category API
- `app/api/routes/settings.py` PATCH → accept enable_ai_categorization

</code_context>

<specifics>
## Specific Ideas

- pgvector оператор cosine distance: `<=>` (меньше = ближе; 1 - cosine_similarity)
- text-embedding-3-small: 1536 размерность, дешевле text-embedding-3-large
- Confidence = 1.0 - cosine_distance (т.е. 1 - (embedding <=> query))
- Для 14 категорий init-seed при старте api достаточен

</specifics>

<deferred>
## Deferred Ideas

- Online learning (дообучение на выборах пользователя) — Phase 11+
- Multi-suggestion (топ-3) — не нужно для MVP
- Re-ranking с LLM — избыточно для single-tenant pet app

</deferred>
