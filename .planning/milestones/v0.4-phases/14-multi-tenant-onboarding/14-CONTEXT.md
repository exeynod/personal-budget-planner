# Phase 14: Multi-Tenant Onboarding - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Приглашённый юзер (`role=member`, добавлен через Admin UI Phase 13) проходит self-onboarding в Mini App без участия owner. Поток: бот `/start` → персонализированное приветствие + chat-bind → редирект во встроенный onboarding flow → starting_balance + cycle_start_day + 14 seed-категорий per-user → автогенерация embeddings для seed-категорий.

До завершения onboarding все доменные API возвращают 409 `onboarding_required`, и frontend перехватывает 409 и редиректит юзера на `OnboardingScreen`. Существующий owner проходит чистым (его `onboarded_at` уже не пуст с v0.2).

Out of scope: новый дизайн onboarding flow (sketch 006-B уже выигран и реализован в v0.2 для owner — переиспользуем), реальная отдача embeddings под нагрузкой (это всегда per-user 14 строк, малая нагрузка), bulk-onboarding.

</domain>

<decisions>
## Implementation Decisions

### 409 Onboarding Gate (backend)
- Реализация — **dependency `require_onboarded`** в `app/api/dependencies.py`, композится с `get_current_user` → проверяет `current_user.onboarded_at IS NOT NULL`, иначе `HTTPException(409, detail={"error": "onboarding_required"})`. Используется как `Depends(require_onboarded)` на роутерах, не на отдельных endpoint'ах.
- Освобождены от гейта: `/me`, `/onboarding/*`, `/internal/*`, `/admin/*` (admin = require_owner = owner уже onboarded), `/health`. Все остальные доменные роутеры (`categories`, `actual`, `planned`, `templates`, `subscriptions`, `periods`, `analytics`, `ai`, `ai_suggest`, `settings`) получают `Depends(require_onboarded)`.
- Формат 409 — `{"detail": {"error": "onboarding_required"}}` (FastAPI `HTTPException(detail=dict)` сериализует словарь). Frontend проверяет `e.body.detail?.error === 'onboarding_required'` или просто `status === 409`.
- `tg_chat_id` есть, `onboarded_at` пуст → гейт срабатывает (chat-bind не равно onboarded).

### Bot `/start` for member (MTONB-01)
- Различение: после `bot_resolve_user_role` + `chat-bind` бот делает прямой DB-lookup (через `bot_resolve_user_role` уже даёт `UserRole`, нужно ещё `onboarded_at` — расширяем helper до `bot_resolve_user(tg_user_id) -> AppUser | None` или добавляем отдельный `bot_user_onboarded(tg_user_id) -> bool`).
- Текст для onboarded member и owner — текущий `?start=onboard` greeting + WebApp button (без изменений).
- Текст для **member, не прошедшего onboarding** (или owner с `onboarded_at IS NULL` — теоретически невозможно, но симметрично) — «Добро пожаловать! Откройте приложение и пройдите настройку — это займёт минуту.» + WebApp button.
- `?start=onboard` payload — оставить семантику: payload запоминается, но не меняет gate-логику (opens app в любом случае; гейт во frontend сам решает на основании `/me`).
- `tg_chat_id` сохраняется через существующий `/internal/telegram/chat-bind` (он tenant-aware с Phase 11).

### Auto-embedding для 14 seed-категорий (MTONB-03)
- **Inline async внутри `complete_onboarding` сервиса** — после `seed_default_categories(user_id=...)` вызываем `await ai_embedding_backfill_user(db, user_id, embedding_svc)` или подобный helper, который для всех `Category` юзера без `CategoryEmbedding` строки генерит вектор через `embedding_svc.embed_text(name)` и записывает.
- Лимит времени — отказоустойчиво: оборачиваем backfill в `try/except`, при провале логируем `WARNING`, оставляем `CategoryEmbedding=пусто`. Onboarding всё равно success. Фоновый дозалив — текущий APScheduler-джоб НЕ занимается этим, поэтому добавим **новую идемпотентную джобу `backfill_missing_embeddings`** в worker (или одноразовый фолбэк on-demand при первом `/ai/suggest-category` — проще). MVP: фолбэк on-demand в `ai_suggest`.
- Провайдер — OpenAI `text-embedding-3-small` через существующий `embedding_svc` (Phase 9). Модель в settings.
- Хранилище — существующая `category_embedding` таблица (PK = category_id, FK CASCADE; имеет `user_id` FK для tenant-scoping).
- Нагрузка — 14 запросов к OpenAI, parallel via `asyncio.gather`. Время — ~1-3 сек суммарно.

### Frontend gate + UX
- Перехват 409 — централизованно в `frontend/src/api/client.ts`. `apiFetch` при 409 + `body.detail.error === 'onboarding_required'` бросает специальный `OnboardingRequiredError` (extends `ApiError`).
- Top-level handler в `App.tsx` (или routing layer) — ловит `OnboardingRequiredError` (через React error boundary или через хук `useOnboardingGate`), переключает state на «show OnboardingScreen». Минимальная реализация: `App.tsx` уже определяет «show OnboardingScreen» по `me.onboarded_at == null` — этого достаточно для большинства кейсов; 409-перехват добавляется как защитная сетка на случай race-condition (между `/me` и domain call).
- Reuse `OnboardingScreen.tsx` — текст hero ветвится по `me.role`: если `member` — «Привет! Несколько шагов и вы готовы вести бюджет», если `owner` — текущий «Добро пожаловать». Логика идентична, только копирайт.
- Layout — оставить текущий sketch 006-B (single scrollable, 4 секции с галочками). Уже реализовано в v0.2.

### Existing-user safety (MTONB success criteria #5)
- Existing owner — `onboarded_at` уже не пуст (set в v0.2). Подтверждаем простой проверкой в integration-тесте.
- Migration не нужна — никаких новых колонок не добавляется в этой фазе. Если в БД есть `app_user` с `role IN (owner, member)` и `onboarded_at IS NULL`, гейт сработает (это и есть intended behavior для invited members).

### Testing
- Unit-тесты `require_onboarded` dependency — owner-onboarded passes, member-not-onboarded → 409, member-onboarded passes.
- Integration-тест `/categories` (или любой gated endpoint) с member-not-onboarded → 409.
- Integration-тест полного flow: invite → bot /start (mock) → frontend onboarding → complete → embeddings → suggest works.
- Bot test для `/start` member-not-onboarded — текст приветствия отличается.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/onboarding.py:complete_onboarding` — atomic 4-step (validate → seed cats → first period → set onboarded_at). Уже tenant-aware (Phase 11). Расширяем добавлением шага embedding-backfill.
- `app/services/categories.py:seed_default_categories` — копирует 14 default-категорий per-user, idempotent.
- `app/ai/embedding_service.py:EmbeddingService.embed_text` — OpenAI text-embedding-3-small, in-process LRU cache.
- `app/api/routes/onboarding.py` — POST `/onboarding/complete` уже работает через `get_current_user`, обрабатывает `AlreadyOnboardedError` (409), `OnboardingUserNotFoundError` (404).
- `app/bot/handlers.py:cmd_start` — chat-bind + WebApp keyboard, role-aware. Расширяем для member-not-onboarded copy.
- `app/bot/auth.py:bot_resolve_user_role` — DB-lookup, возвращает `UserRole | None`. Расширяем (или добавляем sibling-helper `bot_resolve_user_status`) для onboarded-flag.
- `app/api/dependencies.py:get_current_user, require_owner` — current dependency layer. Добавляем `require_onboarded`.
- `app/db/models.py:AppUser` — имеет `onboarded_at: TIMESTAMP NULLABLE`, `tg_chat_id`, `role`, `starting_balance_cents`, `cycle_start_day`. Без миграции.
- `app/db/models.py:CategoryEmbedding` — PK=category_id, has user_id, vector(1536).
- `frontend/src/screens/OnboardingScreen.tsx` — full flow с polling /me, openTelegramLink, MainButton. Reuse 1:1.
- `frontend/src/api/client.ts:apiFetch, ApiError` — централизованный fetch + error class. Расширяем (новый `OnboardingRequiredError`).
- `frontend/src/api/types.ts:MeResponse` — уже имеет `onboarded_at`, `role`, `chat_id_known`.

### Established Patterns
- Backend dependency-based auth gates (Phase 12): `Depends(get_current_user)`, `Depends(require_owner)` навешиваются через router-level `dependencies=[...]`. Расширяем тем же паттерном.
- App-side `.where(user_id=...)` filtering (Phase 11) — primary defense; RLS — backstop.
- Inline-async heavy ops в onboarding: текущий `complete_onboarding` уже делает 4 шага в одной транзакции; добавление 5-го (embeddings) — natural extension.
- Frontend ApiError + per-status branches: `OnboardingScreen.handleSubmit` ловит 409 и считает success — паттерн уже устоялся.
- Bot helpers — `bot_resolve_user_role` уже DB-lookup, добавление `bot_resolve_user_onboarded` или объединение в `bot_resolve_user` повторяет тот же стиль.

### Integration Points
- `app/api/main.py` (или wherever routers подключаются) — добавляем `Depends(require_onboarded)` на конкретные доменные routers через `include_router(..., dependencies=[Depends(require_onboarded)])` или прописываем на самих роутерах.
- `app/bot/handlers.py:cmd_start` — расширяем ветвление по `onboarded_at`.
- `app/services/onboarding.py:complete_onboarding` — добавляем шаг `_backfill_user_embeddings` после seed.
- `frontend/src/api/client.ts` — новый класс `OnboardingRequiredError`.
- `frontend/src/App.tsx` — уже маршрутизирует `OnboardingScreen` по `me.onboarded_at == null`; добавляем error-boundary для `OnboardingRequiredError` (catch-all safety).
- Tests — `tests/integration/test_onboarding_gate.py` (новый), `tests/test_bot_handlers.py` (расширить).

</code_context>

<specifics>
## Specific Ideas

- **Embedding-backfill helper** — выделить в `app/services/ai_embedding_backfill.py` отдельный модуль с `async def backfill_user_embeddings(db, user_id) -> int`. Возвращает количество созданных embeddings. Используется (a) inline в `complete_onboarding`, (b) on-demand в `ai_suggest_category` если для категории нет вектора (graceful fallback).
- **`require_onboarded` имплементация** — proста: `async def require_onboarded(user: AppUser = Depends(get_current_user)) -> AppUser: if user.onboarded_at is None: raise HTTPException(409, detail={"error": "onboarding_required"}); return user`. Возвращает того же AppUser, чтобы цепочка `Depends` могла reuse.
- **Bot `/start` логика для member-not-onboarded** — после chat-bind делать второй internal API call `/internal/users/{tg_user_id}/onboarded` (новый или extend `/internal/users/{tg_user_id}/role`) или прямой DB lookup в боте. Решение: extend существующий helper `bot_resolve_user_role` → `bot_resolve_user_status` возвращающий `(role, onboarded_at)`.
- **Performance**: 14 OpenAI requests via `asyncio.gather` — каждый ~200мс, в сумме ~1сек walltime (rate limit on OpenAI side не должен сработать, лимит free-tier 3 req/sec, но `text-embedding-3-small` — 1500 RPM). Если batched API доступен — использовать batch (`embeddings.create([list_of_14])`), сократит до 1 HTTP call. ✅ OpenAI поддерживает batch в одном запросе — добавим в `embedding_service.embed_texts(list[str]) -> list[list[float]]`.
- **OnboardingRequiredError frontend** — ловится в каждом `useEffect` через try/catch + перебрасывается в context. Рассмотреть React error boundary, но MVP — глобальный `useOnboardingGate` хук, проверяющий `/me` после 409.
- **Tests для seed embeddings** — мокаем `embedding_svc.embed_text` (или `embed_texts`), проверяем что 14 рядов в `category_embedding` появилось после `complete_onboarding`.

</specifics>

<deferred>
## Deferred Ideas

- Background-worker джоба `backfill_missing_embeddings` (периодический скан `category` без `category_embedding` row) — не нужна в MVP, фолбэк on-demand в `ai_suggest` достаточен.
- Welcome-screen marketing-style для member (sketch 006-C) — пока копирайт через ветвление; полный редизайн = отдельная фаза.
- Multi-tenant onboarding analytics (сколько member'ов завершили flow / drop-off rates) — deferred до monitoring milestone.
- Re-onboarding flow (если member хочет сбросить баланс / cycle / категории) — отдельная фича.
- Admin-driven onboarding overrides (owner за member вводит данные) — отвергли, member сам должен пройти.

</deferred>
