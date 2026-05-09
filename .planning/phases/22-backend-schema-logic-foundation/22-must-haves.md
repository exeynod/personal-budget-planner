# Phase 22 — Must-Haves (goal-backward derivation)

This document rolls up the per-plan `must_haves` blocks into a phase-level acceptance signal that maps to the 5 Success Criteria from `ROADMAP.md` plus all 16 BE-XX requirements.

## Phase Goal (verbatim from ROADMAP)

> Backend готов поддержать v1.0 UI — все новые сущности (Account, Goal, SavingsConfig, Recurrent extension), расширения (Category lim/rollover/paused/parent, ActualKind enum) и бизнес-правила (auto-roundup, rollover остатков на закрытии периода, atomic onboarding) работают через типизированные API endpoints с multi-tenant изоляцией через RLS.

## Observable Truths (User-Verifiable)

1. **User can save monthly income** — `PATCH /api/v1/me {income_cents}` round-trips through `GET /me`. (BE-01)
2. **User can manage accounts** — full CRUD; exactly one primary; delete blocked if any txns/subscriptions reference. (BE-02, BE-03)
3. **Account balance updates live** — every actual_transaction insert/update/delete adjusts `account.balance_cents` synchronously. (BE-03)
4. **Categories support plan + rollover + paused + parent_id** — `PATCH /categories/:id` accepts all new fields. (BE-04)
5. **First onboarding seeds 8 default categories with new codes** — food, cafe, home, transit, fun, gifts, health, subs. (BE-05)
6. **System «savings» Category exists for all onboarded users** — code='savings', name='КОПИЛКА', kind=expense, ord='99', plan_cents=0, rollover='savings', paused=true. (CONTEXT D-04)
7. **ActualKind enum has 4 values + parent_txn_id self-FK CASCADE works** — DB-level migration 0014. (BE-06)
8. **Roundup auto-creates child txn on expense when SavingsConfig.roundup_enabled** — formula correct, skip rules honored, balance reduced by parent + roundup total. (BE-07)
9. **`PATCH /savings/config` upserts SavingsConfig** — toggle roundup_enabled + base ∈ {10, 50, 100}. (BE-08)
10. **`GET /savings` aggregator returns {total, monthIn, config, goals}** — DATA-MODEL §2.4 formulas. (BE-09)
11. **`POST /savings/deposit` creates deposit txn + optional goal bump** — atomic single transaction. (BE-10)
12. **Goal CRUD works** — create/update/delete with target>0, due>today validators. (BE-11)
13. **Subscription extended with day_of_month + account_id + posted_txn_id + index** — DB schema present. (BE-12)
14. **Subscription post/unpost flows work** — idempotent (409 on re-post; 404 on unpost-without-post); balance restored on unpost. (BE-13)
15. **`close_period_job` runs rollover idempotently** — advisory lock + rollover_processed_at + UNIQUE INDEX; savings creates deposit txn, misc accumulates virtually into next period. (BE-14)
16. **`POST /api/v1/onboarding/complete` is atomic** — body `{income_cents, accounts[], category_plans, goal?, savings_config?}`; 409 Conflict on re-onboard; reset via DELETE `/internal/onboarding/reset` (admin). (BE-15)
17. **Cross-tenant защита** — RLS policies on account/goal/savings_config; composite FK on category.parent_id and actual_transaction.parent_txn_id reject cross-tenant linkage. (BE-16)

## Required Artifacts

### Migrations
- `alembic/versions/0012_v10_user_account.py` — User.income_cents + account table + RLS (Plan 22.01)
- `alembic/versions/0013_v10_category_ext.py` — Category extension + composite FK + drop PlanTemplateItem (Plan 22.02)
- `alembic/versions/0014_v10_actual_goal_savings.py` — ActualKind enum + parent_txn_id + goal + savings_config + subscription ext + period rollover idempotency (Plan 22.03)
- `alembic/versions/0015_v10_rls_finalize.py` — RLS on goal/savings_config + composite FK on parent_txn_id (Plan 22.04)

### Models
- `app/db/models.py` — Account, Goal, SavingsConfig, ActualKind, AccountKind, RolloverPolicy classes; AppUser.income_cents; Category extension; Subscription extension; ActualTransaction.parent_txn_id + account_id; BudgetPeriod rollover columns; PlanTemplateItem deleted (Plan 22.05)

### Services
- `app/services/accounts.py` — CRUD + apply_balance_delta + delete-protection (Plan 22.06)
- `app/services/roundup.py` — formula + child txn hook (Plan 22.07)
- `app/services/savings.py` — aggregator + config upsert + deposit (Plan 22.08)
- `app/services/goals.py` — CRUD + validators (Plan 22.08)
- `app/services/subscriptions.py` — post/unpost appended (Plan 22.09)
- `app/services/rollover.py` — period rollover with idempotency (Plan 22.10)
- `app/worker/jobs/close_period.py` — calls do_period_rollover before status flip (Plan 22.10)
- `app/services/onboarding_v10.py` — atomic complete_v10 + reset_v10 (Plan 22.11)

### API
- `app/api/schemas/{accounts,goals,savings,onboarding_v10,me_v10}.py` — Pydantic v2 with strict + extra=forbid (Plan 22.12)
- `app/api/schemas/subscriptions.py` — appended SubscriptionPostResponse + extension (Plan 22.12)
- `app/api/routes/{accounts,goals,savings,onboarding_v10,me,internal_onboarding}.py` — wired routers (Plans 22.13, 22.14)
- `app/api/router.py` — include_router for all new routers
- `app/api/routes/subscriptions.py` — appended /post + /unpost endpoints

### Tests
- `tests/services/{test_accounts,test_roundup,test_savings,test_goals,test_subscriptions_post,test_onboarding_v10}.py` — service-layer tests (Plans 22.06-22.11)
- `tests/jobs/test_close_period_rollover.py` — rollover idempotency + branches (Plan 22.10)
- `tests/api/{test_accounts_api,test_goals_api,test_savings_api,test_onboarding_v10_api,test_subscriptions_post_api,test_internal_onboarding_reset}.py` — integration tests (Plans 22.13, 22.14)
- `tests/test_multitenancy_v1_0_columns.py` — BE-16 acceptance gate (Plan 22.15)
- `tests/test_migrations_v1_0.py` — migration safety + backfill (Plan 22.16)

## Key Links (Where Wiring Most Likely Breaks)

1. **API → Service** — Each route imports the right service module + maps domain exceptions to HTTP status (404, 409, 422). Plans 22.13 + 22.14 audit.
2. **Service → Service** — `create_actual_v10 → apply_balance_delta → maybe_create_roundup_child` chain in plan 22.07; `complete_v10 → upsert_config + create_goal + Account inserts` in plan 22.11.
3. **Migration ↔ Models** — `actualkind` PG type name vs `name="actualkind"` in PgEnum; `category_kind` for Category.kind. Plan 22.05 enforces correct binding.
4. **Worker → Rollover** — `close_period_job` → `do_period_rollover(period_id, user_id, next_period_id)` with the new period created BEFORE rollover (so misc carry has a target). Plan 22.10.
5. **Composite FK targets** — `category(id, user_id)` UNIQUE created in 0013; `actual_transaction(id, user_id)` UNIQUE created in 0015. Without these, composite FK ADD CONSTRAINT fails.
6. **Caddy edge filter** — `/api/v1/internal/*` blocked at edge so admin reset cannot leak to public network. Pre-existing infrastructure; Plan 22.14 inherits.

## Phase Acceptance Signal

Phase 22 is acceptance-complete when all of these exit 0:

```bash
pytest tests/test_multitenancy_v1_0_columns.py -x -q                              # BE-16 gate
pytest tests/test_migrations_v1_0.py -x -q                                        # Migration safety
pytest tests/services/test_accounts.py tests/services/test_roundup.py -x -q       # BE-02, BE-03, BE-07
pytest tests/services/test_savings.py tests/services/test_goals.py -x -q          # BE-08, BE-09, BE-10, BE-11
pytest tests/services/test_subscriptions_post.py -x -q                            # BE-13
pytest tests/jobs/test_close_period_rollover.py -x -q                             # BE-14
pytest tests/services/test_onboarding_v10.py -x -q                                # BE-15
pytest tests/api/test_accounts_api.py tests/api/test_goals_api.py -x -q           # BE-02, BE-11 wire
pytest tests/api/test_savings_api.py -x -q                                        # BE-08, BE-09, BE-10 wire
pytest tests/api/test_onboarding_v10_api.py -x -q                                 # BE-15 wire
pytest tests/api/test_subscriptions_post_api.py -x -q                             # BE-13 wire
pytest tests/api/test_internal_onboarding_reset.py -x -q                          # BE-15 reset
# Existing test suite still green:
pytest tests/test_categories.py tests/test_actual_crud.py tests/test_subscriptions.py -x -q
pytest tests/test_close_period_job.py -x -q
pytest tests/test_multitenancy_isolation.py -x -q
```

---

*Created 2026-05-10 by /gsd-plan-phase 22*
