---
phase: 22-backend-schema-logic-foundation
verified: 2026-05-10T00:55:00Z
status: human_needed
score: 17/17 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "ROADMAP SC#4: backward-compat — отсутствие новых полей даёт legacy 14-cat behavior"
    reason: "CONTEXT §Area 1 explicitly drops V0.x backward compat (\"V0.x backward compat (BE-05) — drop полностью. Single user, 1 client (v0.6 iOS → v1.0). Nothing in production needs legacy 14-cat seed.\"). The new Pydantic v2 schema is `extra='forbid'` and rejects legacy bodies; legacy `onboarding_router` mount is removed and replaced by `onboarding_v10_router` per CONTEXT D-04. The 8-cat default (food/cafe/home/transit/fun/gifts/health/subs) is what the BE-05 row in REQUIREMENTS.md actually specifies — the ROADMAP wording was an early draft. CONTEXT supersedes ROADMAP for implementation contract."
    accepted_by: "context-d04"
    accepted_at: "2026-05-10T00:00:00Z"
human_verification:
  - test: "Roundup end-to-end через API"
    expected: "POST /api/v1/savings/config с roundup_enabled=true → POST /api/v1/actual {kind=expense, amount=-101} → GET /api/v1/savings показывает total включая roundup; account.balance уменьшен на 110 (parent 101 + roundup 9)."
    why_human: "Service-layer тесты покрывают chain create_actual_v10 → maybe_create_roundup_child, но end-to-end через RUNNING api+db с реальной авторизацией initData требует TG-окружение."
  - test: "close_period_job rollover на полночь 1-го числа"
    expected: "Через 24-48ч после деплоя в полночь 1-го (Europe/Moscow): для категорий с rollover='savings' создаётся ActualTransaction(kind=deposit), для misc — period.misc_rollover_cents += remainder; rollover_processed_at заполняется; повторный запуск idempotent."
    why_human: "Service-layer + integration-tests подтверждают логику; реальный шедулер требует worker-контейнер и наблюдение календарного перехода (нельзя проверить grep'ом)."
  - test: "Onboarding atomicity при сбое посередине"
    expected: "POST /onboarding/complete с invalid goal.target_cents=-1 → возвращает 422; SELECT count(*) FROM account WHERE user_id=:uid → 0 (никаких partial inserts)."
    why_human: "Атомарность гарантирована транзакцией caller'а; sub-suite test_onboarding_v10.py покрывает rollback семантику, но рекомендуется dev-smoke на запущенном стеке для финальной приёмки."
---

# Phase 22: Backend Schema & Logic Foundation Verification Report

**Phase Goal:** Backend готов поддержать v1.0 UI — все новые сущности (Account, Goal, SavingsConfig, Recurrent extension), расширения (Category lim/rollover/paused/parent, ActualKind enum) и бизнес-правила (auto-roundup, rollover остатков на закрытии периода, atomic onboarding) работают через типизированные API endpoints с multi-tenant изоляцией через RLS.

**Verified:** 2026-05-10T00:55:00Z
**Status:** human_needed (17/17 truths verified — backend artifacts complete; 3 items require live-stack smoke testing)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Must-Haves)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | User can save monthly income — `PATCH /api/v1/me {income_cents}` round-trips through `GET /me` (BE-01) | ✓ VERIFIED | `app/api/routes/me.py:43` PATCH handler; `app/api/schemas/me_v10.py:35` `MePatchV10`; `app/db/models.py:172` `AppUser.income_cents`; `alembic/0012` adds column |
| 2   | User can manage accounts — full CRUD; exactly one primary; delete blocked if any txns/subscriptions reference (BE-02, BE-03) | ✓ VERIFIED | `app/api/routes/accounts.py` 5 endpoints (`@accounts_router.get/post/patch/delete/post`); `app/services/accounts.py:154/214/289` create/update/delete + `AccountHasTxnsError` (line 62); `delete_account` checks subscription.account_id refs + sole-primary guard; `ix_account_user_primary_one` partial unique index in 0012 |
| 3   | Account balance updates live — every actual_transaction insert/update/delete adjusts `account.balance_cents` synchronously (BE-03) | ✓ VERIFIED | `app/services/accounts.py:365` `apply_balance_delta` single-statement UPDATE…RETURNING; `app/services/actual.py` `create_actual_v10` / `delete_actual_v10` chain; `tests/services/test_accounts.py` (509 lines, 15 tests pass per SUMMARY) |
| 4   | Categories support plan + rollover + paused + parent_id — `PATCH /categories/:id` accepts all new fields (BE-04) | ✓ VERIFIED | `alembic/0013` adds 6 cols (plan_cents, code, ord, rollover, paused, parent_id) + composite FK; `app/db/models.py` Category extension (CONTEXT §Area 2 verbatim); CHECK rollover IN ('misc','savings'); composite FK fk_category_parent_composite |
| 5   | First onboarding seeds 8 default categories with new codes — food/cafe/home/transit/fun/gifts/health/subs (BE-05) | ✓ VERIFIED | `app/services/onboarding_v10.py:93-102` `DEFAULT_CATEGORIES` exactly 8 entries with these codes; `_upsert_seed_categories` invoked from `complete_v10` (line 386) |
| 6   | System «savings» Category exists for all onboarded users — code='savings', name='КОПИЛКА', kind=expense, ord='99', plan_cents=0, rollover='savings', paused=true (CONTEXT D-04) | ✓ VERIFIED | `app/services/onboarding_v10.py:103-110` `SYSTEM_SAVINGS_CATEGORY` exact match; `_upsert_savings_category` (line 340) idempotent on (user_id, code='savings'); `complete_v10` calls it as Step 6 |
| 7   | ActualKind enum has 4 values + parent_txn_id self-FK CASCADE works (BE-06) | ✓ VERIFIED | `alembic/0014:85-87` ALTER TYPE categorykind RENAME TO actualkind + ADD VALUE roundup, deposit (autocommit_block); parent_txn_id BIGINT NULL self-FK ON DELETE CASCADE; `app/db/models.py:69` `ActualKind` enum class; composite FK `fk_actual_parent_txn_composite` in 0015 |
| 8   | Roundup auto-creates child txn on expense when SavingsConfig.roundup_enabled — formula correct, skip rules honored, balance reduced by parent + roundup total (BE-07) | ✓ VERIFIED | `app/services/roundup.py:70` `compute_roundup_delta` integer ceiling; `:104` `should_skip` (delta==0 OR delta==base); `:137` `maybe_create_roundup_child` 3-gate early exit; `tests/services/test_roundup.py` (944 lines, 25 tests per SUMMARY) |
| 9   | `PATCH /savings/config` upserts SavingsConfig — toggle roundup_enabled + base ∈ {10, 50, 100} (BE-08) | ✓ VERIFIED | `app/api/routes/savings.py:83` PATCH /config; `app/services/savings.py:179` `upsert_config` INSERT…ON CONFLICT DO UPDATE; `app/api/schemas/savings.py:28` `SavingsConfigPatch` validates base; DB CHECK roundup_base IN (10,50,100) in 0014 |
| 10  | `GET /savings` aggregator returns {total, monthIn, config, goals} — DATA-MODEL §2.4 formulas (BE-09) | ✓ VERIFIED | `app/api/routes/savings.py:66` GET; `app/services/savings.py:89` `get_savings_snapshot` returns dict with all 4 keys; ABS-summing aggregator over kind in (roundup, deposit); month_in_cents = first day of MSK month |
| 11  | `POST /savings/deposit` creates deposit txn + optional goal bump — atomic single transaction (BE-10) | ✓ VERIFIED | `app/api/routes/savings.py:109` POST /deposit; `app/services/savings.py:282` `create_deposit` open-coded insert kind=deposit + apply_balance_delta + atomic Goal.current_cents bump in same flush window |
| 12  | Goal CRUD works — create/update/delete with target>0, due>today validators (BE-11) | ✓ VERIFIED | `app/api/routes/goals.py` 4 endpoints (get/post/patch/delete); `app/services/goals.py:115/153/194/236` CRUD; `GoalValidationError` (subclass of ValueError); `due > today` check in `_validate_due` |
| 13  | Subscription extended with day_of_month + account_id + posted_txn_id + index — DB schema present (BE-12) | ✓ VERIFIED | `alembic/0014` adds 3 cols (day_of_month INT2 CHECK 1..28, account_id FK→account RESTRICT, posted_txn_id FK→actual_transaction SET NULL) + partial index `ix_subscription_user_day` WHERE day_of_month IS NOT NULL |
| 14  | Subscription post/unpost flows work — idempotent (409 on re-post; 404 on unpost-without-post); balance restored on unpost (BE-13) | ✓ VERIFIED | `app/api/routes/subscriptions.py:210/275` POST/{id}/post + /unpost; `app/services/subscriptions.py:317-353/434` exception classes + post_subscription/unpost_subscription; composes `create_actual_v10` + `delete_actual_v10` (CASCADE drops roundup children, balance restored) |
| 15  | `close_period_job` runs rollover idempotently — advisory lock + rollover_processed_at + UNIQUE INDEX; savings creates deposit txn, misc accumulates virtually into next period (BE-14) | ✓ VERIFIED | `app/services/rollover.py:98` `do_period_rollover` with `pg_try_advisory_xact_lock` + processed_at gate; `app/worker/jobs/close_period.py:43,184` imports + calls do_period_rollover BEFORE expired.status flip; `uq_period_rolled` partial UNIQUE INDEX in 0014; `tests/jobs/test_close_period_rollover.py` (768 lines, 12 tests per SUMMARY) |
| 16  | `POST /api/v1/onboarding/complete` is atomic — body `{income_cents, accounts[], category_plans, goal?, savings_config?}`; 409 Conflict on re-onboard; reset via DELETE `/internal/onboarding/reset` (admin) (BE-15) | ✓ VERIFIED | `app/api/routes/onboarding_v10.py:54` POST /complete; `app/services/onboarding_v10.py:386/559` complete_v10 + reset_v10; `OnboardingConflictError` (line 129) → 409; `app/api/routes/internal_onboarding.py:83` DELETE /reset gated by `verify_internal_token` (inherited from internal_router) |
| 17  | Cross-tenant защита — RLS policies on account/goal/savings_config; composite FK on category.parent_id and actual_transaction.parent_txn_id reject cross-tenant linkage (BE-16) | ✓ VERIFIED | `alembic/0012:110` tenant_isolation_account; `alembic/0015:72,82` tenant_isolation_goal + tenant_isolation_savings_config; `alembic/0013:215` fk_category_parent_composite; `alembic/0015:126` fk_actual_parent_txn_composite; `tests/test_multitenancy_v1_0_columns.py` 16 tests across Sections A-F |

**Score:** 17/17 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `alembic/versions/0012_v10_user_account.py` | AppUser.income_cents + account + RLS | ✓ VERIFIED | 133 lines; tenant_isolation_account policy; partial unique on primary; CHECK balance ±100B kop |
| `alembic/versions/0013_v10_category_ext.py` | Category ext + composite FK + drop PlanTemplateItem | ✓ VERIFIED | 313 lines; 6 columns; composite UNIQUE ux_category_id_user; fk_category_parent_composite; PlanTemplateItem dropped + plan_cents backfill |
| `alembic/versions/0014_v10_actual_goal_savings.py` | actualkind enum + parent_txn_id + goal + savings_config + subscription ext | ✓ VERIFIED | 393 lines; autocommit_block ALTER TYPE; goal/savings_config tables; subscription extension; budget_period rollover columns + uq_period_rolled |
| `alembic/versions/0015_v10_rls_finalize.py` | RLS on goal/savings_config + composite FK on parent_txn_id | ✓ VERIFIED | 193 lines; both policies; ux_actual_id_user UNIQUE; fk_actual_parent_txn_composite |
| `alembic/versions/0016_v10_actual_account_id.py` | (Plan deviation) actual_transaction.account_id fix-up | ✓ VERIFIED (DEVIATION) | Added in plan 22.07 — schema gap deferred from 22.06; column + FK to account.id ON DELETE RESTRICT + ix_actual_account_id |
| `app/db/models.py` | Account/Goal/SavingsConfig/ActualKind/AccountKind/RolloverPolicy classes + extensions | ✓ VERIFIED | Account (305), Goal (857), SavingsConfig (897); enums at 69/87/95; AppUser.income_cents (172); BudgetPeriod misc_rollover_cents/rollover_processed_at (399/404); ActualTransaction.parent_txn_id (604) |
| `app/services/accounts.py` | CRUD + apply_balance_delta + delete-protection | ✓ VERIFIED | 425 lines; 7 functions + 2 exceptions; create/list/get/update/set_primary/delete/apply_balance_delta/get_primary_account |
| `app/services/roundup.py` | Formula + child txn hook | ✓ VERIFIED | 241 lines; compute_roundup_delta (pure int ceiling), should_skip, maybe_create_roundup_child, SavingsCategoryMissingError |
| `app/services/savings.py` | Aggregator + config upsert + deposit | ✓ VERIFIED | 427 lines; get_savings_snapshot/upsert_config/create_deposit |
| `app/services/goals.py` | CRUD + validators | ✓ VERIFIED | 269 lines; list/get/get_or_404/create/update/delete + GoalNotFoundError + GoalValidationError(ValueError) |
| `app/services/subscriptions.py` | post/unpost appended | ✓ VERIFIED | +165 lines (legacy untouched); SubscriptionAlreadyPostedError (317), SubscriptionNotPostedError (331), post_subscription (353), unpost_subscription (434) |
| `app/services/rollover.py` | Period rollover with idempotency | ✓ VERIFIED | 296 lines; do_period_rollover (3-layer protection); RolloverConfigError |
| `app/worker/jobs/close_period.py` | Calls do_period_rollover before status flip | ✓ VERIFIED | Line 43 imports; line 184 invokes BEFORE expired.status flip per CONTEXT §Area 3 |
| `app/services/onboarding_v10.py` | Atomic complete_v10 + reset_v10 | ✓ VERIFIED | DEFAULT_CATEGORIES (93-102) exactly 8 with codes; SYSTEM_SAVINGS_CATEGORY (103-110); complete_v10 (386) + reset_v10 (559); OnboardingConflictError (129); PlanExceedsIncomeError (145) |
| `app/api/schemas/{accounts,goals,savings,onboarding_v10,me_v10}.py` | Pydantic v2 strict + extra=forbid | ✓ VERIFIED | All 5 files exist with v2 ConfigDict(strict=True, extra='forbid'); validators for income/plans/base/codes |
| `app/api/schemas/subscriptions.py` | SubscriptionPostResponse + extension appended | ✓ VERIFIED | Line 112 SubscriptionPostResponse; SubscriptionV10Update + SubscriptionV10Extension added |
| `app/api/routes/{accounts,goals,savings,onboarding_v10,me,internal_onboarding}.py` | Wired routers | ✓ VERIFIED | All 6 files exist with route decorators; routers mounted in `app/api/router.py` lines 172/175/178/182/138/211 |
| `app/api/router.py` | include_router for all new routers | ✓ VERIFIED | accounts_router (172), goals_router (175), savings_router (178), me_router (182), onboarding_v10_router (138 — REPLACES legacy line 137 commented-out), internal_onboarding_router (211) |
| `app/api/routes/subscriptions.py` | /post + /unpost endpoints | ✓ VERIFIED | Lines 210/275 |
| `tests/services/{test_accounts,test_roundup,test_savings,test_goals,test_subscriptions_post,test_onboarding_v10}.py` | Service-layer tests | ✓ VERIFIED | 509+944+744+568+525+808 = 4098 lines total |
| `tests/jobs/test_close_period_rollover.py` | Rollover idempotency + branches | ✓ VERIFIED | 762 lines |
| `tests/api/test_*.py` | Integration tests for new endpoints | ✓ VERIFIED | 6 files: accounts_api (273), goals_api (185), savings_api (262), subscriptions_post_api (215), onboarding_v10_api (244), internal_onboarding_reset (394) |
| `tests/test_multitenancy_v1_0_columns.py` | BE-16 acceptance gate | ✓ VERIFIED | 775 lines, 16 tests; runtime_session via RUNTIME_DATABASE_URL for true RLS enforcement |
| `tests/test_migrations_v1_0.py` | Migration safety + backfill | ✓ VERIFIED | 716 lines, 22 tests; opt-in MIGRATION_ROUNDTRIP=1 destructive section |

**Artifact Score:** 24/24 verified

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| API → Service | accounts route | `accounts_service.create_account` etc. | ✓ WIRED | `app/api/routes/accounts.py` imports from `app.services.accounts`; 5 routes wrap 7 service functions; AccountNotFoundError → 404, AccountHasTxnsError → 409 |
| API → Service | goals/savings routes | service functions | ✓ WIRED | Routers import from corresponding service modules; exception mappers at route layer |
| Service → Service | create_actual_v10 chain | apply_balance_delta + maybe_create_roundup_child | ✓ WIRED | `app/services/actual.py` `create_actual_v10` calls both in same DB tx (verified per 22.07 SUMMARY) |
| Service → Service | complete_v10 → upsert_config + create_goal + Account inserts | onboarding_v10 module | ✓ WIRED | 11-step flow in single tx; local imports avoid circular deps (savings.py imports goals.py) |
| Migration ↔ Models | actualkind PG type ↔ ORM ActualKind | name="actualkind" PgEnum | ✓ WIRED | `app/db/models.py:69` ActualKind 4-valued bound to `actualkind` PG type; PlannedTransaction.kind also bound (per 22.05 decision; Pydantic restricts) |
| Migration ↔ Models | category_kind PG type ↔ ORM CategoryKind | name="category_kind" | ✓ WIRED | New 2-valued enum for Category.kind only (CONTEXT §Area 2) |
| Worker → Rollover | close_period_job → do_period_rollover | new period created BEFORE rollover | ✓ WIRED | `app/worker/jobs/close_period.py:184` invokes after new period creation, before status flip |
| Composite FK targets | category(id, user_id) UNIQUE in 0013 | ux_category_id_user | ✓ WIRED | Created before fk_category_parent_composite ADD CONSTRAINT |
| Composite FK targets | actual_transaction(id, user_id) UNIQUE in 0015 | ux_actual_id_user | ✓ WIRED | Created before fk_actual_parent_txn_composite |
| Edge filter | /api/v1/internal/* blocked at Caddy | inherited Caddyfile | ✓ INHERITED | Pre-existing infrastructure (per 22.14 SUMMARY); X-Internal-Token guard verified by 7-test suite |

**Key Link Score:** 10/10 wired

### Requirements Coverage (BE-01..BE-16)

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| BE-01 | 22.01, 22.05, 22.12, 22.13 | AppUser.income_cents + PATCH /me | ✓ SATISFIED | Migration 0012 + ORM + MePatchV10 schema + me_router |
| BE-02 | 22.01, 22.05, 22.06, 22.12, 22.13 | Account CRUD + primary uniqueness | ✓ SATISFIED | account table + ORM + 7 service functions + 5 routes + partial unique idx |
| BE-03 | 22.01, 22.06, 22.07 | Balance delta-accounting | ✓ SATISFIED | apply_balance_delta + create_actual_v10/delete_actual_v10 + delete-protection |
| BE-04 | 22.02, 22.05 | Category extension (plan/rollover/paused/parent) | ✓ SATISFIED | Migration 0013 + ORM + composite FK + CHECK constraints |
| BE-05 | 22.02, 22.11 | 8 default categories with new codes | ✓ SATISFIED | DEFAULT_CATEGORIES exact match; CONTEXT D-04 drops legacy 14-cat compat (override) |
| BE-06 | 22.03, 22.05 | ActualKind enum 4-valued + parent_txn_id | ✓ SATISFIED | autocommit_block ALTER TYPE; ORM ActualKind; composite FK in 0015 |
| BE-07 | 22.07 | Roundup formula + child txn hook | ✓ SATISFIED | compute_roundup_delta + should_skip + maybe_create_roundup_child + 944 LoC tests |
| BE-08 | 22.03, 22.08, 22.12, 22.13 | SavingsConfig PATCH | ✓ SATISFIED | Migration + ORM + service upsert_config + schema + route |
| BE-09 | 22.08, 22.12, 22.13 | Savings aggregator | ✓ SATISFIED | get_savings_snapshot + GET /savings + DATA-MODEL §2.4 formula |
| BE-10 | 22.08, 22.12, 22.13 | Manual deposit | ✓ SATISFIED | create_deposit + POST /savings/deposit + atomic goal bump |
| BE-11 | 22.03, 22.05, 22.08, 22.12, 22.13 | Goal CRUD | ✓ SATISFIED | goal table + ORM + 5 service functions + 4 routes + validators |
| BE-12 | 22.03, 22.05, 22.12 | Subscription extension | ✓ SATISFIED | day_of_month + account_id + posted_txn_id + partial index + ORM + extension schema |
| BE-13 | 22.09, 22.12, 22.13 | Subscription post/unpost | ✓ SATISFIED | post_subscription + unpost_subscription + 2 routes + 3 exception classes + 215 LoC API tests |
| BE-14 | 22.10 | close_period rollover | ✓ SATISFIED | do_period_rollover + close_period_job integration + 3-layer idempotency + 768 LoC tests |
| BE-15 | 22.11, 22.13, 22.14 | Atomic onboarding-complete + reset | ✓ SATISFIED | complete_v10 (11-step) + reset_v10 + onboarding_v10_router (replaces legacy) + internal_onboarding_router |
| BE-16 | 22.04, 22.15 | RLS + composite FK | ✓ SATISFIED | Both composite FKs + 3 tenant_isolation policies + 16-test acceptance gate |

**Requirements Coverage:** 16/16 SATISFIED

### Anti-Patterns Found

No anti-patterns found that block goal achievement. SUMMARY-reported deferred items are acknowledged as out-of-scope follow-ups (see Deferred Items section below).

### Behavioral Spot-Checks

DB-dependent tests cannot be run without a live Postgres instance (docker compose stack not running at verification time). Per scope guidance: "Tests can be assumed passing based on per-plan SUMMARY.md reports (each plan ran tests against live DB and reported X/Y passing). Re-run only if you suspect drift."

Static spot-checks performed:

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All 5 v1.0 alembic migrations exist | `ls alembic/versions/001[2-6]*.py` | 5 files (0012, 0013, 0014, 0015, 0016) | ✓ PASS |
| ORM defines all 3 new classes + 3 enums | `grep "class Account\|class Goal\|class SavingsConfig\|class ActualKind\|class AccountKind\|class RolloverPolicy" app/db/models.py` | 6 matches at lines 69/87/95/305/857/897 | ✓ PASS |
| All 8 service functions present | grep across services/{accounts,roundup,savings,goals,subscriptions,rollover,onboarding_v10}.py | All `def`s found | ✓ PASS |
| All 22 v1.0 endpoints wired | grep `@.*_router\.(get\|post\|patch\|delete)` across new route files | accounts:5, goals:4, savings:3, me:1, onboarding_v10:1, internal_onboarding:1, subscriptions /post & /unpost:2 = 17 v1.0-specific endpoints (set-primary inline + 5 templates 410-stubs raise total to 22 per 22.13 SUMMARY) | ✓ PASS |
| BE-16 test count = 16 | `grep -c "def test_" tests/test_multitenancy_v1_0_columns.py` | 16 | ✓ PASS |
| Migration safety test count = 22 | `grep -c "def test_" tests/test_migrations_v1_0.py` | 22 | ✓ PASS |
| RLS policies named per CONTEXT D-08 | `grep tenant_isolation_(account\|goal\|savings_config) alembic/versions/*` | 3 distinct policies, 3 CREATE + 3 DROP statements | ✓ PASS |
| Composite FKs for cross-tenant | `grep fk_(category\|actual)_parent_(txn_)?composite alembic/versions/*` | Both fk_category_parent_composite (0013) and fk_actual_parent_txn_composite (0015) present | ✓ PASS |
| Default categories exact match | grep DEFAULT_CATEGORIES in onboarding_v10.py | 8 codes: food/cafe/home/transit/fun/gifts/health/subs | ✓ PASS |
| System savings category | grep SYSTEM_SAVINGS_CATEGORY | code='savings', name='КОПИЛКА', ord='99', plan_cents=0, rollover='savings', paused=True | ✓ PASS |

### Human Verification Required

3 items require live-stack smoke testing (TG environment + running docker compose) — see frontmatter `human_verification` block. None block phase acceptance per scope: "Status routing: human_needed: list items requiring manual verification".

1. **Roundup end-to-end через TG Mini App / API** — service-layer covered by test_roundup.py (944 lines, 25 tests per SUMMARY); needs real authenticated TG initData round-trip
2. **close_period_job на полночь 1-го числа** — logic covered by test_close_period_rollover.py (768 lines, 12 tests per SUMMARY); needs calendar-day observation
3. **Onboarding atomicity на failure посередине** — covered by test_onboarding_v10.py (808 lines per SUMMARY); recommended dev smoke for final acceptance

## Deferred Items (Out-of-scope follow-ups)

Three items recorded in `deferred-items.md` — none block Phase 22 goal achievement:

| ID | Discovered During | Severity | Resolution |
| -- | ----------------- | -------- | ---------- |
| D-22-01 | Plan 22.10 | Resolved by 22.13 | `app/services/templates.py` legacy PlanTemplateItem import — stubbed as 410 Gone |
| D-22-02 | Plan 22.13 | WARNING (later phase) | Legacy `seed_default_categories` doesn't set Category.code/ord — affects only legacy v0.x test fixtures; v1.0 path uses onboarding_v10 which sets correctly |
| D-22-03 | Plan 22.13 | WARNING (later phase) | Legacy onboarding-using tests broken by v1.0 router replacement — intentional per CONTEXT D-04 |

D-22-02 and D-22-03 are **intentional consequences** of CONTEXT D-04 ("V0.x backward compat — drop полностью"). They affect only legacy test surface (test_categories.py, test_actual_crud.py, test_postgres_role_runtime.py reuse of `two_tenants` fixture), not Phase 22 functionality.

### Plan Deviations (documented & accepted)

- **Plan 22.07 added migration 0016** as Rule-3 deviation — closing schema gap (`actual_transaction.account_id`) deferred from 22.06. Smallest possible fix-up: column + FK + index, no backfill. Documented in plan 22.07 SUMMARY decisions.
- **Onboarding wave departs from ROADMAP SC#4** ("legacy 14-cat behavior") — CONTEXT §Area 1 supersedes with explicit "drop полностью" + new strict Pydantic v2 schema. See override in frontmatter.

## Gaps Summary

**No gaps.** All 17 must-haves verified, all 24 artifacts present, all 10 key links wired, all 16 BE requirements satisfied. Three behavioral end-to-end checks routed to human verification (per scope: only programmatic checks are auto-verified; runtime/scheduler/visual behavior requires TG stack).

The phase is acceptance-complete on the codebase side. Phase 23 (Design System Foundation) can begin once human spot-checks confirm the runtime behavior.

---

_Verified: 2026-05-10T00:55:00Z_
_Verifier: Claude (gsd-verifier)_
