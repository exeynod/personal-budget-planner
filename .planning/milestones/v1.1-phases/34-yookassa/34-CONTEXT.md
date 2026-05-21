# Phase 34: ЮKassa Integration — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous per PRODUCT-STRATEGY.md Q2=b decision).

## Phase Boundary

Integrate ЮKassa Self-Employed payment rail as primary monetization channel
for Pro 299₽/мес tier. Backend client + webhook + state machine + minimal
frontend trigger. NO recurring (manual renewal in v1.1; auto-renew → v1.2).

## Implementation Decisions

- ЮKassa Self-Employed mode (4% НПД, auto-чеки через «Мой Налог»).
- `user_id BIGINT REFERENCES app_user(id)` (PK, not tg_user_id) — matches RLS GUC.
- Webhook: idempotent через `Payment.yookassa_payment_id` UNIQUE + state-transition guards.
- No HMAC validation in v1.1 (ЮKassa uses IP allowlist; HMAC → v1.2 hardening).
- TG Stars (Q2=b secondary rail) — отложен на v1.2.
- iOS frozen per Q4=b — frontend only web.

## Deferred (to v1.2)

- Recurring auto-renewal (saved_payment_method).
- Webhook HMAC validation + IP allowlist enforcement.
- Refund UI (self-service).
- RLS bypass for webhook handler (currently relies on `payment.yookassa_payment_id` lookup outside tenant scope).
