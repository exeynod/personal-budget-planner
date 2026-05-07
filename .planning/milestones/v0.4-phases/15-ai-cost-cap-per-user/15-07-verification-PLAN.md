---
phase: 15-ai-cost-cap-per-user
plan: 07
type: execute
wave: 4
depends_on: [15-03, 15-04, 15-05, 15-06]
files_modified:
  - .planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
autonomous: false
requirements: [AICAP-01, AICAP-02, AICAP-03, AICAP-04, AICAP-05]

must_haves:
  truths:
    - "Все 28 RED-тестов из Plan 15-01 GREEN после Plans 15-02..06"
    - "Threshold-based property tests + AICAP-05 матрица всех закрыта"
    - "Никаких регрессий в существующих 200+ тестах"
    - "AdminUserResponse возвращает spending_cap_cents корректно через все 3 endpoints (list, invite, patch)"
    - "/me возвращает ai_spend_cents и ai_spending_cap_cents"
    - "Frontend build (npm run build) проходит без TS errors"
    - "STATE.md / ROADMAP.md / REQUIREMENTS.md обновлены: Phase 15 → Complete"
  artifacts:
    - path: ".planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md"
      provides: "Phase 15 verification report"
      contains: "AICAP-01"
    - path: ".planning/STATE.md"
      provides: "Updated milestone progress"
      contains: "Phase 15"
    - path: ".planning/ROADMAP.md"
      provides: "Phase 15 marked [x]"
      contains: "[x] **Phase 15"
    - path: ".planning/REQUIREMENTS.md"
      provides: "AICAP-01..05 marked [x]"
      contains: "[x] **AICAP-01"
  key_links:
    - from: ".planning/STATE.md"
      to: ".planning/ROADMAP.md"
      via: "milestone counters consistent"
      pattern: "Phase 15.*Complete"
---

<objective>
Wave 4: Integration verification + project state housekeeping.

1. Запустить полный pytest suite + frontend build → собрать matrix:
   - 28 new tests (Plan 15-01) → 28 GREEN
   - Existing 200+ tests → 0 regressions
   - Frontend tsc + build OK
2. Создать `.planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md` с:
   - Test results summary
   - Threat-model attestation (covered T-15-XX-YY → mitigated/accepted with evidence)
   - AICAP-01..05 traceability table
   - Manual verification checklist (live TG smoke может быть deferred per user pattern Phases 11-14)
3. Update STATE.md (milestone v0.4 → 5/5 phases complete; mark v0.4 complete если applicable).
4. Update ROADMAP.md (Phase 15 → [x]).
5. Update REQUIREMENTS.md (AICAP-01..05 → [x]).

Purpose: Sign-off Phase 15 + закрытие milestone v0.4.

Output: 1 new VERIFICATION.md + 3 patches.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md
@.planning/phases/15-ai-cost-cap-per-user/15-01-SUMMARY.md
@.planning/phases/15-ai-cost-cap-per-user/15-02-SUMMARY.md
@.planning/phases/15-ai-cost-cap-per-user/15-03-SUMMARY.md
@.planning/phases/15-ai-cost-cap-per-user/15-04-SUMMARY.md
@.planning/phases/15-ai-cost-cap-per-user/15-05-SUMMARY.md
@.planning/phases/15-ai-cost-cap-per-user/15-06-SUMMARY.md
@.planning/phases/13-admin-ui-whitelist-ai-usage/13-VERIFICATION.md
@.planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run full pytest suite + frontend build → collect results</name>
  <files>(no file modifications — этот task собирает evidence для Task 2)</files>
  <read_first>
    - .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md (template structure для verification report)
    - .planning/phases/13-admin-ui-whitelist-ai-usage/13-VERIFICATION.md (similar structure)
    - All 6 phase 15 SUMMARYs
  </read_first>
  <action>
**1.1 Backend full pytest** (must run inside docker stack with DB):

```bash
# Если scripts/run-integration-tests.sh существует — use it.
# Иначе — внутри контейнера:
docker compose exec api pytest -x --tb=short 2>&1 | tee /tmp/phase15-pytest.log
```

Соберите:
- Total tests collected
- Passed / failed / errors / skipped
- Конкретно: 28 new tests (5 files Plan 15-01) — все pass
- Existing tests — 0 regressions

Если есть скип-edge cases (например, `cachetools` not installed yet потому что image rebuild required — Plan 15-02 правит pyproject.toml но не пересобирает контейнер) — задокументируйте: указанные файлы скипались до image rebuild; после rebuild — зеленые.

**1.2 Frontend build**:

```bash
cd frontend
npx tsc --noEmit 2>&1 | tee /tmp/phase15-tsc.log
npm run build 2>&1 | tee /tmp/phase15-build.log
# (опционально) npm test 2>&1 | tee /tmp/phase15-vitest.log
```

Соберите exit codes + tail каждого лога.

**1.3 Manual smoke** (если live TG работает у dev — иначе deferred):

В live TG → Settings → видим AI расход. → AccessScreen → Лимит → 0 → Submit → Settings показывает «AI отключён» → /ai/chat → 429.

**1.4** Если что-то сломалось — fix + repeat. Не идём дальше пока не GREEN. Если cachetools image rebuild required: команда указана в memory `feedback-restart-services.md` («после правок кода сам пересобираю docker-сервисы (--build, не restart)»). Этим занимается developer самостоятельно.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && ls -la /tmp/phase15-pytest.log /tmp/phase15-tsc.log 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `/tmp/phase15-pytest.log` exists, last line shows "passed" with 28+ new tests counted
    - `/tmp/phase15-tsc.log` exists, exit 0 (no errors)
    - `/tmp/phase15-build.log` exists, build succeeded
    - Optional: live TG smoke walkthrough passes (or explicitly deferred per pattern from Phases 11-14)
  </acceptance_criteria>
  <done>Test artefacts collected, ready для verification report.</done>
</task>

<task type="auto">
  <name>Task 2: Create 15-VERIFICATION.md</name>
  <files>.planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md</files>
  <read_first>
    - .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md (template)
    - .planning/phases/13-admin-ui-whitelist-ai-usage/13-VERIFICATION.md (template alt)
    - All 6 plan SUMMARYs из Phase 15
    - /tmp/phase15-pytest.log (from Task 1)
    - .planning/REQUIREMENTS.md (AICAP-01..05 verbatim)
  </read_first>
  <action>
Создать `.planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md`:

```markdown
---
phase: 15-ai-cost-cap-per-user
status: complete | human_needed   # use 'human_needed' если live TG smoke deferred (mirroring Phase 11/12/13/14 pattern)
verified_at: <ISO date YYYY-MM-DD>
test_summary:
  total_tests_run: <int>
  new_tests_added: 28
  passed: <int>
  failed: <int>
  skipped: <int>
  regressions: 0
---

# Phase 15: AI Cost Cap Per User — Verification Report

## Goal Recap

(quote ROADMAP Phase 15 Goal verbatim)

## Requirements Traceability

| ID | Requirement | Plan(s) | Tests | Status |
|----|-------------|---------|-------|--------|
| AICAP-01 | spending_cap_cents BIGINT default ≈46500 | (existing alembic 0008 verified — Phase 13 already shipped column; verify default applied) | check via SELECT default | ✓ |
| AICAP-02 | enforce_spending_cap → 429 + Retry-After | 15-03 | tests/test_enforce_spending_cap_dep.py (6); test_ai_cap_integration.py (4) | ✓ |
| AICAP-03 | spend aggregated MSK month + 60s cache | 15-02 | tests/test_spend_cap_service.py (7) | ✓ |
| AICAP-04 | Settings shows self spend/cap; PATCH /admin/users/{id}/cap | 15-04 + 15-05 + 15-06 | test_admin_cap_endpoint.py (7); test_me_ai_spend.py (4) | ✓ |
| AICAP-05 | Test matrix: cap exceeded, reset, cap=0, edit | 15-01 + integration | All 28 tests (RED → GREEN) | ✓ |

## Test Results

### New Tests (Plan 15-01 + GREEN'ed by 15-02..06)
| File | Tests | Status |
|------|-------|--------|
| tests/test_spend_cap_service.py | 7 | <pass count>/7 GREEN |
| tests/test_enforce_spending_cap_dep.py | 6 | <pass count>/6 GREEN |
| tests/test_admin_cap_endpoint.py | 7 | <pass count>/7 GREEN |
| tests/test_me_ai_spend.py | 4 | <pass count>/4 GREEN |
| tests/test_ai_cap_integration.py | 4 | <pass count>/4 GREEN |

### Regression Check
| Existing test suite | Status |
|---------------------|--------|
| tests/test_admin_users_api.py | <pass count>/<total> — 0 regressions (AdminUserResponse extension non-breaking) |
| tests/test_me_returns_role.py | <pass count>/<total> — 0 regressions |
| tests/test_admin_ai_usage_api.py | <pass count>/<total> — 0 regressions (Phase 13 cents-scale unaffected) |
| Other 50+ test files | <pass count>/<total> — <regressions count> |

## Frontend Build

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | <exit code>: <stdout tail> |
| `npm run build` | <exit code>: bundle size, errors |

## Threat Model Attestation

(Aggregate threats T-15-01..T-15-06 from each Plan; mark mitigated/accepted with evidence.)

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-15-01-01 | Tampering (RED state) | mitigate | All 28 tests GREEN после Plans 15-02..06 |
| T-15-02-01 | Tampering (user_id from caller) | mitigate | Plan 15-03 enforce uses current_user.id from Depends; service trusts caller |
| T-15-02-04 | DoS via cache flood | accept | TTLCache(maxsize=128); whitelist 5-50 users; not realistic vector |
| T-15-03-01 | Info disclosure (own spent_cents in 429) | accept | self-data; expected UX |
| T-15-04-01 | Spoofing (member-as-owner) | mitigate | require_owner enforces 403; tested test_admin_cap_endpoint::test_member_forbidden_403 |
| T-15-04-02 | Tampering (extra fields) | mitigate | extra="forbid"; tested test_extra_fields_rejected_422 |
| T-15-04-03 | Tampering (huge cap overflow) | mitigate | Field(le=100_000_00) |
| T-15-05-01 | Info disclosure (own ai_spend_cents in /me) | accept | self-data |
| T-15-06-04 | UX safety (cap=0 self lockout) | accept | reversible via PATCH; future: confirmation dialog |

## Manual UAT

| Step | Expected | Actual |
|------|----------|--------|
| Settings: показывает $0.00 / $465.00 (для нового owner) | ✓ | <result> |
| AccessScreen: Лимит → bottom-sheet open | ✓ | <result> |
| Submit cap=0: Settings → «AI отключён» | ✓ | <result> |
| /ai/chat → 429 при cap=0 | ✓ | <result> |
| Submit cap=5.00: Settings → $0.00 / $5.00; /ai/chat → 200 | ✓ | <result> |

## Live TG Smoke Status

(Per Phases 11-14 deferred-pattern.) Live TG smoke deferred to milestone close — backend path covered through pytest, frontend через manual UAT в Telegram desktop dev shell. Document как `human_needed` if live TG with real BOT_TOKEN не tested.

## Decisions Resolved

- D-15-01..04 — implemented as specified.

## Carry-Forward / Deferred

(Per CONTEXT deferred-section)
- Migration `est_cost_usd → cost_cents BIGINT` — отдельная мини-фаза.
- Notifications «cap reached» — separate feature.
- Per-model pricing override — текущий est_cost_usd считается per-call.
- Redis cache — overkill для single-instance MVP.
- **Note**: CONTEXT D-15-02 explicit code (`ceil(usd * 100)`) puts spending_cap_cents в scale 100/USD; default 46500 = $465/мес (а не $5). Phase 13 admin AI Usage breakdown продолжает использовать scale 100_000/USD (legacy, not breaking). Calibration of cap unit recorded for v0.5 if needed.

## Status

`status: complete` (или `human_needed` если live TG не tested).
```

Заполните секции `<...>` фактическими значениями из Task 1 logs. Mirror структуру `14-VERIFICATION.md` точно.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && test -f .planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md && grep -c "AICAP-01\|AICAP-02\|AICAP-03\|AICAP-04\|AICAP-05" .planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md` exists
    - YAML frontmatter с status, verified_at, test_summary
    - All 5 AICAP-XX requirement IDs упомянуты в Traceability table
    - Threat model attestation таблица заполнена evidence
    - Manual UAT table заполнена
    - Test summary numbers соответствуют /tmp/phase15-pytest.log
  </acceptance_criteria>
  <done>15-VERIFICATION.md created с complete attestation.</done>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md, ROADMAP.md, REQUIREMENTS.md</name>
  <files>.planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md</files>
  <read_first>
    - .planning/STATE.md (current state)
    - .planning/ROADMAP.md (Phase 15 entry)
    - .planning/REQUIREMENTS.md (AICAP-01..05 entries lines 47-52)
  </read_first>
  <action>
**3.1 STATE.md** обновить:
- `progress.completed_phases: 5` (был 4)
- `progress.completed_plans: <add 7>` (Phase 15 added 7 plans)
- `progress.percent: 100` (если все 5 phases complete)
- `stopped_at`: «Phase 15 complete — 15-VERIFICATION.md status=<complete|human_needed>; <X> tests GREEN; 0 regressions; v0.4 milestone ready to close.»
- `last_updated`: `<ISO date>`
- `last_activity`: `<ISO date> -- Phase 15 verification complete (15-07)`
- `## Current Position`: `Phase 15 (ai-cost-cap-per-user) — COMPLETE`; `Status: Ready for milestone close`
- В `Performance Metrics` → добавить Phase 15 строку
- В `Accumulated Context` → `### Decisions` добавить:
  - `15-02 (<date>): cachetools added to deps; spend cents scale = 100/USD per CONTEXT D-15-02 explicit code (default 46500 = $465/mo); Phase 13 admin /ai-usage retains 100_000/USD scale (legacy, not breaking).`
  - `15-03 (<date>): enforce_spending_cap router-level dependency on /ai/* and /ai-suggest/*; cap=0 blocks all (spend>=0 trivial).`
  - `15-04 (<date>): PATCH /admin/users/{id}/cap; AdminUserResponse extended with spending_cap_cents (non-breaking).`
  - `15-05 (<date>): /me extended ai_spend_cents + ai_spending_cap_cents; required fields.`
  - `15-06 (<date>): Frontend SettingsScreen «AI расход» block + AccessScreen CapEditSheet bottom-sheet.`

**3.2 ROADMAP.md** обновить:
- Phase 15 entry → `- [x] **Phase 15: AI Cost Cap Per User** — 7/7 plans complete; status=<complete|human_needed>; <X> new tests GREEN; 0 regressions; alembic 0008 (existing) covers spending_cap_cents BIGINT.`
- `Plans:` line → 7 plans с тематикой
- `**Plans**: 7 plans` → list links к 7 PLAN.md и SUMMARY.md
- `### Milestone v0.4 (Active)` table → строка Phase 15 → `7/7` `Complete (...)` `<date>`
- (если все 5 phases done) → перевести milestone label с 🚧 на ✅:
  - Header: `- ✅ **v0.4 — Multi-Tenant & Admin** (Phases 11-15) — shipped <date>`
  - Move v0.4 details under `<details>` summary как v0.2/v0.3 done.
  - Если оставляем активным до live TG smoke — keep 🚧 и добавить «pending live TG smoke».

**3.3 REQUIREMENTS.md** обновить:
- AICAP-01..05 (lines 47-52) → переключить `[ ]` → `[x]` для всех пяти.
- Traceability table (lines 116-120) → `Pending` → `Complete`.
- (опционально) обновить «Coverage:» footer if all complete.

После всех правок — git status / commit (но commit делает orchestrator после plan-check; этот task просто пишет файлы).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && grep -c "AICAP-01\|AICAP-02\|AICAP-03\|AICAP-04\|AICAP-05" .planning/REQUIREMENTS.md | grep -E "[0-9]+" && grep -c "\\[x\\] \\*\\*Phase 15" .planning/ROADMAP.md && grep -c "Phase 15" .planning/STATE.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "\\[x\\] \\*\\*AICAP-0[1-5]" .planning/REQUIREMENTS.md` >= 5
    - `grep -c "\\[x\\] \\*\\*Phase 15" .planning/ROADMAP.md` >= 1
    - STATE.md `completed_phases: 5` (or appropriate increment)
    - STATE.md `last_activity` mentions "Phase 15"
    - STATE.md `Accumulated Context` section имеет 15-02..15-06 decisions
  </acceptance_criteria>
  <done>STATE.md / ROADMAP.md / REQUIREMENTS.md current; AICAP-01..05 all marked complete.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human approve Phase 15 verification</name>
  <action>Pause — wait for human to review 15-VERIFICATION.md + STATE/ROADMAP/REQUIREMENTS updates. See <how-to-verify> for steps.</action>
  <what-built>
Phase 15 complete. 7 plans shipped:
- 15-01: 28 RED tests
- 15-02: spend_cap service + cache + cachetools dep
- 15-03: enforce_spending_cap dependency + router wiring
- 15-04: PATCH /admin/users/{id}/cap + AdminUserResponse extension
- 15-05: /me extended with ai_spend_cents + ai_spending_cap_cents
- 15-06: Frontend SettingsScreen «AI расход» + AccessScreen CapEditSheet
- 15-07 (this plan): integration verification + STATE/ROADMAP/REQUIREMENTS update

VERIFICATION.md создан с full traceability + threat-model attestation.
  </what-built>
  <how-to-verify>
1. Откройте `.planning/phases/15-ai-cost-cap-per-user/15-VERIFICATION.md` — review test counts + threat-model.
2. `cat .planning/STATE.md | head -20` — проверьте `completed_phases: 5`.
3. `grep "Phase 15" .planning/ROADMAP.md` — verify [x] mark.
4. (Опционально) live TG: открыть Mini App → Settings → AI расход блок виден → AccessScreen → Лимит работает.

Approve если:
- Verification report полный (нет TODO в таблицах)
- Test results в STATE.md последовательны с фактическими `/tmp/phase15-pytest.log`
- ROADMAP/REQUIREMENTS marks консистентны
- (опционально) live TG OK ИЛИ deferred per Phase 11-14 pattern с `human_needed` status
  </how-to-verify>
  <resume-signal>Type "approved" если verification complete; "issues: <text>" если что-то требует исправления.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Plan execution → repository state | Verification artefact must accurately reflect tests |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-07-01 | Repudiation | future regression hides Phase 15 brittle parts | mitigate | Verification table перечисляет all artefacts по требованиям + threat-model attestation полная |
| T-15-07-02 | Tampering | manual sign-off without test evidence | mitigate | Task 1 collects /tmp/phase15-*.log; Task 2 must reference these logs in counts |
</threat_model>

<verification>
- 15-VERIFICATION.md полный с counts, traceability, threat-model.
- STATE.md / ROADMAP.md / REQUIREMENTS.md в синхроне.
- Optional: human approve в Task 4 checkpoint.
</verification>

<success_criteria>
- Phase 15 documented as complete (или human_needed pending live TG).
- Project counters incremented:
  - completed_phases: +1 (от 4 до 5)
  - completed_plans: +7 (от 29 до 36)
- AICAP-01..05 → [x] across REQUIREMENTS.md.
- ROADMAP.md Phase 15 → [x].
- v0.4 milestone status updated.
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-07-SUMMARY.md`.
</output>
