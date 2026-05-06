# Phase 7 — Nav Refactor

**Milestone:** v0.3 — Analytics & AI
**Status:** Pending plan creation
**Depends on:** Phase 6 (milestone v0.2 complete)

## Goal

Bottom nav v0.3 заменяет MVP-навигацию на функциональную (5 табов: Главная / Транзакции / Аналитика / AI / Управление). Существующие экраны реорганизуются без потери функциональности; placeholder-экраны «Аналитика» и «AI» содержат «Скоро будет», чтобы разблокировать UX-форму до Phase 8/9.

## Requirements

NAV-01, NAV-02, NAV-03, NAV-04 — bottom nav reorganization
TXN-01, TXN-02, TXN-03, TXN-04, TXN-05 — Transactions tab с под-табами
MGT-01, MGT-02, MGT-03, MGT-04 — Management tab как меню-список

## Reference Sketches

- `007-bottom-nav/` — winner: variant A (полные лейблы)
- `012-transactions/` — winner pending (под-табы История/План)
- `013-management/` — winner: variant A (меню с описаниями)

## Files to Touch

**Frontend:**
- `frontend/src/components/BottomNav.tsx` — rewrite TabId enum, TABS array, иконки
- `frontend/src/components/BottomNav.module.css` — добавить `.ai` accent стиль
- `frontend/src/App.tsx` — routing reorganization
- `frontend/src/screens/HomeScreen.tsx` — без изменений
- **NEW:** `frontend/src/screens/TransactionsScreen.tsx` + `.module.css` — объединение HistoryScreen + PlannedScreen с под-табами
- **NEW:** `frontend/src/screens/AnalyticsScreen.tsx` + `.module.css` — placeholder с PageTitle
- **NEW:** `frontend/src/screens/AiScreen.tsx` + `.module.css` — placeholder с PageTitle
- `frontend/src/screens/MoreScreen.tsx` → rename to `ManagementScreen.tsx` (или оставить filename, изменить title и icon)
- `frontend/src/screens/HistoryScreen.tsx` — если переиспользуется внутри TransactionsScreen → переделать в `HistoryView` без full-screen container
- `frontend/src/screens/PlannedScreen.tsx` — аналогично → `PlannedView`
- `frontend/src/components/PageTitle.tsx` (NEW) + module — общий компонент для top-level h1
- `frontend/src/components/SubTabBar.tsx` (NEW) — переиспользуемый sticky underline TabBar

**Tests:**
- `frontend/tests/e2e/home.spec.ts` — обновить под новую nav
- `frontend/tests/e2e/transactions.spec.ts` (NEW) — coverage TXN-*
- `frontend/tests/e2e/management.spec.ts` (NEW) — coverage MGT-*
- `frontend/tests/ui-audit.spec.ts` — обновить screenshots

## Plans

To be created via `/gsd-plan-phase 7`. Expected ~5-6 plans:
1. Wave 0: RED tests for NAV/TXN/MGT
2. Frontend components: PageTitle, SubTabBar, new icons in BottomNav
3. TransactionsScreen + sub-tab views
4. ManagementScreen + entry-points + переименование More
5. AI/Analytics placeholder screens
6. Integration + e2e tests + ui-audit screenshots refresh
