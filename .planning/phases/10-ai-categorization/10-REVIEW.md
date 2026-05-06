---
phase: 10-ai-categorization
reviewed: 2026-05-06T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - tests/ai/test_embeddings.py
  - alembic/versions/0004_pgvector_category_embeddings.py
  - app/db/models.py
  - app/core/settings.py
  - app/ai/embedding_service.py
  - app/api/routes/ai_suggest.py
  - app/ai/llm_client.py
  - app/ai/providers/openai_provider.py
  - app/api/schemas/ai.py
  - app/api/router.py
  - app/api/routes/categories.py
  - main_api.py
  - alembic/versions/0005_add_enable_ai_categorization.py
  - frontend/src/hooks/useAiCategorize.ts
  - app/services/settings.py
  - app/api/schemas/settings.py
  - app/api/routes/settings.py
  - frontend/src/api/types.ts
  - frontend/src/api/ai.ts
  - frontend/src/components/ActualEditor.tsx
  - frontend/src/screens/SettingsScreen.tsx
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-06
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Реализация AI-категоризации (pgvector embeddings + suggest endpoint) в целом структурно корректна — разделение на сервисный слой, провайдер, миграции выполнено аккуратно. Выявлены три критических дефекта: SQL-инъекция через конкатенацию вектора в строку, гонка состояний в background task с потенциальным двойным `commit()` в одной сессии, и нераскрытая зависимость — фича AI-suggest проверяет флаг `ENABLE_AI_CATEGORIZATION` на уровне ENV, но игнорирует пользовательский флаг `enable_ai_categorization` из БД, из-за чего отключение в настройках не работает. Также обнаружен ряд предупреждений: создание нового `EmbeddingService` (с новым `AsyncOpenAI` клиентом) на каждый запрос без pooling, потенциальный stale-read после `flush()` без `commit()`, и несколько проблем качества.

---

## Critical Issues

### CR-01: SQL-инъекция / неправильная передача вектора в pgvector

**File:** `app/ai/embedding_service.py:91`

**Issue:** Вектор передаётся в SQL-запрос как `str(query_vec)`, что превращает Python-список `[0.1, -0.2, ...]` в строку `"[0.1, -0.2, ...]"` и подставляется через placeholder `:query_vec`. Это уже само по себе хрупко, но главная проблема — pgvector ожидает нативный тип `vector`, а SQLAlchemy передаёт строку. В зависимости от версии драйвера asyncpg это либо вызовет ошибку типа (`cannot cast type text to vector`), либо сработает случайно через implicit cast, что делает запрос непредсказуемым. Кроме того, если бы описание транзакции каким-либо образом влияло на `query_vec` вне embed-вызова — это была бы инъекция.

Само значение `query_vec` возвращается из OpenAI и не является пользовательским вводом напрямую, однако передача через `str()` — неверный способ параметризации бинарных типов в asyncpg/pgvector.

**Fix:** Использовать pgvector-aware тип или передавать список `list[float]` напрямую; asyncpg с установленным `pgvector` регистрирует кодек для `vector`. Альтернатива — использовать ORM-запрос через `func.cosine_distance` или `cast`:

```python
# Вместо:
result = await db.execute(stmt, {"query_vec": str(query_vec)})

# Правильно — pgvector asyncpg кодек принимает list[float]:
result = await db.execute(stmt, {"query_vec": query_vec})
# При этом CAST(:query_vec AS vector) в SQL остаётся.
# Либо воспользоваться pgvector.sqlalchemy и сформировать ORM-запрос.
```

---

### CR-02: Пользовательский флаг `enable_ai_categorization` игнорируется в `/ai/suggest-category`

**File:** `app/api/routes/ai_suggest.py:38`

**Issue:** Endpoint проверяет только глобальный ENV-флаг `settings.ENABLE_AI_CATEGORIZATION`, но полностью игнорирует пользовательский флаг `app_user.enable_ai_categorization`, который пользователь может выключить в настройках (PATCH /settings). В результате пользователь видит "AI-категоризация выключена" у себя в настройках, но endpoint продолжает отвечать и возвращать предложения — UI-отображение построено вокруг флага из GET /settings, а backend флаг не применяет.

**Fix:** В handler нужно получить текущего пользователя и проверить его флаг:

```python
@router.get("/suggest-category", response_model=SuggestCategoryResponse)
async def suggest_category(
    q: Annotated[str, Query(min_length=1, max_length=500)],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> SuggestCategoryResponse:
    from app.core.settings import settings
    from app.services.settings import get_enable_ai_categorization

    if not settings.ENABLE_AI_CATEGORIZATION:
        raise HTTPException(status_code=404, detail="AI categorization is disabled")

    user_ai_enabled = await get_enable_ai_categorization(db, current_user["id"])
    if not user_ai_enabled:
        raise HTTPException(status_code=404, detail="AI categorization disabled by user")

    ...
```

---

### CR-03: Двойной `commit()` / конфликт сессий в `_init_missing_embeddings`

**File:** `main_api.py:81`

**Issue:** `upsert_category_embedding` (embedding_service.py строка 59) вызывает `await db.commit()` внутри себя. В `_init_missing_embeddings` та же сессия `session` передаётся в цикле для каждой категории. После первого `upsert_category_embedding` сессия уже закрыта (commit завершил транзакцию и закрыл её в режиме autobegin). Следующая итерация цикла начнёт новую транзакцию, однако если какая-то операция внутри сессии уже была выполнена до вызова (например, `select`), то повторное использование той же сессии после commit корректно с SQLAlchemy async — но только при `autobegin=True`. При этом метод `upsert_category_embedding` документирован как внутренний upsert, а его поведение commit-в-середине делает его неиспользуемым в более широком транзакционном контексте без сайд-эффектов.

Более серьёзная проблема: в `_refresh_embedding` (categories.py строка 71-72) создаётся новая сессия через `AsyncSessionLocal()`, а затем вызывается `upsert_category_embedding`, который снова делает `commit()`. Это работает, но делает метод неперевизуемым для composable-транзакций — любой вызывающий код, передавший внешнюю сессию, получит неожиданный commit посередине. Это архитектурный дефект с реальным риском потери данных если метод будет использован в транзакционном контексте.

**Fix:** Убрать `commit()` из `upsert_category_embedding` и перенести его на уровень вызывающего кода:

```python
async def upsert_category_embedding(
    self, db: AsyncSession, category_id: int, vector: list[float]
) -> None:
    stmt = (
        pg_insert(CategoryEmbedding)
        .values(category_id=category_id, embedding=vector)
        .on_conflict_do_update(
            index_elements=["category_id"],
            set_={"embedding": vector, "updated_at": text("now()")},
        )
    )
    await db.execute(stmt)
    # НЕ commit здесь — вызывающий код решает когда коммитить

# В _refresh_embedding:
async with AsyncSessionLocal() as session:
    await embedding_svc.upsert_category_embedding(session, category_id, vector)
    await session.commit()  # commit явно в вызывающем коде

# В _init_missing_embeddings — аналогично, commit после каждого upsert или после цикла.
```

---

## Warnings

### WR-01: Новый `EmbeddingService` и `AsyncOpenAI` клиент создаётся на каждый HTTP-запрос

**File:** `app/api/routes/ai_suggest.py:41`, `app/api/routes/categories.py:69`

**Issue:** `get_embedding_service()` вызывается прямо в теле handler-а (не через `Depends`), что приводит к созданию нового `EmbeddingService` и нового `AsyncOpenAI(api_key=...)` на каждый запрос. `AsyncOpenAI` создаёт внутренний `httpx.AsyncClient` с connection pool при каждом создании экземпляра. Это утечка ресурсов и деградация производительности при нагрузке.

**Fix:** Зарегистрировать `EmbeddingService` как singleton через FastAPI `Depends` или через lifespan app.state:

```python
# В main_api.py lifespan:
from app.ai.embedding_service import get_embedding_service
app.state.embedding_service = get_embedding_service()

# В роутере:
def get_svc(request: Request) -> EmbeddingService:
    return request.app.state.embedding_service

@router.get("/suggest-category", ...)
async def suggest_category(
    ...,
    svc: Annotated[EmbeddingService, Depends(get_svc)],
): ...
```

---

### WR-02: `flush()` без `commit()` в settings-сервисе — изменения могут быть потеряны

**File:** `app/services/settings.py:69, 92, 118`

**Issue:** Все три `update_*` функции (`update_cycle_start_day`, `update_notify_days_before`, `update_enable_ai_categorization`) вызывают только `await db.flush()`, но не `await db.commit()`. Commit ожидается от middleware/dependency (`get_db`). Если `get_db` dependency не делает commit при нормальном завершении — данные не сохранятся. Необходимо убедиться, что вызывающий код (route handler) делает commit, либо добавить commit в сервис.

В текущем route handler `settings.py` нет явного `await db.commit()` — это означает, что либо commit выполняется в `get_db` dependency, либо изменения теряются. Следует явно задокументировать этот контракт или сделать его надёжным.

**Fix:** Проверить реализацию `get_db` dependency на наличие commit при успешном завершении. Если его нет — добавить `await db.commit()` в route handler или в сервис.

---

### WR-03: Отсутствует валидация размерности embedding-вектора

**File:** `app/ai/embedding_service.py:40-59`

**Issue:** `upsert_category_embedding` принимает `vector: list[float]` без проверки длины. Если OpenAI API вернёт вектор неожиданной размерности (например, при смене модели), запрос в pgvector упадёт с ошибкой на уровне БД с непонятным сообщением. Нет early-fail с понятной диагностикой.

**Fix:**
```python
async def upsert_category_embedding(
    self, db: AsyncSession, category_id: int, vector: list[float]
) -> None:
    if len(vector) != EMBEDDING_DIM:
        raise ValueError(
            f"Expected embedding of dimension {EMBEDDING_DIM}, got {len(vector)}"
        )
    ...
```

---

### WR-04: `todayInMoscow()` — хардкод UTC+3, не учитывает DST и будущие изменения

**File:** `frontend/src/components/ActualEditor.tsx:38-43`

**Issue:** Функция `todayInMoscow()` вычисляет "сегодня" через `Date.now() + 3 * 60 * 60 * 1000`. Москва не переходит на летнее время, поэтому сейчас это корректно. Однако хардкод смещения — ненадёжный паттерн: если конфигурация приложения изменится (например, другой пользователь в другом часовом поясе, или добавится мультитенант), логика сломается незаметно. Кроме того, `todayISO()` просто делегирует в `todayInMoscow()` — двойное дублирование без смысла.

**Fix:** Использовать `Intl.DateTimeFormat` или `toLocaleDateString` с явным `timeZone`:
```typescript
function todayInMoscow(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}
```
Удалить `todayISO()` и использовать `todayInMoscow()` напрямую.

---

### WR-05: `get_settings` делает 4 отдельных запроса к БД вместо одного

**File:** `app/api/routes/settings.py:34-37`

**Issue:** `GET /settings` выполняет четыре последовательных SELECT-а через отдельные вызовы сервиса — каждый из которых делает `_get_user_or_404` (тоже SELECT). Итого 4 SQL-запроса там, где достаточно одного `SELECT * FROM app_user WHERE tg_user_id = ?`. Это не блокер производительности (single-tenant), но делает код неправильным по структуре и создаёт ненужную нагрузку при каждом открытии настроек.

**Fix:** Добавить в сервис функцию `get_all_settings(db, tg_user_id) -> AppUser` и читать все поля одним запросом, либо получать пользователя один раз в route handler:

```python
user = await _get_user_or_404(db, current_user["id"])
return SettingsRead(
    cycle_start_day=user.cycle_start_day,
    notify_days_before=user.notify_days_before,
    is_bot_bound=user.tg_chat_id is not None,
    enable_ai_categorization=user.enable_ai_categorization,
)
```

---

### WR-06: `useAiCategorize` устанавливает `loading=false` в cleanup, но может сделать это преждевременно

**File:** `frontend/src/hooks/useAiCategorize.ts:47`

**Issue:** В cleanup функции useEffect устанавливается `setLoading(false)` при отмене debounce таймера. Это означает, что если пользователь вводит текст быстро, `loading` сбрасывается в `false` после каждого символа до запуска запроса, а затем снова ставится в `true`. Но если предыдущий timeout уже запустил `fetch` (который ещё не завершился) и пришёл новый символ — cleanup отменяет только таймер, но не завершившийся fetch. Отсутствует cancellation токен (AbortController) для самого HTTP-запроса, поэтому в гонке: старый запрос может прийти позже нового и перетереть более актуальный suggestion.

**Fix:** Добавить AbortController для отмены in-flight запросов:

```typescript
const abortRef = useRef<AbortController | null>(null);

const timerId = setTimeout(() => {
  abortRef.current?.abort();
  abortRef.current = new AbortController();
  suggestCategory(description, abortRef.current.signal)
    .then(...)
    .catch((err) => {
      if (err.name === 'AbortError') return; // Игнорируем отменённые запросы
      setSuggestion(null);
    });
}, 500);

return () => {
  clearTimeout(timerId);
  abortRef.current?.abort();
  setLoading(false);
};
```

---

## Info

### IN-01: Дублирование `todayISO()` / `todayInMoscow()` в ActualEditor

**File:** `frontend/src/components/ActualEditor.tsx:38-44`

**Issue:** Функция `todayISO()` объявлена, но является простой обёрткой над `todayInMoscow()` без добавленной логики. Одна из них лишняя.

**Fix:** Удалить `todayISO()`, использовать `todayInMoscow()` напрямую в строке 85.

---

### IN-02: Тест проверяет только наличие атрибута, но не сигнатуру методов

**File:** `tests/ai/test_embeddings.py:25-37`

**Issue:** Тесты `test_embedding_service_has_embed_text_method` и `test_embedding_service_has_upsert_category_method` проверяют только `hasattr(EmbeddingService, "method_name")` без проверки, что метод является async-методом с правильными аргументами. Тест пройдёт даже если метод переименован в sync-вариант или изменена сигнатура.

**Fix:** Добавить проверку через `inspect.iscoroutinefunction`:
```python
import inspect
from app.ai.embedding_service import EmbeddingService

assert inspect.iscoroutinefunction(EmbeddingService.embed_text)
assert inspect.iscoroutinefunction(EmbeddingService.suggest_category)
```

---

### IN-03: `EMBEDDING_MODEL` из settings не проверяется в `validate_production_settings`

**File:** `app/core/settings.py:50-75`

**Issue:** Функция `validate_production_settings` проверяет `OPENAI_API_KEY`, но не проверяет `EMBEDDING_MODEL`. Если `EMBEDDING_MODEL` оставить пустым или задать некорректную модель, ошибка возникнет только при первом запросе к OpenAI в рантайме, а не при старте. Это незначительно, но нарушает принцип fast-fail для конфигурации.

**Fix:** Можно добавить проверку наличия модели:
```python
if not s.EMBEDDING_MODEL:
    insecure.append("EMBEDDING_MODEL")
```

---

_Reviewed: 2026-05-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
