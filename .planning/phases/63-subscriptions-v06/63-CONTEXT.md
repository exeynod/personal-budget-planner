# Phase 63: Subscriptions расширенные (v06 native) - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grey areas auto-decided, anchored to existing V10 impl + v06 sibling patterns)

<domain>
## Phase Boundary

Перевести существующий v06 native экран подписок (`Features/Management/SubscriptionsView.swift` + `SubscriptionsViewModel` + `SubscriptionEditor`) с legacy `SubscriptionsAPI` на `SubscriptionsV10API`, и расширить функционал v1.0:
- **post/unpost** — провести списание подписки (создаёт транзакцию) / отменить проведение.
- **day_of_month** — день месяца для ежемесячного списания.
- **account_id** — выбор счёта списания (Picker).
- Form-based редактор остаётся (расширяется), с DatePicker и Picker(счёт).

НЕ в scope: переписывание master-list под другой паттерн без необходимости; изменение V10-шелла (`FeaturesV10/Subscriptions/*`) — он сосуществует и не трогается; новые домены.
</domain>

<decisions>
## Implementation Decisions

### Миграция на SubscriptionsV10API
- Переключить существующий `SubscriptionsViewModel` на `SubscriptionsV10API` (list / patch / post / unpost / delete). Не создавать параллельный экран.
- Использовать `SubscriptionV10DTO` (поля: id, name, amountCents, cycle, nextChargeDate, categoryId, notifyDaysBefore, isActive, dayOfMonth?, accountId?, postedTxnId?) и `SubscriptionV10UpdateRequest` (per-field encodeIfPresent PATCH).
- Оставить экран на месте — `Features/Management/SubscriptionsView.swift` (уже зарегистрирован в `ManagementView.destination(.subscriptions)`). Минимизировать churn; не плодить `Features/Subscriptions/`.
- create-путь: если у V10API нет create — сохранить legacy create ТОЛЬКО если необходимо; предпочтительно использовать V10 create-эндпоинт если есть. (Планировщик: проверить наличие create в V10API; если отсутствует — оставить legacy `SubscriptionsAPI.create` для создания, остальное на V10. Зафиксировать решение в плане.)

### post / unpost UX
- Действие на уровне строки master-list: leading swipe action «Провести» (когда не проведено) / «Отменить проведение» (когда `postedTxnId != nil`). Дополнительно — в row Menu / editor.
- post и unpost — денежные мутации → `confirmationDialog` перед выполнением.
- Визуальный индикатор проведения: бейдж/иконка (checkmark + дата) когда `postedTxnId != nil`.
- После post/unpost — `submitting` guard + полный `await load()` reload (паттерн мутаций Savings/Accounts; fixed RU error-copy в banner родителя на failure, без утечки raw error).

### day_of_month и account_id в редакторе
- `day_of_month`: Stepper(1...28). Показывать только для `cycle == monthly`; при `yearly` — DatePicker `nextChargeDate`. (Mirror V10 Stepper 1...28.)
- `account_id`: optional Picker «Счёт списания», источник `AccountsAPI.list()` → `[AccountDTO]`, label = bank + ·mask, default = primary account (`accounts.first(where: \.primary)?.id ?? first`), опция «Не указан» (nil).
- `nextChargeDate` кодируется через `DateFormatters.isoDate` (уже `Europe/Moscow`, yyyy-MM-dd) — без UTC day-shift. day_of_month — ordinal 1..28, без timezone.

### Editor & List конвенции (v06 sibling parity)
- Расширить существующий `SubscriptionEditor` (native Form, `.create`/`.edit` modes): добавить секцию «Счёт списания» (Picker) и условную «День месяца» (Stepper для monthly). Сохранить секции Название/Сумма(decimalPad+MoneyParser)/Цикл(segmented)/Категория(Picker)/Уведомления(Stepper)/Активна(Toggle edit-mode)/Delete.
- Validation через pure helper (name≠empty, amount>0, categoryId≠nil, !submitting). Toolbar Отмена/Сохранить, `.interactiveDismissDisabled(submitting)`, detents [.medium,.large].
- master List(.insetGrouped): 4 load-state, mutation-error banner, swipe-delete + confirmationDialog, Menu toolbar (plus → create), `.refreshable`.

### Тесты
- ≥10 unit-тестов на `SubscriptionsViewModel` мутации (load, patch/toggle, post, unpost, delete, validation) + pure helpers (cadence/day formatting RU, валидация editor draft). State-machine + validation покрытие; network seam как в sibling phases (где нет injectable seam — покрывать state/validation).

### Claude's Discretion
- Точная компоновка swipe vs row-Menu для post/unpost (обе допустимы — выбрать наиболее нативную и единообразную с Savings).
- Нужен ли отдельный typed `SubscriptionsRoute` enum (если master→detail drill-down не вводится в этой фазе — не обязателен; Subscriptions пока master+editor без detail).
- Формулировки RU error-copy.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Features/Management/SubscriptionsView.swift` — текущий v06 экран (SubscriptionsViewModel + SubscriptionEditor `.create`/`.edit`). Прямая цель миграции.
- `Networking/Endpoints/SubscriptionsV10API.swift` — list / post(id)→SubscriptionPostResponseDTO / unpost(id) / patch(id,SubscriptionV10UpdateRequest) / delete(id).
- `SubscriptionV10DTO` (+ dayOfMonth, accountId, postedTxnId), `SubscriptionV10UpdateRequest` (encodeIfPresent per-field).
- `AccountsAPI.list()` → `[AccountDTO]` (id, bank, mask?, kind, balanceCents, primary, createdAt?) — источник account Picker.
- `Domain/DateFormatters.swift` → `isoDate` (Europe/Moscow, yyyy-MM-dd) — wire-encoding дат.
- `MoneyParser.parseToCents` — money input (BIGINT cents, no float).
- V10 reference поведение: `FeaturesV10/Subscriptions/*` (togglePause/changeDay/changePrice, formatCadenceRu, SubscriptionMenuSheet) — семантический эталон, НЕ трогать.

### Established Patterns (phases 60/61/62)
- Form sheet: NavigationStack+Form, секции, .decimalPad+MoneyParser, Picker, validation enum, submitting guard, error banner в родителе (fixed RU copy), toolbar Отмена/Сохранить, detents [.medium,.large], interactiveDismissDisabled(submitting).
- Master List: List(.insetGrouped), 4 load-state, mutation-error banner, hero, swipe-delete+confirmationDialog, scroll-to-new (ScrollViewReader), sheet binding, .refreshable.
- ViewModel мутации: submitting+defer, refetch on success, fixed RU error, return Bool.
- Account Picker default = primary ?? first.

### Integration Points
- `ManagementView.swift` `destination(.subscriptions)` уже → `SubscriptionsView()` (line ~111). Регистрация не меняется.
- XcodeGen: новые .swift (тесты) → `cd ios && xcodegen generate` перед build. Build+tests зелёные (iPhone 17 Pro).
</code_context>

<specifics>
## Specific Ideas

- Эталон поведения post/unpost/day/account — V10 `SubscriptionsV10ViewModel` + `SubscriptionMenuSheet` (но в native v06 idiom: Form/List/swipe/Menu, не poster UI).
- post-эндпоинт возвращает `SubscriptionPostResponseDTO {txnId, subscriptionId, postedAt}` — после post сделать reload (postedTxnId появится в DTO).
</specifics>

<deferred>
## Deferred Ideas

- Subscriptions → detail drill-down (master+editor достаточно для этой фазы).
- account_id surfacing в V10-шелле (V10 пока не показывает) — вне scope, V10 не трогаем.
</deferred>
