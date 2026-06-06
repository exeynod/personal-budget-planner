# HANDOFF — реворк планирования + выпиливание + Liquid Glass v2

**Дата:** 2026-06-06 · **Ветка:** `v1.1-planning-rework` (НЕ запушена, НЕ в проде).
**Для:** новая сессия. Прочитать ПЕРВЫМ, затем `AGREED-PLAN.md` (канон), `BACKEND-PLAN.md`,
`RESEARCH.md`, `lg-visual-analysis.md` (+ `lg-refs/`). Memory: `ux-planning-rework`,
`feedback-lean-tests`, `liquid-glass-v2-handoff`, `web-v10-architecture`, `deploy-pipeline`,
`ci-e2e-gotchas`.

---

## 0. TL;DR — где мы

**ОБНОВЛЕНО 2026-06-07: реворк по `AGREED-PLAN.md` фактически ЗАВЕРШЁН на ветке.**
Все фазы 1–6 сделаны и зелёные:

- Фаза 1 Backend ✅, Фаза 3a выпиливание ✅, **Фаза 3b новый UX планирования ✅**
  (План месяца+детализация+проведение, 4-уровневый ладдер Home/CategoryDetail, экран Шаблон,
  «Привести остаток», доходы), **Фаза 4 Liquid Glass v2 ✅** (оптический фон/материал/floating
  таб-бар/дата-виз, scoped к `ui.theme=liquid_glass`), **Фаза 5 iOS ✅** (паритет: выпил
  savings/rollover/paused, проведение/ладдер/шаблон/reconcile, Home→CategoryDetail ладдер;
  `make build` зелёный + runtime-валидация на симуляторе), **Фаза 6 UX-тест ✅** (скриншоты
  всего пути web+iOS, e2e зелёные).
- **Тесты прорежены (lean пасс-2):** backend 602→554 (после +2 баг-фикс тестов), frontend
  vitest 656→386, e2e −3 спеки. Всё зелёное.
- **Доп. баг-фиксы рантайма:** v10-онбординг не создавал первый период (→ пустой Home) — ИСПРАВЛЕНО;
  `/internal/onboarding/seed` 500 NameError — ИСПРАВЛЕНО; постерный онбординг шёл `goal` на
  бэкенд с `extra=forbid` (422) — шаг «ЦЕЛЬ» ВЫПИЛЕН (§G1).
- Linux pixel-эталоны (category-detail/plan-month) обновлены под amd64 → CI зелёный к merge.

ЕДИНСТВЕННЫЙ открытый вопрос (UX-решение владельца): постерный онбординг Step02Accounts
(мульти-счёт) vs §G2 «один неявный баланс». Не сломано (accounts[] бэкенд требует), но не
упрощено. См. §5.

Состояние ветки: backend pytest 554 passed, frontend tsc 0 / vitest 386 / e2e зелёные,
iOS `make build` EXIT 0. **На master НЕ пушено (гейт владельца).** CodeAgentSwarm task #161.

--- ИСТОРИЧЕСКИЙ КОНТЕКСТ НИЖЕ (на момент начала сессии 2026-06-06) ---

Идёт большой реворк по `AGREED-PLAN.md` (согласован с владельцем). **Фаза 1 (Backend)** и
**фаза 3a (выпиливание на фронте)** — ГОТОВЫ и зелёные на ветке. Дальше — **фаза 3b: новый
UX планирования (web native UI)**, потом **фаза 4 Liquid Glass v2**, **фаза 5 iOS**, **фаза 6
полное UX-тестирование**. CodeAgentSwarm task **#157** (in_progress).

⚠️ **master = прод** (`exypersonal.ru`), сейчас на коммите `77e4696` (предыдущий dual-design,
уже задеплоен). Ветка `v1.1-planning-rework` — вся новая работа, **на master не пушить без
явного слова владельца** (push в master → авто-деплой в прод).

---

## 1. Согласованная модель (НЕ переспрашивать — решено)

**Планирование = 2 сущности:**

- **Шаблон бюджета** (Управление → «Шаблон бюджета»): задаётся 1 раз, лимиты + повторяющаяся
  детализация по категориям. Авто-применяется к новому периоду (backend close_period).
- **План месяца** (Home → «План месяца»): инстанс шаблона на период; правится локально;
  в шаблон не возвращается; следующий месяц — снова чистое применение шаблона.

**Лимит vs детализация:** лимит = независимый потолок; детализация = опциональные planned-
строки внутри (может быть < лимита — ок; > → мягкое предупреждение, НЕ блок). Потолок ест
ФАКТ (ручные траты + проведённые строки), не сырой план.

**Проведение:** у каждой planned-строки своя `planned_date`; кнопка «Провести» (одиночно +
bulk, **один факт на строку**) пишет реальный actual на дату строки + мост `posted_txn_id`;
обратимо (unpost). Непроведённое = только план (план-онли: не трогает «в запасе» до
проведения). Счёт = primary авто.

**Прочее:** доходы планируются/проводятся тоже. Подписки слиты в поверхность планирования.
Liquid Glass фон = «оптический» цветной (Payrix ref1).

**Выпилено (фаза G):** Накопления (Копилка целиком), управление счетами (оставлен ОДИН
неявный баланс «Остаток» = старт+доход−расход; account_id под капотом = primary), пауза
категории (`paused`), rollover категории (Прочее/Накопления).

**Новая фича (H):** «Привести остаток» в Настройках — ввожу реальный остаток → балансирующая
корректировка (actual на системной категории `code='adjustment'`) → «Остаток» = введённому.

---

## 2. Что СДЕЛАНО (committed, ветка v1.1-planning-rework)

Коммиты (новые→старые): `e3c38d7` test green after removals · `032f94e` remove pause+rollover
· `d02766f` remove accounts-mgmt · `3050a12` remove savings · `8bf42da` prune pass1 ·
`ed4348c`…`ef3aeda` backend · `716656d` planning docs · (база `77e4696` = master/прод).

### Фаза 1 — Backend ✅ зелёный (pytest 602 passed, 0 failed)

- **Миграции 0028–0031** (head `0031_remove_savings_etc`): revive `plan_template_item`
  (`limit_cents`) + new `plan_template_line` (user_id, category_id, title, amount_cents,
  day_of_period?, kind) + new `period_category_plan` (period_id, category_id, limit_cents);
  `planned_transaction.posted_txn_id` FK→actual ON DELETE SET NULL (+partial unique);
  adjustment backfill (system `code='adjustment'` category); REMOVALS (drop savings_config,
  goal, category.paused, category.rollover). RLS FORCE+policy+grants на новых таблицах.
  Сохранены: `account`, `code='savings'` категория, enum `roundup`/`deposit` (исторические).
- **Сервисы** (`app/services/`): `apply_template_to_period` (в close_period);
  `post_planned`/`unpost_planned`/`post_planned_batch` (mirror post_subscription:
  create_actual_v10 с tx_date + primary account, posted_txn_id, идемпотентность 409,
  per-line date); `compute_balance` (per-period лимит из `period_category_plan` с fallback
  на `Category.plan_cents`; новый агрегат `planned_unposted_cents` EXCL `source=subscription_auto`
  & posted); `reconcile_balance`; удалены savings/roundup/rollover; онбординг чищен + сид
  adjustment-категории. `create_actual_v10` допускает adjustment-категорию (income+expense).
- **Эндпоинты:** NEW template CRUD, `GET/PATCH /periods/{id}/plan`,
  `…/planned/{id}/post|unpost`, `…/planned/post-batch`, `POST /balance/reconcile`.
  REMOVED savings/goals/accounts-mutating routers (оставлен `GET /accounts`); account_id→primary.
- **Контракт** регенерён (openapi.json + web `schema.ts` + iOS GeneratedDTO.swift);
  `make contract-check` идемпотентно OK.

### Фаза 3a — Frontend выпиливание ✅ зелёный (tsc 0, vitest ~654)

- Удалены web: Savings (экраны/API/goals/savings-tab), Accounts management (экраны/create/
  edit/delete/transfer/picker; оставлен `listAccounts` + авто-primary в AddSheet; Home
  «Остаток» display-only), category pause + rollover (Plan/CategoryDetail оба шелла + API
  `CategoryRollover`/`rollover`/`paused`). TabBar: 3 таба (home|ai|mgmt) в постере; в native
  таб-бар свой (home/transactions/ai/management) — Копилки там не было.
- Тесты под новую схему зелёные. e2e специи поправлены/скипнуты (savings/счета):
  `v10-pixel-snapshots`, `v10-phase25-acceptance`, `native-liquid-glass`, `v10-acceptance-tz14`
  (§14.6 savings → skip, переписать когда появится новый UI). `_screenshots.gen.spec.ts`
  (untracked) всё ещё кликает Копилку — не трогали.

### Тесты прорежены (фаза lean-tests, пасс 1)

680→602 backend pytest (коммит 8bf42da). **Пасс-2 (агрессивнее, цель ≤~450) НЕ сделан**
(падал на API 529). Владелец: «720 тестов — жесть», держать сьют лаконичным (см. memory
`feedback-lean-tests`). Касается и frontend (vitest 654 — тоже можно прорежать).

### Фаза 3b — Новый UX планирования: ЧАСТИЧНО ✅ (ветка зелёная: tsc 0, vitest pass)

- **API-обёртки СДЕЛАНЫ** (коммит `a9f9416`): `frontend/src/api/v10/planned.ts`,
  `planTemplate.ts`, `periodPlan.ts`, `balance.ts` (reconcile) — экспортнуты из index.
- **План месяца: детализация + проведение СДЕЛАНЫ** (коммит `9cb9d7e`): NativePlanView с
  раскрытием детализации по категории, planned-строки (manual + подписки), «Провести»/bulk,
  ладдер Лимит/Расписано/Свободно. (Проверить вживую скриншотом — не сверял визуально.)
- **НЕ доделано:** ладдер план↔факт на Home/CategoryDetail (агент начал, я откатил
  半-готовый CategoryDetail-ладдер до green; helper `unpostedByCategory` в computePlanDetail
  надо вернуть чисто); экран **Шаблон бюджета**; **«Привести остаток»** в Настройках; доходы
  в планировании; явное surfacing подписок в поверхности; визуальная сверка скриншотами.

---

## 3. Что ОСТАЛОСЬ (TODO для новой сессии)

### Фаза 3b — Новый UX планирования (web NATIVE shell приоритет; постер можно базовый)

**ВНИМАНИЕ: api-обёртки + План месяца (детализация+проведение) УЖЕ СДЕЛАНЫ** (см §2 фаза 3b
частично; коммиты a9f9416, 9cb9d7e). Ниже — что было запланировано; делать ОСТАВШЕЕСЯ:
ладдер Home/CategoryDetail, экран Шаблон, «Привести остаток», доходы, surfacing подписок,
визуальная сверка. Сначала перепроверить уже сделанное скриншотом.

~~API-обёртки~~ ✅ ГОТОВО (`frontend/src/api/v10/`): planned.ts (list/create/patch/delete/
postPlanned/unpostPlanned/postPlannedBatch), planTemplate.ts, periodPlan.ts, balance.ts
(reconcile). Эталон того, что было нужно:

- `planned.ts`: list (фильтр по категории/периоду), create/patch/delete (title/description,
  amount_cents, planned_date, kind, category_id), `postPlanned(id, tx_date?)`,
  `unpostPlanned(id)`, `postPlannedBatch(ids, tx_date?)`.
- `planTemplate.ts`: template items (limits) CRUD + template lines CRUD.
- `periodPlan.ts`: GET/PATCH `/periods/{id}/plan` (per-period лимиты).
- reconcile: `reconcileBalance(real_balance_cents)` (POST /balance/reconcile) — в `accounts.ts`
  или новый `balance.ts`. Экспорт из `api/v10/index.ts`; инвалидация в `api/cache.ts`.

**Экраны (native, по AGREED-PLAN §C):**

1. **План месяца** (`screensV10/Plan/NativePlanView.tsx` + Mount/compute): лимит (инлайн ₽,
   уже есть) + раскрытие «Детализация» по категории — список planned-строк (manual +
   подписки в ОДНОЙ поверхности; title/amount/planned_date) + «Провести/Отмена» на строке +
   «+ добавить запланированную трату». Ладдер **Лимит / Расписано / Свободно** (Σdetail>лимит
   → мягкое предупреждение). Верхняя кнопка **«Провести запланированное»** (bulk, каждая на
   свою дату, 1 факт на строку). Доходы тоже.
2. **Ладдер план↔факт** на `NativeHomeView` + `NativeCategoryDetailView`: **Лимит /
   Запланировано(unposted) / Факт / В запасе** (источник — compute_balance: per-period лимит +
   planned_unposted уже на бэке).
3. **Шаблон бюджета** (новый экран; вход — строка «Шаблон бюджета» в `NativeMgmtHubView`):
   per-category лимит + повторяющиеся строки (title, amount, day_of_period, kind), expense/income.
4. **«Привести остаток»** в `NativeSettingsView`: строка → ввод реального остатка →
   `reconcileBalance` → показать текущий расчётный + результат.
5. **Доходы:** планирование/детализация/проведение для income-категорий (нужен CRUD категорий
   по kind, если ещё нет на фронте).

Конвенции UI: `.planning/liquid-glass-v2-proof/NATIVE-KIT-BRIEF.md`, примитивы
`screensV10/native/*`, формат денег `screensV10/native/money.ts`, BIGINT копейки.
Без мёртвых кнопок. Тесты — МИНИМАЛЬНО (lean). tsc + vitest зелёные.

### Фаза 4 — Liquid Glass v2 (визуал стекла)

Текущее стекло владелец назвал плоским. Апгрейд по `RESEARCH.md §6` + `lg-visual-analysis.md`:
**оптический цветной фон** (как `lg-refs/ref1-payrix-overview.png`), specular верхние кромки +
inner sheen + слоистые тени + градиентная заливка карточек, **floating glass-таб-бар** со
specular-кантом (ref4 iOS26), круглые glass-кнопки, дата-виз (кольца/сегментные бары/
вертикальный гейдж лимита — ref2/ref3). Скоуп — ТОЛЬКО `ui.theme='liquid_glass'` (`native.css`

- `screensV10/native/*.module.css`); Maximal Poster НЕ трогать (pixel-baselines 8/8). Файлы:
  `stylesV10/native.css`, `screensV10/native/NativePrimitives.module.css`, `NativeShell.module.css`.
  Если владелец пришлёт PNG-ассеты фона — использовать 1:1.

### Фаза 5 — iOS паритет

Native MainShell (`ios/BudgetPlanner/Features/`): убрать savings/счета-mgmt/пауза/rollover
(в Plan/CategoryDetail остались `CategoryRollover`/paused references — backend-агент оставил
их компилируемыми), добавить детализацию/проведение/шаблон/ладдер/корректировку, обновить
под новый контракт (iOS DTO уже регенерён). Liquid Glass материал на iOS — по возможности
(`glassEffect`/UIVisualEffectView). Сборка `cd ios && make build`.

### Фаза 6 — Полное UX-тестирование

Прогон согласованного пайплайна (скриншоты ВСЕГО пути + тесты), сверка с `AGREED-PLAN.md`.
Web: `tests/e2e/native-liquid-glass.spec.ts` (моки+тема liquid_glass, page.screenshot →
`.planning/liquid-glass-v2-proof/web/`). iOS: симулятор (см. ниже).

### Опционально: пасс-2 прореживания тестов (backend ≤~450, frontend vitest).

---

## 4. Команды / инфра

- **Backend тесты:** `./scripts/run-integration-tests.sh -q` (поднимает docker-стек,
  pytest в контейнере, teardown; ~60с). Subset: `… tests/test_x.py -q`.
- **Frontend:** `cd frontend && npx tsc -b` · `npx vitest run` · e2e:
  `CI=1 npx playwright test tests/e2e/native-liquid-glass.spec.ts --reporter=line` (моки,
  бэкенд можно DOWN — CI-эквивалент). MP pixel: `… v10-pixel-snapshots.spec.ts` (8/8 не
  регрессить).
- **Контракт после правок API:** `make contract` (регенерит openapi+web+iOS DTO) +
  `make contract-check` (идемпотентно). Коммитить артефакты.
- **iOS:** `cd ios && make build` (iPhone 17 Pro). Симулятор/скрины: dev-бэкенд
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-build db api`
  (:8000, dev-exchange secret `test-secret-for-curl`), XcodeBuildMCP build_run_sim,
  `ui.theme=liquid_glass`. (Сейчас стек поднимался тестовым раннером и тушился — проверить.)
- **Деплой:** push в master → CI (pytest+frontend-build+e2e) → авто-деплой VPS. Мониторинг:
  `gh run watch <id> --exit-status`. **НЕ пушить master без слова владельца.**
- **Format-хук:** глобальный prettier переписывает кавычки; `frontend/.prettirc` singleQuote —
  не удалять. Хук может переформатировать после Write/Edit.

---

## 5. Грабли / заметки

- **HLD стейл:** `docs/HLD.md §2/§4` описывает дропнутый `plan_template_item` + `/plan-template`/
  `apply-template` как живые — обновить под новую модель (template revived с другой схемой,
  лимит месяца теперь `period_category_plan`, источник плана `PATCH /api/v1/plan-month`).
- **Онбординг multi-account:** wire `OnboardingV10Body` всё ещё требует `accounts[]`; native-
  онбординг уже single-balance; поле «Стартовый баланс» осталось. Постерный Step02Accounts не
  переписан (нет бэкенд-давления) — решить при доведении онбординга.
- **AccountPickerSheet** оставлен (используется в подписках «Сменить счёт»), не в скоупе.
- **subscription_auto**: planned-агрегат ВСЕГДА исключает их (анти-двойной-счёт), подписки
  материализуются close_period отдельно.
- **adjustment-категория** (`code='adjustment'`) — системная, недоступна в обычном UI выбора
  категории (как `savings`); только reconcile пишет на неё.
- **iOS**: `CategoryRollover` Swift enum и paused/rollover call-sites в Plan/CategoryDetail
  оставлены компилируемыми — выпилить в фазе 5.
- **Контекст-стратегия:** работа крупная — вести фазами, тяжёлое делегировать субагентам/
  Workflow, держать AGREED-PLAN.md/HANDOFF.md актуальными, прорежать тесты по ходу.

---

## 6. Следующий конкретный шаг

Ветка `v1.1-planning-rework` зелёная на HEAD `9441d70` (tsc 0, vitest pass, backend pytest 602).
Уже сделано: backend, выпиливание, api-обёртки, План месяца (детализация+проведение).

ДЕЛАТЬ ДАЛЬШЕ (фаза 3b остаток), порядок:

1. **Сверить скриншотом уже сделанный План месяца** (`native-liquid-glass.spec.ts` + богатый мок
   с planned-строками) — убедиться, что детализация/проведение/ладдер реально работают и выглядят.
2. **Ладдер план↔факт** на `NativeHomeView` + `NativeCategoryDetailView` (Лимит/Запланировано/
   Факт/В запасе). Вернуть чисто helper `unpostedByCategory` (был начат и откачен) + прокинуть
   `plannedUnpostedCents` в Mount.
3. **Экран «Шаблон бюджета»** (вход — строка в NativeMgmtHubView) на api `planTemplate.ts`.
4. **«Привести остаток»** в NativeSettingsView на `balance.ts` reconcile.
5. **Доходы** в планировании (income-категории) + **surfacing подписок** в поверхность детализации.
6. tsc+vitest зелёные (тесты МИНИМАЛЬНО, lean), коммиты по чанкам.

Затем фаза 4 (Liquid Glass v2), фаза 5 (iOS), фаза 6 (полное UX-тест). Спек — §3 + `AGREED-PLAN.md`.
**На master НЕ пушить без слова владельца.**
