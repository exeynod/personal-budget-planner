---
phase: 09-ai-assistant
plan: "02"
subsystem: ai-data-layer
tags: [database, orm, alembic, settings, ai]
dependency_graph:
  requires: []
  provides: [AiConversation, AiMessage ORM models, migration 0003, LLM settings]
  affects: [app/db/models.py, alembic/versions/0003_ai_tables.py, app/core/settings.py]
tech_stack:
  added: []
  patterns: [SQLAlchemy 2.x Mapped[], alembic op.create_table, pydantic-settings]
key_files:
  created:
    - alembic/versions/0003_ai_tables.py
  modified:
    - app/db/models.py
    - app/core/settings.py
decisions:
  - "role хранится как String(20) без DB ENUM — валидация на уровне сервиса (user|assistant|tool)"
  - "OPENAI_API_KEY добавлен в validate_production_settings (T-09-02 mitigated)"
  - "AI_MAX_CONTEXT_MESSAGES=20 — последние 20 сообщений передаются в LLM-контекст"
metrics:
  duration: "~10 min"
  completed_date: "2026-05-06"
  tasks: 2
  files_created: 1
  files_modified: 2
---

# Phase 9 Plan 02: AI DB Schema + Settings Summary

**One-liner:** SQLAlchemy ORM модели AiConversation + AiMessage, Alembic миграция 0003 с ai_conversation/ai_message таблицами, настройки LLM (OpenAI) в settings.py с проверкой в production.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ORM-модели AiConversation + AiMessage | b1c0667 | app/db/models.py |
| 2 | Alembic миграция 0003 + settings.py | 5f61548 | alembic/versions/0003_ai_tables.py, app/core/settings.py |

## What Was Built

### Task 1: ORM Models

Добавлены два класса в конец `app/db/models.py`:

- `AiConversation` — таблица `ai_conversation` (id, created_at). Одна глобальная conversation на пользователя (single-tenant, AI-06).
- `AiMessage` — таблица `ai_message` (id, conversation_id FK, role String(20), content Text, tool_name String(100), tool_result Text, created_at). Index `ix_ai_message_conversation` на `conversation_id`.

Все импорты (`Text`, `String`, `Integer`, `ForeignKey`, `Index`, `func`) уже были в файле.

### Task 2: Migration + Settings

Создана `alembic/versions/0003_ai_tables.py`:
- `revision = "0003_ai_tables"`, `down_revision = "0002_add_notify_days_before"` (цепочка не нарушена)
- `upgrade()`: создаёт обе таблицы + индекс
- `downgrade()`: удаляет индекс, затем обе таблицы в правильном порядке

Расширен `app/core/settings.py`:
- Поля `OPENAI_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `AI_MAX_CONTEXT_MESSAGES` добавлены в класс `Settings`
- `validate_production_settings` проверяет `OPENAI_API_KEY not in ("", "changeme")` (T-09-02 mitigation)

## Deviations from Plan

None - план выполнен точно по спецификации.

## Threat Model Compliance

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-09-02 | Mitigated | `validate_production_settings` проверяет OPENAI_API_KEY в production |
| T-09-03 | Accepted | `down_revision` зафиксирован, откат через `downgrade()` |

## Known Stubs

None.

## Threat Flags

None — новых security-relevant endpoints не создано в этом плане.

## Self-Check: PASSED

- [x] `app/db/models.py` contains `class AiConversation` and `class AiMessage`
- [x] `alembic/versions/0003_ai_tables.py` exists with correct revision chain
- [x] `app/core/settings.py` contains OPENAI_API_KEY, LLM_PROVIDER, LLM_MODEL, AI_MAX_CONTEXT_MESSAGES
- [x] Commits b1c0667, 5f61548 confirmed in git log
- [x] `python3 -c "from app.db.models import AiConversation, AiMessage"` — OK
- [x] `python3 -c "from app.core.settings import settings; assert settings.LLM_MODEL == 'gpt-4.1-nano'"` — OK
