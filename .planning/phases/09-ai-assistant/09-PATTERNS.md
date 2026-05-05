# Phase 9: AI Assistant - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 17 (new/modified)
**Analogs found:** 17 / 17

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/ai/__init__.py` | config | — | `app/api/routes/__init__.py` | structure-only |
| `app/ai/llm_client.py` | service | request-response | `app/services/analytics.py` | role-match |
| `app/ai/providers/openai_provider.py` | service | streaming | `app/services/analytics.py` | role-match |
| `app/ai/tools.py` | service | CRUD read | `app/services/analytics.py` | exact (same queries) |
| `app/ai/system_prompt.py` | utility | transform | `app/services/analytics.py` | partial-match |
| `app/api/routes/ai.py` | controller | streaming/SSE | `app/api/routes/analytics.py` | role-match |
| `app/services/ai_conversation_service.py` | service | CRUD | `app/services/analytics.py` | exact |
| `app/db/models.py` (MODIFY) | model | — | `app/db/models.py` | exact |
| `app/api/router.py` (MODIFY) | config | — | `app/api/router.py` | exact |
| `app/api/schemas/ai.py` | schema | — | `app/api/schemas/analytics.py` | exact |
| `alembic/versions/0003_ai_tables.py` | migration | — | `alembic/versions/0002_add_notify_days_before.py` | exact |
| `frontend/src/screens/AiScreen.tsx` (MODIFY) | component | streaming | `frontend/src/screens/AnalyticsScreen.tsx` | role-match |
| `frontend/src/screens/AiScreen.module.css` (MODIFY) | config | — | `frontend/src/screens/AnalyticsScreen.module.css` | role-match |
| `frontend/src/components/ChatMessage.tsx` | component | render | `frontend/src/components/ForecastCard.tsx` | partial-match |
| `frontend/src/components/ToolUseIndicator.tsx` | component | render | `frontend/src/components/ForecastCard.tsx` | partial-match |
| `frontend/src/api/ai.ts` | utility | streaming | `frontend/src/api/analytics.ts` | role-match |
| `frontend/src/hooks/useAiConversation.ts` | hook | streaming/state | `frontend/src/hooks/useAnalytics.ts` | role-match |
| `tests/ai/test_llm_client.py` | test | — | `tests/test_analytics.py` | role-match |
| `tests/ai/test_tools.py` | test | — | `tests/test_analytics.py` | role-match |
| `tests/api/test_ai_chat.py` | test | — | `tests/test_analytics.py` | exact |
| `tests/services/test_ai_conversation_service.py` | test | — | `tests/test_analytics.py` | exact |

---

## Pattern Assignments

### `app/api/routes/ai.py` (controller, streaming/SSE)

**Analog:** `app/api/routes/analytics.py`

**Imports pattern** (lines 1–27):
```python
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.ai import ChatRequest, ChatMessageRead
from app.services import ai_conversation_service
from app.ai.llm_client import stream_chat
```

**Router declaration** (lines 23–27 of analytics.py):
```python
router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[Depends(get_current_user)],
)
```

**SSE streaming endpoint pattern** — нет точного аналога в коде, но следует принципу:
```python
@router.post("/chat")
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    # Аналог get_current_user из analytics: db передаётся через Depends(get_db)
    return StreamingResponse(
        _event_stream(db, body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

**Auth pattern** — router-level `dependencies=[Depends(get_current_user)]` как в analytics.py (строка 26). Все эндпоинты защищены автоматически.

---

### `app/services/ai_conversation_service.py` (service, CRUD)

**Analog:** `app/services/analytics.py`

**Imports pattern** (lines 1–17 analytics.py):
```python
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AiConversation,
    AiMessage,
)
```

**Core service pattern** (lines 20–33 analytics.py):
```python
async def get_or_create_conversation(
    db: AsyncSession,
) -> AiConversation:
    """Return single global conversation, create if absent."""
    q = select(AiConversation).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        row = AiConversation()
        db.add(row)
        await db.flush()
    return row
```

**Pattern для функций:** все функции `async def`, принимают `db: AsyncSession`, используют `select()` → `await db.execute()` → `.scalars().all()` или `.scalar_one_or_none()`. Не вызывают `db.commit()` — коммит делает `get_db` dependency.

---

### `app/ai/tools.py` (service, CRUD read)

**Analog:** `app/services/analytics.py` — SQL-запросы идентичны по стилю

**Паттерн tool-функции:**
```python
async def get_period_balance(db: AsyncSession) -> dict:
    """Tool: текущий баланс активного периода."""
    # Копировать паттерн из analytics.get_forecast() (строки 226–295)
    # select(BudgetPeriod).where(BudgetPeriod.status == PeriodStatus.active)
    # func.sum(ActualTransaction.amount_cents)
    # возвращать structured dict → AI форматирует ответ
    ...
```

**SQLAlchemy паттерн** (из analytics.py, строки 63–86):
```python
q = (
    select(
        ActualTransaction.period_id,
        func.sum(ActualTransaction.amount_cents).label("total_cents"),
    )
    .where(
        ActualTransaction.period_id.in_(period_ids),
        ActualTransaction.kind == CategoryKind.expense,
    )
    .group_by(ActualTransaction.period_id)
)
rows = {r.period_id: r.total_cents for r in (await db.execute(q)).all()}
```

**Импорты моделей** (analytics.py строки 10–17):
```python
from app.db.models import (
    ActualTransaction,
    BudgetPeriod,
    Category,
    CategoryKind,
    PeriodStatus,
    PlannedTransaction,
)
```

**Error return pattern** (из decisions): при ошибке tool возвращает `{"error": "message"}` — не бросает исключение.

---

### `app/db/models.py` (MODIFY — добавить AiConversation + AiMessage)

**Analog:** `app/db/models.py` — тот же файл, копировать паттерн ActualTransaction

**ORM pattern** (строки 196–221):
```python
class AiConversation(Base):
    __tablename__ = "ai_conversation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    messages: Mapped[list["AiMessage"]] = relationship(
        back_populates="conversation", order_by="AiMessage.id"
    )


class AiMessage(Base):
    __tablename__ = "ai_message"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("ai_conversation.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" | "assistant" | "tool"
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    conversation: Mapped["AiConversation"] = relationship(back_populates="messages")

    __table_args__ = (
        Index("ix_ai_message_conversation", "conversation_id"),
    )
```

**Enum pattern** (строки 40–65) — если нужен enum для role, использовать `PgEnum(RoleEnum, name="airole", create_type=False)`.

**Импорты** — добавить в существующий блок импортов (строки 18–33) `String` уже есть (строка 27).

---

### `app/api/schemas/ai.py` (schema)

**Analog:** `app/api/schemas/analytics.py`

**Imports + BaseModel pattern** (строки 1–11):
```python
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict
```

**Schema pattern** (строки 9–54):
```python
class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    content: Optional[str] = None
    tool_name: Optional[str] = None
    created_at: str  # ISO datetime

class ChatRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    message: str

class ChatHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    messages: list[ChatMessageRead]
```

**Optional поля** — всегда `Optional[T] = None` как в `ForecastResponse` (строки 51–54).

---

### `app/api/router.py` (MODIFY — регистрация ai_router)

**Analog:** `app/api/router.py` строки 53–121

**Pattern регистрации** (строки 53–54 + 121):
```python
from app.api.routes.ai import router as ai_router
# ...
# Phase 9 sub-router — AI chat endpoint.
public_router.include_router(ai_router)
```

---

### `alembic/versions/0003_ai_tables.py` (migration)

**Analog:** `alembic/versions/0002_add_notify_days_before.py`

**Migration pattern** (полный файл):
```python
"""add ai_conversation and ai_message tables

Revision ID: 0003_ai_tables
Revises: 0002_add_notify_days_before
Create Date: 2026-05-06

Adds AiConversation + AiMessage tables for Phase 9 AI Assistant.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_ai_tables"
down_revision: Union[str, None] = "0002_add_notify_days_before"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_conversation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "ai_message",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(),
                  sa.ForeignKey("ai_conversation.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("tool_name", sa.String(100), nullable=True),
        sa.Column("tool_result", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_message_conversation", "ai_message", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_message_conversation", table_name="ai_message")
    op.drop_table("ai_message")
    op.drop_table("ai_conversation")
```

---

### `frontend/src/api/ai.ts` (utility, streaming)

**Analog:** `frontend/src/api/analytics.ts` + `frontend/src/api/client.ts`

**Imports + apiFetch pattern** (analytics.ts строки 1–8):
```typescript
import { apiFetch, getInitDataRaw } from './client';
import type { ChatMessageRead, ChatHistoryResponse } from './types';
```

**Regular fetch pattern** (analytics.ts строки 11–25):
```typescript
export async function getChatHistory(): Promise<ChatHistoryResponse> {
  return apiFetch<ChatHistoryResponse>('/ai/history');
}

export async function clearConversation(): Promise<void> {
  return apiFetch<void>('/ai/clear', { method: 'DELETE' });
}
```

**SSE streaming pattern** — нет аналога в коде, но использовать `getInitDataRaw` из client.ts:
```typescript
export function streamChat(
  message: string,
  onEvent: (event: AiStreamEvent) => void,
  onDone: () => void,
  signal?: AbortSignal,
): void {
  const initDataRaw = getInitDataRaw();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (initDataRaw) headers['X-Telegram-Init-Data'] = initDataRaw;
  else if (import.meta.env.DEV) headers['X-Telegram-Init-Data'] = 'dev-mode-stub';

  fetch('/api/v1/ai/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
    signal,
  }).then(async (res) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    // parse SSE lines: "data: {...}\n\n"
    ...
  });
}
```

---

### `frontend/src/hooks/useAiConversation.ts` (hook, streaming/state)

**Analog:** `frontend/src/hooks/useAnalytics.ts`

**Hook structure** (строки 1–85):
```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, getChatHistory, clearConversation } from '../api/ai';
import type { ChatMessageRead } from '../api/types';

export interface UseAiConversationResult {
  messages: ChatMessageRead[];
  streaming: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
  clearHistory: () => Promise<void>;
}

export function useAiConversation(): UseAiConversationResult {
  const [messages, setMessages] = useState<ChatMessageRead[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancelled flag pattern (из useAnalytics.ts строки 56–81):
  useEffect(() => {
    let cancelled = false;
    getChatHistory()
      .then((data) => { if (!cancelled) setMessages(data.messages); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, []);

  const sendMessage = useCallback((text: string) => { ... }, []);

  return { messages, streaming, error, sendMessage, clearHistory };
}
```

**Cancelled flag pattern** (useAnalytics.ts строки 55–81) — обязательно для всех `useEffect` с async операциями.

**Error pattern** (строки 72–74):
```typescript
.catch((e: unknown) => {
  if (!cancelled) setError(e instanceof Error ? e.message : String(e));
})
```

---

### `frontend/src/screens/AiScreen.tsx` (component, streaming)

**Analog:** `frontend/src/screens/AnalyticsScreen.tsx`

**Screen structure pattern** (строки 14–110):
```tsx
import { useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import { ChatMessage } from '../components/ChatMessage';
import { ToolUseIndicator } from '../components/ToolUseIndicator';
import { useAiConversation } from '../hooks/useAiConversation';
import styles from './AiScreen.module.css';

export function AiScreen() {
  const { messages, streaming, error, sendMessage, clearHistory } = useAiConversation();

  return (
    <div className={styles.root}>
      <PageTitle title="AI" />
      {/* ... */}
    </div>
  );
}
```

**Loading state pattern** (AnalyticsScreen.tsx строки 45–52):
```tsx
{loading && (
  <div className={styles.skeletons}>
    <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
  </div>
)}
```

**Error state pattern** (строки 54–58):
```tsx
{error && !loading && (
  <div className={styles.error}>
    Не удалось загрузить данные. Попробуй ещё раз.
  </div>
)}
```

**Empty state pattern** (строки 97–106):
```tsx
{allEmpty && (
  <div className={styles.emptyState}>
    <Sparkle size={48} weight="thin" color="#a78bfa" />
    <div className={styles.emptyHeading}>Задай вопрос о своём бюджете</div>
  </div>
)}
```

**AI tab цвет** — сохранить `#a78bfa` (фиолетовый, уже установлен в BottomNav).

---

### `frontend/src/api/types.ts` (MODIFY — добавить AI типы)

**Analog:** `frontend/src/api/types.ts` строки 248–289 (Phase 8 Analytics block)

**Addendum pattern** — добавить блок в конец файла:
```typescript
// ---------- Phase 9: AI Assistant ----------

export type AiRole = 'user' | 'assistant' | 'tool';

export interface ChatMessageRead {
  id: number;
  role: AiRole;
  content: string | null;
  tool_name: string | null;
  created_at: string; // ISO datetime
}

export interface ChatHistoryResponse {
  messages: ChatMessageRead[];
}

export type AiEventType = 'token' | 'tool_start' | 'tool_end' | 'done' | 'error';

export interface AiStreamEvent {
  type: AiEventType;
  data: string;
}
```

---

### `tests/api/test_ai_chat.py` (test)

**Analog:** `tests/test_analytics.py`

**Test file structure** (строки 1–30):
```python
"""Contract tests for Phase 9 AI chat endpoints."""
import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")
```

**Auth test pattern** (строки 81–103):
```python
@pytest.mark.asyncio
async def test_chat_requires_auth(async_client):
    response = await async_client.post(
        "/api/v1/ai/chat", json={"message": "hello"}
    )
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_history_requires_auth(async_client):
    response = await async_client.get("/api/v1/ai/history")
    assert response.status_code == 403
```

**DB fixture pattern** (строки 31–76) — копировать `db_client` fixture из test_analytics.py; в TRUNCATE добавить `ai_conversation, ai_message`.

**Conftest fixtures** — `async_client`, `bot_token`, `owner_tg_id` берутся из `tests/conftest.py` без изменений.

---

## Shared Patterns

### Authentication (router-level)
**Source:** `app/api/routes/analytics.py` строки 23–27
**Apply to:** `app/api/routes/ai.py`
```python
router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[Depends(get_current_user)],
)
```
Всё, что внутри `router` — автоматически защищено. Не нужно добавлять `Depends(get_current_user)` в каждый эндпоинт.

### DB Session Dependency
**Source:** `app/api/dependencies.py` строки 25–34 + `app/api/routes/analytics.py` строки 36–37
**Apply to:** `app/api/routes/ai.py`, `app/services/ai_conversation_service.py`
```python
db: AsyncSession = Depends(get_db)
```
`get_db` делает commit после успешного yield и rollback при ошибке. Сервисный слой НЕ вызывает `db.commit()` сам.

### No Float Money
**Source:** `CLAUDE.md` + `app/db/models.py` весь файл
**Apply to:** `app/ai/tools.py`, `app/api/schemas/ai.py`
Деньги только `BIGINT` kopecks, ни `float`, ни `Decimal`. `formatKopecks()` на фронте.

### from __future__ import annotations
**Source:** Все backend-файлы
**Apply to:** Все новые `.py` файлы — добавлять первой строкой.

### CSS Modules + Phosphor Icons
**Source:** `frontend/src/screens/AnalyticsScreen.tsx` строки 1–10
**Apply to:** `frontend/src/screens/AiScreen.tsx`, все новые компоненты
```tsx
import { SomeIcon } from '@phosphor-icons/react';
import styles from './ComponentName.module.css';
```
Никаких `lucide-react` (см. feedback-icons.md).

### PageTitle компонент
**Source:** `frontend/src/screens/AnalyticsScreen.tsx` строка 27
**Apply to:** `frontend/src/screens/AiScreen.tsx`
```tsx
<PageTitle title="AI" />
```

### Cancelled flag pattern
**Source:** `frontend/src/hooks/useAnalytics.ts` строки 55–81
**Apply to:** `frontend/src/hooks/useAiConversation.ts` — все `useEffect` с async
```typescript
useEffect(() => {
  let cancelled = false;
  someAsyncCall()
    .then((data) => { if (!cancelled) setState(data); })
    .catch((e: unknown) => { if (!cancelled) setError(...); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [deps]);
```

### Settings pattern (добавление OPENAI_API_KEY)
**Source:** `app/core/settings.py` строки 9–36
**Apply to:** `app/core/settings.py` (MODIFY)
```python
# AI (Phase 9)
OPENAI_API_KEY: str = "changeme"
OPENAI_MODEL: str = "gpt-4.1-nano"
AI_MAX_CONTEXT_MESSAGES: int = 20
```
Добавить в `validate_production_settings`: `if s.OPENAI_API_KEY in ("", "changeme"): insecure.append("OPENAI_API_KEY")`.

---

## No Analog Found

Нет точных аналогов в кодовой базе (плановик использует паттерны из CONTEXT.md):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `app/ai/llm_client.py` | service | streaming | Нет streaming-клиентов в проекте |
| `app/ai/providers/openai_provider.py` | service | streaming | Нет HTTP streaming на бэкенде |
| `app/ai/system_prompt.py` | utility | transform | Нет prompt-builder'ов |
| `frontend/src/components/ChatMessage.tsx` | component | render | Нет chat-bubble компонентов |
| `frontend/src/components/ToolUseIndicator.tsx` | component | render | Нет pulse/indicator компонентов |

**Для этих файлов:** использовать паттерны из CONTEXT.md decisions:
- SSE events: `{type: "token"|"tool_start"|"tool_end"|"done"|"error", data: ...}`
- Tool indicator: pulse-pill, появляется при `tool_start`, исчезает при первом токене
- Markdown: простой inline-parser без библиотек

---

## Metadata

**Analog search scope:** `app/`, `frontend/src/`, `tests/`, `alembic/versions/`
**Files scanned:** 15 (analytics route, analytics service, analytics schemas, models, router, dependencies, settings, client.ts, analytics.ts, useAnalytics.ts, AnalyticsScreen.tsx, AiScreen.tsx, types.ts, 0002 migration, conftest.py, test_analytics.py)
**Pattern extraction date:** 2026-05-06
