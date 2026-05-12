# Phase 59: Transactions (v06 native) — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous, 4 areas accepted as recommended)

<domain>
## Phase Boundary

Миграция экрана `Features/Transactions/TransactionsView.swift` (v06-native shell, активный при `@AppStorage("ui.theme") == "v06"`) с legacy data layer (ActualAPI / PlannedAPI / CategoriesAPI, `CategoryKind` 2-valued) на v1.0 surface (ActualV10API + ActualV10DTO с 4-valued `ActualKindV10`, CategoriesV10API + CategoryV10DTO с 4-valued `CategoryKind`). PlannedAPI остаётся legacy — `PlannedV10API` не существует и backend v1.0 для planned не выделен.

UI: native iOS 26 — `NavigationStack` + large title «Транзакции», subtabs (История / План) в `.toolbar(.principal)` segmented Picker; kind picker (Расходы / Доходы / Сбережения) — `.segmented` в Section header; фильтр категории — `Menu` в trailing toolbar. Swipe-to-delete только в Истории; перед DELETE — `.confirmationDialog`; при ошибке — inline banner вверху списка.

**В скоупе:**
- ViewModel + View переписаны на ActualV10DTO / CategoryV10DTO; адаптировано отображение под 4-valued kind (expense / income / savings / other) с расширением kind-picker до 3 сегментов «Расходы / Доходы / Сбережения».
- Roundup actuals (`ActualKindV10.roundup`) рендерятся в «Расходы» с tonk-индикатором.
- Deposit actuals (`ActualKindV10.deposit`) рендерятся в «Сбережения».
- Other categories (`CategoryKind.other`) — тихо в «Расходы».
- Swipe-to-delete + confirmationDialog + inline error banner (паттерн V10 Phase 25-09).
- Planned subtab продолжает работать через legacy PlannedAPI + PlannedDTO + 2-valued CategoryKind — без UI-регрессий.

**ВНЕ скоупа:**
- TransactionEditor (создание/редактирование) — остаётся как есть; Phase 64 «AddSheet нативный» полностью заменит editor.
- PlannedV10API / миграция planned на 4-valued kind — backend не готов; отдельный artefact.
- Multi-period switcher (DSH-06).
- Accounts switcher / отображение счёта в строке транзакции — Phase 60.
- Savings widget на Home — Phase 62.
- AppStorage-persistence фильтров — отказались (reset к defaults при запуске).

</domain>

<decisions>
## Implementation Decisions

### Data Layer Migration
- **Actuals:** `ActualV10API.list(periodId:)` → `[ActualV10DTO]`. Kind enum `ActualKindV10` (expense / income / roundup / deposit).
- **Planned:** оставляем legacy `PlannedAPI.list(periodId:)` → `[PlannedDTO]` с 2-valued `CategoryKind` (expense / income). PlannedV10API НЕ создаём в этой фазе — backend не выделен.
- **Categories:** `CategoriesV10API.list()` → `[CategoryV10DTO]` (4-valued `CategoryKind`: expense / income / savings / other).
- **Delete:** `ActualAPI.delete(id:)` (legacy enum, shared route — V10 уже reuse'ит. Phase 25-09 подтвердил pattern). PlannedAPI.delete(id:) — без изменений.

### CategoryKind 4-valued — UX
- Kind picker расширяется с 2-segment до **3-segment**: «Расходы / Доходы / Сбережения». Other-категории тихо рендерятся в «Расходы» (legacy bucket, на новых стендах не должен встречаться).
- `ActualKindV10.roundup` строки видны в «Расходы» с тонким индикатором (mini-icon `arrow.up.forward` рядом с amount) — это child-операции округления.
- `ActualKindV10.deposit` строки видны в «Сбережения» (пополнения копилки).
- `ActualKindV10.income` → «Доходы», `ActualKindV10.expense` → «Расходы».
- Planned остаётся 2-segment («Расходы / Доходы»), поскольку PlannedDTO.kind 2-valued. Логика: subtab `.plan` AND kind `.savings` → пустое состояние «План для сбережений редактируется в Savings» (читая Phase 62).

### Subtabs & Filter UI
- **Subtabs (История / План):** `Picker` в `.toolbar { ToolbarItem(.principal) }` с `.pickerStyle(.segmented)`. Large title «Транзакции» сохраняется.
- **Kind picker:** `Picker` в первой Section header `List`'а с `.pickerStyle(.segmented)`. 3 сегмента в Истории (Расходы/Доходы/Сбережения), 2 сегмента в Плане (Расходы/Доходы).
- **Category filter:** `Menu` в `.toolbar { ToolbarItem(.topBarTrailing) }` с иконкой `line.3.horizontal.decrease.circle` (filled при активном фильтре). Пункты: «Все категории» + список `visibleCategories` (только те, что используются в текущей выборке) с галочкой `checkmark` на выбранной.
- **Persistence:** отсутствует — `subTab=.history`, `kind=.expense`, `categoryFilter=nil` при запуске. Никакого `@AppStorage` в этой фазе.

### Swipe-to-delete & Error Handling
- Swipe-to-delete только в подтабе **«История»** (planned не имеет delete-swipe по существующему UX, и backend planned-route отдельный).
- Перед DELETE — `.confirmationDialog("Удалить трату?")` с destructive button «Удалить» и cancel «Отмена». Mirrors V10 (Phase 25-09 T-25-09-02).
- При failed DELETE — `deleteError: String?` в ViewModel, inline banner вверху `List` (не заменяет содержимое). Pattern из V10 Phase 25-09 (WR-25-09). При successful DELETE — full reload через `load()`.

### Coexistence Strategy
- **In-place замена**: `ios/BudgetPlanner/Features/Transactions/TransactionsView.swift` модифицируется напрямую. Это уже v06-native файл (legacy v0.6, до миграции). V10 shell использует свой `FeaturesV10/Transactions/...` — он остаётся untouched.
- **TransactionEditor.swift:** остаётся в неизменном виде. На текущем этапе остаётся точкой входа для редактирования; Phase 64 (AddSheet нативный) полностью перепишет editor.
- **CategoryKind DTO:** `Networking/DTO/CommonDTO.swift` имеет `enum CategoryKind { expense, income }`. Это используется ещё минимум в TransactionEditor + HomeView (v06). Не меняем enum в этой фазе — Transactions View переходит на `CategoryV10DTO` (его own kind типа `CategoryKind` — 4-valued, defined в `CategoryV10DTO.swift`). **Namespace collision:** оба enum называются `CategoryKind`; решается qualified usage / type alias. Plan-phase должен явно проверить (можно использовать `CategoryV10DTO.CategoryKind` если разные namespaces, иначе rename).
- **HomeView (v06):** известная проблема — `CategoryDTO` (legacy) ломается при decode `savings`/`other` от backend v1.0. Это известное Phase 58 Known Issue #2; миграция HomeView не входит в Phase 59 (будет последующий phase).

### Claude's Discretion
- Конкретный layout строки транзакции (font sizes, spacing, color coding amount по kind) — в plan-phase.
- Loading / empty / error states (icon, copy) — следовать паттерну V10 + iOS HIG; конкретика в plan-phase.
- Test surface (ViewModel unit tests, JSON decode fixtures) — plan-phase решит.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ActualV10API.list(periodId:)` + `ActualV10DTO` — готов с Phase 25.
- `CategoriesV10API.list()` + `CategoryV10DTO` — готов с Phase 25.
- `PlannedAPI` (legacy) + `PlannedDTO` — оставляем как есть.
- `ActualAPI.delete(id:)` (legacy) — shared route, использован V10.
- `FeaturesV10/Transactions/TransactionsV10ViewModel.swift` — reference implementation для 4-valued kind + delete pattern + filter chip + day grouping (calendar `Europe/Moscow`). Не переиспользуем напрямую (другой UX без subtabs), но pattern копируем.
- `TxSubTab` enum уже определён в существующем `TransactionsView.swift` (`history` / `plan`).

### Established Patterns
- `@MainActor @Observable final class ...ViewModel` с `enum LoadState`.
- Parallel async-let для одновременной загрузки `period + categories + actuals + planned`.
- Calendar с TZ `Europe/Moscow` для day grouping (CLAUDE.md convention).
- `.confirmationDialog` + destructive button перед удалением (Phase 25-09 V10 паттерн).
- `deleteError: String?` banner pattern (WR-25-09).
- `.toolbar(.principal)` для центральных control'ов (segmented picker subtabs).
- `Menu` в trailing toolbar для фильтров (iOS HIG pattern).

### Integration Points
- `MainShell` (v06 shell) — содержит TabView с табом «Транзакции» → `TransactionsView()`. Не меняем wiring.
- `Notification.Name.txnCreated` — emitted by TransactionEditor / AddSheet; ViewModel должен subscribe и re-`load()` после новой транзакции (паттерн Phase 30-03 DEBT-02 из V10).
- `AppRouter` → `MainShell` (v06) → TransactionsView — путь не меняется.

</code_context>

<specifics>
## Specific Ideas

- 3-segment kind picker: «Расходы» / «Доходы» / «Сбережения». В подтабе «План» — 2-segment («Расходы» / «Доходы»), при выборе «Сбережения» в Истории но переключении на План — fallback в «Расходы» (или пустой стейт «Планирование сбережений → в Savings», читаем Phase 62 после её shipping).
- Mini-indicator у roundup-строк: `Image(systemName: "arrow.up.forward").font(.caption2)` рядом с суммой. Tooltip / a11y label «Округление от родительской траты».
- Empty-state для пустой Истории: `ContentUnavailableView("Нет операций", systemImage: "tray", description: Text("Добавьте трату или измените фильтры"))`.
- Empty-state для пустого Плана: copy «План пуст. Откройте План категории и заполните».

</specifics>

<deferred>
## Deferred Ideas

- AppStorage-persistence фильтров (категория, kind, subtab) — отложено, фаза стартует со sane defaults.
- PlannedV10API + 4-valued planned kind — backend не выделен; отдельный backend-phase когда понадобится.
- HomeView v06 migration на 4-valued CategoryKind — отдельный phase (Known Issue #2 из Phase 58).
- TransactionEditor миграция на v1.0 API — Phase 64 (AddSheet нативный).
- Account info в строке (показать «Сбербанк, ›» при swipe или в detail) — Phase 60 (Accounts).
- Multi-period switcher на toolbar Transactions — DSH-06, отдельный phase.

</deferred>
