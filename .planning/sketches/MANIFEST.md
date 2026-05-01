# Sketch Manifest

## Design Direction
Banking-premium TG Mini App для личного бюджета. Тёмная тема как primary,
светлая как opt-in. Hero-карточка с градиентом фокусируется на текущем
балансе, остальное — плотные list-карточки с tabular-числами.
Положительная дельта — зелёный, отрицательная — красный (правило BRD).
Min-viewport 375px (iPhone SE/13 mini).

## Reference Points
- Tinkoff (премиум-карта, hero с балансом)
- Revolut (вкладки доходы/расходы, плотные список-карточки)
- Apple Wallet (рoundness, тонкие тени, таблицифры)

## Sketches

| #   | Name              | Design Question                                    | Winner | Tags                     |
|-----|-------------------|----------------------------------------------------|--------|--------------------------|
| 001 | dashboard-summary | Структура главного экрана 375px (план/факт/Δ)      | **B: Tabs Расходы/Доходы** | layout, dashboard, mobile |
| 002 | add-transaction   | Паттерн ввода новой траты (UC-2)                   | **B: Bottom sheet**        | form, transaction, mobile |
| 003 | dashboard-states  | Edge-кейсы дашборда (empty/progress/overspend/closed) | **all 4 valid**         | states, edge-cases        |
| 004 | subscriptions     | Список подписок и ближайшие списания (UC-7, UC-8)  | **A: List + timeline**     | list, subscriptions       |
| 005 | plan-and-categories | Паттерн редактора плана/шаблона/категорий (UC-4,5,6) | **B: Grouped + inline edit** | list, crud, plan          |
| 006 | onboarding        | Первый запуск Mini App (UC-10)                     | **B: Scrollable single page** | onboarding, flow       |
