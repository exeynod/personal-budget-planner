# Plan 34-05 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-34-04, REQ-34-06
**Commit:** `62c7a29`

## What was built

1. **`app/api/routes/billing.py`** — `POST /api/v1/billing/create-payment`:
   - Auth via `get_current_user`.
   - Body: `PaymentCreateRequest`.
   - Calls `YookassaClient.create_payment` → persists `Payment` row (status=pending) → returns `payment_id` + `confirmation_url`.
2. **`app/api/routes/me.py`** extended:
   - `GET /api/v1/me/subscription` → `SubscriptionRead | null` (latest non-expired SubscriptionBilling).
   - `POST /api/v1/me/subscription/cancel` → sets `status=canceled` (period_end remains; user retains access until end).
3. **`tests/test_billing.py`** — 3 tests:
   - `test_create_payment_happy_path` — 200 + confirmation_url returned.
   - `test_get_subscription_for_pro_user` — Pro row visible.
   - `test_cancel_subscription_idempotent` — двойной cancel → 200 каждый раз, single state change.

## Verification evidence

- `pytest tests/test_billing.py -v` → **3 passed**.

## Decisions / surprises

- `cancel` не выполняет proration — user сохраняет Pro до конца уже оплаченного периода (соответствует CMP UX-pattern Spotify/Netflix).
- `GET /me/subscription` возвращает `null` для Free users (а не 404) — клиент проще парсит.

## Next plan

Plan 34-06 (frontend billing API + PaymentButton) — клиентский trigger для create-payment.
