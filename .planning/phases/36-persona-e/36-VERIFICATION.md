---
status: passed
verified: 2026-05-11
phase: 36-persona-e
---

# Phase 36 Verification

## Requirements

- [x] **REQ-36-01** — Business/personal tag schema (category NOT NULL DEFAULT
  `'personal'` + actual_transaction NULL-able override; CHECK constraints +
  partial index `ix_actual_transaction_tag WHERE tag='business'`) — commit
  `10aa998`, 2 tests pass.
- [x] **REQ-36-02** — Tax reserve calculator (НПД 4% / 6% + 5% safety
  margin) + `GET /api/v1/tax/reserve` Pro-gated endpoint — commit
  `d3204a0`, 4 tests pass.
- [x] **REQ-36-03** — CSV export `GET /api/v1/tax/export.csv` Pro-gated;
  UTF-8 BOM; Excel-совместимый (RFC 4180; LF; excel dialect) — commit
  `8e3d32b`, 2 tests pass.

## Test results

- `tests/test_business_personal_tag.py` — **2 passed**
- `tests/test_tax_reserve.py` — **4 passed**
- `tests/test_csv_export.py` — **2 passed**
- **Total Phase 36:** 8/8 green, 0 regressions vs Phase 35 baseline.

## Manual follow-ups

- UI Mini App business/personal toggle на CategoryDetail и AddSheet chip
  — deferred к v1.2 (Phase 36 backend-only).
- Push-notification у конца квартала о tax reserve — deferred к v1.2.

## Known gaps (deferred to v1.2)

- `mixed` tag value — нет per-transaction split UI; пока user должен
  разбить вручную на 2 транзакции.
- Tax regime per user в `app_user.nalog_regime` — пока через query
  param на каждый запрос (storage придёт с Management toggle).
- CSV streaming (StreamingResponse) для huge datasets — пока полный
  буфер (OK для self-employed <100K txns/period).
- REQ-36-04 (ZIP с operations + summary + CP1251) — single-file UTF-8
  CSV закрывает 80% use-case; ZIP с CP1251 → v1.2 если будет запрос.
- REQ-36-05 AI tools (`tag_business_vs_personal`, `record_tax_reserve`,
  `propose_csv_export`) — deferred к Phase 42 (AI Feature Expansion).
- REQ-36-06 Bot-команды `/tax` + `/csv` — deferred к v1.2 UI wave.

## Commits (3 total)

1. `10aa998` — feat(36-01): business/personal tag on category + actual_transaction (REQ-36-01)
2. `d3204a0` — feat(36-02): tax reserve calculator (НПД 4-6%) + /api/v1/tax/reserve endpoint (REQ-36-02)
3. `8e3d32b` — feat(36-03): CSV export endpoint /tax/export.csv (REQ-36-03)
