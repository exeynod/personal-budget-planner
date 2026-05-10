# Phase 26 — Must-Haves (goal-backward)

**Phase goal (ROADMAP):** User получает три экрана для управления бюджетом — Category Detail (новый, cobalt/red фон по `isOver`, BigFig + bar-break, rollover-toggle + CTA «+ ПОДНЯТЬ ЛИМИТ» / «ПАУЗА»), PLAN мая (расширенный, sliders 500₽ по 8 категориям + блок «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» + 2 rollover-плашки), Subscriptions (coral, bottom-sheet menu с editor-под-sheet'ами для day/price + destructive delete).

## Observable Truths (must be TRUE for goal achieved)

### Backend (BE prereq for CAT + PLAN)

- T-BE-01: `PATCH /api/v1/categories/{id}` принимает body со всеми v1.0 полями (`plan_cents`, `rollover ∈ {misc, savings}`, `paused`, `name`, `sort_order`, `is_archived`); каждое — optional, не-`None` поля применяются service-level. 200 → `CategoryRead` с обновлёнными значениями. Cross-tenant ID → 404.
- T-BE-02: `PATCH /api/v1/plan-month` принимает body `{plans: [{category_id: int, plan_cents: int >= 0}, ...]}`; в одной DB-транзакции применяет каждый `plan_cents` к соответствующей `Category` user'а; при `Σplan_cents > User.income_cents` (если income задан) → 400 с detail `{error: "plan_overflow", income_cents, sum_plan_cents}`. 200 → `{categories: CategoryRead[]}`.
- T-BE-03: cross-tenant `category_id` в plan-month body → 404; неизвестный `category_id` → 404; отрицательный `plan_cents` → 422.

### Category Detail (CAT-V10-01..06)

- T-C-01: User тапает на категорию из Home → push CategoryDetail screen на cobalt-фоне (норма) либо red (`fact > plan`), Mass UPPERCASE имя (Archivo Black).
- T-C-02: User видит italic подзаголовок «— превышено на N%» когда `fact > plan` (`N = round((fact-plan)/plan*100)`), либо «— на N% плана» когда `fact ≤ plan` (`N = round(fact/plan*100)`); BigFig факт в копейках/100 + count-up cubicOut 900ms.
- T-C-03: User видит progress bar 6px высотой; bar заполнен `min(1, fact/plan)` от ширины; разрыв (visual tick) на отметке `plan/fact` для `isOver` rows; подпись «из X ₽» (план).
- T-C-04: User toggle-tap на plate «ОСТАТОК → НАКОПЛЕНИЯ» / «ОСТАТОК → ПРОЧЕЕ» меняет `category.rollover` через `PATCH /api/v1/categories/:id` body `{rollover: 'savings'|'misc'}`; UI оптимистично обновляется + refetch на success.
- T-C-05: User tap на «+ ПОДНЯТЬ ЛИМИТ» → `router.push(<PlanView focus={categoryId} />)` (PLAN-V10 со скроллом к этой категории); tap на «ПАУЗА» → toggle `category.paused` через `PATCH /api/v1/categories/:id` body `{paused: !current}`.
- T-C-06: User видит список операций по этой категории (filtered `actuals where category_id === id`) в day-grouped формате (re-use `formatDay` + `formatTxAmount` из Phase 25 Transactions).

### PLAN мая (PLAN-V10-01..06)

- T-P-01: User тапает «PLAN МЕСЯЦА» badge на Home (или приходит из CAT через «+ ПОДНЯТЬ ЛИМИТ») → push PlanView на cobalt-фоне; eyebrow «MGMT / LIMITS» + Mass Archivo Black «PLAN МЕСЯЦА.».
- T-P-02: User видит plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» с числом `income_cents − Σplan_cents`; статус OK (yellow) когда `≥ 0`, OVER (red) когда `< 0`; OVER блокирует CTA «СОХРАНИТЬ» (server-side validation тоже отклонит).
- T-P-03: User видит 2 плашки «→ ПРОЧЕЕ X ₽» / «→ НАКОПЛЕНИЯ Y ₽», где `X = Σ (plan_cents - fact_cents) where rollover='misc' AND remainder > 0`, аналогично для `savings`.
- T-P-04: User видит block «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» со списком из `GET /api/v1/subscriptions` где `cycle === 'monthly' AND day_of_month != null`; каждая строка: name UPPER · «N числа · {category.name}» · `amount_cents/100` ₽ · кнопка «ПРОВЕСТИ →» (когда `posted_txn_id == null`) либо «ОТМЕНА» (когда `posted_txn_id != null`); tap «ПРОВЕСТИ» → `POST /subscriptions/:id/post` → toast «✓ ПРОВЕДЕНО · −X ₽ → реестр»; tap «ОТМЕНА» → `POST /subscriptions/:id/unpost` → toast «отменено».
- T-P-05: User видит block «КАТЕГОРИИ · 8» с `PosterSlider` per category (max = `income_cents`, step = 50000 (=500₽), debounce 300ms, tap по числу → keyboard input); каждая slider-row показывает name + bar факта `min(1, fact/plan)` поверх трека плана; chip-pair «ПРОЧЕЕ / НАКОПЛЕНИЯ» меняет `rollover` для конкретной категории (PATCH /categories/:id).
- T-P-06: User submit «СОХРАНИТЬ» → `PATCH /api/v1/plan-month` с body `{plans: [{category_id, plan_cents}, ...]}` (только изменённые); 200 → toast «✓ ПЛАН СОХРАНЁН» + close push (router.pop); 400 (overflow) → inline error «Σplan превышает доход».

### Subscriptions (SUBS-V10-01..04)

- T-S-01: User открывает Subscriptions screen (push из Mgmt-хаба или Home placeholder Plan 27) → coral фон, Mass italic «Подписки.» + BigFig `Σ amount_cents WHERE cycle='monthly' AND is_active = true / 100` + suffix «₽/мес»; eyebrow «N АКТИВНЫХ · Y ₽ В ГОД» (Y = monthly_total*12 + yearly_total).
- T-S-02: User видит список из `GET /api/v1/subscriptions`: name UPPER · «каждое N число» (для monthly) / «N {month_genitive}» (для yearly) · `amount_cents/100` ₽ · `···` button; tap `···` → bottom-sheet menu (PosterSheet).
- T-S-03: User в bottom-sheet menu видит 3 ghost-кнопки:
  - «ПАУЗА» (toggle `is_active`) → `PATCH /subscriptions/:id` body `{is_active: !current}` → close menu + refetch
  - «СМЕНИТЬ ДЕНЬ» → secondary PosterSheet с `<input type="number" min=1 max=28>` (web) или Stepper (iOS) → `PATCH /subscriptions/:id` body `{day_of_month: N}` (через v1.0 SubscriptionV10Update)
  - «ИЗМЕНИТЬ ЦЕНУ» → secondary PosterSheet с numeric input → `PATCH /subscriptions/:id` body `{amount_cents: parseInt(value*100)}`
- T-S-04: User видит destructive CTA «ОТМЕНИТЬ ПОДПИСКУ» (red фон, paper текст) внизу bottom-sheet menu; tap → confirm dialog «Отменить подписку «{name}»?» → confirm → `DELETE /api/v1/subscriptions/:id` → 204 → close menu + refetch.

## Required Artifacts

### Backend (Wave 1)

- path: `app/api/schemas/categories.py` — modified: `CategoryUpdate` принимает `plan_cents: Optional[int] = Field(default=None, ge=0)`, `rollover: Optional[RolloverPolicyStr] = None`, `paused: Optional[bool] = None`, `parent_id: Optional[int] = None`. provides: расширенный wire-contract для PATCH /categories/:id.
- path: `app/services/categories.py` — modified: `update_category` корректно применяет non-None plan_cents/rollover/paused через `setattr` (existing pattern уже работает с `model_dump(exclude_unset=True)`); добавить unit-тест (через service interface).
- path: `app/api/schemas/plan_month.py` — created: `PlanMonthItem(BaseModel)` (`category_id: int`, `plan_cents: int = Field(ge=0)`), `PlanMonthPatch(BaseModel)` (`plans: list[PlanMonthItem]` non-empty), `PlanMonthResponse(BaseModel)` (`categories: list[CategoryRead]`).
- path: `app/api/routes/plan_month.py` — created: `PATCH /api/v1/plan-month` route — DepEnds(get_current_user) + tenant scope; service-call atomic update + Σplan validation; HTTP 400 на overflow; 404 на cross-tenant/missing IDs; 200 → PlanMonthResponse.
- path: `app/services/plan_month.py` — created: `update_plan_month_atomic(db, user_id, plans) -> list[Category]` — single-pass loop с `update_category` calls в одной транзакции; pre-validates user.income_cents constraint.
- path: `app/api/router.py` — modified: include `plan_month_router`.
- path: `app/tests/test_plan_month_route.py` — created: integration tests (happy path, overflow → 400, cross-tenant 404, missing category 404, negative cents 422).

### Web (Wave 2)

#### Category Detail
- path: `frontend/src/api/v10/categories.ts` — modified: добавить `updateCategoryV10(id, payload: {plan_cents?, rollover?, paused?, name?, sort_order?, is_archived?}) → Promise<CategoryV10>`.
- path: `frontend/src/screensV10/CategoryDetail/computeCategoryDetail.ts` — created: pure helpers `computeOverPercent(fact, plan): number`, `computeUnderPercent(fact, plan): number`, `computeBarSegments(fact, plan): {fillRatio: number, tickAt?: number}`, `filterActualsForCategory(actuals, categoryId): ActualV10Read[]`.
- path: `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx` — created: presentational view с props `{category, fact_cents, actuals, onPushPlan, onTogglePause, onToggleRollover, onBack}`.
- path: `frontend/src/screensV10/CategoryDetail/CategoryDetailView.module.css` — created.
- path: `frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx` — created: data fetcher (parallel `listCategoriesV10` + period resolver + `listActualV10`) + router-push glue + PATCH calls.
- path: `frontend/src/screensV10/CategoryDetail/index.ts` — barrel.
- path: `frontend/src/screensV10/Home/HomeMount.tsx` — modified: row tap `onCategoryTap(id)` теперь push `<CategoryDetailMount categoryId={id} />` (replace placeholder).

#### PLAN мая
- path: `frontend/src/api/v10/planMonth.ts` — created: `patchPlanMonth(plans: {category_id, plan_cents}[]) → Promise<{categories: CategoryV10[]}>`.
- path: `frontend/src/api/v10/subscriptions.ts` — created: `listSubscriptionsV10()`, `postSubscription(id)`, `unpostSubscription(id)`, `patchSubscriptionV10(id, payload)`, `deleteSubscription(id)` typed wrappers.
- path: `frontend/src/screensV10/Plan/computePlan.ts` — created: pure helpers `computeSurplus(income, plans): number`, `computeRolloverAggregates(cats, facts): {misc: number, savings: number}`, `computeRegularsList(subs, categories): RegularRow[]`, `applyPlanEdit(plans, catId, planCents): plans` (immutable update).
- path: `frontend/src/screensV10/Plan/PlanView.tsx` — created: presentational view с props `{income_cents, categoryRows, regulars, onSliderChange, onSliderCommit, onRolloverChip, onPostRegular, onUnpostRegular, onSubmit, onBack, focusCategoryId?}`.
- path: `frontend/src/screensV10/Plan/PlanView.module.css` — created.
- path: `frontend/src/screensV10/Plan/PlanMount.tsx` — created: data fetcher (parallel `listCategoriesV10` + `listSubscriptionsV10` + period + `listActualV10`) + state management (local edits before PATCH) + toast wiring + router push to TransactionsMount on regular post.
- path: `frontend/src/screensV10/Plan/index.ts` — barrel.
- path: `frontend/src/screensV10/Home/HomeMount.tsx` — modified: PLAN-bar tap pushes `<PlanMount />` (replace placeholder).

#### Subscriptions
- path: `frontend/src/screensV10/Subscriptions/computeSubscriptions.ts` — created: pure helpers `computeMonthlyTotal(subs)`, `computeYearlyTotal(subs)`, `computeActiveCount(subs)`, `formatNextChargeRu(date)` (для yearly «N мая»).
- path: `frontend/src/screensV10/Subscriptions/SubscriptionsView.tsx` — created: presentational с props `{subs, onMenuOpen}`.
- path: `frontend/src/screensV10/Subscriptions/SubscriptionMenuSheet.tsx` — created: bottom-sheet с 3 ghost-кнопками + destructive delete; secondary sheets для day/price editor.
- path: `frontend/src/screensV10/Subscriptions/SubscriptionsView.module.css` — created.
- path: `frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx` — created.
- path: `frontend/src/screensV10/Subscriptions/index.ts` — barrel.

### iOS (Wave 2)

#### Category Detail
- path: `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift` — modified: добавить `static func update(id: Int, payload: CategoryV10UpdateRequest) async throws -> CategoryV10DTO` + `CategoryV10UpdateRequest` (Encodable: `planCents/rollover/paused/name/sortOrder/isArchived` все optional).
- path: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailData.swift` — created: pure compute (computeOverPercent, computeUnderPercent, computeBarSegments, filterActualsForCategory).
- path: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailViewModel.swift` — created: `@MainActor @Observable` model.
- path: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift` — created: SwiftUI screen.
- path: `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` — modified: `CategoryDetailPlaceholderView(categoryId:)` body returns `CategoryDetailView(categoryId:)`.
- path: `ios/BudgetPlannerTests/FeaturesV10/CategoryDetailDataTests.swift` — created.

#### PLAN мая
- path: `ios/BudgetPlanner/Networking/Endpoints/PlanMonthAPI.swift` — created: `enum PlanMonthAPI { static func patch(plans: [PlanMonthItem]) async throws -> [CategoryV10DTO] }` + `PlanMonthItem` Encodable.
- path: `ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift` — created: `static func list()/post(id:)/unpost(id:)/patch(id:body:)/delete(id:)` (V10 surface, day_of_month-aware).
- path: `ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift` — created: расширенный `SubscriptionV10DTO` с `dayOfMonth: Int?`, `accountId: Int?`, `postedTxnId: Int?` + `SubscriptionV10UpdateRequest` Encodable.
- path: `ios/BudgetPlanner/FeaturesV10/Plan/PlanData.swift` — created: pure compute (computeSurplus, computeRolloverAggregates, computeRegularsList, applyPlanEdit).
- path: `ios/BudgetPlanner/FeaturesV10/Plan/PlanViewModel.swift` — created.
- path: `ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift` — created.
- path: `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` — modified: `PlanViewPlaceholderView` body returns `PlanView()`.
- path: `ios/BudgetPlannerTests/FeaturesV10/PlanDataTests.swift` — created.

#### Subscriptions
- path: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsData.swift` — created: pure compute helpers.
- path: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsViewModel.swift` — created.
- path: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsView.swift` — created.
- path: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionMenuSheet.swift` — created.
- path: `ios/BudgetPlannerTests/FeaturesV10/SubscriptionsDataTests.swift` — created.

## Key Links (where breakage cascades)

- L-01: `app/services/categories.py.update_category` → корректно применяет plan_cents/rollover/paused (если broken: PATCH 200, но БД не обновлена)
- L-02: `app/services/plan_month.py` → atomic transaction Σplan validation (если broken: race-condition или partial update)
- L-03: `frontend/src/screensV10/CategoryDetail/CategoryDetailMount.tsx` → `updateCategoryV10` PATCH calls (если broken: rollover/paused toggle не работает)
- L-04: `frontend/src/screensV10/Plan/PlanMount.tsx` → `patchPlanMonth(plans)` после edits (если broken: planning не сохраняется)
- L-05: `frontend/src/screensV10/Subscriptions/SubscriptionMenuSheet.tsx` → patch/delete API calls (если broken: editing не работает)
- L-06: HomeMount.tsx — `onCategoryTap(id)` push `<CategoryDetailMount categoryId={id} />` (если broken: tap → placeholder, T-C-01 fail)
- L-07: HomeMount.tsx — PLAN-bar tap push `<PlanMount />` (если broken: tap → placeholder, T-P-01 fail)
- L-08: iOS HomePlaceholders.swift — placeholder swap to real views (если broken: same as L-06/L-07 на iOS)

## Reachability Check

| Must-have | Reachable? | Path |
|-----------|------------|------|
| Backend PATCH categories ext | ✓ | Wave 1 plan 26-01 |
| Backend PATCH plan-month | ✓ | Wave 1 plan 26-01 |
| CategoryDetail (web) | ✓ | HomeMount.tsx swap CategoryDetailPlaceholder → CategoryDetailMount |
| CategoryDetail (iOS) | ✓ | HomePlaceholders.swift swap CategoryDetailPlaceholderView body |
| PlanView (web) | ✓ | HomeMount.tsx swap PlanViewPlaceholder → PlanMount |
| PlanView (iOS) | ✓ | HomePlaceholders.swift swap PlanViewPlaceholderView body |
| Subscriptions (web) | ✓ | reachable from Plan «РЕГУЛЯРНЫЕ» (Phase 27 Mgmt entry-point will add direct nav; Phase 26 reachable from Plan post action via push) — see deferred note |
| Subscriptions (iOS) | ✓ | same as web |
| Roundup-rollover toggle | ✓ | CategoryDetail rollover plate → updateCategoryV10 |
| post/unpost regulars | ✓ | PlanView regulars block → postSubscription/unpostSubscription |

**Note on Subscriptions reachability:** Subscriptions screen полноценный, но прямая bottom-nav entry для него ждёт Phase 27 Mgmt-хаб. На Phase 26 пользователь reach Subscriptions через PlanView «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» row tap (можно перейти к экрану Subscriptions для full menu/delete). Если этот UX не удобен — Phase 27 добавит «04 РЕГУЛЯРНЫЕ» numbered list-row в Mgmt-хабе. Это deferred за scope phase 26.
