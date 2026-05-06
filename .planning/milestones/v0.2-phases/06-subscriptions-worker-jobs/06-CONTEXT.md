# Phase 6: Subscriptions & Worker Jobs - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — all decisions at Claude's discretion)

<domain>
## Phase Boundary

Полная реализация функционала подписок: CRUD управление через Mini App (экран «Подписки»
со sketch 004-A: hero-блок + горизонтальный таймлайн + список карточек), два worker-job'а
(notify_subscriptions 09:00 МСК и charge_subscriptions 00:05 МСК с pg_try_advisory_lock),
endpoint `POST /subscriptions/{id}/charge-now` для ручного списания, расширение Settings
на глобальный дефолт `notify_days_before` (SET-02). Уникальный constraint
`(subscription_id, original_charge_date)` уже есть в схеме — используем.

Требования: SUB-01, SUB-02, SUB-03, SUB-04, SUB-05, SET-02.

**Не входит в Phase 6:**
- Автоматическая дедупликация при ручном вводе (REQUIREMENTS.md OUT OF SCOPE).
- Push-алерты перерасхода (ANL-03 — post-MVP).
- ActualTransaction при срабатывании подписки — только PlannedTransaction(source=subscription_auto).

</domain>

<decisions>
## Implementation Decisions

### Backend API (Subscriptions)

- **D-71:** Router `app/api/routes/subscriptions.py` → `subscriptions_router` (prefix=`/subscriptions`, `tags=["subscriptions"]`, `dependencies=[Depends(get_current_user)]`):
  - `GET /subscriptions` — список всех подписок (active + inactive), сортировка `next_charge_date ASC`
  - `POST /subscriptions` — создать подписку; `notify_days_before` дефолтится из `AppUser.notify_days_before` если не передан явно
  - `PATCH /subscriptions/{id}` — частичное обновление (любое поле)
  - `DELETE /subscriptions/{id}` — hard delete (соглашение кодовой базы)
  - `POST /subscriptions/{id}/charge-now` — ручное списание: создаёт `PlannedTransaction(source=subscription_auto, subscription_id=id, original_charge_date=sub.next_charge_date)`, сдвигает `next_charge_date` (+1 mo / +1 yr); идемпотентно через unique constraint — повторный вызов в тот же день → HTTP 409

- **D-72:** Pydantic-схемы в `app/api/schemas/subscriptions.py`:
  - `SubscriptionCreate`: name, amount_cents (gt=0), cycle (SubCycle), next_charge_date (date), category_id, notify_days_before (int, ge=0, le=30, optional — defaults to user global setting server-side), is_active (bool, default=True)
  - `SubscriptionUpdate`: все поля Optional
  - `SubscriptionRead`: все поля + id + `category: CategoryRead` (joined)
  - `ChargeNowResponse`: `{planned_id: int, next_charge_date: date}` — для UI confirmation

- **D-73:** Service `app/services/subscriptions.py`:
  - `list_subscriptions() -> list[Subscription]`
  - `create_subscription(*, name, amount_cents, cycle, next_charge_date, category_id, notify_days_before) -> Subscription`
  - `update_subscription(id, patch) -> Subscription`
  - `delete_subscription(id) -> None`
  - `charge_subscription(id, *, db) -> tuple[PlannedTransaction, date]` — общая логика для charge-now и worker job; raises `AlreadyChargedError` (HTTP 409) при unique violation

- **D-74:** `_advance_charge_date(sub: Subscription) -> date`:
  ```python
  from dateutil.relativedelta import relativedelta
  if sub.cycle == SubCycle.monthly:
      return sub.next_charge_date + relativedelta(months=1)
  else:  # yearly
      return sub.next_charge_date + relativedelta(years=1)
  ```
  Использует `python-dateutil` (уже в pyproject.toml).

### Settings — SET-02

- **D-75:** Добавить `notify_days_before: Mapped[int] = mapped_column(Integer, default=2, nullable=False)` в модель `AppUser`. Новая Alembic-миграция `0002_add_notify_days_before.py` с `ALTER TABLE app_user ADD COLUMN notify_days_before INTEGER NOT NULL DEFAULT 2`.

- **D-76:** Расширить `app/services/settings.py`:
  - `get_notify_days_before(db, tg_user_id) -> int`
  - `update_notify_days_before(db, tg_user_id, value: int) -> int`

- **D-77:** Расширить существующий `SettingsRead` / `SettingsUpdate` (schemas + route):
  - `SettingsRead.notify_days_before: int`
  - `SettingsUpdate.notify_days_before: Optional[int] = Field(None, ge=0, le=30)`
  - `PATCH /settings` теперь обновляет оба поля если переданы (partial update)

### Worker Jobs & Push Mechanism

- **D-78:** `app/worker/jobs/notify_subscriptions.py` — daily 09:00 МСК (SUB-03):
  ```python
  ADVISORY_LOCK_KEY = 20250502  # per comment in close_period.py
  ```
  Алгоритм:
  1. `pg_try_advisory_lock(20250502)` — bail if False
  2. Fetch `AppUser.tg_chat_id` — skip job if None (push некуда слать)
  3. Query: `SELECT * FROM subscription WHERE is_active=true AND next_charge_date = today_msk + notify_days_before`
  4. Для каждой подписки: текст «🔔 Списание "{name}" — {amount} ₽ через {notify_days_before} дн. ({date_str})»
  5. `bot.send_message(chat_id, text)` через aiogram `Bot(token=settings.BOT_TOKEN)` — только API-клиент, без dispatcher
  6. Log each sent notification
  7. Release lock in finally

- **D-79:** **Push via aiogram Bot API-клиент**: worker создаёт `Bot(token=settings.BOT_TOKEN)` только для отправки, без dispatcher. `await bot.send_message(chat_id=tg_chat_id, text=text)`. `await bot.session.close()` в finally. Это стандартный паттерн для worker'ов — bot container держит dispatcher, worker использует Bot как HTTP-клиент.
  - `BOT_TOKEN` уже в `settings` (Phase 1).
  - `tg_chat_id` берётся из `AppUser` (хранится с Phase 2).

- **D-80:** `app/worker/jobs/charge_subscriptions.py` — daily 00:05 МСК (SUB-04):
  ```python
  ADVISORY_LOCK_KEY = 20250503
  ```
  Алгоритм:
  1. `pg_try_advisory_lock(20250503)` — bail if False
  2. Query: `SELECT * FROM subscription WHERE is_active=true AND next_charge_date = today_msk`
  3. Для каждой: `cycle_start_day = get_cycle_start_day()`; `period_id = _resolve_period_for_date(next_charge_date)` (из `app/services/actual.py` — уже реализована в Phase 4)
  4. INSERT `PlannedTransaction(source=subscription_auto, subscription_id=sub.id, original_charge_date=sub.next_charge_date, period_id=period_id, kind=cat.kind, amount_cents=sub.amount_cents, category_id=sub.category_id)`
  5. При `UniqueViolationError` (unique constraint `uq_planned_sub_charge_date`) — rollback partial, log "already charged", skip to next subscription (not fail entire job)
  6. Advance `sub.next_charge_date = _advance_charge_date(sub)`
  7. COMMIT per subscription (не весь batch в одной транзакции — чтобы один failure не откатывал остальные)
  8. Release lock in finally

- **D-81:** `main_worker.py` — раскомментировать placeholders, зарегистрировать оба job'а:
  ```python
  scheduler.add_job(notify_subscriptions_job, "cron", hour=9, minute=0, id="notify_subscriptions", timezone=MOSCOW_TZ)
  scheduler.add_job(charge_subscriptions_job, "cron", hour=0, minute=5, id="charge_subscriptions", timezone=MOSCOW_TZ)
  ```

### Frontend — SubscriptionsScreen

- **D-82:** Новый экран `frontend/src/screens/SubscriptionsScreen.tsx` + `SubscriptionsScreen.module.css`:
  - **Hero block**: «Подписки активных: {count}», «Нагрузка в месяц: {monthly_total} ₽» (суммируем только monthly; yearly делим /12)
  - **Timeline card**: горизонтальная шкала CSS (no SVG) — линия-контейнер + dots позиционированы через `left: {dayOfMonth/daysInMonth * 100}%`. Today-line — `position: absolute; left: {todayPct}%`. Цвета dots: ≤2 дня = `var(--danger)`, ≤7 = `var(--warn)`, иначе `var(--text-secondary)`. При hover/tap — tooltip `{name}: {date_str}`.
  - **Subscription list**: карточки grouped NOT — плоский список по `next_charge_date ASC`. Каждая карточка: название + `[мес]`/`[год]` badge + сумма + «через N дн.» pill с цветом (≤2 красный, ≤7 жёлтый, иначе нейтральный) + toggle is_active + tap → edit sheet.
  - **MainButton**: «+ Добавить подписку» (открывает SubscriptionEditor в create mode)

- **D-83:** `SubscriptionEditor.tsx` — новый компонент (по образцу `ActualEditor.tsx`):
  - Поля: name (text), amount (number в рублях → конвертируем в копейки), cycle (segmented «Мес / Год»), next_charge_date (date picker), category (select), notify_days_before (number, default из Settings), is_active (toggle)
  - create + edit mode через props (same as ActualEditor pattern)
  - delete button в edit mode

- **D-84:** Navigation: добавить «Подписки» в nav-bar в `App.tsx` (рядом с существующими tabs/кнопками навигации)

- **D-85:** API layer `frontend/src/api/subscriptions.ts` + hook `frontend/src/hooks/useSubscriptions.ts`:
  - `listSubscriptions`, `createSubscription`, `updateSubscription`, `deleteSubscription`, `chargeNow`
  - Hook: `{ subscriptions, loading, error, refetch, mutate }`

- **D-86:** TypeScript типы в `frontend/src/api/types.ts` (extend):
  ```typescript
  export type SubCycle = 'monthly' | 'yearly';
  export interface SubscriptionRead { id, name, amount_cents, cycle, next_charge_date, category_id, notify_days_before, is_active, category: CategoryRead }
  export interface SubscriptionCreatePayload { name, amount_cents, cycle, next_charge_date, category_id, notify_days_before?, is_active? }
  export interface SubscriptionUpdatePayload { ... (all optional) }
  ```

### Testing

- **D-87:** Wave 0 RED тесты — `tests/test_subscriptions.py`:
  - CRUD: create, read list, update, delete; archived category → 400; auth 403 без initData
  - `POST /subscriptions/{id}/charge-now` — creates PlannedTransaction + advances date; repeated call same day → 409
  - Settings extension: `GET /settings` returns `notify_days_before`; `PATCH /settings` updates it
  - Используют `_require_db` self-skip pattern (Phase 2/3/4 convention)

- **D-88:** Worker unit tests `tests/test_worker_charge.py`:
  - `charge_subscriptions_job` с mocked DB (или `_require_db`): monthly/yearly date advance + idempotency (duplicate → no crash)
  - `notify_subscriptions_job` с mocked aiogram Bot: убеждаемся что send_message вызывается с правильным chat_id и text

### Claude's Discretion

- Точные CSS-токены для timeline dots и pills — из `themes/default.css` (warn/danger/success var)
- Структура hero-block (один компонент или inline в SubscriptionsScreen)
- Точный текст push-нотификаций (формат даты, emoji)
- Группировка worker-job тестов: один файл `tests/test_workers_phase6.py` или два отдельных — на усмотрение executor'а
- Tooltip-реализация для timeline dots: CSS :hover vs title attr vs кастомный portal

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Subscription` ORM-модель + `SubCycle` enum + индекс `ix_subscription_active_charge` — ГОТОВЫ в models.py:139-156
- `PlannedTransaction.subscription_id + original_charge_date + UniqueConstraint uq_planned_sub_charge_date` — ГОТОВО в models.py:175-188
- `_advance_charge_date` можно строить на `dateutil.relativedelta` (pyproject.toml:14 — `python-dateutil==2.9.0.post0`)
- `_resolve_period_for_date(db, tx_date, *, cycle_start_day)` — уже реализована в `app/services/actual.py` (Phase 4, D-52)
- `_today_in_app_tz()` — в `app/services/periods.py`
- `get_cycle_start_day(db, tg_user_id)` — в `app/services/settings.py`
- `pg_try_advisory_lock` pattern — `app/worker/jobs/close_period.py` (полный шаблон с lock/unlock/rollback)
- Advisory lock keys planned: notify=20250502, charge=20250503 (комментарий в close_period.py:42)
- `Bot(token=settings.BOT_TOKEN)` pattern — aiogram Bot как API-клиент без dispatcher; `settings.BOT_TOKEN` доступен
- `AppUser.tg_chat_id` — хранится с Phase 2; нужен для push
- `BottomSheet` + `ActualEditor` pattern — полный шаблон для `SubscriptionEditor`
- `Fab.tsx`, `MainButton.tsx`, `SectionCard.tsx` — переиспользуем
- `apiFetch` + `useCurrentPeriod` + `useCategories` pattern — hooks
- CSS tokens: `var(--c-warn)`, `var(--c-danger)`, `var(--c-success)`, `var(--gradient-hero)` в `themes/default.css`

### Established Patterns
- Router-level `Depends(get_current_user)` — Phase 2/3/4
- Service layer: pure functions, no FastAPI imports, raise domain exceptions
- Route layer: map domain exceptions → HTTPException
- BIGINT копейки; форматирование через `formatKopecks*`
- CSS Modules для компонентов
- Mutation → refetch + toast + busy guard pattern (PlannedScreen/ActualScreen)
- `_require_db` self-skip в интеграционных тестах
- Worker jobs: AsyncSessionLocal context manager + advisory lock + try/finally

### Integration Points
- `app/api/router.py` — зарегистрировать `subscriptions_router` (public) + update settings route (existing)
- `main_worker.py` — раскомментировать и импортировать два новых job'а
- `frontend/src/App.tsx` — добавить `'subscriptions'` в Screen union + nav кнопку
- `frontend/src/screens/SettingsScreen.tsx` — добавить поле `notify_days_before`
- Alembic: новая миграция `0002_add_notify_days_before.py`

### Files Modified Across Plans (wave-распределение)

| File | Plan(s) |
|------|---------|
| `tests/test_subscriptions.py` | 06-01 (RED gate) |
| `app/db/models.py` | 06-02 (add notify_days_before to AppUser) |
| `alembic/versions/0002_*.py` | 06-02 (new migration) |
| `app/api/schemas/subscriptions.py` | 06-02 (новый) |
| `app/services/subscriptions.py` | 06-02 (новый) |
| `app/services/settings.py` | 06-02 (extend) |
| `app/api/schemas/settings.py` | 06-02 (extend) |
| `app/api/routes/subscriptions.py` | 06-03 (новый router) |
| `app/api/routes/settings.py` | 06-03 (extend PATCH) |
| `app/api/router.py` | 06-03 (register subscriptions_router) |
| `app/worker/jobs/notify_subscriptions.py` | 06-04 (новый) |
| `app/worker/jobs/charge_subscriptions.py` | 06-04 (новый) |
| `main_worker.py` | 06-04 (register jobs) |
| `frontend/src/api/subscriptions.ts` | 06-05 (новый) |
| `frontend/src/api/types.ts` | 06-05 (extend) |
| `frontend/src/hooks/useSubscriptions.ts` | 06-05 (новый) |
| `frontend/src/components/SubscriptionEditor.tsx` | 06-05 (новый) |
| `frontend/src/screens/SubscriptionsScreen.tsx` | 06-06 (новый) |
| `frontend/src/screens/SettingsScreen.tsx` | 06-06 (extend) |
| `frontend/src/App.tsx` | 06-06 (extend) |

</code_context>

<specifics>
## Specific Ideas

### Timeline CSS Layout

```tsx
// SubscriptionTimeline — горизонтальная шкала
// days = количество дней в текущем месяце
// today = сегодняшний day-of-month
// sub.next_charge_date.getDate() = день списания
const todayPct = ((today - 1) / (days - 1)) * 100;
const chargePct = ((chargeDay - 1) / (days - 1)) * 100;

// Dot: position: absolute; left: `${chargePct}%`; transform: translateX(-50%)
// Today-line: position: absolute; left: `${todayPct}%`; height: 100%; border-left: 2px solid var(--c-accent)
```

### Push message format (D-78)

```
🔔 Подписка «{name}»
   Спишется {amount_rub} ₽ через {N} дн. ({dd MMM})
```

### charge-now HTTP 409 on duplicate

```python
# service layer
try:
    db.add(planned)
    await db.flush()
except IntegrityError:
    await db.rollback()
    raise AlreadyChargedError(subscription_id, original_charge_date)
```

### Sketch 004-A implementation guidance

Winner A: Hero (total monthly load + ближайшее списание) + timeline card (horizontal CSS bar) + flat list sorted by next_charge_date. Pills показывают «через N дн.» с цветом. MainButton «+ Добавить подписку».

</specifics>

<deferred>
## Deferred Ideas

- ActualTransaction при charge (реальное списание в факт) — только PlannedTransaction в MVP; пользователь сам вводит факт через Mini App / бот
- Суммарный yearly view таймлайна (12 месяцев) — отложено в post-MVP
- Отмена подписки (toggle is_active) через bot-команду — only Mini App in MVP
- CSV-экспорт подписок — out of scope
- Webhook mode бота — long-poll сохраняем
- Notification sound / vibration (Telegram WebApp.requestWriteAccess) — отложено

</deferred>

---

*Phase: 06-subscriptions-worker-jobs*
*Context gathered: 2026-05-03 (autonomous mode)*
