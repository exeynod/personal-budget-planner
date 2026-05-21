# Plan 34-04 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-34-03, REQ-34-05 (combined: webhook = state-machine entry point)
**Commit:** `312acb1`

## What was built

1. **`app/api/routes/webhooks.py`** — `POST /webhooks/yookassa`:
   - Public endpoint (no Telegram auth — ЮKassa POSTs directly).
   - Parses event payload (`payment.succeeded`, `payment.canceled`).
   - Lookup `Payment` by `yookassa_payment_id` (UNIQUE) → idempotent.
2. **State machine** in `app/services/billing.py`:
   - `pending → succeeded`: updates `payment.status`, creates or extends `subscription_billing` (tier=pro, period_end = now() + 30d, status=active).
   - `pending → canceled`: только обновляет `payment.status`, никаких side-effects.
   - Duplicate event (status already succeeded) → 200 OK, no DB write.
3. **`tests/test_webhook_yookassa.py`** — 3 tests:
   - `test_succeeded_grants_pro` — full path.
   - `test_duplicate_webhook_is_idempotent` — двойной POST, single Pro row.
   - `test_canceled_no_pro_granted` — pending→canceled cleanly.

## Verification evidence

- `pytest tests/test_webhook_yookassa.py -v` → **3 passed**.

## Decisions / surprises

- HMAC validation отложена на v1.2 (ЮKassa primarily uses IP-allowlist; HMAC доступен но опционален). Документировано в 34-CONTEXT.
- Webhook handler читает БД через global async session (без RLS scope), т.к. `yookassa_payment_id` глобально-уникален и не нуждается в tenant-scope lookup.

## Next plan

Plan 34-05 (billing + subscription HTTP endpoints) — фронтенду нужно `create-payment` + `/me/subscription` + `cancel`.
