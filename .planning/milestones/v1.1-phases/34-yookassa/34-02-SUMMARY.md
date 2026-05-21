# Plan 34-02 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-34-01 (ORM/schema layer)
**Commit:** `b701b47`

## What was built

1. **ORM extensions in `app/db/models.py`:**
   - `Payment` class (mirrors `payment` table, FK→app_user).
   - `SubscriptionBilling` class (FK→app_user, FK→payment via `last_payment_id`).
   - PgEnum'ы: `PaymentStatus` (pending/succeeded/canceled/refunded), `BillingTier` (free/pro), `BillingStatus` (active/past_due/canceled/expired).
2. **Pydantic schemas in `app/api/schemas/billing.py`:**
   - `PaymentCreateRequest` (amount_cents, description, return_url).
   - `PaymentCreateResponse` (payment_id, confirmation_url).
   - `SubscriptionRead` (tier, period_start, period_end, status).

## Verification evidence

- `python -c "from app.db.models import Payment, SubscriptionBilling, PaymentStatus, BillingTier"` exits 0.
- `python -c "from app.api.schemas.billing import PaymentCreateRequest; PaymentCreateRequest(amount_cents=29900, return_url='https://x')"` exits 0.

## Decisions / surprises

- `Pydantic v2 model_config = {'from_attributes': True}` для ORM-to-schema conversion.
- Все cents fields — `int` (BIGINT в БД), per project money convention.

## Next plan

Plan 34-03 (YookassaClient wrapper) — реализует HTTP transport к ЮKassa API.
