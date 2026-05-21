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

### CORE-FLOW-OK [VERIFIED] AddSheet → создание траты → live-обновление Home
- «+» → bottom-sheet (Расход/Доход, Сумма, Категория ПРОДУКТЫ, Дата). Ввёл 500₽, Сохранить → лист закрылся, Home мгновенно обновился: Остаток 122 250→121 750, ФАКТ 27 750→28 250, В ЗАПАСЕ +59 250→+58 750, ПРОДУКТЫ 5 790→6 290 / 30 000. Core value работает end-to-end.
- **Minor [P3]:** заголовок листа усечён «Новая транза...» (можно укоротить до «Новая трата» / уменьшить шрифт).

### Pending tour (этой сессией не дошёл — backlog для продолжения)
Подписки, Копилка, Счета, Категории, Аналитика, Шаблон бюджета, Доступ, AI-таб, AddSheet (+), CategoryDetail drill-down, GoalDetail; весь V10MainShell (ui.theme toggle); web. + pixel-perfect сверка с Maximal Poster референсом.

---

## iOS — V10MainShell = Maximal Poster (дефолтная тема; чёрно/кремовый редакторский, serif, таб-бар ГЛАВНАЯ/КОПИЛКА/+/AI/УПР.)

### THEME-REDUCE [DONE+VERIFIED commit e96affa] Оставить 2 темы: Maximal Poster + СТАРЫЙ IOS (owner request)
- Было 4 опции в пикере: sentinel «СТАРЫЙ IOS» (v06) + Theme enum {maximalPoster, liquidGlass, iosDefault}. Убраны liquidGlass + iosDefault из enum/пикеров(v06+V10)/токенов/тестов. Stale raw `liquid_glass`/`ios_default` → резолв в maximalPoster (Theme.resolve). Оба шелла build green, suite 639/0.
- **VERIFIED:** пикер тем показывает ровно 2 ряда — MAXIMAL POSTER (✓ выбрана, «Кораллово-кобальтовая палитра, Archivo Black») + СТАРЫЙ IOS («Нативный SwiftUI: Form, TabView, system colors»).
- Экраны Maximal Poster (Управление «Управление.» нумерованный список, Настройки) — визуально в editorial-стиле, опрятны.
- **Minor [P3] [FIXED+VERIFIED commit b7c1d84]:** заголовок sheet «ТЕМА» налезал на статус-бар — `ThemePickerSheet` был жадным full-screen ScrollView; сделан компактным bottom-sheet (`.fixedSize` vertical + `maxHeight 360`), теперь заякорен снизу, «ТЕМА» чисто под часами.
- **Minor [P3] [RESOLVED — не баг]:** «AI ЛИМИТ РАСХОДОВ $0.00 / $5.00» в долларах — КОРРЕКТНО: `cost_cents` = USD-копейки (косты AI-провайдера, Phase 67 R8). Перевод в ₽ был бы вводящим в заблуждение (курс). Оставлено в USD намеренно.

NB: ранее принятые за «v06» светлые экраны (Главная/Транзакции с tab-баром Главная/Транзакции/AI/Управление) — это и есть **СТАРЫЙ IOS** (v06 MainShell). Maximal Poster — чёрно-кремовый/коралловый editorial. Оба ревьюятся отдельно.

### Maximal Poster tour (TOUR-OK — вылизаны, работают на данных)
- **Главная:** коралловый full-bleed, «Дневной темп — 5 340 ₽», PLAN МЕСЯЦА **+58 750 ₽** (HOME-1 фикс отражён), категории с прогресс-барами %/факт/план, сорт по % убыв. Опрятно.
- **Подписки:** «Подписки. 2 666 ₽/мес · 4 активных». **BUG-2 VERIFIED:** NETFLIX «каждое 15 число», YANDEX PLUS «каждое 20 число», SPOTIFY «каждое 5 число» — день списания сохранён+показан. (leftover «NETFLIX TEST» без дня = мусор прошлых прогонов.)
- **Копилка:** чёрно-жёлтый, НАКОПЛЕНО 48 000 ₽, ОКРУГЛЕНИЕ ВКЛ (10/50/100₽), цели ОТПУСК 23%/ПОДУШКА 7% с прогресс-барами. Опрятно.
- **Управление / Настройки / План месяца / Транзакции** — editorial-стиль, опрятны, данные корректны.

### AI-CHAT-1 [P0 functional] [FIXED+VERIFIED commit e11990f] AI-чат полностью сломан в приложении — malformed SSE URL
- **Корень:** `SSEClient.swift:109` строил URL конкатенацией `baseURL.absoluteString + "api/v1/ai/chat"`. `baseURL` без завершающего `/` (`http://192.168.31.117:8000`) → `…8000api/v1/ai/chat` (пропущен слеш) → URLError → запрос НЕ доходил до backend (в api-логе нет `/ai/chat`, есть `/ai/observation` 200 — он через APIClient с корректным `appendingPathComponent`). Чат не работал НИКОГДА в приложении (не из-за тарифа).
- **Фикс:** `AIChatAPI.chatURL(base:)` через `appendingPathComponent` (как APIClient). +4 unit-теста (no `8000api` mashup, path `/api/v1/ai/chat`). Suite 649/0.
- **VERIFIED:** после фикса free-tier запрос дошёл до backend → 402.

### AI-CHAT-2 [P1 UX] [FIXED+VERIFIED commits 4992fbb + e0d0207] 402 PRO_TIER_REQUIRED → generic «Ошибка» вместо понятного Pro
- AI-чат — Pro-фича; free-tier `/ai/chat` → 402. Приложение показывало «⚠️ Ошибка». Фикс: `APIError.isProTierRequired` (code==402) → оба VM (v06 AIChatViewModel + V10 AiV10ViewModel) показывают фикс-копию «Чат-ассистент доступен в Pro-тарифе» (no-leak, без серверного detail). Промежуточный баг: дренаж тела 402 в SSE бросал другую ошибку — убран (e0d0207).
- **VERIFIED на симуляторе:** free-tier → бабл «Чат-ассистент доступен в Pro-тарифе» (не «Ошибка»). С Pro (выдан owner в dev-БД, 1 год) `/ai/chat` стримит реальный ответ (tool get_category_summary + токены) — подтверждено через API.

### CategoryDetail [TOUR-OK] (Maximal Poster drill-down)
- ЗДОРОВЬЕ · 07: «на 83% плана · 4 140 ₽ из 5 000», прогресс-бар, ОСТАТОК→ПРОЧЕЕ, действия ПОДНЯТЬ ЛИМИТ/ПАУЗА, операции по категории (Стоматолог +2 800, Аптека +1 340). Опрятно, функционально.

### Аналитика [TOUR-OK]: «Месяц.», ПОТРАЧЕНО 28 250, СЭКОНОМЛЕНО +58 750 от плана (корректно), day-chart + КАТ. bar-chart, ТОП КАТЕГОРИИ. Опрятно.
### AI home [TOUR-OK]: «За неделю экономия 48 000 ₽» (observation 200) + промпты-подсказки.

dev-note: owner выдан Pro (pro_active_until +1y) для проверки AI; разумно для персонального приложения владельца. NB: full pytest сбросит это вместе с dev-БД → при пересеве заново выдать Pro если нужен AI.

### Находки выделенного review-агента (оба шелла, полный обход)
- **AN-1 [P1] [FIXED+VERIFIED commit 3583d56]** Аналитика (СТАРЫЙ IOS) сломана: `AnalyticsView.load error: DecodingError.keyNotFound 'categories'` — клиент/сервер контракт-mismatch (ответ без `categories`). Баннер «Что-то пошло не так», нет прогноза/топа несмотря на ~18 транзакций. На всех периодах. (Maximal Poster Аналитика работает — другой decode-путь.)
- **PLAN-1 [P1] [FIXED+VERIFIED commit edb09d2]** PLAN МЕСЯЦА (Maximal Poster) слайдеры в копейках: ПРОДУКТЫ «3 000 000» (надо 30 000 ₽), КАФЕ «1 200 000» и т.д. — значения = рубли×100, без ₽. Хедер «ОСТАЛОСЬ +63 000 ₽» корректен → баг только в слайдер-лейблах.
- **DEP-1 [P1] [FIXED+VERIFIED commit 2361027]** Goal deposit sheet (Maximal Poster) кнопки за таб-баром: «ПОПОЛНЕНИЕ» — ОТМЕНА/СОХРАНИТЬ (y≈809-874) перекрыты таб-баром (y≈798+), недоступны, лист не драг/не expand → депозит нельзя отправить в MP-шелле. (В СТАРЫЙ IOS — нативный sheet, работает.) Тот же класс, что theme-sheet occlusion.
- **ACCESS-1 [P2] Доступ (СТАРЫЙ IOS) = заглушка «Будет в следующей фазе»**, тогда как Maximal Poster Доступ реализован полностью (ПОЛЬЗОВАТЕЛИ/AI USAGE). Parity-gap.
- **BAL-1 [P2] Главная (СТАРЫЙ IOS) «Остаток на счёте» 121 750 ≠ сумма счетов 227 150** (Карта+Наличные). Лейбл обещает баланс счетов, показывает period balance_now. Mislabel vs data — нужно решение (переименовать лейбл ИЛИ показывать сумму счетов).
- **P3:** AddSheet MP без явного Доход/Расход тумблера (доход через chip ЗАРПЛАТА — возможно by-design); empty-desc «—» (MP) vs «Без описания» (v06) инконсистентно; «Сервисы» Title Case (leftover); NETFLIX TEST leftover + клиппинг сабтайтлов «просро…»; Шаблон плана пуст (unseeded plan_template_item).

### Открытые находки (deferred — решения приняты)
- **ACCESS-1 [P2] [FIXED+VERIFIED commit c110e8f]:** реализован нативный v06 «Доступ» (Пользователи + AI Usage), переиспользует `AccessV10ViewModel` + вынесен общий `AccessFormatting` (R6). VERIFIED: owner row ID 123456789/OWNER, AI Usage $0.00/$5.00, оба таба. 669 тестов.
- **WEB-P3-W1 [P3] [FIXED commit 1474c83]:** web — UI счёта подписки («СМЕНИТЬ СЧЁТ» через AccountPickerSheet + лейбл счёта на строке), PATCH account_id.
- **WEB-P3-W2 [P3] [FIXED commit 1e7a620]:** web — analytics month-chip управляет Топ-5 (derive из actuals выбранного месяца; backend top-categories только coarse range, потому client-side per-month).
- **BAL-1 [P2] [FIXED+VERIFIED commit fe02053]:** v06 «Остаток на счёте» теперь = сумма счетов (227 150 ₽, сходится с экраном Счета), переиспользован MP-хелпер `HomeData.computeWalletTotal`. ПЛАН/ФАКТ/В ЗАПАСЕ остались из /actual/balance. (v1.0-онбординг не создаёт starting_balance → старый balance_now был чистым period-net, не соответствовал лейблу.)
- **WEB-AI-1 [P2] [FIXED commit 77e69ef]:** web AI-чат показывал сырое «HTTP 402» вместо Pro — теперь «Чат-ассистент доступен в Pro-тарифе» (паритет с iOS AI-CHAT-2), no-leak. 742 vitest. Web regression-gate зелёный (build+typecheck+vitest), web Home plan-source/analytics-decode/деньги/AI-URL — OK (бэкенд-фиксы HOME-1/BUG-1/2 web получает бесплатно).
- **1M-forecast [P3]:** 1M-прогноз = 0₽ при единственном месяце истории (вероятно корректно — недостаточно данных для проекции; 3M показывает реальные числа).
- **Step03PlanView [P3]:** onboarding-слайдер плана использует тот же PosterSlider с cents-binding — внешний рублёвый лейбл корректен, но внутренний readout сырой (дубль если включить valueIsCents). Будущая чистка.
- **P3-набор:** empty-desc «—»(MP) vs «Без описания»(v06); «Сервисы» Title Case (leftover-данные); NETFLIX TEST leftover + клиппинг сабтайтлов; AddSheet MP без явного Доход/Расход тумблера (доход через chip — by-design?).
- theme persisted across reinstall (incremental install сохраняет UserDefaults) — не регрессия.

### Остаток тура (для продолжения)
web (не тронут); pixel-perfect сверка с Maximal Poster референсом; уборка leftover dev-данных; P3-полировка.

## Итог сессии (phase 71) — 14 проблем закрыто
**P0 (3, verified):** BUG-1 Home balance 500 (e21aba2); AI-CHAT-1 SSE URL — чат был полностью сломан (e11990f); HOME-1 plan source core-value (8e18b9f).
**P1 (5, verified):** BUG-2 subs V10 write (b536653); AI-CHAT-2 402 Pro UX (4992fbb+e0d0207); PLAN-1 plan kopecks→rubles (edb09d2); DEP-1 deposit occlusion (2361027); AN-1 analytics decode (3583d56).
**P2 (2 fixed + 1 deferred):** BAL-1 wallet total verified (fe02053); WEB-AI-1 web 402 Pro msg (77e69ef); ACCESS-1 v06 Доступ — DEFER (намеренный placeholder).
**UI/P3:** темы→2 (e96affa); theme-sheet layout (b7c1d84); subscription subtitle clipping (494b9e6); onboarding plan slider readout (a8e3e1d). Leftover dev-данные (Netflix Test, Сервисы) почищены через API.
**Tests:** backend 786→787 green; iOS 639→663 green; web 738→742 green. Оба iOS-шелла + web отревьюены, визуально вылизаны, ключевой функционал работает. Web build/typecheck/vitest зелёные, бэкенд-фиксы (HOME-1/BUG-1/2) web получает бесплатно.
**23 проблемы закрыто всего.** Финальная итерация (владелец: «реши сам и сделай»):
- **ADDSHEET-INCOME [FUNCTIONAL] [FIXED+VERIFIED commit 4f208b7]:** MP AddSheet жёстко слал `kind:"expense"` → доход НЕЛЬЗЯ было добавить. Добавлен тумблер Доход/Расход + kind-driven payload + фильтрация chips по kind. VERIFIED: доход 1000 → кошелёк +1000, появился как ЗАРПЛАТА.
- **P2-SIGN [FIXED+VERIFIED commit 099e172]:** MP Реестр показывал расходы с «+» (неотличимо от дохода) — знак брался из числа, а API отдаёт положительные magnitude. Теперь kind-driven: расход «−», доход «+» (затронуло Transactions/CategoryDetail/AccountDetail). VERIFIED.
- **P3-TITLE [FIXED+VERIFIED 099e172]:** CategoryDetail-заголовок рвался посреди слова → shrink-to-fit одной строкой. VERIFIED.
- **P3-STEPPER [FIXED+VERIFIED b14249c]:** MP Настройки −/+ степперы низкоконтрастные → новый ink-stroked PosterStepper. VERIFIED.
- **P3-STATUSBAR [FIXED+VERIFIED 157842c]:** статус-бар бледный на кремовых MP-экранах. Первая попытка (preferredColorScheme) — no-op в кастомном PosterRouter; пересделано через swizzle root-VC `preferredStatusBarStyle` + observable per-screen onAppear. VERIFIED: cream→dark clock, dark→light clock.
- **empty-desc [DECIDED leave]:** «—»(MP) vs «Без описания»(v06) — уместный per-shell идиом, не дефект; унификация = риск ухудшить. Оставлено намеренно.

iOS 639→**686** green / backend **787** / web 738→**755** green. Оба шелла + web функционально работают и визуально вылизаны; все конкретные визуальные дефекты из обхода устранены. pixel-perfect vs web-prototype не делался (нет рендера прототипа), но по детальному скрутинизу оба шелла без дефектов. Owner = Pro (dev) для AI. NB: full pytest сбросит dev-БД+Pro.

---

## Web

(pending)
