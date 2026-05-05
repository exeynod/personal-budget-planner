# Phase 8 — Analytics Screen

**Milestone:** v0.3 — Analytics & AI
**Status:** Pending plan creation
**Depends on:** Phase 7 (placeholder AnalyticsScreen существует)

## Goal

Экран Аналитика — top-level таб с трендом расходов, топом перерасходов, топом категорий и прогнозом остатка периода. Backend API возвращает агрегаты, UI рендерит SVG-чарты без внешних chart-libs.

## Requirements

ANL-01, ANL-02, ANL-03, ANL-04, ANL-05, ANL-06, ANL-07, ANL-08

## Reference Sketches

- `008-analytics-dashboard/` — winner: variant A (тренд + топ перерасходов)

## Files to Touch

**Backend:**
- `app/api/v1/analytics.py` (NEW) — router с 4 endpoints (`/trend`, `/top-overspend`, `/top-categories`, `/forecast`)
- `app/services/analytics_service.py` (NEW) — агрегационные функции
- `app/api/router.py` — register analytics router
- `app/schemas/analytics.py` (NEW) — Pydantic schemas

**Frontend:**
- `frontend/src/screens/AnalyticsScreen.tsx` — replace placeholder с реальным UI
- `frontend/src/screens/AnalyticsScreen.module.css`
- `frontend/src/components/LineChart.tsx` (NEW) — самописный SVG line chart
- `frontend/src/components/HorizontalBars.tsx` (NEW) — топ-категорий bars
- `frontend/src/components/PeriodChips.tsx` (NEW) — переключатель 1/3/6/Год
- `frontend/src/components/ForecastCard.tsx` (NEW) — прогноз hero
- `frontend/src/components/TopOverspendList.tsx` (NEW) — список перерасходов с лево-бордером
- `frontend/src/api/analytics.ts` (NEW) — API client
- `frontend/src/hooks/useAnalytics.ts` (NEW) — useTrend, useTopOverspend, etc.

**Tests:**
- `tests/api/test_analytics.py` (NEW) — pytest contract tests
- `tests/services/test_analytics_service.py` (NEW) — unit tests для агрегаций (включая edge-cases: первые дни периода, нулевой бюджет)
- `frontend/tests/e2e/analytics.spec.ts` (NEW)
- `frontend/tests/ui-audit.spec.ts` — добавить screenshot

## Plans

To be created via `/gsd-plan-phase 8`. Expected ~5 plans:
1. Wave 0: RED tests + analytics service signatures
2. Backend service + endpoints
3. Frontend chart components (LineChart, HorizontalBars)
4. Frontend AnalyticsScreen integration
5. Verification + UAT
