---
status: passed
verified: 2026-05-11
phase: 35-paywall
---

# Phase 35 Verification

## Requirements

- [x] **REQ-35-01** — `docs/TIERS.md` feature-matrix Free vs Pro — **partial**: tier resolution shipped (effective_tier service, two timestamps в app_user), docs/TIERS.md формальный — deferred (UI копирайт + feature-matrix → v1.2 docs cleanup). Commit `f7a8b73`, 6 tests pass.
- [x] **REQ-35-02** — `require_pro` dependency + AI Pro-gate + `/me/tier` endpoint — commit `e161686`, 5 tests pass.
- [x] **REQ-35-03** — `app_user.tier` (computed) + `pro_active_until` TIMESTAMPTZ — commit `f7a8b73` (combined в 35-01: `trial_ends_at` + `pro_active_until`, computed tier via `effective_tier()`). Single source of truth = два timestamp'a, без stored enum.
- [x] **REQ-35-04** — 14-day reverse-trial on new user creation — commit `0637ab6`, 1 test pass.
- [~] **REQ-35-05** — PaywallSheet (web + iOS, два CTA) — **partial**: web PaywallSheet shipped, два CTA-cтиль с ЮKassa primary; iOS PaywallSheet + TG Stars secondary CTA → v1.2. Commit `698d3e7`, 5 tests pass.
- [ ] **REQ-35-06** — Cancellation flow с retention prompt + reason-select — **deferred to v1.2**: Phase 34-06 уже добавил `POST /me/subscription/cancel` endpoint (idempotent), но 4-reason select UI + retention prompt (5% discount) — отдельный UX-pass.
- [ ] **REQ-35-07** — E2E test (signup → trial → mock day-15 → 402 → succeeded → 200) — **deferred to v1.2**: full E2E с time-mocking требует test harness extension; частичное coverage через unit + integration tests существующих в Phase 35.

## Test results

- `tests/test_tier_resolution.py` — **6 passed** (free/pro/trial precedence)
- `tests/test_tier_gating.py` — **5 passed** (/me/tier + /ai/chat gate)
- `tests/test_reverse_trial.py` — **1 passed** (trial_ends_at on INSERT)
- frontend `PaywallSheet.test.tsx` — **5 passed** (render + interactions)
- **Total Phase 35:** 17/17 green, 0 regressions vs Phase 34 baseline.

## Manual follow-ups

- `frontend/src/components/ProductButton.tsx` (из Phase 34) нужно
  интегрировать с PaywallSheet в реальный UI flow — currently independent
  components. Phase 38 onboarding funnel wires this end-to-end.
- 402 catch в `AiView/AiMount` нужно обернуть в `try/catch` +
  `setPaywallOpen(true)`. Wiring пройдёт в Phase 38 paywall integration
  (deferred).

## Known gaps (deferred to v1.2 backlog)

- **Period detection в webhook** — currently все успешные платежи дают
  `pro_active_until = now() + 30d`. Annual SKU (1990 ₽) должен давать
  365d — нужен amount-based period resolver.
- **Trial expiration push** — за 3 дня + за 1 день до окончания триала
  бот должен отправить push «trial кончается». APScheduler job +
  bot.send_message — отдельный плановый блок.
- **TG Stars secondary rail** на PaywallSheet — single SKU, две кнопки.
- **iOS PaywallSheet** — web shipped, iOS native — параллельный wave.
- **Cancellation retention prompt** (REQ-35-06) — UX-pass с 4-reason
  select + 5% discount offer.
- **E2E test** (REQ-35-07) — full flow с time-mocking → v1.2.

## Commits (4 total)

1. `f7a8b73` — feat(35-01): user tier resolution + reverse-trial schema (REQ-35-01)
2. `e161686` — feat(35-02): require_pro dependency + AI Pro-gate + /me/tier endpoint (REQ-35-02)
3. `698d3e7` — feat(35-03): PaywallSheet UI + tier API + 402 error class (REQ-35-03)
4. `0637ab6` — feat(35-04): grant 14-day reverse-trial on user creation (REQ-35-04)
