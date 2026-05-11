# Plan 36-03 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-36-03
**Commit:** `8e3d32b`

## What was built

1. **Service `app/services/csv_export.py`** — CSV-стрингификатор; join
   c `category` для денорм; UTF-8 BOM prefix; excel dialect + LF
   line-terminator.
2. **Endpoint `GET /api/v1/tax/export.csv`** — Pro-gated; filename
   `transactions_{start}_{end}.csv` через `Content-Disposition`.
3. **Tests** — 2 integration scenarios (with txn + empty period).

## Verification evidence

- `pytest tests/test_csv_export.py -v` → **2 passed**.
- Combined Phase 36: `pytest test_business_personal_tag.py test_tax_reserve.py
  test_csv_export.py` → **8 passed**, 0 regressions.

## Decisions / surprises

- Поле в модели — `description` (НЕ `note`); финальный CSV-столбец всё
  равно называется `note` — это external-facing name, который ожидает user.
- `kind` приходит как str-enum subclass, но guard `hasattr(kind, 'value')`
  на случай raw value (defensive).
- Полный буфер (не streaming) — приемлемо для self-employed <100K
  txns/period (worst case ~10 MB CSV). StreamingResponse → v1.2 если
  понадобится.

## Next plan

Phase 36 закрывается этим planом. UI surface (toggles, AddSheet chip,
Management) + bot-команды `/tax` `/csv` + AI tools — всё к v1.2.
