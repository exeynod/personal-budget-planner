# Plan 33-06 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-33-01 (template-ready; actual submission is manual user-side action)

## What was built

1. **`docs/legal/RKN-NOTIFICATION.md`** — full ready-to-copy template for
   the РКН online form (pd.rkn.gov.ru). Includes all required sections:
   - Оператор, адрес, контакты, ИНН placeholders
   - Цели обработки (5 пунктов)
   - Правовое основание (ст. 6 ч. 1 п. 1 152-ФЗ — consent)
   - Категории субъектов
   - Перечень обрабатываемых ПДн (6 категорий)
   - Способы обработки
   - Сроки хранения
   - Меры защиты (технические + организационные)
   - Sub-processors (OpenAI, Telegram)
   - Step-by-step submission instructions + post-submission checklist

2. **`docs/legal/LEGAL-REVIEW-TODO.md`** — checklist for professional
   legal review covering Privacy Policy, ToS, Cross-border data transfer,
   Refund/Billing, РКН submission. Total **12 items** across 5 sections.
   Includes finalization workflow (replace Draft v0.1 → v1.0 (legal-reviewed)).

3. **`docs/COMPLIANCE.md`** — top-level state-of-compliance map. Contents:
   - Юрисдикция statement (РФ; GDPR deferred to v2.0)
   - РКН registration tracking table (placeholders for reg-номер + дата)
   - DPO contact (exeynod@gmail.com)
   - Sub-processors table (OpenAI EU, Telegram)
   - Retention table (active / soft-deleted / audit / backup)
   - Audit log policy (events + hashing)
   - Compliance roadmap (Phase 32 shipped, 33 in progress, 34/Legal review/РКН pending)
   - Legal counsel placeholder
   - Regulatory inquiries contact

## Verification evidence

- All 3 files exist with required keywords (pd.rkn.gov.ru, exeynod@gmail.com, rkn_registration_id, 12 checkbox items).

## Decisions / surprises

- **РКН automation impossible** — submission requires ЭЦП/Госуслуги. Template + checklist is practical minimum; owner completes the rest manually.
- **DPO not required for физлица** per ст. 18.1 ч. 2 152-ФЗ (cited in COMPLIANCE.md).

## Open items (manual user action)

1. Подать РКН-уведомление через `RKN-NOTIFICATION.md` шаблон.
2. Записать `rkn_registration_id` в `COMPLIANCE.md`.
3. После получения reg-номера — закрыть REQ-33-01 в REQUIREMENTS.md.
4. Provoke professional legal review per `LEGAL-REVIEW-TODO.md`.

## Next plan

Plan 33-03 (consent endpoints + onboarding gate) — runs in wave 3.
