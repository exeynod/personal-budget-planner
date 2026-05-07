# Requirements: TG Budget Planner — Milestone v0.4

**Defined:** 2026-05-06
**Milestone Goal:** Превратить single-tenant pet в multi-user приложение с whitelist-управлением через UI-админку. 5-50 closed whitelist, без биллинга. Owner управляет доступом сам, не через бот-команды.

## Milestone v0.4 Requirements

### Multi-Tenancy Core

- [x] **MUL-01**: Все доменные таблицы (`category`, `budget_period`, `plan_template_item`, `planned_transaction`, `actual_transaction`, `subscription`, `category_embedding`, `ai_conversation`, `ai_message`) имеют `user_id BIGINT NOT NULL FK → app_user.id` — alembic 0006 + ORM models; verified by test_user_id_backfilled_to_owner (Plan 11-07)
- [x] **MUL-02**: Postgres Row-Level Security (RLS) policies на всех доменных таблицах — `user_id = current_setting('app.current_user_id')::bigint` (defense-in-depth) — alembic 0006 ENABLE/FORCE ROW LEVEL SECURITY + 9 POLICY rows; verified by test_rls_* (Plan 11-07). Caveat: runtime postgres role is currently superuser → bypasses RLS at runtime; tracked as D-11-07-02 for Phase 12. Policies enforce correctly under non-superuser context (verified).
- [x] **MUL-03**: Все API queries фильтруют по `user_id` пользователя в Python-слое; RLS как backup (никогда не полагаемся только на RLS) — Plan 11-05 PART A (categories, periods, templates, planned, onboarding) + Plan 11-06 PART B (actuals/subs/analytics/AI/internal_bot/worker) complete; verified by test_user_a_* in test_multitenancy_isolation.py (Plan 11-07)
- [x] **MUL-04**: Уникальные constraints с `user_id`: `category(user_id, name)`, `subscription(user_id, name)`, `plan_template_item(user_id, category_id, ...)` — вместо глобальных — established in 11-02 alembic 0006, services use scoped queries since 11-05/11-06; verified by test_unique_category_name_scoped_per_user + test_category_unique_scoped_per_user (Plan 11-07)
- [x] **MUL-05**: Alembic-миграция выполняет backfill `user_id = (SELECT id FROM app_user WHERE tg_user_id = OWNER_TG_ID)` на существующих данных, потом устанавливает NOT NULL constraints — Plan 11-02 + verified by test_user_id_backfilled_to_owner (Plan 11-07) + manual upgrade/downgrade/upgrade cycle on dev DB

### Role-Based Auth

- [x] **ROLE-01**: `app_user` имеет колонку `role` (enum: `owner` / `member` / `revoked`), default = `member` для новых юзеров; миграция устанавливает `role=owner` для существующего OWNER_TG_ID-юзера — alembic 0006 (CREATE TYPE + ALTER TABLE + UPDATE) + ORM models (UserRole) + dev_seed; verified by test_user_role_enum_type_exists + test_role_owner_assigned_to_owner_tg_id (Plan 11-07)
- [ ] **ROLE-02**: При первом запуске юзер с `tg_user_id == OWNER_TG_ID` получает `role = owner`; OWNER_TG_ID больше не используется в auth-проверках на каждом запросе
- [ ] **ROLE-03**: Auth-dependency `get_current_user` пропускает только юзеров с `role IN ('owner', 'member')`; `revoked` → 403; неизвестный `tg_user_id` → 403
- [ ] **ROLE-04**: Admin-only endpoints защищены дополнительной dependency `require_owner` → 403 для юзеров с `role != 'owner'`
- [ ] **ROLE-05**: Endpoint `GET /api/v1/me` возвращает `{tg_user_id, role, onboarded_at, ...}` — frontend использует `role` для conditional admin tab visibility

### Admin UI — Whitelist

- [ ] **ADM-01**: В «Управление» добавляется пункт «Доступ» — visible только при `role === 'owner'` (backend-driven через `/me`); скрыт у members
- [ ] **ADM-02**: Экран «Доступ» содержит 2 саб-таба (underline sticky TabBar): «Пользователи» / «AI Usage»
- [ ] **ADM-03**: Саб-таб «Пользователи» — список членов whitelist с inline-кнопкой «Отозвать» (по скетчу `010-admin-whitelist`); owner-строка отображается без revoke-кнопки
- [ ] **ADM-04**: FAB «Пригласить» открывает bottom-sheet с полем `tg_user_id` (число); создаёт `app_user(role=member)` без bot-bind (юзер пройдёт onboarding сам после `/start` в боте)
- [ ] **ADM-05**: Revoke открывает confirm-dialog с warning «Все данные юзера будут удалены безвозвратно»; подтверждение → DELETE с purge всех связанных данных
- [ ] **ADM-06**: API: `GET /api/v1/admin/users` (список с last_seen_at), `POST /api/v1/admin/users` (invite by tg_user_id), `DELETE /api/v1/admin/users/{user_id}` (revoke + cascade purge)

### AI Usage Admin

- [ ] **AIUSE-01**: Саб-таб «AI Usage» в «Доступ» — список юзеров с total tokens и est_cost_usd за last 30 дней + текущий месяц
- [ ] **AIUSE-02**: Endpoint `GET /api/v1/admin/ai-usage` возвращает per-user breakdown (расширение существующего `/ai/usage` с user-grouping)
- [ ] **AIUSE-03**: Каждая строка показывает: имя юзера, total tokens, est_cost, % от spending_cap, индикатор приближения к лимиту (≥80% = warn-стили, ≥100% = danger-стили)

### Multi-Tenant Onboarding

- [x] **MTONB-01**: Юзер с `role=member` после `/start` в боте → бот сохраняет `tg_chat_id` и пишет «Добро пожаловать, открывайте Mini App для onboarding»
- [x] **MTONB-02**: Onboarding для приглашённого: bot bind → starting_balance (сам выбирает) → cycle_start_day (сам выбирает) → seed 14 категорий (per-user копия из default-набора)
- [x] **MTONB-03**: При завершении onboarding для нового юзера автогенерируются embeddings для его 14 seed-категорий (background task через worker или inline async)
- [x] **MTONB-04**: Все доменные API-запросы от юзера до завершения onboarding → 409 с `{"error": "onboarding_required"}`; frontend перехватывает и редиректит в onboarding flow

### AI Cost Cap Per User

- [ ] **AICAP-01**: `app_user` имеет колонку `spending_cap_cents BIGINT` (default = $5/month в копейках USD ≈ 46500 коп. при курсе ~93 ₽/$); миграция устанавливает default для существующего owner
- [x] **AICAP-02**: Перед каждым `/ai/chat` и `/ai/suggest-category` запросом проверяется месячный spend юзера; при превышении `spending_cap_cents` → 429 с `Retry-After` (до начала следующего календарного месяца)
- [x] **AICAP-03**: Per-user spend агрегируется из `ai_usage_log` по `user_id` за текущий календарный месяц (Europe/Moscow); запросы кешируются на 60 сек для производительности
- [x] **AICAP-04**: Settings экран показывает текущий spend / cap для self; owner может редактировать `spending_cap_cents` для себя и других юзеров через Admin UI (PATCH `/admin/users/{id}/cap`)
- [ ] **AICAP-05**: Тесты: при превышении cap → 429; при reset месяца → доступ возвращается; cap=0 → AI отключён полностью; cap_cents изменение → принимается со следующего запроса

## Future Requirements (Deferred)

### Backups & Monitoring (deferred from v0.3 research)
- **BAK-01**: pg_dump → gzip → age-encrypt → Cloudflare R2 nightly
- **MON-01**: Sentry Cloud free integration
- **MON-02**: UptimeRobot для api/bot healthchecks
- **MON-03**: Healthchecks.io для worker cron-джоб

### Rate limiting (deferred from v0.3 research)
- **RL-01**: Cloudflare WAF
- **RL-02**: Caddy plugin rate limit
- **RL-03**: slowapi + Redis для per-endpoint limits

### Audit log (deferred from v0.3 research)
- **AUD-01**: append-only audit_log table для всех write-операций
- **AUD-02**: Admin UI экран «Аудит» с filters по user / action / date

### Other
- **BILL-01**: Биллинг / тарифы — не в scope, closed whitelist
- **MUL-EXT-01**: Регистрация любого TG-юзера (open signup) — не в scope, whitelist-only

## Out of Scope (v0.4)

| Feature | Reason |
|---------|--------|
| Бот-команды `/invite` / `/revoke` / `/list_users` | Все админ-действия через UI |
| Биллинг / тарифы | Closed whitelist (5-50 юзеров), денег не берём |
| Open self-signup | Только invite-only через owner |
| Multi-currency / семейный учёт / mobile-app | См. PROJECT.md Out of Scope |
| Cross-tenant aggregation (общая статистика) | Каждый юзер видит только свои данные; нет shared views |
| AI cost cap биллинг (top-up) | Cap = hard stop, не оплата за overage |
| Импорт/экспорт данных юзера | Не в scope; revoke просто purge без backup |
| Audit log в этом milestone | Deferred (см. Future Requirements) |
| Backups в R2 | Deferred (см. Future Requirements) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MUL-01 | Phase 11 | In progress (schema artifact ready in 11-02 alembic 0006; ORM mappings ready in 11-03; DB application + verify in 11-07) |
| MUL-02 | Phase 11 | In progress (RLS DDL in 11-02 alembic 0006; DB application + verify in 11-07) |
| MUL-03 | Phase 11 | PART A complete (Plan 11-05) + PART B complete (Plan 11-06: actuals, subs, analytics, AI, internal_bot, worker per-tenant); verify in 11-07 |
| MUL-04 | Phase 11 | Schema complete (11-02 alembic 0006); service-layer uses scoped queries (11-05 + 11-06); verify in 11-07 |
| MUL-05 | Phase 11 | In progress (backfill DDL in 11-02 alembic 0006; DB application + verify in 11-07) |
| ROLE-01 | Phase 11 | In progress (role enum + column DDL in 11-02 alembic 0006; UserRole + AppUser.role ORM mapping in 11-03; verify in 11-07) |
| ROLE-02 | Phase 12 | Pending |
| ROLE-03 | Phase 12 | Pending |
| ROLE-04 | Phase 12 | Pending |
| ROLE-05 | Phase 12 | Pending |
| ADM-01 | Phase 13 | Pending |
| ADM-02 | Phase 13 | Pending |
| ADM-03 | Phase 13 | Pending |
| ADM-04 | Phase 13 | Pending |
| ADM-05 | Phase 13 | Pending |
| ADM-06 | Phase 13 | Pending |
| AIUSE-01 | Phase 13 | Pending |
| AIUSE-02 | Phase 13 | Pending |
| AIUSE-03 | Phase 13 | Pending |
| MTONB-01 | Phase 14 | Complete |
| MTONB-02 | Phase 14 | Complete |
| MTONB-03 | Phase 14 | Complete |
| MTONB-04 | Phase 14 | Complete |
| AICAP-01 | Phase 15 | Pending |
| AICAP-02 | Phase 15 | Complete |
| AICAP-03 | Phase 15 | Complete |
| AICAP-04 | Phase 15 | Complete |
| AICAP-05 | Phase 15 | Pending |

**Coverage:**
- v0.4 requirements: 28 total
- Mapped to phases: 28 (100%)
- Unmapped: 0

**Phase distribution:**
- Phase 11 (Multi-Tenancy DB Migration & RLS): 6 reqs (MUL-01..05, ROLE-01)
- Phase 12 (Role-Based Auth Refactor): 4 reqs (ROLE-02..05)
- Phase 13 (Admin UI — Whitelist & AI Usage): 9 reqs (ADM-01..06, AIUSE-01..03)
- Phase 14 (Multi-Tenant Onboarding): 4 reqs (MTONB-01..04)
- Phase 15 (AI Cost Cap Per User): 5 reqs (AICAP-01..05)

---
*Requirements defined: 2026-05-06 for milestone v0.4 Multi-Tenant & Admin*
*Traceability filled: 2026-05-06 (roadmap created, Phases 11-15)*
