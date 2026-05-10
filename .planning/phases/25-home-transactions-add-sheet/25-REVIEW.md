---
phase: 25-home-transactions-add-sheet
reviewed: 2026-05-10T17:06:21Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - app/api/routes/actual.py
  - app/api/schemas/actual.py
  - app/api/schemas/categories.py
  - frontend/src/AppV10.tsx
  - frontend/src/api/periods.ts
  - frontend/src/api/types.ts
  - frontend/src/api/v10/accounts.ts
  - frontend/src/api/v10/actual.ts
  - frontend/src/api/v10/categories.ts
  - frontend/src/api/v10/index.ts
  - frontend/src/screensV10/AddSheet/AddSheet.tsx
  - frontend/src/screensV10/AddSheet/Keypad.tsx
  - frontend/src/screensV10/AddSheet/computeAddSheet.ts
  - frontend/src/screensV10/AddSheet/index.ts
  - frontend/src/screensV10/Home/HomeMount.tsx
  - frontend/src/screensV10/Home/HomeView.tsx
  - frontend/src/screensV10/Home/computeHomeData.ts
  - frontend/src/screensV10/Home/index.ts
  - frontend/src/screensV10/Onboarding/OnboardingMount.tsx
  - frontend/src/screensV10/Transactions/TransactionsMount.tsx
  - frontend/src/screensV10/Transactions/TransactionsView.tsx
  - frontend/src/screensV10/Transactions/computeTransactions.ts
  - frontend/src/screensV10/Transactions/index.ts
  - frontend/src/screensV10/V10MainShell.tsx
  - frontend/src/screensV10/_placeholders.tsx
  - frontend/src/screensV10/common/PosterRouter.tsx
  - frontend/src/screensV10/common/PosterSheet.tsx
  - frontend/src/screensV10/common/BottomNavV10.tsx
  - frontend/src/screensV10/common/format.ts
  - frontend/src/screensV10/common/index.ts
  - ios/BudgetPlanner/App/V10MainShell.swift
  - ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift
  - ios/BudgetPlanner/FeaturesV10/Common/BottomNavV10.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomeV10View.swift
  - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift
  - ios/BudgetPlanner/Networking/DTO/AccountDTO.swift
  - ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
  - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
  - ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift
  - ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift
  - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
findings:
  critical: 4
  warning: 9
  info: 7
  total: 20
status: findings_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-05-10T17:06:21Z
**Depth:** standard
**Files Reviewed:** 47
**Status:** findings_found

## Summary

Фаза 25 закрывает Home / Transactions / AddSheet на двух платформах + расширяет
backend для `account_id` + 4-valued `ActualKind`. Архитектурно код аккуратный
— pure-функции вынесены отдельно, threat-модели задокументированы построчно,
отделение wire-DTO от legacy v0.x корректно.

Но обнаружено несколько серьёзных дефектов корректности:

1. **BLOCKER** — `POST /api/v1/actual` 500 при `kind ∈ {roundup, deposit}` без
   `account_id` (legacy fallback ловит `CategoryKind('roundup')` → `ValueError`,
   которая не отображается в HTTPException → 500).
2. **BLOCKER** — iOS `AddSheetViewModel` форматирует `tx_date` в UTC TZ,
   а пользователь в `Europe/Moscow`: вечером дата сдвинется на завтра.
3. **BLOCKER** — iOS AddSheet header ВСЕГДА показывает «Сегодня» вместо
   «9 МАЯ» (вызов `formatDay(Date(), today: Date())`).
4. **BLOCKER** — `ActualUpdate` Pydantic schema без `extra='forbid'`:
   PATCH принимает любые поля (доступная DoS / шум в логах + риск, что
   `account_id`/`source` будут серверно проигнорированы, но клиент решит,
   что прошло).

## Critical Issues

### CR-01: `POST /api/v1/actual` падает с 500 для kind=roundup/deposit без account_id

**File:** `app/api/routes/actual.py:170-183` + `app/services/actual.py:289-298`
**Issue:** `ActualCreate.kind` — `Literal["expense","income","roundup","deposit"]`
(4-valued). Если клиент пришлёт `kind='roundup'` (или `deposit`) **без**
`account_id`, route уходит в legacy ветку `actual_svc.create_actual(...)`
(строки 170-183). Внутри сервиса:
```python
row = ActualTransaction(
    ...
    kind=CategoryKind(kind),   # CategoryKind = 2-valued (expense|income)
    ...
)
```
`CategoryKind('roundup')` бросит `ValueError: 'roundup' is not a valid CategoryKind`,
которая не сматчится ни одним `except` в роуте → 500 Internal Server Error. По
сути API контракт принимает значение, которое сразу же роняет сервер.

Также вторичный issue: `kind != cat.kind` проверка через `KindMismatchError`
сработала бы первой, но KindMismatchError нормально ловится → 400. То есть
в наихудшем случае конструктор `CategoryKind(...)` рвёт раньше, либо
KindMismatchError вернёт 400 — клиент видит «kind mismatch» вместо ясной
«unsupported kind».

**Fix:** Либо пропускать legacy путь только для `kind ∈ {expense, income}`,
либо валидировать на уровне роута:
```python
if body.account_id is None and body.kind not in ("expense", "income"):
    raise HTTPException(
        status_code=400,
        detail="kind 'roundup'/'deposit' requires account_id",
    )
```
Альтернативно — отдельная Pydantic-схема для legacy-пути с 2-valued `kind`.

---

### CR-02: iOS AddSheet форматирует tx_date в UTC, а не в локальной TZ

**File:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift:178-184`
**Issue:**
```swift
private static let txDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone(identifier: "UTC")     // ← BUG
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()
```
Вызывается на `resolvedTxDate = Date()` (строка 81) — и форматирует это
**в UTC**. Пользователь в `Europe/Moscow` (UTC+3) после 21:00 локального
времени получит дату «завтра» по UTC, и transaction уедет в неправильный
бюджетный период.

Это прямое нарушение CLAUDE.md §Conventions: «расчёты периодов и шедулер
`Europe/Moscow`», и не соответствует web-версии в
`computeAddSheet.ts:141-146`, которая корректно использует local-time
компоненты.

**Fix:** Использовать локальный календарь / TZ:
```swift
private static let txDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    // Project uses Europe/Moscow business TZ for period boundaries
    f.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()
```

---

### CR-03: iOS AddSheet eyebrow всегда показывает «Сегодня» вместо короткой даты

**File:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift:83-85`
**Issue:**
```swift
Eyebrow(
    "NEW ENTRY · \(V10Formatters.formatDay(Date(), today: Date())) · ...",
    opacity: 0.7
)
```
`formatDay(date, today:)` возвращает «Сегодня», когда `date` и `today` —
один и тот же календарный день. Здесь оба — `Date()`, **всегда** один и тот
же день → eyebrow всегда «NEW ENTRY · СЕГОДНЯ · 14:32», что не соответствует
spec ADD-V10-02 («NEW ENTRY · 9 МАЯ · 14:32») и web-implementation
(`AddSheet.tsx:63-68` → `formatShortDate` → «9 МАЯ»).

**Fix:** Добавить в `V10Formatters` функцию `formatShortDate(date)` (по аналогии
с web `formatShortDate`) и вызвать её:
```swift
static func formatShortDate(_ date: Date, calendar: Calendar = .current) -> String {
    let day = calendar.component(.day, from: date)
    let monthIdx = calendar.component(.month, from: date) - 1
    return "\(day) \(monthsRuGenitive[monthIdx].uppercased())"
}
// AddSheetView.swift:84:
"NEW ENTRY · \(V10Formatters.formatShortDate(Date())) · \(V10Formatters.formatTimeHM(Date()))"
```

---

### CR-04: `ActualUpdate` Pydantic schema без `extra='forbid'`

**File:** `app/api/schemas/actual.py:54-62`
**Issue:** `ActualCreate` корректно использует `model_config = ConfigDict(extra="forbid")`
(строка 40 — T-25-01-02). Но `ActualUpdate` тот же config не имеет:
```python
class ActualUpdate(BaseModel):
    # PATCH stays scoped to v0.x surface (no account_id) ...
    kind: Optional[ActualKindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = Field(default=None, gt=0)
    tx_date: Optional[date] = None
```
Клиент может прислать любые лишние поля (`account_id`, `source`, `parent_txn_id`,
`user_id`, `id`) — они пройдут валидацию **без 422**. `update_actual` сделает
`patch.model_dump(exclude_unset=True)` и применит только знакомые ключи, но:
1. Клиент думает, что обновление прошло (silent ignore — нарушение
   принципа least surprise).
2. Контракт API асимметричен: POST строгий, PATCH — нет.
3. Атаки tampering (попытка переписать `user_id`, `source`) проходят без
   обратной связи; даже если они игнорируются сервером, отсутствие 422
   маскирует вредоносные клиенты в логах.

**Fix:**
```python
class ActualUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Optional[ActualKindStr] = None
    ...
```

## Warnings

### WR-01: Web AddSheet `account_id: null` отправляется на сервер при пустом списке счетов

**File:** `frontend/src/screensV10/AddSheet/AddSheet.tsx:223-242`
**Issue:** Если `listAccounts()` вернёт пустой массив (нет счетов в системе)
или 5xx упало на init fetch, `accountId` остаётся `null`. CTA становится
«ready» как только есть amount + category, и `createActualV10` отправляется
с `account_id: null`. Сервер уйдёт в legacy путь — для `kind='expense'` это
работает, но без обновления баланса аккаунта (HOME-V10-04 wallet рассинхрон).

Дополнительно: `useEffect` ловит ошибку `.catch(() => {})` и **тихо** глотает
её (комментарий «Best-effort: ... Keep silent here»). Пользователь не видит,
что данные не подгрузились.

**Fix:** Гейтить CTA на наличие выбранного счёта (`accountId !== null`) либо
показать non-dismissable error banner при провале bootstrap fetch:
```typescript
const cta = ctaState(amountCents, categoryId, accountId);
// computeAddSheet.ts:
export function ctaState(amount, categoryId, accountId) {
  if (amount <= 0) return 'empty';
  if (categoryId === null) return 'no-cat';
  if (accountId === null) return 'no-account';  // new state
  return 'ready';
}
```

---

### WR-02: iOS AddSheet `accountId` может оказаться `nil` после неудачи `loadFormData()`

**File:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetViewModel.swift:97-117, 127-148`
**Issue:** Если `loadFormData()` падает (network/timeout), `loadStatus = .error`,
но `submit()` это не проверяет:
```swift
func submit() async -> Int? {
    guard ctaState == .ready, let catId = categoryId else { return nil }
    ...
    let request = ActualCreateRequest(
        kind: "expense",
        amountCents: amountCents,
        categoryId: catId,
        ...
        accountId: accountId,   // nil — уйдёт в legacy путь
    )
```
Категория не выбралась бы (visibleCategories пуст → CTA остаётся `.noCat`),
поэтому фактическое отправление маловероятно — но защиты нет.

Также UI вообще не отображает `loadStatus = .error` (нет error-state ветки
в `AddSheetView.body`), пользователь смотрит на пустой scroll и не понимает,
почему чипы категорий пустые.

**Fix:** Добавить отдельную error-ветку в `AddSheetView.content`:
```swift
@ViewBuilder
private var content: some View {
    switch model.loadStatus {
    case .error(let msg):
        errorState(msg)
    default:
        scrollContent
    }
}
```

---

### WR-03: PosterSheet drag-to-close не возвращает `dragOffset` к 0 после закрытия с overlay

**File:** `frontend/src/screensV10/common/PosterSheet.tsx:85-89, 102-126`
**Issue:** При закрытии через backdrop click (`onClick={() => onCloseRef.current()}`)
сначала родитель установит `isOpen = false`. Эффект на строке 87-89 вернёт
`dragOffset` к 0 — но между этими двумя renders sheet с применённым transform
(`translateY(${dragOffset}px)`) не успеет сделать визуальный snap-back. На
следующем открытии (если пользователь до этого почти-перетянул вниз) будет
короткая вспышка — sheet начнёт с `translateY(...)` !== 0.

Минорный визуальный artifact, не корректность.

**Fix:** Сбрасывать `dragOffset` до 0 при release-up если сравнение не дотянуло до
порога — это уже делается. Также добавить CSS-transition на `transform` для
плавного snap-back (комментарий в коде уже это упоминает: «CSS transition
could be added; for now just reset state»).

---

### WR-04: Web `Home/HomeMount.tsx` — `daysLeft` ≠ web eyebrow `daysLeft` иногда

**File:** `frontend/src/screensV10/Home/HomeMount.tsx:138-143` vs `common/format.ts:99`
**Issue:** В `HomeMount`:
```typescript
const daysLeft = Math.max(1, lastDayOfMonth - today.getDate() + 1);
```
`Math.max(1, ...)` — никогда не вернёт 0.

В `common/format.ts:99`:
```typescript
const daysLeft = lastDay - d.getDate() + 1;
```
**Без** clamp. Если бы date пришло «после» last day месяца (теоретически
невозможно, но скажем clock skew), eyebrow покажет «-1 ДНЕЙ» (`pluralDays(-1)`
→ «ДЕНЬ»), а dailyPace всё равно использует `max(1)`. Лёгкая рассинхронизация.

Дополнительно: в iOS `HomeViewModel.swift:102` clamp — `Swift.max(0, ...)`,
а web использует `Math.max(1, ...)`. iOS показывает «0 ДНЕЙ» в последний день
месяца, web — «1 ДЕНЬ». Cross-platform parity bug.

**Fix:** Унифицировать clamp в формуле:
```typescript
// format.ts:
const daysLeft = Math.max(1, lastDay - d.getDate() + 1);
// HomeViewModel.swift:
let computedDaysLeft = Swift.max(1, lastDayOfMonth - todayDay + 1)
```

---

### WR-05: iOS V10MainShell `init()` — `OnboardingMountView()` всегда новый, при `@State` повторных init'ах теряется gateway state

**File:** `ios/BudgetPlanner/App/V10MainShell.swift:28-32, 36-43`
**Issue:**
```swift
@MainActor
init() {
    let mount = OnboardingMountView()
    _router = State(initialValue: PosterRouter(root: mount))
}
```
SwiftUI вызывает `init()` многократно (re-evaluation). `_router = State(initialValue: ...)`
работает корректно (только первая инициализация имеет эффект — это документированное
поведение SwiftUI), но в `body`:
```swift
PosterNavStack(router: router) {
    Color.clear
}
```
ViewBuilder closure возвращает `Color.clear`. Из комментария: «ViewBuilder
param is unused by the borrowed-router init's body». Если в будущем
`PosterNavStack` начнёт использовать closure-content, текущий вызов сломается
тихо. Не bug сейчас, но fragile API contract.

Также: `OnboardingMountView()` создаётся **в первом init** и сохраняется внутри
PosterRouter. Если `V10MainShell` перемонтируется (например после deep-link
nav), новая `OnboardingMountView` instance не пересоздаётся — старый router
сохранён в `@State`. Это нормальное SwiftUI поведение, но стоит документировать
явно.

**Fix:** Документировать инвариант: «PosterRouter persists for app session».
Если требуется reset, добавить `.onAppear` callback или public reset метод.

---

### WR-06: iOS `formatPeriodEyebrow` — force unwrap после nil-check

**File:** `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift:98-101`
**Issue:**
```swift
let lastDay: Int = {
    let range = calendar.range(of: .day, in: .month, for: date)
    return range?.upperBound != nil ? (range!.upperBound - 1) : 30
}()
```
Логически безопасно (есть nil-check), но force-unwrap (`range!`) после
optional chaining — code smell. И fallback на `30` неверный для февраля
(если каким-то образом `range == nil`, что в реальности не произойдёт).

**Fix:** Использовать `if let`:
```swift
let lastDay: Int
if let range = calendar.range(of: .day, in: .month, for: date) {
    lastDay = range.upperBound - 1
} else {
    lastDay = 30  // unreachable for valid dates; defensive default
}
```

---

### WR-07: Web `_placeholders.tsx` — `router.canPop` обращение к опциональному `router`?

**File:** `frontend/src/screensV10/_placeholders.tsx:34, 72-84`
**Issue:** `usePosterRouter()` бросит, если выйти за `<PosterRouterProvider>`.
В `PlaceholderShell` вызов безусловный:
```typescript
const router = usePosterRouter();
...
{router.canPop && <span ... onClick={router.pop}>← НАЗАД</span>}
```
Если placeholder когда-нибудь будет отрендерен без provider'а (preview, тест),
будет `throw Error`. Сейчас все callsite внутри shell'а — OK. Но `usePosterRouter`
сам по себе — strict (бросает). Если нужен мягкий fallback, надо обернуть
`try {} catch {}` или сделать optional-version хука.

Скорее улучшение DX, чем bug.

**Fix:** Опционально, добавить `usePosterRouterOptional()` для preview/testing:
```typescript
export function usePosterRouterOptional(): PosterRouterAPI | null {
  return useContext(RouterCtx);
}
```

---

### WR-08: iOS `AddSheetData.parseAmountToCents` — расхождение поведения с web для `"0"` + `"5"`

**File:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetData.swift:96-134`
**Issue:** Web `parseAmountToCents("0")` → 0, iOS `parseAmountToCents("0")` → 0
(early return на строке 97). OK.

Но web `parseAmountToCents("5")` → 500, iOS `parseAmountToCents("5")` → 500. OK.

`appendDigit("0", "5")` (iOS):
```swift
if current == "0" { return digit }   // → "5"
```
Вернёт "5", дальше parseAmount("5") = 500. OK.

`appendDigit("0", "0")` (iOS):
```swift
if current == "0" { return digit }   // → "0"
```
Вернёт "0". А web `appendDigit("0", "0")` → возвращает `current` («`'0' + '0'` stays
'0'»), тоже "0". OK. Парность есть.

**НО**: iOS `appendDigit` не проверяет «cap decimal at 2 chars» **до** проверки
leading-zero, а **после** — пишет «Cap decimal part at 2 chars» в начале:
```swift
if let dotIdx = current.firstIndex(of: ".") {
    let decimalPart = current[current.index(after: dotIdx)...]
    if decimalPart.count >= 2 { return current }
}
if current == "0" { return digit }
return current + digit
```
В web — другой порядок (leading-zero сначала), но семантически они эквивалентны
для всех валидных входов.

Edge case: `appendDigit("0.05", "1")` — iOS: decimalPart="05", count=2 → return current. OK.

Не блокирует, но порядок проверок отличается от web — рекомендуется зеркалить.

**Fix:** Привести порядок проверок к web-варианту для cross-platform parity:
```swift
static func appendDigit(_ current: String, _ digit: String) -> String {
    if current.isEmpty { return digit }
    if current == "0" && digit != "0" { return digit }
    if current == "0" && digit == "0" { return current }
    if let dotIdx = current.firstIndex(of: ".") {
        let decimalPart = current[current.index(after: dotIdx)...]
        if decimalPart.count >= 2 { return current }
    }
    return current + digit
}
```

---

### WR-09: iOS `TransactionsV10ViewModel` — error-state не возвращает данные

**File:** `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift:121-128`
**Issue:**
```swift
func delete(_ tx: ActualV10DTO) async {
    do {
        try await ActualAPI.delete(id: tx.id)
        await load()
    } catch {
        self.status = .error("не удалось удалить операцию")
    }
}
```
При delete failure: status уходит в `.error`, существующий список (`actuals`)
сохранён, но `content` view рендерит `errorState(msg)` (View строка 86-106) —
**вместо списка**. Пользователь видит fullscreen ошибку, а не toast/banner
с сохранённым контекстом. Контраст с комментарием в HomeViewModel: «keep
previously-loaded state intact so a retry does not flash empty UI» —
здесь реально flash происходит в обратную сторону (от данных к ошибке).

**Fix:** Использовать отдельный `deleteError` state-переменную, либо рендерить
overlay/banner вместо смены `status`:
```swift
@Observable final class ... {
    private(set) var deleteError: String? = nil
    func delete(_ tx: ActualV10DTO) async {
        do { ... } catch {
            self.deleteError = "не удалось удалить операцию"
        }
    }
}
```

## Info

### IN-01: Web `AddSheet.tsx` — `_id` параметр в `onSubmitted` callback не используется

**File:** `frontend/src/screensV10/V10MainShell.tsx:133-141`
**Issue:**
```typescript
onSubmitted={(_id) => {
    // Plan 25-10: simply close the sheet — refetch deferred to 25-12
    setAddSheet(false);
}}
```
Параметр `_id` явно префиксован `_` (unused convention), но контракт `AddSheetProps.onSubmitted`
обещает `(txId: number)`. Если `id` никогда не нужен — упростить тип в `AddSheetProps`
до `() => void`. Если нужен — использовать (refetch / scroll-to-row).

---

### IN-02: Web `actual.ts` v10 client — отсутствует `Promise<void>` для DELETE wrapper

**File:** `frontend/src/api/v10/actual.ts`
**Issue:** Файл экспортирует только `listActualV10` и `createActualV10`. DELETE
operation в `TransactionsMount.tsx:34` импортируется из `../../api/actual`
(legacy v0.x путь). Это работает (DELETE-роут общий), но нарушает архитектуру
«v1.0 client = `api/v10/`». Минорный inconsistency.

---

### IN-03: iOS `OnboardingMountModel.reload` — `loadError` не сбрасывается между двумя fail/success циклами правильно

**File:** `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift:64-81`
**Issue:** `reload()` устанавливает `loadError = nil` в начале, но если первый
call упал → `loadError = "..."`, второй call (retry button) пройдёт `inFlight`
guard и поставит `isLoading = true; loadError = nil` затем возможно снова
ошибку. Логически OK, но в UI между двумя update'ами на короткий момент
будет «loading» state (без ошибки) — это и желаемое поведение, просто сложно
читается. Refactor для ясности:
```swift
func reload() async {
    if inFlight { return }
    inFlight = true
    defer { inFlight = false }
    let isFirstLoad = (me == nil && loadError == nil)
    if isFirstLoad { isLoading = true }
    // ... etc
}
```

---

### IN-04: Web `computeHomeData.ts:182-184` — break tick с делением на потенциальный 0

**File:** `frontend/src/screensV10/Home/HomeView.tsx:181-184`
**Issue:**
```typescript
const breakTickLeftPct =
  cat.isOver && cat.fact_cents > 0
    ? Math.min(99.9, (cat.plan_cents / cat.fact_cents) * 100)
    : null;
```
Защищено `cat.fact_cents > 0` — деление на 0 невозможно. Корректно. Inline
note: `cat.isOver` всегда подразумевает `fact > plan`, значит `fact > 0` если
`plan ≥ 0`. Дублированная защита, но defence-in-depth — OK.

---

### IN-05: iOS `HomeV10View.swift` — `barFilled` `@State` не учитывает повторные `onAppear` после navigation

**File:** `ios/BudgetPlanner/FeaturesV10/Home/HomeV10View.swift:217-218, 300-310`
**Issue:** `appeared` / `barFilled` — `@State`. После push новой view и pop'а
обратно SwiftUI **может** перетсоздать `CategoryRowView` (зависит от Identifiable
и структуры родителя), вызывая повторное `onAppear` → анимация проигрывается
заново при каждом popback. UX-feature или bug — зависит от дизайна. Stagger
анимация при каждом возврате может ощущаться навязчивой.

---

### IN-06: iOS `TransactionsData.applyFilterChip` — `default: target = ""` unreachable

**File:** `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift:107-110`
**Issue:**
```swift
case .cafe, .food, .transit, .subs:
    let target: String
    switch chip {
    case .cafe: target = "cafe"
    case .food: target = "food"
    case .transit: target = "transit"
    case .subs: target = "subs"
    default: target = ""    // ← unreachable
    }
```
Outer switch уже сузил до 4 кейсов, inner switch покрывает все 4. `default`
unreachable — Swift compiler даже warning не выдаст из-за outer narrowing.
Удалить либо превратить в `fatalError("unreachable")` для documentation.

---

### IN-07: Web `actual.ts` line 63 — error message не локализован

**File:** `frontend/src/api/v10/actual.ts:63-65`
**Issue:**
```typescript
if (payload.amount_cents <= 0) {
  throw new Error('createActualV10: amount_cents must be positive');
}
```
Английский message в codebase, где UI показывает русский («Не удалось
сохранить»). Если эта ошибка проявится в `submitError` баннере (AddSheet.tsx:244-246),
пользователь увидит технический текст. Минорный UX gap.

---

_Reviewed: 2026-05-10T17:06:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
