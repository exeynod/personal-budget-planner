# Phase 35: Paywall + Tier Enforcement + Reverse-Trial — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous, per PRODUCT-STRATEGY.md Q1=b 2-tier decision).

## Phase Boundary

Backend tier resolution (Free / Pro) + reverse-trial mechanic (14 days for
new users) + Pro-gate на AI endpoints + frontend PaywallSheet UI с ЮKassa
rail.

Per PRODUCT-STRATEGY.md Q1=b — фиксированная 2-tier модель (Free / Pro),
без сложных enterprise тарифов.

## Implementation Decisions

- Tier resolution через `effective_tier(user)` (app/services/tier.py):
  Pro если `pro_active_until > now` OR `trial_ends_at > now`. Free
  иначе. Computed at request time (no stored `tier` enum — single
  source of truth via two timestamps).
- `require_pro` FastAPI dependency raises 402 PRO_TIER_REQUIRED с JSON
  detail `{error, current_tier, upgrade_url}` на free users.
- AI endpoints gated: `POST /ai/chat`, `GET /ai/suggest-category`.
  Observation/usage endpoints остаются Free (entry hook — пусть видят
  что у них есть AI quota, который не могут потратить).
- Reverse-trial 14 days on new user creation (commit 0637ab6) —
  установлено в `_dev_mode_resolve_test_user` + `_dev_mode_resolve_owner`
  на INSERT, ON CONFLICT не трогает trial_ends_at (idempotent).
- Frontend `ProTierRequiredError` class extends `ApiError`; UI ловит и
  открывает PaywallSheet.
- PaywallSheet: monthly 299 ₽ / annual 1990 ₽ (44% off скидка явная) +
  единственная rail ЮKassa (TG Stars secondary → v1.2 backlog).

## Deferred (v1.2)

- TG Stars rail на paywall (один SKU, две кнопки — пока только ЮKassa).
- Trial expiration push-notification (за 3 дня + за 1 день).
- Tier-flip animation после успешного payment (currently — page reload).
- Yearly `pro_active_until` logic в webhook (currently все = 30 дней; нужен
  period detection из payment amount).
- Cancellation retention prompt (5% discount offer).
- E2E test «signup → trial → mock day-15 → 402 → paywall → succeeded → 200»
  (REQ-35-07) — частично покрыт unit + integration tests; full E2E с
  фиктивным временем deferred.
