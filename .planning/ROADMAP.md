# Roadmap: TG Budget Planner

## Milestones

- ✅ **v0.2 — MVP** (Phases 1-6) — shipped 2026-05-03 → [archive](milestones/v0.3-REQUIREMENTS.md) (full v0.2 traceability в v0.3 archive at close)
- ✅ **v0.3 — Analytics & AI** (Phases 7-10.2) — shipped 2026-05-06 → [archive](milestones/v0.3-ROADMAP.md)
- 🚧 **v0.4 — Multi-Tenant & Admin** (Phases 11-15) — active, planning 2026-05-06

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

### 🚧 v0.4 Multi-Tenant & Admin (Active)

- [x] **Phase 11: Multi-Tenancy DB Migration & RLS** — `user_id` FK во всех доменных таблицах + Postgres RLS + `app_user.role` колонка с backfill для существующего owner — 7/7 plans complete; status=human_needed (live TG smoke deferred per user); D-11-07-01/02 carry forward into the next phase
- [x] **Phase 12: Role-Based Auth Refactor** — 7/7 plans complete; status=human_needed (live TG smoke deferred per user pattern, mirroring Phase 11 U-1); D-11-07-01 + D-11-07-02 closed
- [ ] **Phase 13: Admin UI — Whitelist & AI Usage** — вкладка «Доступ» в «Управление» (только owner): список юзеров + invite/revoke + AI usage sub-tab с per-user breakdown
- [ ] **Phase 14: Multi-Tenant Onboarding** — invite-flow для `role=member` юзеров: bot bind → starting_balance → cycle_start_day → seed 14 категорий per-user + автогенерация embeddings
- [ ] **Phase 15: AI Cost Cap Per User** — `spending_cap_cents` (default $5/month) с enforcement → 429; Settings показывает текущий spend/cap; owner редактирует cap через Admin UI

## Phase Details

### Phase 11: Multi-Tenancy DB Migration & RLS
**Goal**: Все доменные данные изолированы по `user_id` на уровне БД (FK + RLS), существующие данные owner-юзера сохранены, схема готова к multi-tenant запросам.
**Depends on**: Nothing (foundation phase for v0.4)
**Requirements**: MUL-01, MUL-02, MUL-03, MUL-04, MUL-05, ROLE-01
**Success Criteria** (what must be TRUE):
  1. Все 9 доменных таблиц (`category`, `budget_period`, `plan_template_item`, `planned_transaction`, `actual_transaction`, `subscription`, `category_embedding`, `ai_conversation`, `ai_message`) имеют `user_id BIGINT NOT NULL FK → app_user.id` с unique constraints, scoped по `(user_id, ...)`.
  2. Postgres RLS policies включены на всех доменных таблицах: `user_id = current_setting('app.current_user_id')::bigint`; запрос без выставленного setting не возвращает строки.
  3. Alembic-миграция (offline + online) выполнена: backfill `user_id` для существующих данных через `OWNER_TG_ID`-юзера, после чего NOT NULL constraints применены без потери данных.
  4. `app_user` имеет колонку `role` (enum `owner` / `member` / `revoked`, default `member`); миграция установила `role=owner` для существующего OWNER_TG_ID-юзера.
  5. Все Python-слой queries фильтруют по `user_id` явно; интеграционный тест с двумя seed-юзерами подтверждает: юзер A не видит данных юзера B (даже при попытке обхода через прямой ID).
**Plans:** 7 plans
- [x] 11-01-PLAN.md — RED tests + 2-tenant fixture skeleton (Wave 1, parallel with 11-02) — completed 2026-05-06
- [x] 11-02-PLAN.md — Alembic single revision: enum + role + user_id + backfill + RLS + uniques + indexes (Wave 1, parallel with 11-01) — completed 2026-05-06
- [x] 11-03-PLAN.md — ORM models update (Mapped[user_id] + UserRole enum) (Wave 2) — completed 2026-05-06
- [x] 11-04-PLAN.md — Dependencies refactor (get_current_user_id + SET LOCAL) + dev_seed role=owner (Wave 3) — completed 2026-05-06
- [x] 11-05-PLAN.md — Service+route refactor part A (categories, periods, templates, planned, onboarding, settings) (Wave 4, parallel with 11-06) — completed 2026-05-06
- [x] 11-06-PLAN.md — Service+route refactor part B (actuals, subs, analytics, AI, internal_bot, worker) (Wave 4, parallel with 11-05) — completed 2026-05-06
- [x] 11-07-PLAN.md — Verification: fill RED tests + manual UAT + 11-VERIFICATION.md (Wave 5, has human checkpoint) — completed 2026-05-06; status=human_needed (live TG smoke pending)
**UI hint**: no

### Phase 12: Role-Based Auth Refactor
**Goal**: Auth-слой переключён с `OWNER_TG_ID`-equality на role-based проверки; frontend получает role через `/me` и может скрывать admin-функционал у members.
**Depends on**: Phase 11 (требует `app_user.role` колонку)
**Requirements**: ROLE-02, ROLE-03, ROLE-04, ROLE-05
**Success Criteria** (what must be TRUE):
  1. При первом запуске юзер с `tg_user_id == OWNER_TG_ID` автоматически получает `role = owner`; на последующих запросах `OWNER_TG_ID` больше нигде не сравнивается — auth полагается только на `role`.
  2. Юзер с `role = revoked` (или неизвестный `tg_user_id`) при любом API-запросе получает 403; юзер с `role IN ('owner', 'member')` проходит в `get_current_user`.
  3. Admin-only endpoints (отмеченные `require_owner`) возвращают 403 для members; для owner — отрабатывают как обычно. Тест покрывает оба сценария.
  4. `GET /api/v1/me` возвращает `{tg_user_id, role, onboarded_at, ...}`; frontend читает `role` из response и использует для conditional rendering admin-вкладки.
  5. Удалены все прямые eq-проверки `tg_user_id == OWNER_TG_ID` из request-pipeline (auth-слой, бот, worker); grep по codebase подтверждает.
**Plans**: 7 plans
- [x] 12-01-PLAN.md — RED tests + 2-tenant fixture для role/auth/postgres-role/bot helper (Wave 1)
- [x] 12-02-PLAN.md — Auth dependency refactor: get_current_user → AppUser ORM, require_owner, role-based whitelist (Wave 2)
- [x] 12-03-PLAN.md — /me endpoint extends with role + frontend MeResponse types (Wave 2, parallel with 12-02)
- [x] 12-04-PLAN.md — Bot OWNER_TG_ID removal: bot_resolve_user_role helper + cmd_start/_is_owner refactor (Wave 3)
- [x] 12-05-PLAN.md — Postgres role split (D-11-07-02): alembic 0007 + ADMIN_DATABASE_URL + docker-compose updates (Wave 3, parallel with 12-04)
- [x] 12-06-PLAN.md — Test fixture sweep (D-11-07-01): tests/helpers/seed.py + single_user fixture + 22 test files updated (Wave 4)
- [x] 12-07-PLAN.md — Verification: full pytest + alembic 0007 apply + 12-VERIFICATION.md + threat-model attestation (Wave 5, has human checkpoint) — completed 2026-05-07; status=human_needed (live TG smoke deferred)
**UI hint**: no

### Phase 13: Admin UI — Whitelist & AI Usage
**Goal**: Owner управляет whitelist'ом и видит AI-расходы по юзерам полностью через Mini App; никаких бот-команд.
**Depends on**: Phase 12 (требует `require_owner` и `role` в `/me`)
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, AIUSE-01, AIUSE-02, AIUSE-03
**Success Criteria** (what must be TRUE):
  1. В табе «Управление» owner видит пункт «Доступ»; member пункт не видит вовсе (backend-driven через `/me`).
  2. Экран «Доступ» содержит 2 саб-таба (underline sticky TabBar) — «Пользователи» и «AI Usage»; саб-таб «Пользователи» показывает список членов whitelist с last_seen_at, owner-строка без revoke-кнопки, остальные с inline-кнопкой «Отозвать».
  3. FAB «Пригласить» открывает bottom-sheet с полем `tg_user_id`; submit создаёт `app_user(role=member)` через `POST /api/v1/admin/users`; после `/start` в боте у приглашённого появляется доступ к onboarding (Phase 14 покроет flow).
  4. Revoke жмёт confirm-dialog с warning «Все данные юзера будут удалены безвозвратно»; подтверждение вызывает `DELETE /api/v1/admin/users/{user_id}` с cascade purge всех связанных данных (включая `ai_conversation`, `ai_message`, `category_embedding`); после revoke юзер получает 403 на любом запросе.
  5. Саб-таб «AI Usage» показывает per-user breakdown (имя, total tokens, est_cost_usd, % от spending_cap, индикатор ≥80% warn / ≥100% danger) за последние 30 дней + текущий месяц через `GET /api/v1/admin/ai-usage`.
**Plans**: TBD
**UI hint**: yes

### Phase 14: Multi-Tenant Onboarding
**Goal**: Приглашённый юзер (`role=member`) проходит self-onboarding в Mini App: связывает бота, сам выбирает starting_balance + cycle_start_day, получает 14 seed-категорий с готовыми embeddings — без участия owner.
**Depends on**: Phase 11 (per-user изоляция данных), Phase 12 (role-check для invite-flow)
**Requirements**: MTONB-01, MTONB-02, MTONB-03, MTONB-04
**Success Criteria** (what must be TRUE):
  1. Юзер с `role=member` после `/start` в боте получает приветственное сообщение «Добро пожаловать, открывайте Mini App для onboarding»; `tg_chat_id` сохраняется в `app_user`.
  2. До завершения onboarding любой доменный API-запрос (категории, транзакции, план, подписки) от этого юзера возвращает 409 с `{"error": "onboarding_required"}`; frontend перехватывает и редиректит в onboarding-flow.
  3. Onboarding-flow (scrollable-page по дизайну `006-B`) проходит шаги: bot bind → ввод starting_balance → выбор cycle_start_day → seed 14 категорий per-user (копия из default-набора, изолирована по `user_id`).
  4. По завершении onboarding для нового юзера автогенерируются embeddings для его 14 seed-категорий (background task через worker или inline async); первый AI-suggest-category для нового юзера возвращает корректные результаты без задержки на cold-start.
  5. Существующий owner (уже onboarded в v0.2/v0.3) проходит при следующем запросе без 409 — миграция считает его onboarded_at непустым; новый member после успешного onboarding также не получает 409.
**Plans**: TBD
**UI hint**: yes

### Phase 15: AI Cost Cap Per User
**Goal**: AI-расходы каждого юзера ограничены месячным cap'ом (default $5); при превышении API возвращает 429; owner может редактировать cap через Admin UI; юзер видит свой текущий spend в Settings.
**Depends on**: Phase 13 (Admin UI для PATCH cap)
**Requirements**: AICAP-01, AICAP-02, AICAP-03, AICAP-04, AICAP-05
**Success Criteria** (what must be TRUE):
  1. `app_user.spending_cap_cents BIGINT` существует с default ≈ 46500 коп. ($5 при ~93 ₽/$); миграция установила default для существующего owner; новые юзеры из Phase 14 onboarding получают тот же default.
  2. Перед каждым `/ai/chat` и `/ai/suggest-category` запросом backend агрегирует месячный spend юзера из `ai_usage_log` (group by `user_id`, scope = текущий календарный месяц Europe/Moscow), результат кешируется на 60 сек; при `spend ≥ spending_cap_cents` запрос возвращает 429 с `Retry-After` до начала следующего месяца.
  3. Settings экран показывает self-spend / cap (например, `$2.30 / $5.00`); юзеры видят только свой; owner дополнительно может редактировать `spending_cap_cents` для себя и других юзеров через `PATCH /api/v1/admin/users/{id}/cap` (UI — поле в admin row или sub-action).
  4. `cap_cents = 0` полностью отключает AI для юзера (любой `/ai/*` запрос → 429); изменение cap_cents принимается со следующего запроса (TTL кеша respect'ится).
  5. Тестовая матрица покрывает: превышение → 429 с корректным Retry-After; reset на 1-е число месяца → доступ возвращается; cap=0 → всегда 429; cap edit через PATCH → новый лимит действует на следующем запросе.
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

### Milestone v0.4 (Active)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Multi-Tenancy DB Migration & RLS | 4/7 | In progress | — |
| 12. Role-Based Auth Refactor | 6/7 | In Progress|  |
| 13. Admin UI — Whitelist & AI Usage | 0/? | Not started | — |
| 14. Multi-Tenant Onboarding | 0/? | Not started | — |
| 15. AI Cost Cap Per User | 0/? | Not started | — |

---
*Roadmap reorganized: 2026-05-06 at v0.3 milestone close*
*v0.4 phases added: 2026-05-06 (Phases 11-15, 28 requirements mapped)*
*v0.2 archived retroactively; v0.3 archive in `milestones/v0.3-ROADMAP.md`*
