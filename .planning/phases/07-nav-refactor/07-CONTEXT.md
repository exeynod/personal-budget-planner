# Phase 7: Nav Refactor — Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Bottom nav v0.3 заменяет MVP-навигацию (home / history / planned / subscriptions / more) на функциональную 5-табовую (Главная / Транзакции / Аналитика / AI / Управление). Существующие экраны реорганизуются без потери функциональности. Placeholder-экраны «Аналитика» и «AI» содержат «Скоро будет» для разблокировки UX-формы до Phase 8/9. Никаких новых backend-endpoints в этой фазе.

</domain>

<decisions>
## Implementation Decisions

### TransactionsScreen Architecture
- ActualScreen рефакторится в `screens/HistoryView.tsx` (убирается full-screen container, принимает `inTransactions` prop) — не остаётся как есть
- PlannedScreen рефакторится аналогично в `screens/PlannedView.tsx`
- `components/SubTabBar.tsx` — отдельный переиспользуемый компонент (пригодится в Phase 8 Analytics)
- FAB context-aware: под-таб «История» → add actual (ActualEditor), под-таб «План» → add planned (PlanItemEditor)
- Filter chips (TXN-04): горизонтальный скролл Все / Расходы / Доходы + все категории как чипы (не bottom-sheet)

### App.tsx Routing
- `subScreen` state переименовывается в `managementView` — явно отражает назначение
- `historyFilter` остаётся в App.tsx (необходим для HomeScreen → история по категории cross-tab навигации)
- ManagementScreen — новый файл `screens/ManagementScreen.tsx` + `screens/ManagementScreen.module.css`; старый `MoreScreen.tsx` удаляется
- Analytics/AI placeholders — отдельные файлы `screens/AnalyticsScreen.tsx` + `screens/AiScreen.tsx`

### История и детали
- Day-header total (TXN-02): показывает сумму расходов дня (отрицательная сумма)
- Subscriptions добавляется первым пунктом в ManagementScreen (Подписки / Шаблон / Категории / Настройки)
- `components/PageTitle.tsx` — новый общий компонент h1 + optional subtitle, переиспользуется в Phase 8/9

### Claude's Discretion
- Точная CSS-анимация перехода между под-табами в TransactionsScreen
- Phosphor icon weight для неактивных nav-табов (thin vs light vs regular)
- ManagementScreen contextual desc — динамические (через API count) или статичные строки в MVP

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ActualScreen` уже имеет `groupByDate()` — логику группировки по дням переносим в HistoryView
- `MoreScreen` содержит 3 пункта (template/categories/settings) — основа для ManagementScreen, добавить Subscriptions первым
- `Fab.tsx` — готовый компонент, нужно добавить вариант для planned action
- `BottomSheet.tsx` + `ActualEditor` — переиспользуются без изменений
- `PlannedScreen` + `PlanGroupView` + `PlanRow` — переиспользуются как PlannedView

### Established Patterns
- Phosphor icons уже используются (`@phosphor-icons/react`): `House`, `Receipt`, `CalendarBlank`, `Bell`, `DotsNine` — заменяем на `House`, `ArrowsLeftRight`, `ChartBar`, `Sparkle`, `SquaresFour` (NAV-03)
- CSS Modules для каждого компонента — следовать тому же паттерну
- `active ? 'fill' : 'thin'` — текущий паттерн для icon weight в BottomNav
- `TabId` type export из BottomNav — заменить на новые 5 табов

### Integration Points
- `App.tsx` — главная точка изменений: новый TabId enum, новые state vars, новые экраны
- `HomeScreen` — без изменений, но `onNavigateToSub` callback меняет тип (больше не 'planned' как sub)
- `ActualScreen` → `HistoryView`: убрать ScreenHeader, принять `inTransactions?: boolean` prop
- `PlannedScreen` → `PlannedView`: аналогично

</code_context>

<specifics>
## Specific Ideas

- AI таб: `#a78bfa` фиолетовый акцент только для AI, остальные active = primary blue (`var(--color-primary)`) — прописать отдельный CSS класс `.ai.active`
- Placeholder screens: PageTitle + card с иконкой + текст «Скоро будет» — минималистично, без лишних деталей
- ManagementScreen: иконки из Phosphor для каждого пункта (Bell → Subscriptions, FileText → Template, Tag → Categories, Gear → Settings) — уже используются в MoreScreen

</specifics>

<deferred>
## Deferred Ideas

- Динамические счётчики в ManagementScreen desc (MGT-03 «3 активные подписки» и т.п.) — Phase 7 может использовать статичные строки, динамику добавить опционально если время позволит
- История: пагинация / infinite scroll — не в Phase 7 (все транзакции текущего периода, как сейчас)
- Swipe-to-delete в HistoryView — уже есть в ActualScreen, сохранить при рефакторе

</deferred>
