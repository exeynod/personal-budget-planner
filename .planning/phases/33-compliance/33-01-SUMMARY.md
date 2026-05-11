# Plan 33-01 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-33-02 (base), REQ-33-04 (base)

## What was built

1. **Alembic migration `0020_pdn_compliance.py`** — adds:
   - `app_user.pdn_consent_at TIMESTAMPTZ NULL`
   - `app_user.deleted_at TIMESTAMPTZ NULL`
   - PG ENUM `pdn_audit_event` (granted / revoked / data_export / deletion_requested / deletion_completed)
   - Table `pdn_audit_log` (id BIGSERIAL, user_id_hash VARCHAR(64), event_type, occurred_at, ip_hash, metadata JSONB)
   - 3 indexes (composite event+occurred, GIN on metadata, user_id_hash)

2. **ORM extensions in `app/db/models.py`:**
   - `AppUser` extended with `pdn_consent_at`, `deleted_at` fields
   - NEW `PdnAuditEvent` Python enum
   - NEW `PdnAuditLog` ORM class (column `metadata` mapped to attribute `event_metadata` due to SQLAlchemy reserved-name conflict)
   - Added `JSONB` import from `sqlalchemy.dialects.postgresql`

3. **Service `app/services/pdn_audit.py`:**
   - `record_audit(db, *, user_id, event, ip, metadata)` — hashes user_id + ip via sha256, inserts one row
   - Caller-controlled transaction boundaries (no implicit commit)

4. **Tests `tests/test_pdn_consent.py`** — 5 tests, all green:
   - Schema columns present (`pdn_consent_at`, `deleted_at`)
   - `pdn_audit_log` table + 6 expected columns
   - Enum has 5 expected values
   - `record_audit` inserts row with sha256 hashes
   - `record_audit` with no IP leaves `ip_hash` NULL

## Verification evidence

- `alembic upgrade head` → 0020 applied (current).
- `alembic downgrade -1 → upgrade head` round-trip clean.
- `pytest tests/test_pdn_consent.py -v` → **5 passed in 0.23s**.

## Decisions / surprises

- **structlog reserves `event=` kwarg** for the message-name field; renamed call-site to `audit_event=` to avoid `TypeError: multiple values for argument 'event'`.
- **`metadata` is reserved on SQLAlchemy DeclarativeBase**; ORM attribute renamed to `event_metadata`, PG column name stays `metadata` via `mapped_column("metadata", JSONB, …)`.
- No RLS on `pdn_audit_log` — entries are hash-only, single-tenant audit trail.

## Next plan

Plan 33-02 (Privacy Policy + ToS + /legal endpoints) can run in parallel with Plan 33-06 (РКН template + docs). Plan 33-03 / 33-04 depend on this schema.
