# Phase 33: Compliance Baseline (152-ФЗ + ПДн + ToS + Privacy) — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (skip-discuss; user-authorized autonomous run).
**Branch:** `v1.0-maximal-poster`

<domain>
## Phase Boundary

**Goal.** Юридически подготовить продукт к публичному launch'у в РФ —
закрыть 152-ФЗ compliance baseline: явный consent на обработку ПДн
(checkbox на onboarding + /start), Privacy Policy + Terms of Service
(RU+EN markdown с обязательными секциями), право на удаление аккаунта
(`DELETE /api/v1/me/account` с 30-day cooling) + право на экспорт
(`GET /api/v1/me/export`), cookie banner на web Mini App, audit log
для consent-событий + готовый шаблон РКН-уведомления для manual
user-side submission.

### In Scope
1. **Alembic migration `0020_pdn_compliance.py`** — добавить
   `app_user.pdn_consent_at` (TIMESTAMPTZ NULL) + `app_user.deleted_at`
   (TIMESTAMPTZ NULL, для 30-day cooling) + новая таблица `pdn_audit_log`
   (id, user_id_hash, event_type ENUM, occurred_at, ip_hash NULL, metadata
   JSONB NULL) с GIN-индексом на metadata. RLS НЕ нужен для audit-log
   (single-tenant audit для оператора ПДн, owner-only read).
2. **Privacy Policy markdown (RU + EN)** — `docs/legal/privacy-policy.ru.md`
   + `docs/legal/privacy-policy.en.md`, обязательные секции per 152-ФЗ
   §10.1: оператор + контакты, цели обработки, виды ПДн, основания (consent),
   сроки хранения, права субъекта (доступ, исправление, удаление, отзыв),
   sub-processors (OpenAI EU), DPO contact (email автора). Помечены
   `Draft v0.1 — pending legal review`.
3. **Terms of Service markdown (RU + EN)** — `docs/legal/terms.ru.md` +
   `docs/legal/terms.en.md`. Включает: предмет договора, ограничения
   ответственности, billing terms (TBD в Phase 34), refund policy
   (TBD в Phase 34), forced arbitration clause OFF (РФ jurisdiction).
4. **Legal endpoints** — `GET /legal/privacy`, `GET /legal/terms`
   (отдельный sub-router без `get_current_user` dependency, public
   access; query param `?lang=ru|en`, default ru; возвращает
   `text/markdown; charset=utf-8` с raw markdown — frontend / Telegram
   рендерит как Markdown).
5. **Consent flow integration** — backend gate: `POST /onboarding/complete`
   проверяет, что `app_user.pdn_consent_at IS NOT NULL`. Без consent →
   403 `{"error": "pdn_consent_required", "privacy_url": "/legal/privacy"}`.
   Новый endpoint `POST /api/v1/me/consent` (idempotent) ставит
   `pdn_consent_at = now()` + пишет audit-event `granted`. Аналогичный
   endpoint `DELETE /api/v1/me/consent` (revoke) обнуляет flag + пишет
   `revoked` event.
6. **Data export endpoint** — `GET /api/v1/me/export` возвращает
   `application/json` со всеми ПДн user'a (app_user row + actual_tx +
   planned_tx + categories + subscriptions + ai_conversation + ai_message
   + accounts + goals + savings_config); audit-event `data_export`.
7. **Account deletion endpoint** — `DELETE /api/v1/me/account` ставит
   `app_user.deleted_at = now()` (soft-delete, 30-day cooling), пишет
   audit-event `deletion_requested`. Background job `purge_deleted_users_job`
   (APScheduler, daily @ 02:00 MSK) для user'ов с `deleted_at < now() - 30d`
   выполняет cascade hard-delete всех domain-таблиц через RLS-scoped
   SQL под `app` ролью. После hard-delete пишет `deletion_completed`
   audit-event с `user_id_hash` (raw user_id уже нет).
8. **Cookie banner (web Mini App)** — minimal banner: «Мы используем
   только обязательные cookies для работы приложения. Согласие на
   analytics-cookies можно дать в Настройки → Приватность». Component
   `<CookieBanner />` в `frontend/src/components/CookieBanner.tsx`,
   рендерится в `App.tsx` при первом visit (state в localStorage
   `cookie_consent_v1`), кнопка «Понятно» закрывает. Analytics consent
   toggle отложен — PostHog/Plausible appear в Phase 38.
9. **РКН notification template** — `docs/legal/RKN-NOTIFICATION.md` со
   статичным русским шаблоном для онлайн-формы pd.rkn.gov.ru (manual
   user-side submission). Содержит: наименование оператора, цели,
   категории ПДн, перечень субъектов, способы обработки, защита, срок
   хранения. После submission user руками вписывает reg-номер в `docs/COMPLIANCE.md`.
10. **`docs/legal/LEGAL-REVIEW-TODO.md`** — checklist для professional
    legal review. Items: (1) review privacy/tos для соответствия 152-ФЗ
    actual edition (на момент launch), (2) verify sub-processor list,
    (3) clarify cross-border data transfer disclosures, (4) review
    refund policy после Phase 34 ЮKassa integration.

### Out of Scope
- **Реальная подача в РКН** — manual user-side action; готовим только
  шаблон + checklist. User сам submit'ит через pd.rkn.gov.ru.
- **GDPR compliance** — отложено до v2.0 (EN expansion). Текущий scope —
  152-ФЗ + ПДн (РФ резиденты).
- **iOS UI consent screen** — iOS frozen per PRODUCT-STRATEGY Q4=b.
  Backend endpoints (`/api/v1/me/consent`, `/api/v1/me/export`,
  `DELETE /api/v1/me/account`) достаточны — iOS client v1.0.1 не
  модифицируется в этой фазе. iOS UI consent integration deferred to
  future iOS-specific phase когда client будет re-engaged.
- **Billing terms в ToS** — placeholder; Phase 34 ЮKassa integration
  добавит detail после merchant setup (refund window, recurring,
  чеки).
- **Real legal audit privacy/tos** — manual user action per
  `docs/legal/LEGAL-REVIEW-TODO.md`. Текущие документы — Draft v0.1.
- **PostHog/Plausible analytics consent toggle** — Phase 38 (Landing +
  Analytics). Cookie banner Phase 33 минимальный (info-only), full
  opt-in flow требует analytics platform который ещё не установлен.
- **Audit-log retention policy + archival** — текущая БД growth
  негативно не влияет (audit-events малочастотные); proper retention
  archival → v2.0.
- **Multi-language privacy/tos beyond RU/EN** — EN + RU достаточны для
  launch; CIS-расширение → v1.2+.

</domain>

<decisions>
## Implementation Decisions

### CMP-33-01: ПДн consent — single timestamp + audit-log table
- **Decision.** Не вводим отдельный `consent` enum / version-tracking.
  Один nullable column `pdn_consent_at TIMESTAMPTZ` в `app_user` + new
  `pdn_audit_log` таблица для всех consent-связанных events. Простая
  модель: `IS NULL` → consent отсутствует, гейтим operation; `IS NOT NULL`
  → granted at this time.
- **Action.** Migration 0020 (а) ADD COLUMN `pdn_consent_at` + `deleted_at`
  в app_user, (б) CREATE TABLE `pdn_audit_log` с event_type enum
  (`granted`, `revoked`, `data_export`, `deletion_requested`, `deletion_completed`).
- **Rationale.** За MVP launch'a достаточно tracking «согласился или
  нет». Version-tracking privacy policy (через `consent_version` FK) →
  отложено когда мы реально менять политику. Audit-log в отдельной
  таблице — separation of concerns, иначе app_user разрастается.
- **Reference.** 152-ФЗ §9.1 («согласие должно быть свободным, конкретным,
  информированным и сознательным»; explicit timestamp == proof).

### CMP-33-02: Soft-delete + 30-day cooling — APScheduler purge job
- **Decision.** `DELETE /api/v1/me/account` ставит `app_user.deleted_at`,
  НЕ выполняет immediate cascade hard-delete. APScheduler job
  `purge_deleted_users_job` (daily @ 02:00 MSK, advisory lock pattern из
  HLD §6) проходит по user'ам с `deleted_at < now() - 30d` + физически
  удаляет.
- **Rationale.** 30-day cooling — стандарт user-facing apps (Google,
  Apple, Telegram); даёт юзеру возможность передумать + recovery
  путь в случае mistaken delete. Per Phase 32 RLS infrastructure уже
  shipped — purge выполняется под `budget_admin` ролью (BYPASSRLS) для
  cascade по всем user-scoped таблицам.
- **Implementation detail.** Purge order: ai_message → ai_conversation →
  category_embedding → actual_transaction → planned_transaction →
  subscription → plan_template_item → budget_period → goal → savings_config →
  account → category → app_user. (Reverse-dependency order, no orphan
  FK violations.)
- **Reference.** v0.4 close_period_job pattern + advisory lock; Phase 32
  load-test confirmed cascade scales.

### CMP-33-03: Legal endpoints — public access, no auth, markdown response
- **Decision.** `/legal/privacy` + `/legal/terms` smonted на main app
  (без `/api/v1` prefix, без `get_current_user`). Возвращают
  `text/markdown; charset=utf-8`. Query param `?lang=ru|en` (default `ru`).
  Markdown файлы загружаются с диска (FS read), кешируются в process
  memory на startup для zero-latency response.
- **Rationale.** Privacy policy must быть accessible **до** Telegram-auth
  (юзер должен иметь возможность прочитать перед consent). Markdown
  rendered client-side (Mini App) или Telegram сам форматирует превью
  ссылки. Альтернатива — pre-rendered HTML — требует extra build step.
- **Caddy.** `/legal/*` НЕ должен прокидываться в internal blocks; Caddy
  forwards everything кроме `/api/v1/internal/*`. Документировано
  в Caddyfile.
- **Reference.** REQ-33-03; HLD §1 (Caddy routing).

### CMP-33-04: Consent gate на onboarding/complete (server-side enforcement)
- **Decision.** `POST /api/v1/onboarding/complete` теперь требует, чтобы
  `current_user.pdn_consent_at IS NOT NULL` — иначе 403 с
  `{"error": "pdn_consent_required", "privacy_url": "/legal/privacy"}`.
  Это первая bottleneck — без consent юзер не может пройти onboarding.
- **Client flow (web Mini App, документально).**
  1. Frontend на onboarding page 1 показывает checkbox «Я согласен
     на обработку ПДн» + link «Подробнее» → opens `/legal/privacy`
     в Telegram WebApp browser (или modal).
  2. После tick → `POST /api/v1/me/consent` (idempotent, ставит
     `pdn_consent_at = now()` + audit-event `granted`).
  3. После consent → user продолжает onboarding flow (page 2-4).
  4. На step 4 `POST /onboarding/complete` проходит gate.
- **Bot flow.** `/start` от user без `pdn_consent_at` шлёт сообщение
  с инлайн-кнопкой WebApp + текстом «Открой приложение, прими
  политику обработки данных и пройди настройку».
- **Rationale.** Server-side enforcement = single source of truth;
  никаких client-side bypass'ов. Idempotent endpoint избегает race
  conditions при double-tap checkbox.

### CMP-33-05: Cookie banner — info-only, не opt-in
- **Decision.** Минимальный banner: «Мы используем только обязательные
  cookies для работы приложения». Кнопка «Понятно» → closes banner +
  ставит `localStorage.cookie_consent_v1 = "acknowledged"`.
- **Что НЕ делаем.** Opt-in toggle для analytics — отложено до Phase 38
  (когда PostHog/Plausible реально будут installed). Если analytics
  отсутствует, banner это просто info notice; per 152-ФЗ + ст. 9
  cookie law банner для обязательных cookies info-only достаточен.
- **Rationale.** Минимизация scope; full opt-in flow требует
  installed analytics platform (Phase 38 dep).

### CMP-33-06: Data export — JSON dump, синхронный response
- **Decision.** `GET /api/v1/me/export` возвращает JSON-объект со
  всеми ПДн user'a за один request. Размер ограничен текущим
  domain-data объёмом (one user ≈ <10MB даже после года использования).
  Audit-event `data_export` пишется per call.
- **Что НЕ делаем.** Background async export + email-delivery —
  избыточно для текущего масштаба. CSV-export — отдельная фича
  (Phase 36 предусматривает `/export/csv` для accounting).
- **Schema response.**
  ```json
  {
    "user": {...app_user fields, no spending_cap, no created_at},
    "accounts": [...],
    "categories": [...],
    "budget_periods": [...],
    "plan_template_items": [...],
    "planned_transactions": [...],
    "actual_transactions": [...],
    "subscriptions": [...],
    "ai_conversations": [...],
    "ai_messages": [...],
    "goals": [...],
    "savings_config": null | {...},
    "audit_log": [...]
  }
  ```

### CMP-33-07: РКН notification — manual template, не automated submission
- **Decision.** `docs/legal/RKN-NOTIFICATION.md` — статичный шаблон,
  user копирует поля в онлайн-форму pd.rkn.gov.ru. После submission
  user руками пишет reg-номер в `docs/COMPLIANCE.md`.
- **Rationale.** Submission через pd.rkn.gov.ru требует ЭЦП или ЛК
  Госуслуг — automation невозможен без user-side credentials. Шаблон
  + checklist — practical minimum.

### CMP-33-08: Documentation — `docs/COMPLIANCE.md` + `docs/legal/` структура
- **Decision.** `docs/COMPLIANCE.md` — top-level compliance state-of-the-union
  (РКН reg-номер, дата подачи, контакт DPO, sub-processors list, retention
  schedule). `docs/legal/` — содержит privacy policy / ToS / РКН шаблон /
  legal-review-todo / audit-log retention policy.
- **Audience.** Owner / future legal counsel / Phase 37 open-core readers.

</decisions>

<code_context>
### Files affected

**Migrations:**
- `alembic/versions/0020_pdn_compliance.py` — NEW (CMP-33-01, schema additions).

**Models:**
- `app/db/models.py:148-192` (`AppUser`) — добавить `pdn_consent_at` +
  `deleted_at` колонки. NEW class `PdnAuditLog` + `PdnAuditEvent` PgEnum.

**API routes:**
- `app/api/routes/legal.py` — NEW (CMP-33-03), `legal_router` mounted на
  app-level (НЕ /api/v1).
- `app/api/routes/me.py` (extend) — NEW endpoints `POST /me/consent`,
  `DELETE /me/consent`, `GET /me/export`, `DELETE /me/account`.
- `app/api/routes/onboarding_v10.py:54-120` — добавить consent-gate в
  начало `complete_v10()`.

**Schemas:**
- `app/api/schemas/legal.py` — NEW (CMP-33-03 / CMP-33-06 response models).

**Services:**
- `app/services/pdn_audit.py` — NEW (write-only audit helper).
- `app/services/data_export.py` — NEW (CMP-33-06 export builder).
- `app/services/account_deletion.py` — NEW (soft-delete + purge).

**Worker:**
- `app/worker/jobs.py` (extend) — NEW `purge_deleted_users_job` (daily 02:00 MSK).
- `main_worker.py` — register new job.

**Frontend:**
- `frontend/src/components/CookieBanner.tsx` — NEW.
- `frontend/src/components/PdnConsentCheckbox.tsx` — NEW (used in onboarding step 1).
- `frontend/src/api/me.ts` — NEW endpoints (consent grant/revoke, export, delete).
- `frontend/src/App.tsx` — mount `<CookieBanner />`.

**Bot:**
- `app/bot/handlers.py:55-132` (`cmd_start`) — branch на `pdn_consent_at IS NULL`
  чтобы шлать prompt о принятии политики.
- `app/bot/auth.py:bot_resolve_user_status` — extend tuple to include
  `pdn_consent_at` (или новая helper).

**Tests:**
- `tests/test_pdn_consent.py` — NEW (CMP-33-01, CMP-33-04).
- `tests/test_legal_endpoints.py` — NEW (CMP-33-03).
- `tests/test_data_export.py` — NEW (CMP-33-06).
- `tests/test_account_deletion.py` — NEW (CMP-33-02).
- `tests/test_pdn_audit_log.py` — NEW (audit events).
- `tests/test_purge_deleted_users_job.py` — NEW (CMP-33-02 worker).

**Docs:**
- `docs/legal/privacy-policy.ru.md` — NEW.
- `docs/legal/privacy-policy.en.md` — NEW.
- `docs/legal/terms.ru.md` — NEW.
- `docs/legal/terms.en.md` — NEW.
- `docs/legal/RKN-NOTIFICATION.md` — NEW.
- `docs/legal/LEGAL-REVIEW-TODO.md` — NEW.
- `docs/COMPLIANCE.md` — NEW.

### Existing infrastructure (NOT modified, leveraged)
- `app/api/dependencies.py` — `get_current_user`, `require_onboarded`, `verify_internal_token`.
- `app/db/session.py:set_tenant_scope` — RLS GUC setter.
- `alembic/versions/0006_multitenancy.py` — RLS на 9 v0.4 tables.
- `alembic/versions/0019_owner_role_backfill.py` — Phase 32 latest revision.
- `app/worker/scheduler.py` — APScheduler PostgreSQL jobstore + advisory lock pattern.
- `app/bot/handlers.py:cmd_start` — existing onboarded-aware greeting branching.
- `app/api/router.py` — public_router / internal_router mounts.

### Reference research
- `.planning/research/v2-stream-A-multitenancy.md` (RLS pattern usable for purge job).
- `.planning/phases/32-multi-tenant-prod/32-VERIFICATION.md` (Phase 32 RLS green).

</code_context>

<specifics>
## Specific Ideas

**Suggested plan structure (6 plans, sequential with parallel waves):**

- **33-01: Schema migration + audit table** (REQ-33-02 base, REQ-33-04 base)
  - Alembic migration `0020_pdn_compliance.py`:
    - `ALTER TABLE app_user ADD COLUMN pdn_consent_at TIMESTAMPTZ NULL;`
    - `ALTER TABLE app_user ADD COLUMN deleted_at TIMESTAMPTZ NULL;`
    - `CREATE TYPE pdn_audit_event AS ENUM ('granted', 'revoked', 'data_export', 'deletion_requested', 'deletion_completed');`
    - `CREATE TABLE pdn_audit_log (id BIGSERIAL PK, user_id_hash VARCHAR(64) NOT NULL, event_type pdn_audit_event NOT NULL, occurred_at TIMESTAMPTZ DEFAULT now() NOT NULL, ip_hash VARCHAR(64) NULL, metadata JSONB NULL);`
    - Index on (event_type, occurred_at DESC).
    - Index GIN on metadata.
  - Models: extend `AppUser`, NEW `PdnAuditLog`, NEW `PdnAuditEvent` PgEnum.
  - `tests/test_pdn_consent.py` (smoke): migration upgrade/downgrade clean.
  - `app/services/pdn_audit.py`: `record_audit(db, user_id, event, ip=None, metadata=None)` helper (writes user_id hash via sha256, ip hash).

- **33-02: Privacy Policy + ToS markdown docs (RU+EN) + legal endpoints** (REQ-33-03, REQ-33-06)
  - `docs/legal/privacy-policy.ru.md` + `.en.md` (полный 152-ФЗ-compliant draft).
  - `docs/legal/terms.ru.md` + `.en.md` (Draft v0.1).
  - `app/api/routes/legal.py` — `legal_router` (no auth), `GET /legal/privacy`, `GET /legal/terms`,
    оба с `?lang=ru|en`.
  - `main_api.py` — mount `legal_router` без `/api/v1` prefix.
  - `tests/test_legal_endpoints.py`: 200, content-type, ru/en lang.

- **33-03: Consent endpoints + onboarding gate + bot prompt** (REQ-33-02)
  - `POST /api/v1/me/consent` (idempotent) + `DELETE /api/v1/me/consent`.
  - Onboarding-v10 service: добавить consent-gate в начало `complete_v10()`.
  - Bot `cmd_start`: branch на `pdn_consent_at IS NULL` → invite prompt.
  - `tests/test_pdn_consent.py` (full): full flow grant → onboarding-complete → revoke → onboarding-complete fails.
  - `tests/test_bot_handlers.py` (extend): bot prompt без consent.

- **33-04: Data export + account deletion endpoints + purge job** (REQ-33-04)
  - `GET /api/v1/me/export` (audit-event `data_export`).
  - `DELETE /api/v1/me/account` (soft-delete + audit-event `deletion_requested`).
  - `app/services/account_deletion.py` (purge function).
  - `app/worker/jobs.py:purge_deleted_users_job` (daily @ 02:00, advisory lock).
  - `tests/test_data_export.py` + `tests/test_account_deletion.py` + `tests/test_purge_deleted_users_job.py`.

- **33-05: Frontend — cookie banner + consent checkbox** (REQ-33-05, REQ-33-02 client)
  - `frontend/src/components/CookieBanner.tsx` (minimal info-only).
  - `frontend/src/components/PdnConsentCheckbox.tsx`.
  - `frontend/src/App.tsx`: mount CookieBanner.
  - Integration with onboarding step 1 (web): checkbox required before "Next" → calls `POST /me/consent`.
  - No frontend tests in this phase (covered by backend integration).

- **33-06: РКН template + compliance docs** (REQ-33-01)
  - `docs/legal/RKN-NOTIFICATION.md` (full template).
  - `docs/legal/LEGAL-REVIEW-TODO.md`.
  - `docs/COMPLIANCE.md` (state-of-compliance doc).

**Parallelization:**
- Wave 1: 33-01 (schema; blocks all others)
- Wave 2: 33-02 + 33-06 parallel (docs; no code dep)
- Wave 3: 33-03 + 33-04 parallel (endpoints; both consume 33-01 schema)
- Wave 4: 33-05 (frontend; consumes 33-03 endpoints)

</specifics>

<deferred>
## Deferred Ideas (NOT in Phase 33 scope)

- **Real legal audit of privacy/tos by lawyer** → manual user action per `docs/legal/LEGAL-REVIEW-TODO.md`.
- **РКН submission automation** → impossible without ЭЦП/Госуслуги; manual user-side.
- **GDPR compliance** → v2.0 (EN expansion).
- **iOS consent screen UI** → iOS frozen Q4=b; backend endpoints достаточны для server-side enforcement.
- **Billing terms in ToS** → Phase 34 (ЮKassa integration adds refund window, recurring detail).
- **Analytics opt-in toggle in cookie banner** → Phase 38 (PostHog/Plausible needed first).
- **Multi-language privacy/tos (beyond RU/EN)** → v1.2+.
- **Audit-log archival / retention policy enforcement** → v2.0 (current growth не критичен).
- **Versioned consent (`consent_version` FK)** → когда policy реально changes (v1.x).
- **Email/TG confirmation на DELETE /me/account** → 30-day cooling даёт recovery window;
  immediate confirmation via push отложено до Phase 35 (push subscription Pro feature).

</deferred>
</content>
</invoke>