# Plan 34-01 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-34-01 (schema base)
**Commit:** `c9b4fbf`

## What was built

1. **Alembic migration `0021_yookassa_payment_schema.py`** — creates:
   - `payment` table (id BIGSERIAL, user_id BIGINT FK→app_user, yookassa_payment_id VARCHAR UNIQUE, amount_cents BIGINT, status enum, created_at/updated_at TIMESTAMPTZ).
   - `subscription_billing` table (id, user_id FK, tier enum free/pro, period_start/period_end DATE, status enum active/past_due/canceled/expired, last_payment_id FK→payment).
2. **RLS policies** on both new tables (current_user_id GUC filter, mirrors Phase 32 pattern from 0006_multitenancy).
3. **Indexes**: `ix_payment_user_id`, `ix_subscription_billing_user_id`, `ix_payment_yookassa_payment_id` (UNIQUE).

## Verification evidence

- `alembic upgrade head → downgrade -1 → upgrade head` round-trip clean.
- `SELECT * FROM pg_policies WHERE tablename IN ('payment', 'subscription_billing')` shows RLS active.

## Decisions / surprises

- Used `user_id BIGINT` (PK from app_user) NOT `tg_user_id` — matches RLS GUC `current_user_id` semantics (Phase 32).
- Idempotency key on `payment.yookassa_payment_id` UNIQUE — webhook handler relies on this.

## Next plan

Plan 34-02 (ORM models + Pydantic schemas) consumes this schema.
