# Phase 36: Persona E Feature Pack (Самозанятые) — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous run, scoped backend-only per Persona E targeting).

## Phase Boundary

Backend-only delivery of Persona E (самозанятый/микро-ИП РФ) Pro-features
required for v1.1 monetization: business/personal tag schema на категориях
и транзакциях, налоговый калькулятор для НПД 4/6% + CSV export для архива
налоговых отчётов. UI surface (toggles на CategoryDetail / AddSheet chip /
Management → «Я самозанятый») — deferred к v1.2 frontend wave.

Per PRODUCT-STRATEGY.md Persona E sizing: ~9M самозанятых в РФ к 2026 —
крупнейший addressable Pro-segment. v1.1 backend lands schema + math; v1.2
открывает UI + push-нотификации к концу квартала.

## Implementation Decisions

- **Schema split**: `category.tag` NOT NULL DEFAULT `'personal'` (always
  set); `actual_transaction.tag` NULL-able override (NULL = наследует от
  category). CHECK constraints на DB-уровне (migration 0023). Partial
  index `ix_actual_transaction_tag WHERE tag='business'` — для быстрого
  tax-deductible queries без full-scan.
- **Tax calc**: pure `Decimal` арифметика (`round_to_cent` HALF_UP), без
  float; rates строго `Decimal("0.04")` / `Decimal("0.06")`. 5% safety
  margin поверх tax_owed (recommendation, не charge).
- **API gating**: оба endpoint'а (`/tax/reserve` + `/tax/export.csv`) под
  `require_pro` — reverse-trial users тоже proходят (Phase 35 mechanic).
- **CSV format**: UTF-8 с BOM, RFC 4180 excel dialect, LF line-terminator,
  10 столбцов (date / cat-code / cat-name / cat-tag / amount_cents /
  amount_rub / kind / tag / note / source). Денорм category.* — чтобы
  CSV был self-contained для Excel без джойнов.
- **Sort order CSV**: `tx_date DESC` — то же, что Mini App transactions
  screen (UI/CSV consistency).

## Deferred (v1.2)

- UI Mini App toggle business/personal на CategoryDetail.
- AddSheet chip «Бизнес / Личное» per-transaction override.
- Management → Настройки toggle «Я самозанятый» + auto-resolve regime
  (currently через query param на каждый запрос).
- Push-уведомление за 3 дня до конца квартала о tax reserve sum.
- AI tools `tag_business_vs_personal` / `record_tax_reserve` /
  `propose_csv_export` (REQ-36-05).
- Bot-команды `/tax` + `/csv` (REQ-36-06).
- `mixed` tag value — нет per-transaction split UI; user пока должен
  разбить вручную на 2 транзакции.
- CSV streaming (StreamingResponse) для huge datasets — пока полный
  буфер (OK для self-employed <100K txns/period).

## Commits

1. `10aa998` — feat(36-01): business/personal tag on category + actual_transaction (REQ-36-01)
2. `d3204a0` — feat(36-02): tax reserve calculator (НПД 4-6%) + /api/v1/tax/reserve endpoint (REQ-36-02)
3. `8e3d32b` — feat(36-03): CSV export endpoint /tax/export.csv (REQ-36-03)
