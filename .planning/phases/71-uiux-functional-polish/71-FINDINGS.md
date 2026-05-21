# Phase 71 — UI/UX & Functional Polish — FINDINGS (running log)

**Goal (owner /goal):** довести продукт до идеального, вылизанного интерфейса И полностью рабочего функционала. Скриншот-driven цикл на iPhone 17 Pro симуляторе (оба шелла) + web. Итерации: screenshot → findings → fix → rebuild → re-screenshot, пока не идеально.

**Setup:** docker dev stack up (api :8000). iOS app autologin как OWNER (tg 123456789). Backend засеян реалистичным датасетом (income 150k₽, 8 expense + savings + income категории, ~22 транзакции в периоде май-2026, 4 подписки, 2 счёта, 2 цели + депозиты, roundup on). DEV_FORCE_ONBOARDING снят с sim UserDefaults.

Severity: P0 (блокер экрана/функции) · P1 (важно) · P2 (полировка) · P3 (мелочь).
Status: OPEN / FIXED / VERIFIED.

---

## Functional bugs (backend)

### BUG-1 [P0] [FIXED commit e21aba2] GET /actual/balance → 500 при наличии deposit-транзакции → экран Home «Не удалось загрузить»
- **Симптом:** Home (Главная) показывает ошибку загрузки, как только в периоде есть savings-deposit.
- **Корень:** `app/services/actual.py::compute_balance` — `actual_q` группирует по 4-значному `ActualKind` (expense/income/roundup/deposit). Цикл `by_category` (строки ~482-502) кладёт строки с `kind="deposit"/"roundup"` в результат; `BalanceCategoryRow.kind` = `Literal['expense','income']` → `BalanceResponse(**bal)` (actual.py:250) валидационно падает → 500. Docstring УТВЕРЖДАЕТ, что deposit/roundup отфильтрованы — фильтра нет (расхождение doc vs code).
- **Фикс:** ограничить `actual_q` на `kind IN {expense, income}` (по намерению docstring; savings/roundup живут на экране Savings, не в plan/fact-балансе). Totals уже исключали их через `== CategoryKind.expense/income`.

### BUG-2 [P1] [FIXED commit b536653] POST/PATCH /subscriptions не принимают V10-поля (account_id, day_of_month)
- **Симптом:** подписки создаются/патчатся, но `account_id`/`day_of_month` = null (нельзя задать через API); экран подписок не показывает счёт/день списания.
- **Корень:** PATCH-роут подключён к legacy `SubscriptionUpdate` (extra=forbid → 422 на V10-поля); `SubscriptionCreate` тоже без этих полей. Read отдаёт V10 (фаза 67 P0-1), но write — legacy. Нужен `SubscriptionV10Update`/create-поля на write-роутах.

---

## iOS — v06 MainShell (default theme; tabs Главная/Транзакции/AI/Управление)

### HOME-1 [P0 core-value] [FIXED+VERIFIED commit 8e18b9f] ПЛАН=0 и «Без плана» у ВСЕХ категорий несмотря на планы из онбординга
- **VERIFIED на симуляторе после фикса:** Home показывает ПЛАН 87 000 · ФАКТ 27 750 · В ЗАПАСЕ +59 250 (зелёным); категории с план/факт (ПРОДУКТЫ 5 790 / 30 000, КАФЕ 2 050 / 12 000, ДОМ 6 390 / 15 000). Core value (план/факт-дельта) работает.
- **Minor [P3]:** leftover-категория «Сервисы» (cat-171, prior-run артефакт) показывается с «Без плана / 0» — не баг, мусорные данные.
- **Симптом (Home/Главная):** строка ПЛАН 0 · ФАКТ 23 870 · В ЗАПАСЕ −23 870 (красным); каждая категория в списке = «Без плана». Но онбординг задал планы (Продукты 30000, Кафе 12000…). 
- **Гипотеза:** Home/balance читает агрегат `planned_transaction` (пусто), а онбординг пишет лимиты в `Category.plan_cents` БЕЗ создания `planned_transaction`-строк. Тогда план не появляется на Home → core value (план/факт-дельта) сломан для свежего юзера. ЛИБО план материализуется отдельно через PLAN-редактор (Управление→План), тогда это артефакт API-сидинга, не баг.
- **VERDICT [CONFIRMED P0 — core value]:** реальный продуктовый баг. Канонический v1.0-план = `Category.plan_cents` (пишется онбордингом + `PATCH /plan-month`). V10-шелл читает его правильно (`HomeData.swift` planTotal = Σ `CategoryV10DTO.planCents` через `/categories`). v06-Home читает `/actual/balance` → `compute_balance`, который берёт план из агрегата legacy `PlannedTransaction` (в v1.0 пусто) → ПЛАН 0 / «Без плана». Экран «План месяца» (Управление→План месяца) показывает планы корректно (ПРОДУКТЫ 30 000/факт 9 570, КАФЕ 12 000, ДОМ 15 000…), что доказывает: план в Category.plan_cents есть, Home его не читает.
- **FIX:** `app/services/actual.py::compute_balance` — брать per-category + total **expense**-план из `Category.plan_cents` (active, исключая archived + `code='savings'`, как V10 `HomeData` фильтр); income-план total из `AppUser.income_cents`; НЕ суммировать subscription-PlannedTransaction (no double-count). Переписать `tests/test_balance.py` (сейчас сидит план как PlannedTransaction rows) на сидинг `Category.plan_cents`; согласовать с BUG-1-тестом.
- **Visual:** Home опрятен; «В ЗАПАСЕ» красным — симптом plan=0 (станет положительным после фикса).

### TOUR-OK (визуально опрятны, работают на данных)
- **Транзакции/История:** список по датам (Вчера/19 мая…), иконки+категория+сумма (красный минус), дневные тоталы. OK.
- **Транзакции/План:** «Пусто — Нет планов» (planned_transaction list, отдельная фича; пусто ожидаемо). OK.
- **Управление:** меню (Аналитика/План месяца/Подписки/Копилка/Шаблон бюджета/Счета/Категории/Доступ). User-row «Пользователь · owner · —». OK.
- **План месяца:** ОСТАТОК К РАСПРЕДЕЛЕНИЮ +63 000, Rollover→Прочее/Накопления, список расходов план+факт. Опрятен, работает.
- **Minor [P3]:** иконка КАФЕ a11y-label = сырой SF-symbol `cup.and.saucer.fill` (не локализован, как «Корзина»/«Автомобиль»).

### Pending tour (этой сессией не дошёл — backlog для продолжения)
Подписки, Копилка, Счета, Категории, Аналитика, Шаблон бюджета, Доступ, AI-таб, AddSheet (+), CategoryDetail drill-down, GoalDetail; весь V10MainShell (ui.theme toggle); web. + pixel-perfect сверка с Maximal Poster референсом.

---

## iOS — V10MainShell (ui.theme toggle)

(pending)

---

## Web

(pending)
