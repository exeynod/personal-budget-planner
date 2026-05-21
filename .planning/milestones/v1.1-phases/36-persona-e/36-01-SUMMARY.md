# Plan 36-01 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-36-01
**Commit:** `10aa998`

## What was built

1. **Alembic migration `0023_business_personal_tag.py`** — adds `tag`
   столбец на `category` (NOT NULL DEFAULT `'personal'`) и
   `actual_transaction` (NULL-able override); CHECK constraints на оба;
   partial index `ix_actual_transaction_tag WHERE tag='business'`.
2. **ORM** — `Category.tag` mapped как required string с default'ом
   `'personal'`; `ActualTransaction.tag` mapped как `Optional[str]`
   (NULL = inherit от category).
3. **Tests** — 2 integration tests подтверждают: explicit tag values
   round-trip; DB DEFAULT срабатывает на legacy INSERT без `tag`.

## Verification evidence

- `pytest tests/test_business_personal_tag.py -v` → **2 passed**.
- Migration upgrade/downgrade clean.

## Decisions / surprises

- Хранение как `VARCHAR(16)` + CHECK (не PG enum) — легче добавлять новые
  значения без `ALTER TYPE` (паттерн уже использован для `RolloverPolicy`).
- Partial index дешевле full-column index — business-tx обычно <30% от
  total для самозанятых с personal расходами.

## Next plan

Plan 36-02 (tax reserve calculator) использует партиальный индекс для
быстрого `SUM(amount_cents) WHERE tag='business'` запросов.
