# Phase 64: AddSheet нативный (v06) - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grey areas auto-decided, anchored to scout of current TransactionEditor + v06 sibling patterns)

<domain>
## Phase Boundary

Расширить native add/edit sheet для транзакций (`Features/Transactions/TransactionEditor.swift`):
- **Account Picker** — выбор счёта списания (optional `account_id`) для actual-транзакций.
- **Inline AI-подсказка категории** — debounce-запрос `GET /api/v1/ai/suggest-category?q=<описание>`, tappable suggestion-chip → проставляет категорию.

НЕ в scope: переписывание шелла; добавление savings/roundup/deposit kinds в editor (остаётся expense/income, 2-valued); смена 4 call-sites' API; V10-шелл.

**Scope correction (важно):** ROADMAP-цель формулирует «замену TransactionEditor modal на native Form sheet без custom keypad». Scout показал, что editor УЖЕ native Form sheet с `.keyboardType(.decimalPad)` — **custom keypad'а не существует**, эта часть цели уже выполнена в Phase 17-21/25. Реальный net-new фазы 64 = (1) account Picker, (2) inline AI category hint. Editor расширяется in-place, публичный API сохраняется.
</domain>

<decisions>
## Implementation Decisions

### Подход: расширить существующий TransactionEditor in-place
- Сохранить публичный API `TransactionEditor(mode:categories:onSaved:onDelete?)` и все 3 call-site (HomeView, TransactionsView, TemplateView) — НЕ менять их сигнатуры.
- Не переименовывать в «AddSheet» (4 call-site используют TransactionEditor; churn без пользы). Файл остаётся `Features/Transactions/TransactionEditor.swift`.
- Custom keypad НЕ удаляем — его нет; `.decimalPad` уже на месте.

### Account Picker
- Добавить optional Picker «Счёт списания» только для actual-режимов (`.createActual` / `.editActual`); planned-режимы счёта не имеют — секция скрыта.
- Источник: `AccountsAPI.list()` → `[AccountDTO]`, загрузка ВНУТРИ editor в `.task` (не нагружать call-sites новым параметром). Label = `bank` + ` ·<mask>`.
- Default = primary account (`accounts.first(where:\.primary)?.id ?? first`), опция «Не указан» (nil). Передаётся в `ActualCreateRequest.accountId` / `ActualUpdateRequest`.
- editActual: преселект `account_id` из редактируемого DTO если есть.
- Если accounts ещё не загрузились / пусто — секция счёта не показывается (graceful), сохранение работает с accountId=nil (текущее поведение).

### Inline AI-подсказка категории
- Новый iOS-wrapper `AISuggestCategoryAPI.suggest(q: String) async throws -> SuggestCategoryDTO {categoryId: Int?, name: String?, confidence: Double}` → `GET /api/v1/ai/suggest-category?q=`.
- Триггер: debounce на поле «Описание» (≥3 символа, ~500ms после остановки ввода) через cancellable Task. Каждый новый ввод отменяет предыдущий запрос.
- UI: под полем описания — tappable suggestion-row/chip «AI: <название категории>» когда `categoryId != nil`. Tap → проставляет `categoryId` (и kind при необходимости). Backend уже фильтрует confidence ≥ 0.5 (ниже → null) — показываем только при непустом category_id.
- Не перетирать категорию, выбранную пользователем вручную: показывать подсказку как hint; tap = явное действие пользователя. (Не авто-применять.)
- Pro-gating: эндпоинт `require_pro`. На 403/любую ошибку — подсказка просто не появляется (silent, без error banner — это вспомогательный hint, не критичный путь).
- Включить в create-режимах (createActual + createPlanned); в edit-режимах допустимо, но не обязательно (приоритет — create).

### Конвенции и тесты (v06 sibling parity)
- Сохранить v06 Form-конвенции: NavigationStack+Form, секции, `.decimalPad`+MoneyParser, Picker, validation (`canSave`: amount>0 && categoryId!=nil && !submitting), submitting guard, error banner в родителе (fixed RU copy), toolbar Отмена/Сохранить, detents [.medium,.large], `interactiveDismissDisabled(submitting)`.
- `txDate` кодируется через `DateFormatters.isoDate` (МСК) — без изменений.
- Тесты: injectable seam для AISuggest + AccountsAPI; unit-тесты на debounce/cancel-логику (новый запрос отменяет старый), на silent-fail при 403/ошибке, на default-account логику (primary ?? first ?? nil), на «не авто-применять подсказку». State/логика покрытие (сетевые вызовы за seam).

### Claude's Discretion
- Точная вёрстка suggestion-chip (row в Form-секции vs inline под TextField).
- Debounce-интервал (300-600ms) и min-длина (2-3 символа).
- Нужен ли отдельный `AISuggestViewModel` или логика внутри editor (editor — struct View; вынести debounce-state в небольшой @Observable helper для тестируемости — рекомендуется).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Features/Transactions/TransactionEditor.swift` — текущий native Form sheet (modes: createActual/createPlanned/editActual/editPlanned; `.decimalPad`; segmented kind picker expense/income; category Picker filtered by kind+!archived; DatePicker MSK; description). Цель расширения.
- `Networking/Endpoints/AccountsAPI.swift` → `list()` → `[AccountDTO]` (id, bank, mask?, kind, balanceCents, primary, createdAt?). Источник account Picker.
- Backend `GET /api/v1/ai/suggest-category?q=` (app/api/routes/ai_suggest.py, require_pro) → {category_id, name, confidence≥0.5}. НЕТ iOS-обёртки — создать `AISuggestCategoryAPI`.
- `ActualCreateRequest` уже имеет `var accountId: Int? = nil` (Phase 25-03). `ActualUpdateRequest` — optional поля.
- `MoneyParser.parseToCents`, `DateFormatters.isoDate` (МСК), `Tokens.Categories.visual(for:)`.
- `CategoryDTO` (kind: CategoryKind expense/income, isArchived) — категории передаются call-site'ами как сейчас.

### Established Patterns (phases 60/61/62/63)
- Form sheet: NavigationStack+Form, секции, .decimalPad+MoneyParser, Picker, validation, submitting guard, error banner в родителе (fixed RU copy), detents [.medium,.large], interactiveDismissDisabled.
- Account Picker default = primary ?? first (Savings/Subscriptions).
- Cancellable-Task debounce: использовать `.task(id:)` или хранимый `Task` с отменой (паттерн нов для этого проекта — реализовать чисто).
- Injectable API seam для тестов (как в Phase 63 SubscriptionsViewModel).

### Integration Points
- 3 call-site (HomeView/TransactionsView/TemplateView) — НЕ менять сигнатуры; новый функционал самодостаточен внутри editor.
- XcodeGen: новые .swift (AISuggestCategoryAPI, тесты, опц. helper) → `cd ios && xcodegen generate` перед build. Build+tests зелёные (iPhone 17 Pro).
</code_context>

<specifics>
## Specific Ideas

- AI suggest — Pro-only фича; в single-tenant pet-app владелец Pro, но обрабатывать 403 silent (друг-non-pro не должен видеть ошибку).
- account_id optional — сохранить текущее поведение «без счёта» как валидное; Picker лишь добавляет возможность указать.
</specifics>

<deferred>
## Deferred Ideas

- Savings/roundup/deposit kinds в editor (отдельная подсистема Savings; вне scope).
- Миграция editor на ActualV10API/CategoriesV10API (Phase 59 закрыл Transactions migration; editor остаётся на legacy ActualAPI с bridging — вне scope 64).
- AI hint в edit-режимах как обязательный (приоритет create).
</deferred>
