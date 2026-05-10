# Requirements — v1.0 Maximal Poster Full

**Milestone:** v1.0
**Started:** 2026-05-09
**Source:** `.planning/v1.0-handoff/handoff/` + `.planning/research/SUMMARY.md`
**Decisions:** ADR-001 (cyrillic fallback), ADR-002 (PosterNavStack), 5 user-decisions OQ-13/21/22/09/10

REQ-IDs продолжают нумерацию категорий (новые префиксы для v1.0). Каждый requirement — atomic, testable, user-centric («User can X»).

## v1.0 Requirements

### BACKEND-EXT — расширение схемы и логики (Phase 22)

- [ ] **BE-01** — User-владелец может сохранить месячный доход (`User.income_cents`) через `PATCH /api/v1/me`; AI и UI используют его как basis для категорийных лимитов.
- [ ] **BE-02** — User может создавать/редактировать/удалять счета (`Account`: card/cash/savings + bank + mask + balance + primary) через `GET/POST/PATCH/DELETE /api/v1/accounts`; ровно один primary на пользователя (partial unique index); удаление запрещено если есть транзакции.
- [ ] **BE-03** — User видит баланс счёта в реальном времени: `account.balance_cents` пересчитывается в service-layer при создании/редактировании/удалении actual transaction (delta accounting).
- [ ] **BE-04** — User имеет лимит, rollover-цель, paused-флаг и parent на каждой категории (`Category.{plan_cents, rollover ∈ misc|savings, paused, parent_id, code, ord}`); расширенный `PATCH /api/v1/categories/:id` принимает все эти поля.
- [ ] **BE-05** — При первом онбординге создаются 8 default-категорий с кодами `food/cafe/home/transit/fun/gifts/health/subs` и shares 0.20/0.10/0.30/0.06/0.05/0.04/0.05/0.03; legacy 14-cat behavior сохраняется для v0.x клиентов (signal по наличию accounts[]).
- [ ] **BE-06** — `actual_transaction.kind` расширен enum `ActualKind ∈ expense|income|roundup|deposit` через alembic `autocommit_block`; добавлено `parent_txn_id BIGINT NULL FK self ON DELETE CASCADE` для roundup-связи.
- [ ] **BE-07** — При создании expense-транзакции автоматически создаётся roundup child-txn (kind=roundup, same account_id, parent_txn_id=parent.id) если `SavingsConfig.roundup_enabled=true`; формула `delta = ((|amount| + base − 1) // base) * base − |amount|`; пропуск если `delta == 0` или `delta == base`.
- [ ] **BE-08** — User может включить/выключить округление и выбрать базу (10/50/100 ₽) через `PATCH /api/v1/savings/config`; toggle-off действует только на новые transactions (future-only effect).
- [ ] **BE-09** — User получает агрегатный snapshot копилки через `GET /api/v1/savings` → `{total, monthIn, config, goals}`; `total = SUM(amount) WHERE kind IN ('roundup','deposit')`.
- [ ] **BE-10** — User может ручно пополнить копилку через `POST /api/v1/savings/deposit { amount, account_id, goal_id? }` → создаётся kind=deposit txn.
- [ ] **BE-11** — User может создавать/редактировать/удалять цели копилки (`Goal { name, target, current, due? }`) через `GET/POST/PATCH/DELETE /api/v1/goals`.
- [ ] **BE-12** — User видит регулярные платежи как extension существующего Subscription (+ `day_of_month` 1..28, + `account_id`, + `posted_txn_id`); UI-name = «Регулярные» / «Подписки» в зависимости от cycle (monthly = recurrent, yearly = subscription); table остаётся `subscription` (минимум churn).
- [ ] **BE-13** — User может вручную «провести в факт» месячную регулярку через `POST /api/v1/subscriptions/:id/post` → создаётся actual_transaction(kind=expense), Subscription.posted_txn_id = txn.id; `POST .../unpost` откатывает.
- [ ] **BE-14** — В полночь 1-го числа `close_period_job` выполняет rollover: для каждой `category где !paused` берёт `remainder = max(0, plan_cents − fact_cents)`; если `rollover='savings'` — создаёт kind=deposit txn с descript `Остаток {category.name} → копилка`; если `rollover='misc'` — суммирует в `period.misc_rollover_cents` для следующего периода (виртуально, без txn). Идемпотентно через `period.rollover_processed_at` + UNIQUE INDEX.
- [ ] **BE-15** — `POST /api/v1/onboarding/complete` атомарно принимает расширенный body `{income_cents, accounts[], category_plans{code:cents}, goal?, savings_config?}` (все поля optional для backward compat); создаёт User.income, Account-rows, Category.plan_cents, Goal, SavingsConfig в одной транзакции.
- [ ] **BE-16** — Все 4 новые таблицы (`account`, `goal`, `subscription`-ext, `savings_config`) защищены Postgres RLS с policy `tenant_isolation USING (user_id = current_setting('app.current_user_id')::bigint)`; composite FK `(parent_id, user_id) → (id, user_id)` на `category.parent_id` и `actual_transaction.parent_txn_id` для cross-tenant защиты.

### DESIGN-SYSTEM — Design System Foundation (Phase 23, web ║ iOS параллельно)

- [ ] **DS-01** — Web и iOS используют единый `tokens.json` как source-of-truth (палитра, spacing scale, font registry); codegen-скрипты `scripts/gen-css.ts` и `scripts/gen-swift.ts` пишут `frontend/src/stylesV10/tokens.css` и `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift`; CI-check `make tokens-check` валит билд если generated ≠ committed.
- [ ] **DS-02** — Web подключает 4 шрифта через `@fontsource(-variable)/*@5.2.8`: Manrope (variable wght 200-800 + ital), JetBrainsMono (variable wght + ital), Archivo Black (900), DM Serif Display Italic; PT Serif Italic как cyrillic fallback по ADR-001 через `unicode-range`. Self-host woff2 + `font-display: optional` + preload top-2 weights.
- [ ] **DS-03** — iOS bundles 5 TTF в `Resources/Fonts/` + `UIAppFonts` Info.plist (синхронная регистрация at launch — нет FOUT race); variable Manrope и JetBrainsMono через `Font.custom().weight()`; PT Serif Italic как замена DM Serif Italic для cyrillic glyphs (ADR-001).
- [ ] **DS-04** — Web и iOS реализуют 11 keyframe-анимаций из DESIGN-SYSTEM §7: posterRowIn, posterRiseIn, posterBarFill, posterTabPop, posterPopIn, posterCheck, posterDot, posterSlideInFwd/Back, posterTabSwap, posterToastIn; web — pure CSS keyframes; iOS — `withAnimation(.easeOut)` + `Path.trim` + `phaseAnimator` (iOS 17+).
- [ ] **DS-05** — Web и iOS поддерживают `prefers-reduced-motion` / `accessibilityReduceMotion` — анимации редуцированы до opacity-only при включённом OS-флаге (нет in-app toggle).
- [ ] **DS-06** — Web реализует базовые компоненты `<Eyebrow>`, `<Mass>`, `<BigFig>`, `<Plate>`, `<PosterButton variant>`, `<Chip>`, `<PosterSlider step=500>`, `<TabBar>`, `<FAB>`, `<Toast>` в `frontend/src/componentsV10/`; iOS — symmetric set в `ios/BudgetPlanner/FeaturesV10/Common/`.
- [ ] **DS-07** — iOS реализует custom `PosterNavStack` (ZStack + asymmetric transitions + `@Observable` router) + `PosterSheet` (slide-up + sheetEase + backdrop) + ручной edge-swipe-back через `UIScreenEdgePanGestureRecognizer` (ADR-002); accessibility traits `.accessibilityLabel("Назад")` + `.accessibilityAddTraits(.isButton)`.
- [ ] **DS-08** — iOS dual-shell coexistence: `AppRouter` switch на `@AppStorage("ui.theme")` между `V06MainShell` (текущий) и `V10MainShell` (новый); v0.6 screens остаются untouched до Phase 28; default flips на v10 в acceptance.

### ONB — Onboarding 4-step (Phase 24, web → iOS)

- [ ] **ONB-V10-01** — User проходит 4-шаговый онбординг: Доход → Счета → План → Цель (опц.) → Final «ВСЁ. деньги под контролем.»; back-arrow на каждом шаге, прогресс-бар (4 деления), eyebrow «ШАГ 0X / 04».
- [ ] **ONB-V10-02** — User вводит месячный доход на step 01 (large input + ₽); NEXT enabled при `income > 0`; сохраняется в `User.income_cents` через atomic `POST /onboarding/complete`.
- [ ] **ONB-V10-03** — User добавляет 1+ счёта на step 02 через chip-list (Т-Банк / Сбер / Наличные / + Добавить) с указанием balance per account; первый = primary; NEXT enabled при `accounts.length >= 1`.
- [ ] **ONB-V10-04** — User распределяет план по 8 default-категориям на step 03 через slider (initial = `share * income`, step 500 ₽); нижний счётчик «остаётся X ₽ → накопления» / «превышение X ₽» live; NEXT disabled при `Σ plan > income`.
- [ ] **ONB-V10-05** — User опционально создаёт цель копилки на step 04 (name + target_cents); кнопка «ПРОПУСТИТЬ» сверху skip к Final; default Goal не создаётся при skip.
- [ ] **ONB-V10-06** — User видит Final-экран с резюме (доход, счета, план, цель) и CTA «НАЧАТЬ →»; tap → переход на Home (новый `PosterHomeView`).
- [ ] **ONB-V10-07** — User черновик онбординга persistится в `localStorage` (web) / `UserDefaults` (iOS) при выходе/возврате; clear после успешного `POST /onboarding/complete`.

### HOME — Главная (Phase 25)

- [x] **HOME-V10-01** — User видит eyebrow `VOL.NN / MONTH YYYY · N ДНЕЙ` (номер месяца, год, осталось дней) + italic «Дневной темп —» + BigFig (count-up на mount, easing cubicOut 900ms).
- [x] **HOME-V10-02** — User видит подложку «осталось N дней · в кошельке X ₽ →» (X = Σ account.balance_cents); tap → push Accounts list.
- [x] **HOME-V10-03** — User видит plan-bar бейдж «PLAN МЕСЯЦА · ± X ₽ →»; tap → push PLAN мая.
- [x] **HOME-V10-04** — User видит сортированный список категорий (по `act/plan` desc, превышения сверху) с stagger-анимацией (`posterRowIn` delay 0.08 + i*0.045s) и bar-fill 700ms; OVER-плашка для `act > plan`.
- [x] **HOME-V10-05** — User tap на категории → push Category Detail; «ВСЕ ОПЕРАЦИИ →» → push Transactions registry.
- [x] **HOME-V10-06** — User видит цвет фона Home: coral / cobalt / cream (Tweak — выбран coral по умолчанию для v1.0; toggle отложен в R6).

### TXN — Реестр транзакций (Phase 25, push-stack из Home/Category)

- [x] **TXN-V10-01** — User видит реестр с eyebrow «SECTION II» + Mass italic «Реестр.» + eyebrow «N ЗАПИСЕЙ · X ₽» (фон cobalt).
- [x] **TXN-V10-02** — User фильтрует транзакции через single-select chip-bar: Все / Кафе / Продукты / Транспорт / Подписки / Копилка.
- [x] **TXN-V10-03** — User видит транзакции сгруппированными по дням (Сегодня / Вчера / «N мая» через DM Serif italic 28px) с суммой за день справа.
- [x] **TXN-V10-04** — User видит каждую операцию: время моно · название · `категория · СЧЁТ` · сумма (моно с U+2212 для отрицательных); roundup отмечены жёлтой плашкой «↻ ОКРУГЛ.», deposit — «→ КОПИЛКА».
- [x] **TXN-V10-05** — User tap на операцию → edit sheet (re-use TransactionEditor с poster-стилем); swipe-left → delete с confirm.
- [x] **TXN-V10-06** — V0.6 Transactions tab fully demoted из bottom nav (5 табов = Home/Savings/FAB/AI/Mgmt); реестр доступен через push-stack из Home «ВСЕ ОПЕРАЦИИ →» и через Category Detail.

### ADD — Add Sheet (Phase 25)

- [x] **ADD-V10-01** — User открывает Add Sheet через FAB (доступен на каждом экране кроме Add Sheet самого); чёрный фон, NEW ENTRY · {date} · {time}, `×` close.
- [x] **ADD-V10-02** — User вводит сумму через custom 3×4 цифровую клаву (1..9, ., 0, ⌫); BigFig 86px жёлтым; iOS suppresses system kb (TextField inputView = empty UIView); web hidden input + custom buttons.
- [x] **ADD-V10-03** — User вводит описание (italic-сериф плейсхолдер «кафе / продукты / …»); chips «Когда»: Сегодня / Вчера / Своя дата (DatePicker).
- [x] **ADD-V10-04** — User выбирает категорию через горизонтальный chip-scroll (single-select, обязательное); счёт — строка с primary, tap → выбор из списка.
- [x] **ADD-V10-05** — CTA состояния: «ВВЕДИТЕ СУММУ» (disabled, серый) → «ВЫБЕРИТЕ КАТЕГОРИЮ» (disabled) → «СОХРАНИТЬ ↵» (active, yellow); закрытие при unsaved → confirm-sheet «ОТМЕНИТЬ ЗАПИСЬ?».

### CAT-DET — Category Detail (Phase 26, новый экран)

- [x] **CAT-V10-01** — User видит цветной фон Category Detail: cobalt (норма) / red (`isOver`); Mass UPPERCASE (Archivo Black) с именем категории.
- [x] **CAT-V10-02** — User видит italic подзаголовок «— превышено на N%» / «— на N% плана» (DM Serif Italic / PT Serif Italic для cyrillic) + BigFig факт + count-up.
- [x] **CAT-V10-03** — User видит progress bar 6px с разрывом на отметке плана если `isOver`; «из X ₽ · −over» подпись.
- [x] **CAT-V10-04** — User toggle-tap на plate «ОСТАТОК → НАКОПЛЕНИЯ / ПРОЧЕЕ» меняет `category.rollover` через `PATCH /api/v1/categories/:id`.
- [x] **CAT-V10-05** — User видит CTA-row «+ ПОДНЯТЬ ЛИМИТ» (push PLAN с фокусом на эту категорию) / «ПАУЗА» (toggle `category.paused`).
- [x] **CAT-V10-06** — User видит список операций по этой категории (фильтр из реестра).

### PLAN — PLAN мая расширенный (Phase 26)

- [x] **PLAN-V10-01** — User видит eyebrow «MGMT / LIMITS» + Mass Archivo Black «PLAN МЕСЯЦА.» (фон cobalt).
- [x] **PLAN-V10-02** — User видит plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» (`income − Σplan`) с OK/OVER статусом; OVER блокирует продолжение редактирования.
- [x] **PLAN-V10-03** — User видит block «ОСТАТОК ПО ИТОГУ МЕСЯЦА» — две плашки `→ ПРОЧЕЕ X ₽` / `→ НАКОПЛЕНИЯ Y ₽` с агрегатами по rollover-flag.
- [x] **PLAN-V10-04** — User видит block «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» со списком из `/api/v1/subscriptions` (cycle=monthly, day_of_month set); каждая строка: имя · «N числа · комментарий» · сумма · кнопка «ПРОВЕСТИ →» (post) / «ОТМЕНА» (unpost если `posted_txn_id != null`); tap → toast «✓ ПРОВЕДЕНО · −X ₽ → реестр».
- [x] **PLAN-V10-05** — User видит block «КАТЕГОРИИ · 8» с slider per category (шаг 500 ₽, debounce commit 300ms, tap по числу → keyboard input); bar факта поверх трека лимита; chip-pair «ПРОЧЕЕ / НАКОПЛЕНИЯ» меняет `rollover`.
- [x] **PLAN-V10-06** — User PATCH `Σplan` атомарно через single endpoint (избегаем race-condition); validation `Σplan ≤ income` server-side с 400 на нарушение.

### SUBS — Подписки (Phase 26)

- [x] **SUBS-V10-01** — User видит экран Подписки на coral-фоне с Mass italic «Подписки.» + BigFig «X ₽/мес» + eyebrow «N АКТИВНЫХ · Y ₽ В ГОД».
- [x] **SUBS-V10-02** — User видит список подписок: name UPPER · «каждое N число» / «N {month}» · price · `···`; bottom-sheet меню по tap на `···`.
- [x] **SUBS-V10-03** — User в меню видит 3 ghost-кнопки: «ПАУЗА» (toggle is_active), «СМЕНИТЬ ДЕНЬ» (secondary sheet с DatePicker → PATCH day_of_month), «ИЗМЕНИТЬ ЦЕНУ» (secondary sheet с numeric input → PATCH amount_cents).
- [x] **SUBS-V10-04** — User видит destructive CTA «ОТМЕНИТЬ ПОДПИСКУ» (red фон, paper текст); tap → confirm → `DELETE /api/v1/subscriptions/:id`.

### AI — AI Assistant (Phase 27)

- [x] **AI-V10-01** — User в initial-state (без сообщений) видит eyebrow «AI · ASSISTANT / ONLINE» + DM Serif 36px (cyrillic-fallback PT Serif Italic) наблюдение поверх данных + дополнение DM Serif italic 24px + eyebrow «— из ваших данных, {today}».
- [x] **AI-V10-02** — User видит eyebrow «ПОДСКАЗКИ · ТАПНИ» + 4 строки-чипа (DM Serif italic 18px) с `→`; tap чипа → отправляет prompt в чат.
- [x] **AI-V10-03** — Backend генерирует initial observation через rule-engine (template-based) с rules: «{Month} в плюсе на X ₽» / «{Category} уже +N% к лимиту» / «За неделю экономия Y ₽» / «Завтра списание подписок на Z ₽»; cache 1 час; fallback template при не-достаточности данных.
- [x] **AI-V10-04** — User в active-state видит ленту: user-сообщения = чёрная плашка справа, ai = italic-текст слева в рамке; typing-indicator = 3 dots с posterDot animation; auto-scroll к последнему.
- [x] **AI-V10-05** — User видит composer: чёрная плашка снизу, моно-инпут с плейсхолдером «напишите или тапните подсказку…», жёлтая кнопка «↵ ОТПРАВИТЬ»; reuse v0.6 SSE streaming + AI tools.

### SAV — Копилка (Phase 27, новый экран)

- [x] **SAV-V10-01** — User видит экран Копилка на чёрном фоне с Mass italic «Копилка.» + жёлтая plate «НАКОПЛЕНО ВСЕГО X ₽» + eyebrow «В МАЕ + Y ₽».
- [x] **SAV-V10-02** — User видит eyebrow «ОКРУГЛЕНИЕ ТРАТ» с toggle ВКЛ/ВЫКЛ + chips базы 10/50/100 ₽ (PATCH `/savings/config`) + подпись «в этом месяце скоплено: + X ₽».
- [x] **SAV-V10-03** — User видит eyebrow «ЦЕЛИ» + карточки name · «срок · {due}» · «{cur} / {target} ₽» · «{pct}%» + posterBarFill progress; CTA «+ НОВАЯ ЦЕЛЬ» / «ПОПОЛНИТЬ».
- [x] **SAV-V10-04** — User создаёт цель через bottom-sheet form (name + target + due?); ручное пополнение через secondary sheet (amount + account picker → POST `/savings/deposit`).

### ACCT — Счета (Phase 27, новый экран)

- [x] **ACCT-V10-01** — User видит Accounts list на cream-фоне с Mass italic «Счета.» + dark plate «СУММАРНО · X ₽ · N счетов»; список (bank · type/mask · balance · «история →» · бейдж ОСНОВНОЙ для primary).
- [x] **ACCT-V10-02** — User видит CTA «+ ДОБАВИТЬ СЧЁТ» (sheet с form) и «ПЕРЕВОД» (disabled с «SOON» badge — defer в v1.1 per OQ-10).
- [x] **ACCT-V10-03** — User tap на счёт → push Account Detail на чёрном фоне с Mass italic названием банка + подпись «карта ·· 4408» / «наличные» / «накопит. счёт».
- [x] **ACCT-V10-04** — User видит 2 KPI plates на Account Detail: «БАЛАНС» (yellow) + «В МАЕ · N ОПЕРАЦИЙ» (dark) + список операций по счёту (фильтр из реестра).

### ANAL — Аналитика (Phase 27)

- [x] **ANAL-V10-01** — User видит экран Аналитика на cream-фоне с Mass italic «Месяц.» + segmented диапазона «МАР 26 / АПР 26 / МАЙ 26 (•)» + ссылка «полгода / год».
- [x] **ANAL-V10-02** — User видит 2 KPI plates: «ПОТРАЧЕНО» (тёмная) с delta к прошлому периоду + «СЭКОНОМЛЕНО» (жёлтая) «+ X / от плана».
- [x] **ANAL-V10-03** — User видит segmented группировки «ДЕНЬ / НЕД. / КАТ.»; bar-chart по дням с красным выделением столбцов ≥75% от плана.
- [x] **ANAL-V10-04** — User видит топ-5 категорий ниже chart (re-use v0.6 `/analytics/top-categories` с rewrite UI).

### MGMT — Управление (Phase 27)

- [x] **MGMT-V10-01** — User видит Mgmt-хаб на чёрном фоне с 5 пунктами (per OQ-13): «01 PLAN МЕСЯЦА» / «02 СЧЕТА» / «03 АНАЛИТИКА» / «04 НАСТРОЙКИ» / «05 ДОСТУП» (admin only — owner role).
- [x] **MGMT-V10-02** — User видит каждый пункт как numbered list-row: моно-цифра + UPPER name + sub-info (count + sum) + `→`; tap → push соответствующий screen.
- [x] **MGMT-V10-03** — User в Settings видит rewrite v0.6 form в poster-стиле (cycle_start_day stepper, notify_days_before, AI-categorization toggle, AI spend cap read-only); функционал не меняется, только визуал.
- [x] **MGMT-V10-04** — User-owner в Access видит admin Users / AI Usage tabs с poster-стилем (re-use v0.6 endpoints).

### POLISH — Animations & Acceptance (Phase 28)

- [ ] **POL-01** — Все 11 keyframe-анимаций работают на каждом экране (web и iOS), stagger-индексы соответствуют DESIGN-SYSTEM §7.4 (rows 0.045s, day-groups 0.07s, hints 0.08s, regulars 0.09s).
- [ ] **POL-02** — Tab bar: 5 колонок 1fr 1fr 64px 1fr 1fr, sliding indicator 350ms sheetEase, tab-pop 0.45s overshoot, FAB 48×48 с `scale(0.88) rotate(-90deg)` на press; Toast top:64 с overshoot in + check-mark stroke-dashoffset + 1700ms life.
- [ ] **POL-03** — User с включённым `prefers-reduced-motion` (web) / `accessibilityReduceMotion` (iOS) видит редуцированные анимации (opacity-only, без movement); a11y audit с VoiceOver / TalkBack: UPPERCASE+letter-spacing 0.18em имеют `accessibilityLabel` overrides; edge-swipe-back имеет `.accessibilityLabel("Назад")` (ADR-002).
- [ ] **POL-04** — Pixel-perfect side-by-side QA: каждый экран сверен с `prototype/index.html` через Playwright `toHaveScreenshot()` (web) и manual XcodeBuildMCP screenshot + Preview Canvas (iOS); divergences задокументированы в `.planning/v1.0-handoff/DIVERGENCES.md` (например iOS safe-area).
- [ ] **POL-05** — Performance: Home первая отрисовка с count-up завершается < 1.5s после launch (iPhone 11 / iPhone Pro target); Lighthouse mobile > 90 / LCP < 2.5s; bundle добавка woff2 < 200kB gzipped.
- [ ] **POL-06** — Migration safety: alembic upgrade head → downgrade -1 → upgrade head без падения (на копии prod DB); integration test `test_multitenancy_v1_0_columns.py` — RLS + composite FK защищают cross-tenant access; CI-check `make hidden-unicode-grep` находит U+00AD / U+200B / U+200C / U+200D в репе.
- [ ] **POL-07** — Acceptance §14 ТЗ: онбординг < 60 сек / Home показывает дневной темп с count-up / Add Sheet записывает за один tap / PLAN меняет лимиты / AI initial state работает / Копилка показывает накопления и цели / нет видимого FOUT после первого визита (переформулировано из «нет FOUT-моментов»).

---

## Future Requirements (deferred к v1.1+)

| REQ-ID | Description | Defer reason |
|---|---|---|
| **DF-V11-01** | Account-to-account transfer (CTA «ПЕРЕВОД» функциональный) | OQ-10: scope reduction для v1.0 |
| **DF-V11-02** | AI-driven recurrent suggestions (чат предлагает создать regular на основе паттернов) | После наблюдения за usage v1.0 |
| **DF-V11-03** | Multiple goals с goal-specific deposits (выдача из копилки под цель) | DATA-MODEL.md §3.4: «Из копилки можно "выдать" под цель (не в MVP)» |
| **DF-V11-04** | Tweak-цвет toggle (coral / cobalt / cream на Home) | Phase 25 hardcode coral |
| **DF-V11-05** | Apple Watch companion + iOS Widgets | iOS-specific extensions |
| **DF-V11-06** | Bank statement import (Open Banking) | RU non-existent в 2026 |
| **DF-V11-07** | Подкатегории (Category.parent_id используется UI-side) | R3 в handoff §13 |

## Out of Scope (v1.0 explicit exclusions)

| Feature | Reason |
|---|---|
| Multi-select на filter chips | Single-select per prototype consistency |
| Soft delete для transactions | Hard delete остаётся (категории через `is_archived` only) |
| Multi-currency / FX | Single RUB always |
| Push-уведомления над budget overspend | Notification fatigue, ТЗ §1.6 «никакой милоты»; local notifications для подписок остаются (v0.6) |
| In-app reduce-motion toggle | OS-level setting `prefers-reduced-motion` / `accessibilityReduceMotion` достаточно |
| Editable initial AI observation hide-button | Defeat differentiator DF-05 |
| Account-per-goal | Goals = virtual progress trackers, savings = pooled |
| Skip на Onb steps 01/02/03 | Только Goal step skippable |
| «Smart» auto-categorization bypass | AICAT-pre-select остаётся как hint, юзер confirm-tap |
| Real-time WebSocket sync web↔iOS | Single-user-single-device; pull-on-foreground enough |
| Confirmation на roundup-toggle off с retroactive delete | Future-only effect (BE-08) |
| Bank-statement import / Open Banking | RU non-existent в 2026 |
| iPad split-view + master-detail | Out of scope, defer indefinitely |
| macOS / Catalyst-сборка | Defer indefinitely |

## Traceability

**Total v1.0 requirements:** 92
**Mapped to phases:** 92 / 92 ✓
**Status:** all Pending (roadmap created 2026-05-09, no plans executed yet)

| REQ-ID | Phase | Status |
|---|---|---|
| BE-01 | Phase 22 | Pending |
| BE-02 | Phase 22 | Pending |
| BE-03 | Phase 22 | Pending |
| BE-04 | Phase 22 | Pending |
| BE-05 | Phase 22 | Pending |
| BE-06 | Phase 22 | Pending |
| BE-07 | Phase 22 | Pending |
| BE-08 | Phase 22 | Pending |
| BE-09 | Phase 22 | Pending |
| BE-10 | Phase 22 | Pending |
| BE-11 | Phase 22 | Pending |
| BE-12 | Phase 22 | Pending |
| BE-13 | Phase 22 | Pending |
| BE-14 | Phase 22 | Pending |
| BE-15 | Phase 22 | Pending |
| BE-16 | Phase 22 | Pending |
| DS-01 | Phase 23 | Pending |
| DS-02 | Phase 23 | Pending |
| DS-03 | Phase 23 | Pending |
| DS-04 | Phase 23 | Pending |
| DS-05 | Phase 23 | Pending |
| DS-06 | Phase 23 | Pending |
| DS-07 | Phase 23 | Pending |
| DS-08 | Phase 23 | Pending |
| ONB-V10-01 | Phase 24 | Pending |
| ONB-V10-02 | Phase 24 | Pending |
| ONB-V10-03 | Phase 24 | Pending |
| ONB-V10-04 | Phase 24 | Pending |
| ONB-V10-05 | Phase 24 | Pending |
| ONB-V10-06 | Phase 24 | Pending |
| ONB-V10-07 | Phase 24 | Pending |
| HOME-V10-01 | Phase 25 | Complete |
| HOME-V10-02 | Phase 25 | Complete |
| HOME-V10-03 | Phase 25 | Complete |
| HOME-V10-04 | Phase 25 | Complete |
| HOME-V10-05 | Phase 25 | Complete |
| HOME-V10-06 | Phase 25 | Complete |
| TXN-V10-01 | Phase 25 | Complete |
| TXN-V10-02 | Phase 25 | Complete |
| TXN-V10-03 | Phase 25 | Complete |
| TXN-V10-04 | Phase 25 | Complete |
| TXN-V10-05 | Phase 25 | Complete |
| TXN-V10-06 | Phase 25 | Complete |
| ADD-V10-01 | Phase 25 | Complete |
| ADD-V10-02 | Phase 25 | Complete |
| ADD-V10-03 | Phase 25 | Complete |
| ADD-V10-04 | Phase 25 | Complete |
| ADD-V10-05 | Phase 25 | Complete |
| CAT-V10-01 | Phase 26 | Complete |
| CAT-V10-02 | Phase 26 | Complete |
| CAT-V10-03 | Phase 26 | Complete |
| CAT-V10-04 | Phase 26 | Complete |
| CAT-V10-05 | Phase 26 | Complete |
| CAT-V10-06 | Phase 26 | Complete |
| PLAN-V10-01 | Phase 26 | Complete |
| PLAN-V10-02 | Phase 26 | Complete |
| PLAN-V10-03 | Phase 26 | Complete |
| PLAN-V10-04 | Phase 26 | Complete |
| PLAN-V10-05 | Phase 26 | Complete |
| PLAN-V10-06 | Phase 26 | Complete |
| SUBS-V10-01 | Phase 26 | Complete |
| SUBS-V10-02 | Phase 26 | Complete |
| SUBS-V10-03 | Phase 26 | Complete |
| SUBS-V10-04 | Phase 26 | Complete |
| AI-V10-01 | Phase 27 | Complete |
| AI-V10-02 | Phase 27 | Complete |
| AI-V10-03 | Phase 27 | Complete |
| AI-V10-04 | Phase 27 | Complete |
| AI-V10-05 | Phase 27 | Complete |
| SAV-V10-01 | Phase 27 | Complete |
| SAV-V10-02 | Phase 27 | Complete |
| SAV-V10-03 | Phase 27 | Complete |
| SAV-V10-04 | Phase 27 | Complete |
| ACCT-V10-01 | Phase 27 | Complete |
| ACCT-V10-02 | Phase 27 | Complete |
| ACCT-V10-03 | Phase 27 | Complete |
| ACCT-V10-04 | Phase 27 | Complete |
| ANAL-V10-01 | Phase 27 | Complete |
| ANAL-V10-02 | Phase 27 | Complete |
| ANAL-V10-03 | Phase 27 | Complete |
| ANAL-V10-04 | Phase 27 | Complete |
| MGMT-V10-01 | Phase 27 | Complete |
| MGMT-V10-02 | Phase 27 | Complete |
| MGMT-V10-03 | Phase 27 | Complete |
| MGMT-V10-04 | Phase 27 | Complete |
| POL-01 | Phase 28 | Pending |
| POL-02 | Phase 28 | Pending |
| POL-03 | Phase 28 | Pending |
| POL-04 | Phase 28 | Pending |
| POL-05 | Phase 28 | Pending |
| POL-06 | Phase 28 | Pending |
| POL-07 | Phase 28 | Pending |
