# Phase 8: Analytics Screen — Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Экран Аналитика (top-level таб) реализует 4 блока аналитики: прогноз остатка, топ перерасходов, тренд расходов (SVG line chart), топ категорий (SVG horizontal bars). Все агрегаты считаются на backend через 4 новых REST endpoints. SVG-чарты самописные, без внешних chart-libs. Никаких изменений существующих экранов.

</domain>

<decisions>
## Implementation Decisions

### API Design
- 4 отдельных endpoints: `GET /api/v1/analytics/trend`, `/top-overspend`, `/top-categories`, `/forecast` — per ANL-07
- Period chips mapping: `1M` = текущий period по cycle_start_day; `3M/6M/12M` = N последних закрытых periods
- Top-overspend: ранжирование по % перерасхода (факт/план×100), top-5
- Тренд: точки данных по периодам (budget_period), не по календарным месяцам

### SVG Charts Implementation
- Line chart форма: cubic bezier (гладкая кривая через SVG `C` path commands)
- Оси line chart: ось X — аббревиатуры периодов (Янв/Фев/…), ось Y — авто-тик каждые 5000₽
- Horizontal bars для топ-категорий: статичные (без CSS-анимации)
- Цветовая палитра: CSS vars `--chart-1`..`--chart-6` добавить в `:root` в styles/globals.css

### Forecast Algorithm
- Формула: `daily_rate = actual_expense_cents / days_elapsed; projected_end_balance = current_balance_cents - remaining_days * daily_rate`
- Forecast card показывает: projected balance к концу периода + сумма «сгорит»
- Edge case `days_elapsed=0` (первый день периода): показывать «Недостаточно данных» — без ложных цифр
- Доходы: не экстраполируются; в расчёт баланса входят только фактические доходы (уже учтены в current_balance)

### UI Layout & States
- Порядок блоков: Period chips → Forecast card → Top-overspend → Line chart (тренд) → Top-categories
- Empty state: каждый блок скрывается при отсутствии данных; если скрыты все — показать «Нет данных за период» с иконкой
- Loading state: skeleton placeholders per-блок (паттерн как в DashboardCategoryRow)
- Top-categories: top-5, без collapse

### Claude's Discretion
- Точная SVG viewBox и responsive scaling для разных ширин экрана
- Шрифт и размер tick labels на осях
- Точный цвет линии тренда и fill под ней (gradient или plain)
- CSS module именование для chart компонентов

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/PageTitle.tsx` — уже есть (создан в Phase 7), переиспользуем без изменений
- `screens/AnalyticsScreen.tsx` — placeholder уже создан в Phase 7, заменяем содержимое
- `frontend/src/api/periods.ts` + `usePeriods.ts` — паттерн для нового `api/analytics.ts` + `useAnalytics.ts`
- `DashboardCategoryRow.module.css` — skeleton loading паттерн для инспирации
- `HeroCard.tsx` — паттерн для forecast card (surface + значение)
- CSS vars `--color-primary`, `--color-danger`, `--color-warn` — уже в globals.css, добавить `--chart-1..6`

### Established Patterns
- CSS Modules для каждого компонента
- `formatKopecks` / `formatKopecksShort` из `utils/format.ts` — для Y-axis и card values
- `api/client.ts` — shared fetch wrapper с auth header; все новые endpoints через него
- React hooks: data + loading + error из custom hook, компоненты потребляют hook
- Phosphor icons: `@phosphor-icons/react` — для иконок в empty state

### Integration Points
- `screens/AnalyticsScreen.tsx` — полная замена placeholder на реальный контент
- `app/api/routes/` — новый файл `analytics.py` + регистрация в `router.py`
- `app/services/` — новый `analytics.py` service с агрегатными запросами
- `frontend/src/api/analytics.ts` — новые типы + fetch функции
- `frontend/src/hooks/useAnalytics.ts` — хук для всех 4 endpoints

</code_context>

<specifics>
## Specific Ideas

- Sketch 008-A — reference для верстки экрана (period chips + блоки)
- Top-overspend карточки: левый бордер `--color-danger` если >100%, `--color-warn` если ≥80%
- Forecast card: если projected_balance < 0 — показывать красным с иконкой предупреждения
- Line chart: fill под кривой с opacity 0.15 цвета `--color-primary` (area chart вид)

</specifics>

<deferred>
## Deferred Ideas

- Пагинация / infinite scroll тренда (сейчас top N периодов)
- Интерактивные tooltip на hover/tap для точек line chart — можно добавить в Phase 8 если время позволит, иначе Phase 11
- Materialized views для тяжёлых агрегатов (ANL-08 упоминает возможность позже)
- Сравнение периодов side-by-side — в Phase 9 AI или отдельная Phase 11

</deferred>
