---
phase: 10-ai-categorization
plan: "01"
subsystem: ai-categorization
tags: [pgvector, embeddings, tdd-red, orm, migration, settings]
dependency_graph:
  requires: []
  provides: [category_embedding_table, CategoryEmbedding_orm, ENABLE_AI_CATEGORIZATION_setting, pgvector_migration, RED_embedding_tests]
  affects: [app/db/models.py, app/core/settings.py, alembic/versions, pyproject.toml]
tech_stack:
  added: [pgvector>=0.3.0]
  patterns: [TDD RED phase, pgvector Vector(1536), HNSW cosine index, pydantic-settings bool flag]
key_files:
  created:
    - tests/ai/test_embeddings.py
    - alembic/versions/0004_pgvector_category_embeddings.py
  modified:
    - app/db/models.py
    - app/core/settings.py
    - pyproject.toml
decisions:
  - "pgvector >=0.3.0 добавлен как production зависимость (не dev) — нужен в API контейнере"
  - "Миграция создаёт таблицу через raw SQL op.execute() — pgvector тип vector(1536) не поддерживается стандартным SQLAlchemy"
  - "HNSW индекс с vector_cosine_ops для оператора <=> cosine distance"
  - "EMBEDDING_MODEL: str = text-embedding-3-small добавлен рядом с ENABLE_AI_CATEGORIZATION"
metrics:
  duration: "15 minutes"
  completed: "2026-05-06"
  tasks_completed: 4
  tasks_total: 4
---

# Phase 10 Plan 01: RED тесты + pgvector DB schema Summary

## One-liner

TDD RED phase: failing tests для embedding service + pgvector миграция 0004 с HNSW индексом + CategoryEmbedding ORM модель + ENABLE_AI_CATEGORIZATION флаг.

## What Was Built

### Task 1: RED тесты (86a9dba)

`tests/ai/test_embeddings.py` — 16 falling тестов для:
- `EmbeddingService` (import, методы embed_text/upsert_category_embedding/suggest_category)
- `get_embedding_service()` фабрика
- `SuggestCategoryResponse` Pydantic schema (category_id nullable, confidence, name)
- `app.api.routes.ai_suggest` router с `/suggest-category` path
- `EMBEDDING_DIM = 1536` константа
- `CategoryEmbedding` ORM модель
- `ENABLE_AI_CATEGORIZATION` настройка

Результат: 12 fail (ожидаемо — реализация в Plan 10-02), 4 pass (ORM модель + настройки добавлены в задачах 3-4).

### Task 2: pgvector миграция (4527916)

`alembic/versions/0004_pgvector_category_embeddings.py`:
- `CREATE EXTENSION IF NOT EXISTS vector` (idempotent)
- `CREATE TABLE category_embedding` через raw SQL (нативный тип `vector(1536)`)
- `category_id INTEGER PRIMARY KEY REFERENCES category(id) ON DELETE CASCADE`
- `embedding vector(1536) NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- HNSW индекс `ix_category_embedding_hnsw` с `vector_cosine_ops`
- downgrade: drop index + drop table

### Task 3: CategoryEmbedding ORM модель (3e16ff8)

`app/db/models.py`:
- Импорт `from pgvector.sqlalchemy import Vector`
- `CategoryEmbedding(Base)` с `category_id PK`, `embedding Vector(1536)`, `updated_at`
- FK с `ondelete="CASCADE"`
- Relationship к `Category`

### Task 4: Настройки + зависимость (dbd51f3)

`app/core/settings.py`:
- `ENABLE_AI_CATEGORIZATION: bool = True`
- `EMBEDDING_MODEL: str = "text-embedding-3-small"`

`pyproject.toml`:
- `pgvector>=0.3.0` добавлен в production dependencies

## TDD Gate Compliance

RED gate: `test(10-01)` commit 86a9dba — failing tests созданы до реализации.
GREEN gate: ожидается в Plan 10-02 (EmbeddingService + ai_suggest route).

## Deviations from Plan

### Auto-added items

**1. [Rule 2 - Missing] EMBEDDING_MODEL настройка**
- **Found during:** Task 4
- **Issue:** Plan упоминал `text-embedding-3-small` в CONTEXT.md, но не требовал ENV флага явно
- **Fix:** Добавлен `EMBEDDING_MODEL: str = "text-embedding-3-small"` рядом с `ENABLE_AI_CATEGORIZATION`
- **Files modified:** app/core/settings.py

**2. [Rule 1 - Bug] Миграция через raw SQL вместо SQLAlchemy op.create_table()**
- **Found during:** Task 2
- **Issue:** SQLAlchemy не поддерживает тип `vector(1536)` нативно без pgvector интеграции в `Column()`. Использование `sa.Text()` + ALTER COLUMN — ненадёжно
- **Fix:** `CREATE TABLE` через `op.execute()` raw SQL — pgvector нативный синтаксис

None — план выполнен точно как описано, с двумя мелкими дополнениями.

## Self-Check

- [x] tests/ai/test_embeddings.py — создан, 16 тестов
- [x] alembic/versions/0004_pgvector_category_embeddings.py — создан
- [x] app/db/models.py — CategoryEmbedding добавлена
- [x] app/core/settings.py — ENABLE_AI_CATEGORIZATION = True
- [x] pyproject.toml — pgvector>=0.3.0 добавлен
- [x] Все 4 задачи закоммичены (86a9dba, 4527916, 3e16ff8, dbd51f3)
