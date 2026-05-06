# Roadmap: TG Budget Planner

## Milestones

- ✅ **v0.2 — MVP** (Phases 1-6) — shipped 2026-05-03 → [archive](milestones/v0.3-REQUIREMENTS.md) (full v0.2 traceability в v0.3 archive at close)
- ✅ **v0.3 — Analytics & AI** (Phases 7-10.2) — shipped 2026-05-06 → [archive](milestones/v0.3-ROADMAP.md)
- 📋 **v0.4 — Multi-Tenant & Admin** (planning) — phases TBD

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

### 📋 v0.4 Multi-Tenant & Admin (Planning)

Phases будут зафиксированы в `/gsd-new-milestone v0.4`. High-level scope:

- Multi-tenancy: `user_id` FK во всех доменных таблицах + Postgres RLS
- Whitelist через `app_user.role` (owner / member / revoked); auth с `OWNER_TG_ID`-eq → role-based
- Admin-вкладка внутри «Управление» (видна только owner) — UI по скетчам `010-admin-whitelist`
- AI usage admin sub-tab с per-user breakdown
- Onboarding для приглашённых юзеров (сам задаёт starting_balance + cycle_start_day)
- AI cost cap per user (`spending_cap_cents`, default $5/month)
- Revoke = hard delete + purge

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

### Milestone v0.4 (Planning)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| TBD | — | Not started | — |

---
*Roadmap reorganized: 2026-05-06 at v0.3 milestone close*
*v0.2 archived retroactively; v0.3 archive in `milestones/v0.3-ROADMAP.md`*
