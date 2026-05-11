---
status: passed
verified: 2026-05-11
phase: 34-yookassa
---

# Phase 34 Verification

## Requirements

- [x] **REQ-34-01** — payment + subscription_billing schema (RLS + indexes) — commits `c9b4fbf` (migration) + `b701b47` (SQLAlchemy models + Pydantic schemas)
- [x] **REQ-34-02** — YookassaClient async wrapper (create_payment / get_payment / refund) — commit `f6fa963`, **3 tests pass**
- [x] **REQ-34-03** — Webhook endpoint `/webhooks/yookassa` + idempotency через `Payment.yookassa_payment_id` UNIQUE + state-transition guards — commit `312acb1`, **3 tests pass**
- [x] **REQ-34-04** — Billing endpoints (`/api/v1/billing/create-payment`, `/api/v1/billing/payments`) + frontend slice (`PaymentButton.tsx`) — commits `62c7a29` (backend) + `5fbdd7c` (frontend), **3 tests pass**
- [x] **REQ-34-05** — Subscription state machine (active / past_due / canceled / expired) — commit `312acb1` (combined in webhook handler — `_handle_payment_succeeded` creates SubscriptionBilling row; `_handle_refund_succeeded` cancels)
- [x] **REQ-34-06** — Cancel subscription endpoint (`POST /api/v1/me/subscription/cancel`) — commit `62c7a29`, idempotent
- [x] **REQ-34-07** — Operator onboarding doc (`docs/operator/YOOKASSA-ONBOARDING.md`) — commit `b09acd1`

## Test results

- `pytest tests/test_yookassa_client.py -v` → **3 passed** in 0.02s
- `pytest tests/test_webhook_yookassa.py -v` → **3 passed** in 0.80s
- `pytest tests/test_billing.py -v` → **3 passed** in 0.86s
- **Total Phase 34 tests:** 9/9 green, 0 regressions vs Phase 33 baseline

## Alembic round-trip
- `alembic upgrade head` → `0020_pdn_compliance` → `0021_payment_billing` ✓
- `alembic downgrade -1` → `0021_payment_billing` → `0020_pdn_compliance` ✓
- `alembic upgrade head` (re-apply) ✓

## Manual follow-ups (operator-side, не блокеры shipment)

1. ЮKassa самозанятый регистрация — см. `docs/operator/YOOKASSA-ONBOARDING.md` §1-2.
2. Production webhook URL config в ЮKassa dashboard (после получения credentials).
3. `.env` credentials (`YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY`) в secrets manager production.
4. (Опционально) IP allowlist webhook ЮKassa IPs (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.156.11, 77.75.156.35) в Caddy/firewall.

## Known gaps (deferred to v1.2 backlog)

- **Webhook HMAC signature validation** — ЮKassa полагается на IP allowlist; HMAC рассмотреть в v1.2 hardening.
- **Webhook handler RLS bypass** — handler сейчас не устанавливает `app.current_user_id` GUC; lookup идёт через UNIQUE `yookassa_payment_id`. Для production нужен либо row_security=off в session, либо service-role bypass — детали в issue/v1.2.
- **Recurring auto-renewal** — `save_payment_method` уже в YookassaClient API, но enabling требует ЮKassa "tokenize" approval; user-facing renewal — v1.2.
- **Refund self-service UI** — only через ЮKassa dashboard (admin-only); UI → v1.2.

## Commits (7 total)

1. `c9b4fbf` — feat(34-01): payment + subscription_billing schema + RLS
2. `b701b47` — feat(34-02): SQLAlchemy models + Pydantic schemas for billing
3. `f6fa963` — feat(34-03): YookassaClient async wrapper + mock-transport tests
4. `312acb1` — feat(34-04): YooKassa webhook + idempotent state machine
5. `62c7a29` — feat(34-05): billing + subscription endpoints
6. `5fbdd7c` — feat(34-06): minimal frontend billing API + PaymentButton component
7. `b09acd1` — docs(34-07): YooKassa operator onboarding checklist
