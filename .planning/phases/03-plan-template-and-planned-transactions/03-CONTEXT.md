# Phase 3: Plan Template & Planned Transactions — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Auto (decisions made on behalf of user; revisable in revision mode)

<domain>
## Phase Boundary

Доменное наполнение «План». После этой фазы:
- В БД активно использует таблицы `plan_template_item` и `planned_transaction` (схема Phase 1, без миграций).
- Backend: `/api/v1/template/items` (CRUD), `/api/v1/template/snapshot-from-period/{period_id}`, `/api/v1/periods/{period_id}/apply-template`, `/api/v1/periods/{period_id}/planned` (GET/POST), `/api/v1/planned/{id}` (PATCH/DELETE).
- Frontend: два новых экрана — **TemplateScreen** (шаблон плана) и **PlannedScreen** (план текущего периода). Оба используют паттерн sketch 005-B (group by category + inline-edit + bottom-sheet для полного редактора). Новый общий компонент `BottomSheet`.
- Решение для PER-05 (отложенное из Phase 2): реализовано через явный POST `/periods/{id}/apply-template`, которым пользуется UI «Применить шаблон». Phase 5 worker `close_period` будет звать этот же сервис при создании нового периода — поэтому идемпотентность критична.

**Не входит в Phase 3:**
- ActualTransaction (Phase 4) и связанные UI-компоненты добавления факт-трат (хотя `BottomSheet` создаётся в Phase 3 и переиспользуется в Phase 4 — D-43).
- Worker `close_period` (Phase 5, PER-04). Phase 3 предоставляет endpoint `apply-template` готовым к вызову worker'ом, но сам worker — Phase 5.
- Subscriptions (Phase 6). PLN-03 «🔁 from subscription» маркер реализуется визуально на основе поля `source='subscription_auto'` — но в БД таких строк не будет до Phase 6, поэтому верификация PLN-03 идёт на mock-данных (D-37).
- Dashboard / агрегации план-vs-факт (Phase 5).
- Drag-n-drop reorder строк шаблона (deferred).

</domain>

<decisions>
## Implementation Decisions

### Storage & Schema

- **D-30:** Никаких миграций в Phase 3. Таблицы `plan_template_item` и `planned_transaction` уже созданы в Phase 1 (см. `app/db/models.py`). Идемпотентность apply-template решается на уровне сервиса (D-31), а не через дополнительный unique constraint. Это согласуется с принципом «schema changes только когда поведенчески нужны».

- **D-31:** **Идемпотентность POST `/periods/{id}/apply-template`** реализуется проверкой существующих строк до вставки:
  - Сервис `apply_template_to_period(period_id)` сначала делает `SELECT count() FROM planned_transaction WHERE period_id = :pid AND source = 'template'`.
  - Если count > 0 — возвращает существующие строки (с `created: 0`), HTTP 200.
  - Если count == 0 — вставляет все строки шаблона (через `db.add_all` + `flush`), возвращает их (с `created: N`), HTTP 200.
  - Response shape всегда одинаковый: `{ period_id, created, planned: [PlannedRead, ...] }`.
  - **Не вводим unique constraint** на `(period_id, source, category_id, ...)` — это потребовало бы миграцию + усложнило бы случай «пользователь стер строку шаблона руками, потом передумал и хочет применить заново». Source-based check проще.
  - **Trade-off:** Если пользователь после apply-template добавил вручную строку с category_id=X, потом удалил все template-строки (но manual-строка осталась), повторный apply-template увидит count(source=template)=0 и снова создаст полный набор. Это корректное поведение: manual и template — независимые источники.

- **D-32:** **POST `/periods/{id}/snapshot-from-period`** (TPL-03 — «Перенести план в шаблон») — destructive overwrite:
  - DELETE all `plan_template_item` rows.
  - SELECT `planned_transaction` WHERE `period_id = :pid AND source IN ('template', 'manual')` — **исключаем `subscription_auto`** (чтобы шаблон не «разрастался» автоматически от подписок; подписки и так формируют свои plan-строки в каждом периоде через worker).
  - INSERT новые `plan_template_item` rows (mapping: `category_id`, `amount_cents`, `description`, `day_of_period := planned_date.day if planned_date else NULL`, `sort_order := index`).
  - Single transaction (DELETE + INSERT atomic).
  - Response: `{ template_items: [...], replaced: <prev_count> }`.

### API Layout

- **D-33:** Новые routers и file paths (следуем D-03/D-04 Phase 2):
  - `app/api/routes/templates.py` → `templates_router` (prefix=`/template`, tags=`["templates"]`)
    - `GET /template/items` — список template-items
    - `POST /template/items` — создать template-item
    - `PATCH /template/items/{id}` — обновить
    - `DELETE /template/items/{id}` — удалить (hard delete, не soft — соглашение CLAUDE.md «soft delete только для category»)
    - `POST /template/snapshot-from-period/{period_id}` — snapshot
  - `app/api/routes/planned.py` → `planned_router` (prefix=`""`, tags=`["planned"]`) — два под-блока:
    - `GET /periods/{period_id}/planned?kind=&category_id=` — список plan-строк периода
    - `POST /periods/{period_id}/planned` — создать (source=manual)
    - `POST /periods/{period_id}/apply-template` — apply (idempotent)
    - `PATCH /planned/{id}` — обновить
    - `DELETE /planned/{id}` — удалить (hard delete)
  - **Зачем два роутера:** routes для шаблона и для plan-строк семантически независимы (разные ресурсы); легче тестировать. `apply-template` логически относится к «periods», но физически живёт в `planned.py` (как операция, создающая planned rows).
  - **Все public routes под `Depends(get_current_user)`** (на уровне router, как в Phase 2).

- **D-34:** Pydantic-схемы — два новых файла (D-05 Phase 2):
  - `app/api/schemas/templates.py`: `TemplateItemCreate`, `TemplateItemUpdate`, `TemplateItemRead`, `SnapshotFromPeriodResponse`.
  - `app/api/schemas/planned.py`: `PlannedCreate`, `PlannedUpdate`, `PlannedRead`, `ApplyTemplateResponse`.
  - Все суммы в копейках (`amount_cents: int`), snake_case, source как `Literal["template", "manual", "subscription_auto"]`.

- **D-35:** Service-слой:
  - `app/services/templates.py`: `list_template_items`, `create_template_item`, `update_template_item`, `delete_template_item`, `snapshot_from_period(period_id)`. Domain exception: `TemplateItemNotFoundError`.
  - `app/services/planned.py`: `list_planned_for_period(period_id, *, kind=None, category_id=None)`, `create_manual_planned(period_id, ...)`, `update_planned(planned_id, patch)`, `delete_planned(planned_id)`, `apply_template_to_period(period_id)`. Domain exceptions: `PlannedNotFoundError`, `PeriodNotFoundError`.
  - Сервисы НЕ импортируют FastAPI (re-confirm Phase 2 паттерна). Route-layer мапит exceptions в HTTPException.
  - **`apply_template_to_period` идёт через `app/services/planned.py`** (а не `templates.py`), потому что результат — planned rows; templates — read-only зависимость.

### Domain Validation

- **D-36:** При создании/обновлении planned/template item:
  - `category_id` должен существовать и быть `is_archived=false`. Если категория архивная — 400 (`InvalidCategoryError("Cannot use archived category")`). Это защищает от создания plan-строк с категориями, которые скрыты в UI.
  - `kind` plan-строки должен совпадать с `kind` категории (например, нельзя plan-строку с category_id, которая `kind=expense`, но передать `kind=income`). Сервис валидирует это; route мапит в 400.
  - `day_of_period` (для template) — опциональный, валидация Pydantic `Field(default=None, ge=1, le=31)`. Не клампим к длине месяца на этапе template — клампим при apply-template (через `planned_date = period_start + (day_of_period - 1)` с проверкой границ периода).
  - `amount_cents`: `Field(gt=0)` — отрицательные/нулевые суммы запрещены (план без суммы бессмысленен).

### PLN-03 Visual Marker

- **D-37:** **«🔁 from subscription»** — визуальный маркер для строк с `source='subscription_auto'`:
  - Реализуется во frontend компоненте `PlannedRow` (внутри PlannedScreen): если `row.source === 'subscription_auto'` — рендерим badge `🔁 Подписка` рядом с описанием, серый цвет, нечитаемая (no edit pencil), кнопка удаления отключена с tooltip «Управляется подпиской — измените в разделе «Подписки»».
  - В Phase 3 в БД таких строк не будет (subscriptions появятся в Phase 6). Поэтому verification PLN-03 — на mock-данных:
    - Wave 0 frontend test (или manual checkpoint) — UI разработчик инжектит фейковую строку `source='subscription_auto'` в state и проверяет visual rendering.
    - Альтернативно: **бэкенд seed-skript** `tests/manual/inject_mock_subscription_planned.py` (опциональный, не запускается автотестами) — создаёт одну фейковую planned-строку с source=subscription_auto для UI-walkthrough.
    - В CONTEXT для исполнителя: PLN-03 завершён, когда (а) код PlannedRow обрабатывает `source='subscription_auto'` ветку, (б) checkpoint:human-verify подтверждает визуал на инъецированной mock-строке.
  - Edit/delete для subscription_auto строк **запрещены** (server-side также): `update_planned` и `delete_planned` возвращают 400 если `row.source == 'subscription_auto'` (`SubscriptionPlannedReadOnlyError`). Это страховка на будущее — Phase 6 предположит, что только subscription cron-job меняет такие строки.

### Apply-Template Trigger UI

- **D-38:** Кнопка «Применить шаблон» в PlannedScreen:
  - Показывается только когда у периода **нет ни одной plan-строки** (любого source). Если шаблон пустой — вместо кнопки показываем placeholder «Шаблон пуст. Перейдите в «Шаблон» чтобы заполнить».
  - При клике: POST `/periods/{current_period.id}/apply-template`, при успехе — refetch + toast «Применено N строк».
  - Если повторно нажать (например, после удаления нескольких строк): кнопка скрывается после первого apply (есть строки), появляется только после полного очищения. Идемпотентность endpoint защищает от случайного дубля.

- **D-39:** Кнопка «Перенести план в шаблон» в PlannedScreen (TPL-03):
  - Показывается всегда (даже на пустом периоде — тогда snapshot создаст пустой шаблон, по сути «очистит» текущий шаблон).
  - При клике: `window.confirm("Перезаписать шаблон текущим планом? Существующий шаблон будет удалён.")` → POST `/template/snapshot-from-period/{current_period.id}`, при успехе — toast «Шаблон обновлён: N строк».
  - Snapshot включает только `source IN (template, manual)` (D-32) — пользователь интуитивно ожидает, что подписки не «утекут» в шаблон.

### BottomSheet Component

- **D-40:** `frontend/src/components/BottomSheet.tsx` — переиспользуемый bottom-sheet:
  - CSS-only анимация (slide-up): `transform: translateY(100%) → translateY(0)` через `transition`. Никаких библиотек (D-18 Phase 2: minimum deps).
  - Backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.5)`. Tap на backdrop → close.
  - Sheet: `position: fixed; bottom: 0; left: 0; right: 0; max-height: 85vh; overflow: auto; border-radius: 20px 20px 0 0` (как в sketch 002-B).
  - Props: `{ open: boolean, onClose: () => void, title: string, children: ReactNode }`.
  - Используется в Phase 3 для полного редактора template-item / planned-row (поля: category, amount, description, day_of_period/planned_date). В Phase 4 переиспользуется для add-actual-transaction (sketch 002-B).
  - Telegram BackButton: при `open=true` подписываемся на `tg.BackButton.onClick(onClose)` через `@telegram-apps/sdk-react`. В браузере — Esc closes.

### TemplateScreen Layout

- **D-41:** `frontend/src/screens/TemplateScreen.tsx`:
  - Заголовок «Шаблон плана», back button, action button «↻ В шаблон» (только в PlannedScreen, не здесь — здесь template уже master).
  - Группировка `by category` (как в CategoriesScreen — D-43 reuse pattern):
    - Группы по `kind` (Расходы / Доходы).
    - Внутри `kind` — sub-groups по `category.name`. В каждой sub-group — строки template-item.
  - Inline-edit суммы (sketch 005-B): tap на сумму → input field, Enter сохраняет, Esc отменяет (как в CategoryRow).
  - Tap на не-amount часть строки (название/описание/day badge) → открывает BottomSheet полного редактора.
  - В каждой sub-group: «+ Добавить строку в `<category>`» — open BottomSheet в режиме «новая строка» с предзаполненной категорией.
  - Если строк нет: empty-state «Шаблон пуст. Добавьте первую строку.» + кнопка «+ Добавить строку» → BottomSheet с пустой категорией.
  - `day_of_period` отображается как badge «День N» рядом с описанием (если задано).

### PlannedScreen Layout

- **D-42:** `frontend/src/screens/PlannedScreen.tsx`:
  - Заголовок «План текущего периода», back button, action buttons «Применить шаблон» (conditional, D-38) и «↻ В шаблон» (TPL-03, D-39).
  - Sub-header: текущий период (`Февраль 2026 · 5 фев — 4 мар`).
  - Группировка такая же, как в TemplateScreen (by kind → by category).
  - Каждая plan-строка: amount inline-edit + tap-to-edit-full → BottomSheet.
  - subscription_auto строки: read-only с badge «🔁 Подписка» (D-37). Edit и delete заблокированы.
  - manual строки: создаются через «+ Добавить строку» (BottomSheet «новая plan-строка», source=manual).
  - template строки: визуально не отличаются от manual (badge только для subscription_auto). Можно редактировать сумму/описание/категорию (PATCH /planned/{id}).
  - Empty-state: показывается кнопка «Применить шаблон» (D-38). Если шаблон пуст — placeholder.

### Reuse from Phase 2

- **D-43:** Переиспользуем без изменений:
  - `frontend/src/api/client.ts` (apiFetch + ApiError + initData injection).
  - `frontend/src/components/SectionCard.tsx` — для empty-state карточки в PlannedScreen.
  - `frontend/src/hooks/useCategories.ts` — нужен в template/planned screens для select категории в BottomSheet (только active, без archived).
  - `frontend/src/components/MainButton.tsx` — для action кнопок (на TemplateScreen — «+ Добавить строку» если контекстная или скрыта).
  - Pattern «inline-edit с Enter/Esc» из `CategoryRow.tsx` — копируем в новый `PlanRow.tsx` (различие: редактируется amount, не name; и tap на metadata открывает sheet).
  - `useState`-routing в App.tsx (D-19): добавляем экраны `'template'` и `'planned'` в Screen union; HomeScreen получает две новые навигационные кнопки.
  - Стили: используем `frontend/src/styles/tokens.css` (D-18). Никаких новых дизайн-токенов.

### Testing

- **D-44:** Wave 0 RED тесты для Phase 3 (паттерн D-22 Phase 2):
  - `tests/test_templates.py` — CRUD template-items + snapshot-from-period
  - `tests/test_planned.py` — CRUD planned + filter by kind/category + subscription_auto read-only
  - `tests/test_apply_template.py` — POST /periods/{id}/apply-template + idempotency (повторный вызов = 200 + создаёт 0 новых)
  - `tests/test_snapshot.py` — POST /template/snapshot-from-period + destructive overwrite + exclude subscription_auto
  - Все DB-backed тесты следуют `_require_db` self-skip pattern из `tests/test_categories.py:19-21`.
  - **Frontend тестов нет** в Phase 3 (D-22 carryover). PLN-03 visual verification — manual checkpoint с mock-injection.

### Claude's Discretion

- Точные имена React-компонентов (`PlanRow`, `PlanItemEditor`, `TemplateItemRow`).
- Структура BottomSheet — может быть один универсальный компонент или два (`PlanItemSheet`, `TemplateItemSheet`) — на усмотрение исполнителя в Plan 03-05/06.
- Имена exception-классов (могут быть `TemplateItemNotFoundError` или `TemplateNotFoundError` — главное единый стиль с Phase 2).
- Точный текст empty-state и toast-сообщений.
- Способ передачи `current_period_id` в PlannedScreen — может быть из `useUser` + `useCurrentPeriod` хука или через props из App.tsx.

</decisions>

<canonical_refs>
## Canonical References

### Архитектура и API
- `docs/HLD.md` §2 — ERD (`plan_template_item`, `planned_transaction`)
- `docs/HLD.md` §2.2 — `PlanSource` enum (template/manual/subscription_auto)
- `docs/HLD.md` §4.3 — Plan Template endpoints
- `docs/HLD.md` §4.4 — Periods (`/periods/{id}/apply-template`)
- `docs/HLD.md` §4.5 — Planned Transactions endpoints
- `docs/HLD.md` §10 N-1 — unique `(subscription_id, original_charge_date)` (Phase 6, не Phase 3)

### Бизнес-правила
- `docs/BRD.md` UC-4, UC-5 — план месяца, шаблон
- `.planning/REQUIREMENTS.md` — TPL-01..04, PLN-01..03

### Дизайн-референсы
- `.planning/sketches/005-plan-and-categories/index.html` — winner B (grouped + inline edit)
- `.planning/sketches/005-plan-and-categories/README.md` — implementation note про bottom-sheet для полного редактора
- `.planning/sketches/002-add-transaction/` — winner B (bottom sheet) — паттерн для BottomSheet, который реализуется здесь и переиспользуется в Phase 4
- `.planning/sketches/themes/default.css` — design tokens (carry-over)

### Существующий код Phase 1+2
- `app/db/models.py:126-190` — `PlanTemplateItem`, `PlannedTransaction`, `PlanSource` enum
- `app/services/categories.py` — паттерн service-layer с domain exceptions
- `app/services/periods.py:19-32` — `get_current_active_period` (нужен в planned-сервисе)
- `app/api/routes/categories.py` — паттерн thin route + Pydantic + exception mapping
- `app/api/router.py:80-83` — где регистрировать новые sub-routers
- `app/api/dependencies.py` — `get_current_user`, `get_db`
- `frontend/src/screens/CategoriesScreen.tsx` — паттерн group-by-kind + inline edit
- `frontend/src/components/CategoryRow.tsx` — inline-edit с Enter/Esc
- `frontend/src/components/SectionCard.tsx` — empty-state карточка
- `frontend/src/hooks/useCategories.ts` — fetching pattern с refetch
- `frontend/src/api/client.ts` — apiFetch
- `frontend/src/api/types.ts` — место для новых TS-типов

### Требования Phase 3
- `.planning/REQUIREMENTS.md` — TPL-01, TPL-02, TPL-03, TPL-04, PLN-01, PLN-02, PLN-03
- Также косвенно покрывается PER-05 (deferred from Phase 2): apply-template endpoint, который Phase 5 worker будет вызывать при создании нового периода.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 2)
- `PlanTemplateItem`, `PlannedTransaction` ORM-модели — готовы. Никаких изменений в схеме.
- `PlanSource` enum (template/manual/subscription_auto) — готов.
- Pattern «service raises domain exception → route maps to HTTPException» — установлен и работает (`CategoryNotFoundError`, `AlreadyOnboardedError` в Phase 2).
- `get_current_active_period` сервис — нужен в `apply_template` сервисе для валидации существования периода.
- Frontend: `CategoriesScreen` group-by-kind layout, `CategoryRow` inline-edit pattern — копируем структуру для `TemplateScreen` / `PlannedScreen`.
- `useCategories` хук — будет переиспользован для category-select в BottomSheet.
- `apiFetch` + `ApiError` — без изменений.

### Established Patterns
- Async SQLAlchemy session-per-request через `Depends(get_db)`.
- Pydantic v2 response_model на каждом эндпоенте.
- structlog для логирования.
- BIGINT копейки.
- Snake_case в API/DB, camelCase только во frontend если нужно (но мы держим snake_case везде, mirror types.ts соответствует backend Pydantic схеме).
- Inline-edit: Enter сохраняет, Esc отменяет, autofocus, blur=cancel.
- Group-by-kind: визуально headers «Расходы» / «Доходы», sort by `(kind, sort_order, name)`.

### Integration Points
- `bot` ↔ `api`: НЕ задействован в Phase 3 (subscription cron-job — Phase 6).
- `worker`: НЕ задействован напрямую. Но endpoint `apply-template` готовится к будущему вызову worker'ом `close_period` (Phase 5).
- `frontend` ↔ `api`: новые endpoints под `/api/v1/template/*`, `/api/v1/periods/{id}/planned`, `/api/v1/planned/*`. Все через apiFetch + initData header.

### New Modules to Create
- `app/services/templates.py`, `app/services/planned.py`.
- `app/api/routes/templates.py`, `app/api/routes/planned.py`.
- `app/api/schemas/templates.py`, `app/api/schemas/planned.py`.
- `frontend/src/screens/TemplateScreen.tsx`, `PlannedScreen.tsx`.
- `frontend/src/components/BottomSheet.tsx`, `PlanRow.tsx`, `PlanItemEditor.tsx` (имена approximate; D-Discretion).
- `frontend/src/api/templates.ts`, `frontend/src/api/planned.ts`.
- `frontend/src/hooks/useTemplate.ts`, `useCurrentPeriod.ts`, `usePlanned.ts`.

</code_context>

<specifics>
## Specific Ideas

- `apply_template_to_period` алгоритм:
  1. SELECT все `plan_template_item` (with eager-load category для kind).
  2. SELECT count существующих `planned_transaction` WHERE period_id=:pid AND source='template'.
  3. Если count > 0 — вернуть существующие (SELECT * WHERE period_id=:pid AND source='template') без insert.
  4. Иначе — вставить через `db.add_all([PlannedTransaction(period_id=pid, kind=item.category.kind, amount_cents=item.amount_cents, description=item.description, category_id=item.category_id, planned_date=clamped_date, source=PlanSource.template) for item in template_items])`.
  5. `planned_date` вычисление: если `item.day_of_period` задан — `period_start + (day_of_period - 1)` с clamp к `period_end` (если day > длины периода — `period_end`); если не задан — `NULL`.
  6. Возвращаем `{period_id, created: N|0, planned: [...]}`.

- `snapshot_from_period` алгоритм (D-32):
  1. SELECT `planned_transaction` WHERE `period_id=:pid AND source IN ('template', 'manual')` ORDER BY category_id, planned_date NULLS LAST, id.
  2. DELETE FROM `plan_template_item`.
  3. INSERT new template-items (mapping в D-32). `sort_order` = enumerate-index.
  4. Single transaction (через session, commit on handler exit).
  5. Response: `{ template_items: [...], replaced: <prev_count> }`.

- BottomSheet CSS: ключевые стили в RESEARCH.md. Anim duration 250ms ease-out.

- `PlanRow` компонент пропсы:
  ```tsx
  interface PlanRowProps {
    row: PlannedRead | TemplateItemRead;  // discriminated union or generic
    onAmountChange: (id: number, newAmountCents: number) => Promise<void>;
    onOpenEditor: (id: number) => void;
    onDelete: (id: number) => Promise<void>;
    readOnly?: boolean;  // true для subscription_auto
  }
  ```

- Frontend types (mirror Pydantic):
  ```typescript
  type PlanSource = 'template' | 'manual' | 'subscription_auto';

  interface TemplateItemRead {
    id: number;
    category_id: number;
    amount_cents: number;
    description: string | null;
    day_of_period: number | null;
    sort_order: number;
  }

  interface PlannedRead {
    id: number;
    period_id: number;
    kind: 'expense' | 'income';
    amount_cents: number;
    description: string | null;
    category_id: number;
    planned_date: string | null;  // ISO date
    source: PlanSource;
    subscription_id: number | null;
  }
  ```

</specifics>

<deferred>
## Deferred Ideas

- **Drag-n-drop reorder строк шаблона/плана** — UI-фича для post-MVP. В Phase 3 порядок определяется `sort_order` (числовой), редактируется через BottomSheet (numeric input).
- **Per-row копирование строки** («дублировать» с автосдвигом amount) — отложено.
- **Bulk-edit (выбрать несколько → изменить amount на %)** — out of scope MVP.
- **Импорт plan/template из CSV/xlsx** — out of scope (REQUIREMENTS.md OUT OF SCOPE).
- **PLN-03 «🔁 from subscription» end-to-end (с реальной БД-строкой)** — отложено до Phase 6 (subscriptions). В Phase 3 — только UI-готовность + mock-проверка.
- **Worker `close_period` вызов apply-template при создании нового периода** — Phase 5 (PER-04). Phase 3 предоставляет endpoint готовым.
- **History / "previous period plan" view** — Phase 5 (DSH-06 переключатель периодов).
- **Per-template-item `notify_days_before` (типа подписок)** — нет в требованиях; шаблон чисто декларативный.
- **Unique constraint `(period_id, source, category_id)` для апликейшна** — D-31 объясняет, почему не делаем (manual + template могут иметь один и тот же category_id).
- **Bot-команды для plan editing** — out of scope, бот в MVP только для actual-транзакций (Phase 4).

</deferred>

---

*Phase: 03-plan-template-and-planned-transactions*
*Context gathered: 2026-05-02 (auto mode)*
