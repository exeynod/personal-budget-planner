---
phase: 34-yookassa
plan: 07
type: docs
requirements: [REQ-34-07]
status: complete
commit: b09acd1
---

# Phase 34 Plan 07 — Operator onboarding doc

Created `docs/operator/YOOKASSA-ONBOARDING.md` — пошаговый чеклист для активации ЮKassa в режиме самозанятого (4-6% НПД).

**Sections:**
- Pre-requisites (ИНН, «Мой Налог», банковская карта).
- Регистрация самозанятого через «Мой Налог»/Госуслуги.
- Регистрация в ЮKassa с верификацией ИНН ФНС.
- `.env` credentials setup (test + prod).
- Webhook URL configuration + IP allowlist (185.71.76.0/27 и т.п.).
- Sandbox test через curl + tested card 1111 1111 1111 1026.
- Налоговая отчётность через автоматические чеки в «Мой Налог».
- Известные ограничения (2.4M ₽/год лимит самозанятого, RUB-only).

**Commit:** b09acd1
