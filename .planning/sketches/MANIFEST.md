# Sketch Manifest

> **Перед созданием нового скетча — обязательно прочитать [STYLE-GUIDE.md](./STYLE-GUIDE.md).**
> Источник истины — реальные стили из `frontend/src/styles/tokens.css` и компоненты в
> `frontend/src/components/`. Все скетчи должны использовать `themes/default.css` без
> локальных переопределений цветов / радиусов / шрифтов.

## Design Direction
Banking-premium TG Mini App для личного бюджета. Тёмная тема как primary,
светлая как opt-in. Hero-карточка с градиентом фокусируется на текущем
балансе, остальное — плотные list-карточки с tabular-числами.
Положительная дельта — зелёный, отрицательная — красный (правило BRD).
Min-viewport 375px (iPhone SE/13 mini). Иконки — Phosphor (line-icons), не emoji.

## Reference Points
- Tinkoff (премиум-карта, hero с балансом, функциональная nav 5 табов)
- Revolut (вкладки доходы/расходы, плотные список-карточки)
- Apple Wallet (роundness, тонкие тени, табличные числа)

## Bottom Nav v0.3
Принят функциональный вариант 2: **Главная / Транзакции / Аналитика / AI / Управление**.
- Группировка по частоте использования, не «свалка в Ещё»
- AI как первоклассный таб (фиолетовый акцент `#a78bfa`)
- «Транзакции» = объединение бывших History + Plan под-табами
- «Управление» = бывший «Ещё» с тем же содержимым, но с осмысленным названием
Решение фиксировано: `.planning/PROJECT.md` Key Decisions, milestone v0.3, Phase 7.

## Sketches

| #   | Name              | Design Question                                    | Winner | Tags                     |
|-----|-------------------|----------------------------------------------------|--------|--------------------------|
| 001 | dashboard-summary | Структура главного экрана 375px (план/факт/Δ)      | **B: Tabs Расходы/Доходы** | layout, dashboard, mobile |
| 002 | add-transaction   | Паттерн ввода новой траты (UC-2)                   | **B: Bottom sheet**        | form, transaction, mobile |
| 003 | dashboard-states  | Edge-кейсы дашборда (empty/progress/overspend/closed) | **all 4 valid**         | states, edge-cases        |
| 004 | subscriptions     | Список подписок и ближайшие списания (UC-7, UC-8)  | **A: List + timeline**     | list, subscriptions       |
| 005 | plan-and-categories | Паттерн редактора плана/шаблона/категорий (UC-4,5,6) | **B: Grouped + inline edit** | list, crud, plan          |
| 006 | onboarding        | Первый запуск Mini App (UC-10)                     | **B: Scrollable single page** | onboarding, flow       |
| 007 | bottom-nav        | Подача функциональной nav v0.3 (Главная/Транзакции/Аналитика/AI/Управление) | **A: Полные лейблы** ★ | navigation, v0.3 |
| 008 | analytics-dashboard | Экран Аналитики как top-level таб v0.3           | **A: Тренд + топ перерасходов** ★ | analytics, v0.3  |
| 009 | ai-chat           | Экран AI как top-level таб: чат / sheet / лента    | **A: Полноэкранный чат** ★    | ai, chat, streaming, v0.3 |
| 010 | admin-whitelist   | Управление whitelist-пользователями                | **all valid** ★               | admin, users           |
| 011 | ai-categorization | AI-предложение категории в форме «Новая транзакция» | **A: AI заменяет select** ★   | ai, categorization     |
| 012 | transactions      | Таб «Транзакции» с под-табами История/План         | **all valid** ★ (A=История, B=План, C=empty — три состояния) | navigation, transactions, v0.3 |
| 013 | management        | Таб «Управление» как меню-список                   | **A: Меню с описаниями** ★    | navigation, settings, v0.3 |

★ = winner подтверждён пользователем 2026-05-05.
