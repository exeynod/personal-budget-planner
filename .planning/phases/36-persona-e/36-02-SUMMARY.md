# Plan 36-02 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-36-02
**Commit:** `d3204a0`

## What was built

1. **Service `app/services/tax_reserve.py`** — pure Decimal math, HALF_UP
   rounding, 4%/6% rate constants, `calculate_tax_reserve()` aggregates
   business-tagged income transactions в [period_start, period_end].
2. **Endpoint `GET /api/v1/tax/reserve`** — Pro-gated; принимает
   `regime=nalog_4|nalog_6` (default `nalog_4`); возвращает 7-field JSON
   (period_*, income_cents, business_income_cents, regime, tax_owed_cents,
   reserve_recommended_cents).
3. **Tests** — 2 pure-function + 2 DB-backed integration scenarios.

## Verification evidence

- `pytest tests/test_tax_reserve.py -v` → **4 passed**.
- Math verified manually: 50_000₽ business income × 4% = 2_000₽ tax;
  2_000₽ × 1.05 = 2_100₽ reserve recommended.

## Decisions / surprises

- `Decimal` строго, без `float` — финансовые вычисления НЕ должны иметь
  IEEE-754 ошибки.
- 5% safety margin поверх — recommendation, не auto-charge; user сам
  переводит в копилку (per Persona E feedback — пользователи хотят
  control, не auto-deduction).
- `regime` через query param (не stored в `app_user.nalog_regime`) — пока
  user явно выбирает на каждый запрос. Storage перейдёт в v1.2 вместе с
  Management → «Я самозанятый» toggle.

## Next plan

Plan 36-03 (CSV export) реиспользует тот же `require_pro` gating
паттерн для архивной выгрузки транзакций.
