# Phase 60: Accounts (v06 native, новый домен) — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous, 4 areas accepted)

<domain>
## Phase Boundary

Новый домен «Счета» в v06 native шелле. Сейчас в `MainShell.swift` нет таба или экрана для accounts; в `ManagementView.swift` отсутствует пункт «Счета». Добавляем:
1. `ManagementItem.accounts` в меню Управления — native `NavigationLink` push в `AccountsView`.
2. `AccountsView` — List со счетами, hero summary, primary star indicator, `+` toolbar для создания.
3. `AccountDetailView` — push через `NavigationLink`, hero (bank/kind/mask/balance) + history транзакций счёта в текущем периоде.
4. `NewAccountSheet` — native Form sheet (Bank TextField + AccountKind segmented Picker + Mask conditional + balance MoneyParser + primary Toggle) с live validation.

**В скоупе:**
- ManagementItem registration в `ManagementItem.all` (новый case `.accounts` в id enum + row entry).
- `AccountsView` + `AccountDetailView` + `NewAccountSheet` (новые файлы в `ios/BudgetPlanner/Features/Accounts/`).
- `AccountsViewModel` + `AccountDetailViewModel` (новые @Observable VM по паттерну Phase 59).
- API integration: `AccountsAPI.list()` + `AccountsAPI.create(_:)`.
- History в AccountDetail: фильтр `ActualV10DTO.accountId == account.id` из текущего периода (через `ActualV10API.list(periodId:)`) — клиентская фильтрация, потому что `actualId` параметр в API нет.
- ViewModel unit tests.

**ВНЕ скоупа:**
- Update/Delete/SetPrimary endpoints — `AccountsAPI` не имеет; добавление потребует backend phase. Make-primary action скрыт в UI до появления API.
- Transfer между счетами (DF-V11-01 deferred — функционал «ПЕРЕВОД»).
- History за все периоды (только current period в AccountDetail).
- Edit name/mask/kind после создания — backend не поддерживает.
- HomeView v06 интеграция (отображение primary account / total balance в Home hero) — отдельный future phase.
- V10 shell остаётся untouched (`FeaturesV10/Accounts/*` не модифицируется).

</domain>

<decisions>
## Implementation Decisions

### Navigation & Placement (Area 1)
- Новый `ManagementItem` с id `.accounts`, label «Счета», description «Карты и наличные, основной счёт», icon `creditcard.fill`, `ownerOnly: false`. Вставляется в `ManagementItem.all` массиве **перед** `.categories`.
- `NavigationStack` shared с `ManagementView` — `NavigationLink(value: ManagementItem.ID.accounts)` → `AccountsView()`; внутри `AccountsView` `.navigationDestination(for: Int.self) { id in AccountDetailView(accountId: id) }` для push на detail.
- AccountsView и AccountDetailView получают доступ к auth-environment через `@Environment(AuthStore.self)` если нужно.

### List Structure (Area 2)
- **Hero summary section (без header):** первая ячейка `List`, ContentUnavailableView-style:
  - title: «Всего на счетах»
  - value: `formatCents(sumBalances)` с `monospacedDigit` (e.g. «123 456,78 ₽»)
  - subtitle: «\(accounts.count) счётов»
- **Account rows section** («Счета» header):
  - `HStack(spacing: 12)`:
    - Leading: иконка kind через `Image(systemName:)` — `creditcard.fill` (card), `banknote` (cash), `tray.full.fill` (savings)
    - VStack: `bank` (`.body`), `kind label + mask` (`.caption` secondary) — e.g. «Карта •0420»
    - Spacer
    - VStack trailing align: balance (`.body.monospacedDigit()`)
    - При `primary == true` — `Image(systemName: "star.fill")` orange, рядом с balance (HStack trailing)
- **Empty state:** `ContentUnavailableView("Нет счетов", systemImage: "creditcard", description: Text("Добавьте первый счёт через «+»"))`.

### AccountDetailView (Area 3)
- **Hero section** (first Section без header):
  - bank name `.largeTitle`
  - sub-label: «\(kind.displayName)" + «•\(mask)» если есть mask (`.subheadline` secondary)
  - balance `.title2.monospacedDigit()`
  - primary star рядом с balance если `primary == true`
- **History section** (header «История операций в текущем периоде»):
  - Загрузка через `ActualV10API.list(periodId:)` + локальная фильтрация `actual.accountId == accountId`.
  - Группировка по дате (Europe/Moscow), как в Phase 59.
  - Если фильтр пуст: `ContentUnavailableView("Нет операций", systemImage: "tray", description: Text("В текущем периоде на этом счёте нет операций"))`.
- **Toolbar:** только default «Назад». Menu `...` НЕ добавляем (нет API для make-primary/edit/delete).
- **Make-primary:** скрыто. Когда появится PATCH `/api/v1/accounts/{id}/primary` — отдельный phase добавит кнопку.

### NewAccountSheet (Area 4)
- Native `Form` в `.sheet`, открывается по toolbar `Image(systemName: "plus.circle.fill")` в `AccountsView`.
- **Поля:**
  - «Банк»: `TextField` (`.text`). Trim whitespace.
  - «Тип»: `Picker(.segmented)` с 3 опциями (Карта / Наличные / Сбережения). State: `kind: AccountKind`.
  - «Последние 4 цифры»: conditional `TextField` (только при `kind == .card`), `.numberPad`, `maxLength = 4`, regex `^\d{4}$`.
  - «Текущий баланс»: `TextField` `.decimalPad` с MoneyParser (paste from Phase 57 `OnboardingStep1IncomeView`). Stores in cents.
  - «Основной счёт»: `Toggle`. Если уже есть primary — info-text «Снимет статус с другого счёта».
- **Live validation** (`canCreate` computed):
  - bank.trimmed.count >= 1
  - if kind == .card: mask matches `^\d{4}$`
  - balanceCents >= 0
- **Submit button** «Создать» в toolbar `.confirmationAction`. Disabled когда `!canCreate`.
- **Cancel** в `.cancellationAction` («Отмена»).
- На успех: `viewModel.sheet = .none` + `await viewModel.load()` + scroll-to новой строки (через `ScrollViewReader` + `id: account.id`).
- На failure: error banner (паттерн Phase 59 deleteError) inline в sheet.

### Coexistence & Compatibility
- **V10 shell:** `FeaturesV10/Accounts/*` (AccountsListV10View, AccountDetailV10View, NewAccountSheet poster-styled, AccountsListV10ViewModel, AccountDetailV10ViewModel) — **untouched**. Свой собственный routing через `PosterRouter` сохраняется.
- **v06 shell:** новый каталог `ios/BudgetPlanner/Features/Accounts/` со своим Native UI. Никакого общего кода с V10 (другие токены / paddings / структура).
- **MainShell.swift** не меняется (не добавляем 5-й tab).
- **HomeView v06:** не интегрируем primary-account display здесь; отдельный future phase.

### Claude's Discretion
- Точное распределение иконок по AccountKind: `card → creditcard.fill`, `cash → banknote`, `savings → tray.full.fill`. Можно переписать в plan-phase если есть лучше.
- Layout цифр balance (где локаль, разделители) — следовать `formatCents` from common utils если есть, иначе `NumberFormatter` с локалью `ru_RU`.
- Test coverage — plan-phase решит конкретные test cases (минимум: ViewModel load success/failure, AccountsViewModel.sumBalances, AccountDetailViewModel filter logic, NewAccountSheet `canCreate` validation matrix).
- Animation для scroll-to-new — `withAnimation(.easeInOut(duration: 0.3))` или native.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AccountsAPI.list()` + `AccountsAPI.create(_:)` — готов с Phase 27-09 / Phase 22 BE-02.
- `AccountDTO` (id, bank, mask, kind, balanceCents, primary, createdAt) — uniform для обоих шеллов.
- `AccountKind` enum (.card / .cash / .savings) — Codable.
- `AccountCreateRequest` — Encodable с правильным `encodeIfPresent` для optional fields.
- `ActualV10API.list(periodId:)` — для history в detail.
- `CategoriesV10API.list()` — для отображения категории в history rows.
- `Tokens.Accent.primary` — accent color v06.
- `MoneyParser` (из Phase 57 OnboardingStep1IncomeView) — парс рубли → cents.
- Phase 59 patterns: `@MainActor @Observable VM`, `Status` enum, `inFlight: Bool`, `deleteError: String?` banner, `Notification.Name.txnCreated` observer (релевантно для detail history refresh).
- `ManagementView.destination(for:)` + `ManagementItem.ID` enum — точка расширения.

### Established Patterns
- v06 NativeOnboardingStepN views (Phase 57) — Form + Section + TextField/Stepper/Picker/Toggle.
- v06 CategoryDetailScreen (Phase 65) — NavigationLink push + Hero section + List of items.
- V10 AccountsListV10ViewModel (reference) — async let load, inFlight guard, sheet state machine, submitting flag for create mutation. **Pattern копируем без визуального переноса** (V10 poster-styled, v06 native).

### Integration Points
- `ManagementItem.all` массив в `ManagementView.swift` — добавить новый entry.
- `ManagementView.destination(for:)` — добавить case `.accounts → AccountsView()`.
- `ManagementItem.ID` enum — добавить `.accounts`.

</code_context>

<specifics>
## Specific Ideas

- Hero summary value: формат «1 234 567,89 ₽» (через ru_RU NumberFormatter с `groupingSeparator = " "`).
- Mask display: `«•0420»` или `«0420»` после слова kind — выбираем «•0420» (более чистый visual).
- Primary star: orange (system orange), trailing к balance. A11y label «Основной счёт».
- Empty state copy: «Добавьте первый счёт через «+»» — обыгрывает toolbar `+` button.
- Scroll-to-new: достаточно `proxy.scrollTo(newAccount.id, anchor: .center)`.

</specifics>

<deferred>
## Deferred Ideas

- Update/Delete/SetPrimary endpoints — backend phase нужен (`PATCH /api/v1/accounts/{id}`, `DELETE`, `PATCH /accounts/{id}/primary`).
- Transfer flow (DF-V11-01) — entire feature.
- History за все периоды (multi-period selector) — отдельный phase, см. DSH-06.
- HomeView v06 интеграция (primary account display) — отдельный phase.
- Account-level statistics / chart — отдельный phase или Phase 27 analytics ext.
- Edit account name / mask после создания — backend нужен.

</deferred>
