# Phase 40: Referral Mechanics — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped per session-override skip_discuss=true)

<domain>
## Phase Boundary

Viral acquisition: «Пригласи друга, оба получают 30 дней Pro». Attribution
через `tg_user_id` referrer-параметр в deeplink. Anti-abuse: 1 reward per
referrer в 30d, max 5/мес.

См. ROADMAP.md секция "Phase 40: Referral Mechanics" для полного списка
success criteria 1-5.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was
skipped per session-override `skip_discuss=true`. Use ROADMAP phase goal,
success criteria, и codebase conventions (см. CLAUDE.md «Conventions» секция).

Ключевые ориентиры из CLAUDE.md:
- Money: `BIGINT` копейки (если нужны денежные поля в reward log).
- TZ: расчёты periods в `Europe/Moscow`, БД в UTC.
- Single-tenant FK не вводим (FK на `app_user` отсутствует).
- Internal API защищены `X-Internal-Token`; пользовательские endpoint'ы —
  через TG initData HMAC.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Ключевые точки
интеграции (предположительно):
- `app_user` table — добавить `referral_code` (NOT NULL UNIQUE 8-char base32)
  и `referrer_id` (nullable, self-FK или UUID-ref в single-tenant модели).
- Phase 35 tier infra: `pro_active_until`, `/me/tier` endpoint — extend reward
  trigger при `payment_success` event.
- Phase 38 PostHog `trackEvent` уже есть — добавить events `referral_share`,
  `referral_signup`, `referral_reward_granted`.
- aiogram бот `/start` handler — парсить `?start=ref_<code>` параметр.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP success
criteria 1-5 и REQ-40-01..05 (если уже описаны в REQUIREMENTS.md; на момент
написания этой CONTEXT.md REQUIREMENTS.md не содержит REQ-40 секций — план
должен дефинировать REQ inline или создать секцию).

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
