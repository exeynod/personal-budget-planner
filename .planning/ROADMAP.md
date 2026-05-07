# Roadmap: TG Budget Planner

## Milestones

- ✅ **v0.2 — MVP** (Phases 1-6) — shipped 2026-05-03 → [archive](milestones/v0.3-REQUIREMENTS.md) (full v0.2 traceability в v0.3 archive at close)
- ✅ **v0.3 — Analytics & AI** (Phases 7-10.2) — shipped 2026-05-06 → [archive](milestones/v0.3-ROADMAP.md)
- ✅ **v0.4 — Multi-Tenant & Admin** (Phases 11-15) — shipped 2026-05-07 → [archive](milestones/v0.4-ROADMAP.md) (live TG smoke deferred to UAT — see [v0.4-MILESTONE-AUDIT.md](v0.4-MILESTONE-AUDIT.md))
- 🚧 **v0.5 — Security & AI Hardening** (Phase 16) — in progress (started 2026-05-07)

## Phases

<details>
<summary>✅ v0.2 MVP (Phases 1-6) — SHIPPED 2026-05-03</summary>

- [x] Phase 1: Infrastructure & Auth (6/6 plans) — completed 2026-05-02
- [x] Phase 2: Domain Foundation & Onboarding (6/6 plans) — completed 2026-05-02
- [x] Phase 3: Plan Template & Planned Transactions (6/6 plans) — completed 2026-05-03
- [x] Phase 4: Actual Transactions & Bot Commands (6/6 plans) — completed 2026-05-03
- [x] Phase 5: Dashboard & Period Lifecycle (6/6 plans) — completed 2026-05-03
- [x] Phase 6: Subscriptions & Worker Jobs (7/7 plans) — completed 2026-05-03

> v0.2 не закрывался formally через `/gsd-complete-milestone`; archived retroactively at v0.3 close.

</details>

<details>
<summary>✅ v0.3 Analytics & AI (Phases 7-10.2) — SHIPPED 2026-05-06</summary>

- [x] Phase 7: Nav Refactor (6/6 plans) — completed 2026-05-05
- [x] Phase 8: Analytics Screen (5/5 plans) — completed 2026-05-05
- [x] Phase 9: AI Assistant (7/7 plans) — completed 2026-05-06
- [x] Phase 10: AI Categorization (5/5 plans) — completed 2026-05-06
- [x] Phase 10.1: AI Cost Optimization (INSERTED, inline) — completed 2026-05-06
- [x] Phase 10.2: AI Hardening + Write-Flow (INSERTED, inline) — completed 2026-05-06

См. [milestones/v0.3-ROADMAP.md](milestones/v0.3-ROADMAP.md) для full phase details.

</details>

<details>
<summary>✅ v0.4 Multi-Tenant & Admin (Phases 11-15) — SHIPPED 2026-05-07</summary>

- [x] Phase 11: Multi-Tenancy DB Migration & RLS (7/7 plans) — completed 2026-05-06
- [x] Phase 12: Role-Based Auth Refactor (7/7 plans) — completed 2026-05-07
- [x] Phase 13: Admin UI — Whitelist & AI Usage (8/8 plans) — completed 2026-05-07
- [x] Phase 14: Multi-Tenant Onboarding (7/7 plans) — completed 2026-05-07
- [x] Phase 15: AI Cost Cap Per User (7/7 plans) — completed 2026-05-07

См. [milestones/v0.4-ROADMAP.md](milestones/v0.4-ROADMAP.md) для full phase details.

</details>

### 🚧 v0.5 Security & AI Hardening (In Progress)

**Milestone Goal:** Закрыть 2 CRITICAL и 7 HIGH из код-ревью 2026-05-07. Каждый фикс сопровождается регресс-тестом. Hotfix-style milestone, без новых фич.

- [ ] **Phase 16: Security & AI Hardening** — 9 atomic fixes (XSS, SSE-leak, race-conditions, AI guardrails, SQLi-regression-guard, money-parser dedup) — каждый с регресс-тестом

## Phase Details

### Phase 16: Security & AI Hardening
**Goal**: Все 9 находок код-ревью 2026-05-07 закрыты в коде; для каждой — green regression-тест, не позволяющий деградации
**Depends on**: Phase 15 (v0.4 milestone shipped)
**Requirements**: SEC-01, SEC-02, CON-01, CON-02, AI-01, AI-02, AI-03, DB-01, CODE-01
**Success Criteria** (what must be TRUE):
  1. Adversarial markdown payload (`**<img src=x onerror=...>**`) от LLM, отрисованный в `ChatMessage`, НЕ выполняет JS — Playwright assert `window.__xss === undefined` зелёный (SEC-01); SSE error-event при exception в `_event_stream` отдаёт generic-сообщение без имени класса/file path/SQL текста — pytest проверяет sanitization (SEC-02).
  2. Параллельные `complete_onboarding` для одного `tg_user_id` (asyncio.gather) дают ровно один success + один `AlreadyOnboardedError`, без частичной мутации `app_user` (CON-01); параллельные `/ai/chat` при `cap−1¢` дают ровно один pass + один 429, число записей в `ai_usage_log` совпадает с числом успешных вызовов (CON-02).
  3. Proposal-tools отвергают `amount_rub <= 0` с `{"error": ...}` без создания `amount_cents` в ProposalPayload (AI-01); невалидный JSON или mistyped args в tool-call → SSE-event `tool_error` + `logger.warning("ai.tool_args_invalid ...")`, БЕЗ silent `kwargs={}` (AI-02); зацикленный mock-LLM прерывается ≤ 8 total tool-calls с финальным user-friendly assistant-message (AI-03).
  4. `grep -r 'SET LOCAL app.current_user_id' app/services/spend_cap.py` возвращает 0 совпадений; `spend_cap.py` использует `await set_tenant_scope(db, user_id)` идентично `app/db/session.py` (DB-01).
  5. `parseRublesToKopecks` определён единожды в `frontend/src/utils/format.ts` — vitest зелёный для edge-кейсов `"100,50"`, `"1 000.5"`, `"0.01"`, `"0.001"`; `ActualEditor` и `PlanItemEditor` импортируют helper, локальные дубли удалены; Playwright e2e подтверждает одинаковые `amount_cents` для одинаковых input-строк в обоих редакторах (CODE-01).
**Plans**: TBD
**UI hint**: yes

## Progress

### Milestone v0.2 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Auth | 6/6 | Complete | 2026-05-02 |
| 2. Domain Foundation & Onboarding | 6/6 | Complete | 2026-05-02 |
| 3. Plan Template & Planned Transactions | 6/6 | Complete | 2026-05-03 |
| 4. Actual Transactions & Bot Commands | 6/6 | Complete | 2026-05-03 |
| 5. Dashboard & Period Lifecycle | 6/6 | Complete | 2026-05-03 |
| 6. Subscriptions & Worker Jobs | 7/7 | Complete | 2026-05-03 |

### Milestone v0.3 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Nav Refactor | 6/6 | Complete | 2026-05-05 |
| 8. Analytics Screen | 5/5 | Complete | 2026-05-05 |
| 9. AI Assistant | 7/7 | Complete | 2026-05-06 |
| 10. AI Categorization | 5/5 | Complete | 2026-05-06 |
| 10.1. AI Cost Optimization (INSERTED) | inline | Complete | 2026-05-06 |
| 10.2. AI Hardening + Write-Flow (INSERTED) | inline | Complete | 2026-05-06 |

### Milestone v0.4 (Complete)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Multi-Tenancy DB Migration & RLS | 7/7 | Complete (human_needed) | 2026-05-06 |
| 12. Role-Based Auth Refactor | 7/7 | Complete (human_needed) | 2026-05-07 |
| 13. Admin UI — Whitelist & AI Usage | 8/8 | Complete (human_needed) | 2026-05-07 |
| 14. Multi-Tenant Onboarding | 7/7 | Complete (human_needed) | 2026-05-07 |
| 15. AI Cost Cap Per User | 7/7 | Complete (human_needed) | 2026-05-07 |

### Milestone v0.5 (In Progress)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 16. Security & AI Hardening | 6/9 | In Progress|  |

---
*Roadmap reorganized: 2026-05-06 at v0.3 milestone close*
*v0.4 closed: 2026-05-07 — full archive in `milestones/v0.4-ROADMAP.md`*
*v0.5 added: 2026-05-07 — Phase 16 hotfix milestone (Security & AI Hardening)*
*v0.2 archived retroactively at v0.3 close; v0.3 archive in `milestones/v0.3-ROADMAP.md`*
