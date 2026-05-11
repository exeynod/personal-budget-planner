# Phase 58: Home & Period (v06 native) — Context

**Gathered:** 2026-05-11
**Status:** Shipped (minimal correction)
**Mode:** Autonomous extension of milestone v1.1.2.

## Phase Boundary

Минимальная коррекция v06 HomeView empty state. До этой фазы `.noActivePeriod` ContentUnavailableView показывал «Завершите onboarding, чтобы создать первый период.» — неточный текст: `AppRouter` гарантирует `is_onboarded=true` в этой ветке (иначе бы перехватил `.onboardingRequired(user)` → `OnboardingView`).

**В скоупе:**
- Переписать текст и actions ContentUnavailableView для `.noActivePeriod`.
- Иконка `calendar.badge.clock` (нейтральная), без exclamationmark — это не ошибка пользователя.
- Primary action «Добавить трату» — открывает TransactionEditor; backend `POST /actual` D-52 auto-create создаст период автоматически при первой трате.
- Secondary action «Обновить» — re-fetch.

**ВНЕ скоупа (Phase 59-66):**
- Миграция HomeView с legacy DTO (CategoryKind 2-valued) на v1.0 (CategoryKind 4-valued: expense/income/savings/other). Отложено в Phase 59 (Transactions) и сопутствующие.
- Plan editor доступ из Home (Phase 61).
- Account switcher в hero card (Phase 60).
- Multi-period switcher (DSH-06).
- Savings widget на Home (Phase 62).

## Verified

- v06 Home показывает новый ContentUnavailableView при отсутствии активного периода (тестовый стенд: user onboarded, period nil).
- Скриншот: иконка `calendar.badge.clock`, текст «Период ещё не открыт. Новый месячный период создаётся автоматически после закрытия предыдущего или при первой трате. Добавьте операцию через «+» вверху или обновите экран.», 2 кнопки.
- Build: `build_run_sim` — 0 errors, 0 new warnings.

## Known Issues

1. **Backend lazy auto-create на `POST /actual`** — D-52 предполагает что период создастся при первой трате. На dev-стенде это работает, на prod не проверено. Если auto-create не сработает — кнопка «Добавить трату» вернёт 404 в editor, что неоптимально. Отслеживать первый user-report.
2. **CategoryKind 2-valued vs 4-valued** — v06 DTO `CategoryKind` имеет только `.expense / .income`. Backend v1.0 может вернуть `savings`/`other` — decoder упадёт. Не воспроизводится на текущем дев-стенде (только expense/income в категориях). Миграция в Phase 59.
