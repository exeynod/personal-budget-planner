# Phase 32: Multi-tenant Production Enablement — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (skip-discuss; user-authorized autonomous run).
**Branch:** `v1.0-maximal-poster`

<domain>
## Phase Boundary

**Goal.** Активировать shipped-in-v0.4 multi-tenant инфраструктуру (RLS на 9 + 4
доменных таблицах + role-based auth + AccessScreen) на live production data,
завершить переход с legacy single-tenant config (`OWNER_TG_ID` ENV) на полностью
role-based auth (`owner` / `member` / `revoked`), вытащить AI cost cap default
на $5/мес и доставить production-grade migration runbook + load test.

### In Scope
1. **RLS audit на всех 13 доменных таблицах** — 9 v0.4 (`category`, `budget_period`,
   `plan_template_item`, `planned_transaction`, `actual_transaction`,
   `subscription`, `category_embedding`, `ai_conversation`, `ai_message`)
   + 4 v1.0 (`account`, `goal`, `savings_config`, `ai_usage_log`) — проверить
   `ENABLE + FORCE ROW LEVEL SECURITY` на каждой, наличие policy с
   `current_setting('app.current_user_id')::bigint` filter, FK
   `ON DELETE CASCADE/RESTRICT` корректно настроены.
2. **Удаление `OWNER_TG_ID`-based fallback из production path** — `_dev_mode_resolve_owner`
   остаётся только в `DEV_MODE`-ветке; в production path (DEV_MODE=false)
   `OWNER_TG_ID` НЕ должен влиять на auth. Документировать в коде, что
   `OWNER_TG_ID` теперь — только seed для `dev_seed.py` и pytest-фикстур.
3. **Backfill миграция `OWNER_TG_ID` → `role=owner`** — Alembic migration 0018
   гарантированно ставит `role=owner` для existing user с `tg_user_id=OWNER_TG_ID`
   (если есть). Идемпотентна. Применима как на prod, так и на пустой dev DB.
4. **AI cost cap default → 500 cents ($5/мес)** — server_default + Alembic
   migration 0019 + invite-flow ставит cap=500 при role-flip member→active.
   Проверка через `GET /api/v1/ai/usage` (extended) — возвращает `remaining_cents`.
5. **Load test (k6 / locust)** — 50 concurrent users × 100 actual_tx create
   + 20 AI chats, без 5xx, p95 < 800ms; результаты в `docs/LOAD-TEST.md`.
6. **Production runbook** `docs/RUNBOOK-multitenant.md` — alembic downgrade -1
   проверен на копии prod, dump/restore scenarios, RTO ≤ 30 мин, как
   мониторить, какие edge cases (single tenant → multi tenant ownership).
7. **Documentation**: `docs/MULTI-TENANT-MIGRATION.md` (как мы пришли в текущее
   состояние, что shipped когда, что осталось закрыто per v0.4 deferred-items).
8. **Integration test `test_multitenancy_live.py`** — конкретный сценарий:
   2 users created, user A creates txn → user B's session (через X-Test-User
   header) НЕ видит row через прямой SQL под `app` ролью.

### Out of Scope
- **Регистрация новых юзеров через self-serve UI** — это Phase 33 (compliance
  + consent gate) + Phase 35 (paywall sign-up flow).
- **Payment integration** — Phase 34.
- **Frontend изменения** — backend-only milestone-segment.
- **iOS изменения** — iOS frozen per PRODUCT-STRATEGY Q4=b.
- **Closed whitelist → public sign-up flip** — это Phase 33 (consent screen
  на onboarding) + Phase 35 (sign-up flow), а не Phase 32. Phase 32 готовит
  инфраструктуру, sign-up enabled позже.
- **Open-core repo split** — Phase 37 depends on Phase 32, но это отдельный
  scope (publishing artifacts, не enabling multi-tenant on this instance).

</domain>

<decisions>
## Implementation Decisions

### MT-32-01: RLS — defense-in-depth существующая, не переписываем
- **Decision.** Не меняем existing RLS policies. Они уже shipped в alembic
  0006 (9 tables) + 0012/0013/0014/0015 (4 v1.0 tables) + 0007 (postgres role split).
- **Action.** Audit-only — pytest integration test перечисляет 13 таблиц,
  проверяет `pg_class.relrowsecurity=true AND relforcerowsecurity=true` + наличие
  policy с `current_setting('app.current_user_id', true)::bigint` predicate.
- **Rationale.** Already shipped, working, tested in v0.4 + v1.0. Лишнее
  переписывание = новые баги. Audit подтверждает текущее состояние.
- **Reference.** `.planning/research/v2-stream-A-multitenancy.md` §1.2-1.3
  (RLS-as-backstop pattern), `.planning/milestones/v0.4-phases/11-multi-tenancy-db-migration/11-VERIFICATION.md`
  (PASS-evidence for 9 tables).

### MT-32-02: Production path НЕ зависит от `OWNER_TG_ID`
- **Decision.** Текущий `app/api/dependencies.py` `get_current_user` —
  production path уже НЕ читает `OWNER_TG_ID` (только `_dev_mode_resolve_owner`
  в DEV_MODE-ветке). Audit-only step + sharpen documentation, не behaviour
  change.
- **Action.** (a) explicit pytest, что DEV_MODE=false + initData для unknown
  `tg_user_id` возвращает 403 (даже если `tg_user_id == settings.OWNER_TG_ID`).
  (b) Сильнее docstring в `app/api/dependencies.py` — "production path is role-based".
- **Rationale.** Phase 12 (v0.4) уже отделил dev и prod auth-paths. Сейчас
  фиксируем это явно в test + docstring чтобы случайно не вернуть legacy.
- **Reference.** `app/api/dependencies.py:228-302`, Phase 12 VERIFICATION.md.

### MT-32-03: Idempotent backfill migration 0018
- **Decision.** Новая Alembic migration `0018_owner_role_backfill.py`
  выполняет: `UPDATE app_user SET role='owner' WHERE tg_user_id = $OWNER_TG_ID
  AND role <> 'owner'`. Идемпотентная (no-op если уже owner). Downgrade —
  no-op (нельзя унить owner-role без бизнес-логики; это будет logical-pollution).
- **Configurable.** `OWNER_TG_ID` берётся из env `settings.OWNER_TG_ID`. Если
  =0 — migration логирует warning и skip-s (для dev/test без owner-config).
- **Rationale.** Existing v0.4 backfill (alembic 0006) делал то же самое, но
  во время initial multi-tenant rollout. Эта migration — safety-net для
  любых edge-case prod-DBs где owner потерял role (например, если
  кто-то ручками изменил role на member). REQ-32-06 explicit.

### MT-32-04: AI cost cap default = 500 cents (5 USD)
- **Decision.** Bump default с 100 → 500 cents в:
  - `app/db/models.py`: `spending_cap_cents` default + server_default = "500".
  - Alembic migration `0019_ai_cost_cap_default_500.py`: 
    `ALTER TABLE app_user ALTER COLUMN spending_cap_cents SET DEFAULT 500;`
    plus optional `UPDATE app_user SET spending_cap_cents=500 WHERE
    spending_cap_cents=100` для existing rows с default (опционально через
    env flag, но per REQ-32-03 default-bump must propagate to new users).
- **Action.** Modified existing endpoint behaviour: invite-flow
  (`_dev_mode_resolve_owner`, `seed_extra_dev.py`, future invite path) ставит
  `spending_cap_cents=500` для нового user, если specifically не указано.
- **/ai/usage extension.** Endpoint возвращает `remaining_cents` (cap - spend) и
  `cap_cents` per-user. Сейчас он buffer-based ring; нужно либо переписать
  ВСЕГО buffer на DB-aggregation, либо параллельно дополнить response с
  per-user fields. Per CONTEXT — additive (новые поля; legacy `today / session_total`
  остаются для backward-compat).
- **Rationale.** $1 → $5 — middle ground между "AI почти выключен" (где
  юзер не успевает попробовать) и "infinite spend" (где себестоимость
  растёт). $5/мес — comfortable headroom для conversational AI usage в test
  paying tier.

### MT-32-05: Load test через locust (Python) — preferred over k6
- **Decision.** Use `locust` Python-package (already in our stack as a `[dev]`
  optional dep) вместо k6 (Go binary). Reasoning:
  - Test code is Python; same engineer skill set; не вводим Go-toolchain.
  - Locust supports async via gevent/FastHttpUser; достаточно для 50 concurrent.
  - Result CSV + plot artifacts проще интегрировать в `docs/LOAD-TEST.md`.
- **Scenarios.** 
  - Scenario A: 50 users × 100 actual_tx (POST /api/v1/actual) → expect 200 / 201.
  - Scenario B: 20 users × AI chat (POST /api/v1/ai/chat) — без 429 на первом
    запросе при default cap=500.
- **Pass criteria.** p95 < 800ms, 0 5xx, 0 cross-tenant leakage (random sample
  of 10 user-sessions checked для contamination).
- **Artifacts.** CSV traces + bar-chart screenshots commited in `docs/LOAD-TEST.md`.

### MT-32-06: Runbook scope — "operational disaster manual"
- **Decision.** `docs/RUNBOOK-multitenant.md` — single-page Markdown с:
  - Pre-migration checklist (backup, smoke).
  - `alembic upgrade head` step-by-step + expected output.
  - `alembic downgrade -1` rollback procedure (verified).
  - pg_dump / pg_restore disaster scenario (RTO ≤ 30 min).
  - Monitoring + alert triage (5xx burst, RLS GUC missing).
  - Audit-log inspection query (cross-tenant leak detection).
- **Out.** Не runbook для compliance / payments / GDPR — это Phase 33 / 34.

### MT-32-07: Documentation — `docs/MULTI-TENANT-MIGRATION.md` (history + state-of)
- **Decision.** Single doc сводящая v0.4 milestone results + v1.0 RLS extension
  + Phase 32 enablement. Audience: future contributors / open-core readers
  (Phase 37 zerodir-link).
- **Structure.** (1) Phases 11–15 summary, (2) RLS architecture diagram (текст-only
  draw для git-friendly), (3) auth precedence chain (X-Test-User → Bearer → initData),
  (4) outstanding deferred items.

</decisions>

<code_context>
### Files affected
- `app/api/dependencies.py` — docstring sharpening (no behaviour change for prod
  path; REQ-32-02 audit).
- `app/db/models.py:163-168` — `spending_cap_cents` default bump 100 → 500
  (REQ-32-03).
- `alembic/versions/0018_owner_role_backfill.py` — NEW (REQ-32-06).
- `alembic/versions/0019_ai_cost_cap_default_500.py` — NEW (REQ-32-03).
- `app/api/routes/ai.py:696-724` — `get_usage` extended с per-user
  `remaining_cents` / `cap_cents` (REQ-32-03).
- `app/api/schemas/ai.py` `UsageResponse` — добавить опциональные поля
  `cap_cents`, `remaining_cents`, `spent_cents_period`.
- `tests/test_multitenancy_live.py` — NEW (REQ-32-01, integration scenario).
- `tests/test_rls_audit.py` — NEW (REQ-32-01, pg_class introspection).
- `tests/test_no_owner_tg_id_in_prod.py` — NEW (REQ-32-02, prod path audit).
- `tests/test_ai_cap_default.py` — NEW (REQ-32-03, default cap behavior).
- `docs/MULTI-TENANT-MIGRATION.md` — NEW (REQ-32-07).
- `docs/RUNBOOK-multitenant.md` — NEW (REQ-32-05).
- `docs/LOAD-TEST.md` — NEW (REQ-32-04).
- `loadtest/locustfile.py` — NEW (REQ-32-04 driver).

### Existing infrastructure (NOT modified, audit only)
- `alembic/versions/0006_multitenancy.py` — RLS на 9 v0.4 tables.
- `alembic/versions/0007_postgres_role_split.py` — `budget_admin` (BYPASSRLS)
  vs `app` (RLS-enforced) role split.
- `alembic/versions/0012_v10_user_account.py` — RLS на `account`.
- `alembic/versions/0013_v10_category_ext.py` — RLS на `plan_template_item`.
- `alembic/versions/0014_v10_actual_goal_savings.py` — RLS на `goal` +
  `savings_config`.
- `alembic/versions/0015_v10_rls_finalize.py` — symmetry / paranoia RLS on
  goal + savings_config (re-ENABLE FORCE).
- `app/db/session.py` `set_tenant_scope` — sets `app.current_user_id` GUC.
- `tests/test_multitenancy_isolation.py` — existing 5 isolation tests (Phase 11).
- `tests/test_rls_policy.py` — existing RLS policy validation (Phase 11).
- `tests/test_role_based_auth.py` — Phase 12 role-based tests.
- `tests/test_e2e_multi_user_lifecycle.py` — full multi-tenant lifecycle E2E.

### Reference research
- `.planning/research/v2-stream-A-multitenancy.md` §1-2 (RLS + migration sequence).
- `.planning/milestones/v0.4-phases/11-multi-tenancy-db-migration/11-VERIFICATION.md`
  (Phase 11 evidence — RLS shipped, BYPASSRLS-role split deferred to Phase 12).
- `.planning/milestones/v0.4-phases/12-role-based-auth-refactor/12-VERIFICATION.md`
  (Phase 12 evidence — non-superuser app role added).
- `.planning/milestones/v0.4-phases/15-ai-cost-cap-per-user/15-VERIFICATION.md`
  (Phase 15 evidence — per-user spending_cap mechanism).

</code_context>

<specifics>
## Specific Ideas

**Suggested plan structure (5 plans, sequential with one parallel pair):**

- **32-01: RLS audit + isolation hard-test** (REQ-32-01)
  - `tests/test_rls_audit.py` — assert все 13 таблиц имеют ENABLE+FORCE
    RLS + правильную policy (introspection через `pg_class`, `pg_policies`).
  - `tests/test_multitenancy_live.py` — 2 user'a (создаём через internal
    seed endpoint), userA создаёт actual_tx → userB session видит только
    свои rows через прямой `SELECT` под non-superuser `app` ролью.
  - Гарантирует, что v0.4 + v1.0 work — НЕ rewrite, only audit.

- **32-02: AI cost cap default 100 → 500 cents** (REQ-32-03)
  - `app/db/models.py:163` — default 100 → 500 + server_default "500".
  - Alembic migration `0019_ai_cost_cap_default_500.py`:
    `ALTER COLUMN ... SET DEFAULT 500;` + (опционально) UPDATE на legacy 100-rows.
  - `app/api/routes/ai.py:696` — `get_usage` возвращает `cap_cents`,
    `remaining_cents`, `spent_cents_period` для current user.
  - `app/api/schemas/ai.py UsageResponse` — добавить новые поля.
  - `tests/test_ai_cap_default.py` — pytest: new user inserted без spending_cap_cents
    → spending_cap_cents = 500.

- **32-03: OWNER_TG_ID backfill migration + production-path audit** (REQ-32-02, REQ-32-06)
  - Alembic migration `0018_owner_role_backfill.py` — idempotent
    UPDATE; downgrade no-op (раздокументировано в docstring).
  - Audit `app/api/dependencies.py` — strengthen docstring на production path
    «role-based, not OWNER_TG_ID-based».
  - `tests/test_no_owner_tg_id_in_prod.py` — `DEV_MODE=false` + initData
    для `tg_user_id=settings.OWNER_TG_ID` без app_user row → 403. (current
    bug-shield: подтверждает, что prod-path не имеет magic OWNER bypass.)

- **32-04: Load test (locust) + LOAD-TEST.md** (REQ-32-04) — RUNS IN PARALLEL with 32-03
  - `loadtest/locustfile.py` — 2 scenarios (actual_tx, AI chat).
  - `loadtest/README.md` — как запустить локально + docker-compose hook.
  - `docs/LOAD-TEST.md` — methodology + results table + p95 / 5xx-count.
  - Acceptance: 50 users × 100 tx → p95 < 800ms, 0 5xx, 0 cross-tenant leakage.
  - Если в CI/local запуск не возможен — markdown captures methodology + sample
    output из last run (если есть) или explicit "Run манualно before deploy".

- **32-05: Runbook + Migration history docs** (REQ-32-05, REQ-32-07)
  - `docs/RUNBOOK-multitenant.md` — operational disaster manual.
  - `docs/MULTI-TENANT-MIGRATION.md` — historical narrative + current-state map.

**Parallelization:** wave-1 → 32-01 (audit hard-test) blocks all; wave-2 →
32-02 + 32-03 parallel (model + migration changes); wave-3 → 32-04 + 32-05
parallel (load test + docs).

</specifics>

<deferred>
## Deferred Ideas (NOT in Phase 32 scope)

- **Self-serve sign-up flow** → Phase 33 (compliance + consent gate).
- **Public registration UI** → Phase 35 (paywall sign-up).
- **Audit log expansion (DB triggers)** → Phase 33 (compliance baseline) per
  v2-stream-A research §4.
- **pg_dump cron + offsite backup** → outside Phase 32 (infrastructure milestone).
- **PostHog / Plausible analytics** → Phase 38.
- **k6 load test (alternative driver)** → not done; locust suffices.
- **Multi-instance horizontal scaling** → v2.0 Branch A.
- **JWT-based auth** → v2.0 Branch A (Bank CSV / Stripe integration may force this).

</deferred>
