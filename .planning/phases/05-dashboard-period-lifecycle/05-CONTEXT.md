# Phase 5: Dashboard & Period Lifecycle - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Полная замена placeholder HomeScreen на реальный дашборд Mini App: tabs Расходы/Доходы, hero-карточка баланса, aggr-блок План/Факт/Δ, плотный список категорий с прогресс-барами и всеми 4 edge-states (empty, in-progress, warn, overspend/closed). Переключатель периодов для навигации по архиву. Worker-job PER-04: автозакрытие истёкшего периода в 00:01 МСК и создание следующего.

Требования: DSH-01, DSH-02, DSH-03, DSH-04, DSH-05, DSH-06, PER-04.

</domain>

<decisions>
## Implementation Decisions

### Hero Card & Aggr Block
- Hero-карточка показывает `balance_now_cents` (текущий баланс) + даты периода (`period_start` – `period_end`) + `delta_total_cents` со знаком и цветом
- На закрытом периоде hero показывает `ending_balance_cents` вместо `balance_now_cents`
- Aggr-блок: фиксированная полоска под tabs, над списком категорий; 3 числа для активного таба: Plan total / Fact total / Δ со знаком и цветом
- Знак дельты: расходы `План−Факт`, доходы `Факт−План`; зелёный для положительной, красный для отрицательной

### Category List & Tabs
- Tabs «Расходы/Доходы» фильтруют список категорий по `kind` (expense или income)
- Сортировка категорий по `sort_order` (database order) — консистентно с другими экранами
- Прогресс-бар: `actual_cents / planned_cents * 100`; если `planned_cents == 0` — прогресс-бар не отображается
- Категории с нулевым actual отображаются со строкой (planned_cents, нулевой actual, пустой прогресс-бар)

### Edge States & Period Switcher
- Empty state (нет плановых строк): 2 CTA кнопки — «Применить шаблон» (вызывает apply-template API) + «Добавить вручную» (переход на PlannedScreen)
- Переключатель периодов: над tabs, строчка «‹ Май 2026 ›»; badge «Закрыт» если status=closed; ← disabled если нет предыдущего периода; → disabled на текущем активном
- FAB (кнопка +) скрыт на закрытых и архивных периодах; показывается только на активном периоде
- Warn-состояние (≥80% план исчерпан): жёлтая обводка + жёлтый прогресс-бар на категории; Overspend (>100%): красная обводка + красный прогресс-бар + бейдж «123%»
- Closed-период: read-only; MainButton дизейблен; FAB скрыт; мутации заблокированы

### Backend — Period API & Worker Job
- Новый endpoint: `GET /api/v1/periods` — список всех периодов (id, period_start, period_end, status) для switcher
- Новый endpoint: `GET /api/v1/periods/{id}/balance` — как `/actual/balance` но для конкретного period_id (позволяет смотреть архивные периоды)
- `ending_balance` при закрытии: `starting_balance + Σ actual_income - Σ actual_expense` по всем транзакциям периода
- close_period джоба: единая DB-транзакция — close old period (фиксирует ending_balance) + create new period; rollback при ошибке; повторный запуск — no-op (idempotency check по дате)
- pg_try_advisory_lock для координации (установленный паттерн в кодовой базе)

### Claude's Discretion
- Конкретная CSS-реализация прогресс-баров и цветовые токены — из существующей design-системы (themes/default.css)
- Структура новых API-схем (PeriodListResponse и т.п.)
- Структура новых React-хуков (usePeriods, useDashboard)
- Детали анимаций и переходов

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BottomSheet`, `Fab`, `MainButton` — уже используются в HomeScreen; переиспользовать
- `BalanceResponse` тип уже определён в `api/types.ts` с `by_category: BalanceCategoryRow[]`, `balance_now_cents`, `delta_total_cents`, и т.д.
- `useCurrentPeriod` хук — уже существует; нужен новый `usePeriods` и обновлённый `useDashboard`
- `SectionCard` компонент — уже существует; использовать для aggr-блока и секций
- `CategoryRow` компонент — уже существует; расширить для прогресс-бара
- Design-система: `.planning/sketches/themes/default.css` — цветовые токены, градиенты, hero-стили

### Established Patterns
- Хуки делают `fetch` через `api/client.ts`; хранят `data | null` + `loading` + `error`
- CSS Modules для стилей компонентов (`.module.css`)
- Все деньги в копейках, форматирование через `formatKopecks`/`formatKopecksWithSign`
- `App.tsx` управляет навигацией через `overrideScreen` state; HomeScreen уже принимает `onNavigate`

### Integration Points
- `HomeScreen.tsx` — полная переработка (placeholder → реальный дашборд)
- `App.tsx` — добавить `periodId` state для switcher (выбранный период)
- `api/types.ts` — добавить `PeriodRead` list response типы
- `app/api/router_periods.py` (новый) — endpoints GET /periods + GET /periods/{id}/balance
- `app/worker/jobs/close_period.py` (новый) — PER-04 worker job
- `app/worker/main_worker.py` — зарегистрировать close_period джобу в 00:01 МСК

</code_context>

<specifics>
## Specific Ideas

- Дашборд должен точно реализовать sketch 001-B (hero-карточка с градиентом), sketch 003 (все edge-states), sketch 006-B уже реализован
- FAB остаётся на HomeScreen (уже есть), интегрировать в общий state управления периодом
- При apply-template из empty state — показать toast «Шаблон применён» и перезагрузить данные

</specifics>

<deferred>
## Deferred Ideas

- Графики/тренды по месяцам (post-MVP, ANL-01)
- Push-алерт при достижении 90% бюджета (ANL-03)
- Детализация транзакций при клике на категорию в дашборде (возможно Phase 6+)

</deferred>
