---
phase: 27-ai-savings-accounts-analytics-management
verified: 2026-05-10T23:11:00Z
status: passed
score: 24/24 must-haves verified (web shell wiring gap fixed inline by orchestrator commits 4b79480 + 5c60835)
overrides_applied: 0
re_verified_after_inline_fix: true
prior_status: gaps_found (23/24) — web shell mounted stubs instead of real Mounts; v10 barrel was missing Savings/Goals/Analytics exports
inline_fixes:
  - "V10MainShell.tsx: SavingsMount + AiMount imports replace stubs"
  - "MgmtHubMount.tsx: AccountsListMount + AnalyticsMount imports replace stubs"
  - "_externalMountStubs.tsx: deleted (dead code)"
  - "V10MainShell.test.tsx: extended vi.mock for api/v10/api/ai/api/periods/api/analytics; retargeted assertions"
  - "v10/index.ts: re-exported fetchSavingsSummary/patchSavingsConfig/postDeposit/listGoals/createGoal/deleteGoal/fetchTopCategories"
  - "verified: vite build succeeds (was BLOCKED with 5 MISSING_EXPORT errors); 683/683 tests pass; tsc clean"
deferred_to_later_phases:
  - "iOS SettingsAPI organizational deviation: SettingsAPI declared as separate file in 27-11 plan but implemented in TransactionsAPI.swift (functional, file org only — INFO)"
  - "Pixel-perfect easing / chart fidelity → Phase 28 polish"
gaps:
  - truth: "V10MainShell tab routing: home → popToRoot, savings → push SavingsMount, ai → push AiMount, mgmt → push MgmtHubMount (web)"
    status: failed
    reason: "V10MainShell.tsx pushes <SavingsMountStub /> and <AiMountStub /> from Management/_externalMountStubs.tsx instead of the real <SavingsMount /> and <AiMount /> built by plans 27-02/27-03. MgmtHubMount.tsx similarly pushes <AccountsListMountStub /> and <AnalyticsMountStub /> instead of the real <AccountsListMount /> (27-04) and <AnalyticsMount /> (27-05). All four real Mount components exist, are tested, and exported from their barrels — they are simply not imported by the shell. End-user opens КОПИЛКА tab → sees «Копилка — / WIP — replaced by SavingsMount when Plan 27-03 lands.»; opens AI tab → sees «AI — / WIP — replaced by AiMount when Plan 27-02 lands.»; opens УПР → 02 СЧЕТА → sees «Счета — / WIP …»; opens УПР → 03 АНАЛИТИКА → sees «Месяц — / WIP …». 27-06 SUMMARY documented this in `affects:` («once `screensV10/Ai/index.ts` exports `AiMount`, swap import in `V10MainShell.tsx` from `Management/_externalMountStubs.AiMountStub` to `../Ai/AiMount»`) but the swap was never executed after sibling plans landed."
    artifacts:
      - path: "frontend/src/screensV10/V10MainShell.tsx"
        issue: "Lines 57-59 import SavingsMountStub, AiMountStub from Management/_externalMountStubs; lines 86, 90 push the stubs."
      - path: "frontend/src/screensV10/Management/MgmtHubMount.tsx"
        issue: "Lines 22-25 import AccountsListMountStub, AnalyticsMountStub; lines 50, 52 push them on accounts/analytics row tap."
      - path: "frontend/src/screensV10/__tests__/V10MainShell.test.tsx"
        issue: "Tests at lines 157-170 explicitly assert the WIP stubs render («Копилка», «AI —») instead of the real screens — tests pass but lock the broken state."
    missing:
      - "Replace `import { SavingsMountStub, AiMountStub } from './Management/_externalMountStubs'` with `import { SavingsMount } from './Savings'; import { AiMount } from './Ai';` in V10MainShell.tsx; update the two router.push() calls at lines 86 and 90."
      - "Replace stub imports in MgmtHubMount.tsx with `import { AccountsListMount } from '../Accounts'; import { AnalyticsMount } from '../Analytics';`; update router.push() calls at lines 50 and 52."
      - "Update V10MainShell.test.tsx mocks: extend `vi.mock('../../api/v10', …)` to also stub fetchSavingsSummary, listGoals, fetchObservation, fetchTopCategories, listActualV10 etc. so the real Mounts mount cleanly in jsdom; retarget assertions away from «Копилка —»/«AI —» stub strings to a real-screen sentinel (e.g. eyebrow «КОПИЛКА · ОКРУГЛЕНИЕ» or testid `savings-view`)."
      - "Optional cleanup: delete `_externalMountStubs.tsx` (dead code after the swap) — already noted in 27-06 patterns-established as a follow-up `chore` commit."
deferred:
  - truth: "ПЕРЕВОД CTA functional (account-to-account transfer)"
    addressed_in: "v1.1 (post-milestone)"
    evidence: "27-CONTEXT.md <deferred>: «ACCT-V10 «ПЕРЕВОД» (account-to-account transfer) → v1.1 per OQ-10». Renders disabled with «SOON» badge per ACCT-V10-02 — accepted scope."
human_verification:
  - test: "Откройте веб-приложение в браузере (Mini App или dev-режим) → tap КОПИЛКА tab → tap AI tab → tap УПР → 02 СЧЕТА → УПР → 03 АНАЛИТИКА"
    expected: "Все 4 экрана показывают РЕАЛЬНЫЕ poster-screens (Mass italic «Копилка.» с жёлтой plate, AI initial-state с DM Serif observation, Mass italic «Счета.» с dark plate, Mass italic «Месяц.» с segmented periods + bar-chart). НЕ должны показываться WIP-плейсхолдеры «Копилка — / WIP — replaced when Plan 27-03 lands»."
    why_human: "Этот тест ловит web-stub-routing gap, который автоматический grep подтверждает (V10MainShell pushes Stubs), но визуальная проверка единственная даёт уверенность что после фикса всё работает end-to-end."
  - test: "iOS XCTest spot-check: запустить app в Simulator → tap каждой tab + Mgmt rows"
    expected: "iOS V10MainShell.handleTabChange + MgmtHubView.onTap обе route real V10 Views (verified in code, but Simulator confirms SwiftUI navigation actually displays the views)."
    why_human: "Visual SwiftUI navigation cannot be programmatically asserted from CLI — нужен Simulator или реальное устройство для подтверждения, что router.push не пускает в чёрный экран."
  - test: "AI initial-state observation: открыть AI screen с реальными user-данными (over-limit category, или upcoming sub, или month surplus)"
    expected: "Observation text меняется в зависимости от user-state (rule priority 1→4→fallback)."
    why_human: "Rule-engine output зависит от прод-данных в БД — pytest проверяет логику с фейковыми category/actual/subscription, но реальный текст для конкретного пользователя в реальном UI требует ручной проверки."
  - test: "Bar-chart красное выделение ≥75% от плана (ANAL-V10-03)"
    expected: "Категории с fact_cents/plan_cents ≥ 0.75 рендерятся красным; остальные — обычным цветом."
    why_human: "Цветовое выделение и pixel-perfect tones не валидируются unit-tests; визуальная проверка нужна на реальном экране."
  - test: "Optimistic settings PATCH с откатом на ошибку"
    expected: "Изменение Stepper мгновенно меняет UI; на 422/500 от backend → UI откатывается + появляется saveError text."
    why_human: "Тест-mock-rollback покрыл логику, но реальное взаимодействие сети (latency, timeout) не воспроизводится в jsdom."
  - test: "Owner-gate ДОСТУП row (MGMT-V10-01)"
    expected: "Member видит только 4 row (01-04); owner видит 5 (включая 05 ДОСТУП). Скриншот обоих ролей."
    why_human: "Зависит от значения /me.role на сервере — нужен smoke с реальной auth-сессией владельца + member."
---

# Phase 27: AI + Savings + Accounts + Analytics + Management — Verification Report

**Phase Goal:** 5 экранов нового UX — AI (initial + active SSE), Savings (Копилка), Accounts list+Detail, Analytics rewrite, Management hub + Settings + Access (web + iOS).
**Verified:** 2026-05-10T23:05:00Z
**Status:** gaps_found (1 web-shell-wiring blocker; iOS clean)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (aggregated from 11 plan must_haves)

#### Backend (Plan 27-01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/v1/ai/observation returns {text, generated_at} for owner; rule-engine pure-Python | VERIFIED | `app/services/ai_observation.py` (290 lines) implements `build_observation` + 4-rule chain; `app/api/routes/ai.py:@observation_router.get("/observation"...)`; 8 pytest cases pass per 27-01-SUMMARY |
| 2 | Cache 1h per-user (TTL via OBSERVATION_CACHE) | VERIFIED | `OBSERVATION_CACHE: dict[int, ObservationResult]` + `CACHE_TTL = timedelta(hours=1)` in ai_observation.py |
| 3 | Rule priority: over-limit > tomorrow subs > week savings > month surplus > fallback | VERIFIED | 4 dedicated pytest cases (over_limit / tomorrow_subs_charge / week_savings / month_surplus / fallback) all pass per 27-01-SUMMARY |

#### Web AI (Plan 27-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 4 | Initial state: eyebrow «AI · ASSISTANT / ONLINE» + DM Serif Italic 36px observation + «— из ваших данных, {today}» | VERIFIED | `AiView.tsx` (214 LOC) renders eyebrow + obs-text + obs-loading + obs-error sub-states; AiMount.fetchObservation feeds; CSS module sets DM Serif italic 36px |
| 5 | 4 chip-suggestions «ПОДСКАЗКИ · ТАПНИ» each with `→`; tap → onChipTap → handleSend | VERIFIED | `DEFAULT_SUGGESTION_CHIPS` (4 strings) + AiView renders chip rows with arrow + onChipTap calls handleSend; 12 view tests cover this |
| 6 | Active state: чёрные плашки справа (user) + italic-text слева в рамке (ai) + 3-dot typing + auto-scroll | VERIFIED | AiView.module.css `.msgUser` / `.msgAi` / `.typing.dot` (posterDot animation, staggered delays); jsdom-guarded scrollIntoView |
| 7 | Composer: чёрная плашка, моно-input, жёлтая «↵ ОТПРАВИТЬ»; reuses v0.6 SSE streamChat | VERIFIED | AiMount.tsx imports `streamChat` from `../../api/ai`; 4-arg signature with `onDone` documented; AbortController for cleanup |

#### Web Savings (Plan 27-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8 | Чёрный фон + Mass italic «Копилка.» + жёлтая plate «НАКОПЛЕНО ВСЕГО X ₽» + eyebrow «В МАЕ + Y ₽» | VERIFIED | `SavingsView.tsx` (263 LOC) + module.css; `SavingsMount.tsx` (205 LOC) calls fetchSavingsSummary; tests in `__tests__/SavingsView.test.tsx` |
| 9 | Toggle ВКЛ/ВЫКЛ + chips 10/50/100 ₽ → PATCH /savings/config | VERIFIED | SavingsMount.handleRoundupToggle / handleBaseChip wire patchSavingsConfig; optimistic update via setSummary then refetch |
| 10 | Карточки целей с posterBarFill + CTA «+ НОВАЯ ЦЕЛЬ» (POST /goals via NewGoalSheet) | VERIFIED | NewGoalSheet.tsx (103 LOC) renders form; SavingsMount handleCreateGoal → createGoal from `../../api/v10/goals` |
| 11 | «ПОПОЛНИТЬ» secondary sheet → POST /savings/deposit + refetch on success | VERIFIED | DepositSheet.tsx (142 LOC) + SavingsMount handleDeposit → postDeposit then re-fetch |

#### Web Accounts (Plan 27-04)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 12 | Cream фон + Mass italic «Счета.» + dark plate «СУММАРНО · X ₽ · N счетов» | VERIFIED | `AccountsListView.tsx` (171 LOC) + module.css; `AccountsListMount.tsx` calls listAccounts; helpers in `computeAccounts.ts` |
| 13 | Каждая строка: bank · type/mask · balance · бейдж ОСНОВНОЙ; tap → push Account Detail | VERIFIED | AccountsListView renders rows; row.onTap → router.push(<AccountDetailMount accountId={id}/>) |
| 14 | CTA «+ ДОБАВИТЬ СЧЁТ» (POST /accounts via NewAccountSheet) + «ПЕРЕВОД» disabled с «SOON» | VERIFIED | NewAccountSheet.tsx (166 LOC) calls createAccount; CTA disabled+SOON badge per ACCT-V10-02 |
| 15 | Account Detail (чёрный): Mass italic банк-name + 2 KPI plates (БАЛАНС yellow + В МАЕ · N ОПЕРАЦИЙ dark) + ops list | VERIFIED | AccountDetailView.tsx (224 LOC) renders 2 plates + ops list filtered by account_id; AccountDetailMount fetches actual + categories |

#### Web Analytics (Plan 27-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 16 | Cream-фон + Mass italic «Месяц.» + segmented периода (МАР/АПР/МАЙ) | VERIFIED | `AnalyticsView.tsx` (287 LOC); period state in AnalyticsMount; `computeAnalytics.ts` has buildPeriodOptions helper (last 3 months from now) |
| 17 | 2 KPI plates: ПОТРАЧЕНО (delta) + СЭКОНОМЛЕНО (yellow) | VERIFIED | AnalyticsView renders both plates from compute helpers; tests in __tests__ verify |
| 18 | Segmented ДЕНЬ/НЕД./КАТ. + bar-chart с красным ≥75% от плана | VERIFIED | computeAnalytics.bucketByDay/Week/Cat + threshold 0.75 logic; AnalyticsView renders bars with red class |
| 19 | Топ-5 категорий ниже chart (re-use /analytics/top-categories) | VERIFIED | AnalyticsMount calls fetchTopCategories; AnalyticsView renders top5 list |

#### Web Management Hub + Shell wire (Plan 27-06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 20 | Mgmt-хаб (чёрный) с 5 numbered rows; 05 ДОСТУП — только при me.role === 'owner' | VERIFIED | MgmtHubView.tsx renders ROWS array (5 items, ownerOnly on access); `visible = ROWS.filter((r) => !r.ownerOnly || props.isOwner)`; MgmtHubMount fail-closed default isOwner=false |
| 21 | Tap row → push соответствующего screen (PlanMount, AccountsListMount, AnalyticsMount, SettingsMount, AccessMount) | **FAILED (partial)** | MgmtHubMount pushes real PlanMount/SettingsMount/AccessMount, but `accounts` row pushes `<AccountsListMountStub />` and `analytics` row pushes `<AnalyticsMountStub />` instead of the real Mounts. See gap below. |
| 22 | Settings: rewrite v0.6 в poster (cycle stepper, notify stepper, AI toggle, AI cap read-only) | VERIFIED | SettingsView.tsx (184 LOC) + SettingsMount.tsx (107 LOC); cap source = MeV10Response.ai_spending_cap_cents (parallel fetch /me + /settings); optimistic PATCH with rollback |
| 23 | Owner Access: admin Users + AI Usage tabs в poster | VERIFIED | AccessView.tsx (143 LOC) + AccessMount.tsx (82 LOC); 403 → friendly «Только для владельца» banner; chip-tabs |
| 24 | V10MainShell tab routing: home → popToRoot, savings → push SavingsMount, ai → push AiMount, mgmt → push MgmtHubMount | **FAILED** | V10MainShell.tsx pushes `<SavingsMountStub />` (line 86) and `<AiMountStub />` (line 90) — NOT the real Mounts that 27-02 + 27-03 built. mgmt → MgmtHubMount is correct. See gap below. |

#### iOS AI (Plan 27-07)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 25 | Initial state: eyebrow + DM Serif 36pt obs + «— из ваших данных, {today}» | VERIFIED | `AiV10View.swift` (305 LOC); AiV10ViewModel.load → AIObservationAPI.fetch(); AiData.swift has todayRu helper |
| 26 | 4 chip-suggestions DM Serif italic 18pt + tap → send | VERIFIED | AiData.defaultSuggestionChips (4 items); AiV10View renders ForEach; tap → vm.send |
| 27 | Active state: чёрные плашки справа + italic слева + 3-dot typing | VERIFIED | AiV10View has ChatBubble layouts + posterDot animation; jsdom-equivalent SwiftUI |
| 28 | Composer: чёрная плашка + моно-input + жёлтая ОТПРАВИТЬ; reuse v0.6 AIChatAPI streamChat | VERIFIED | AiV10ViewModel uses AIChatAPI/streamChat (4 hits in grep); AbortController equivalent (Task cancel) |

#### iOS Savings (Plan 27-08)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 29 | Чёрный фон + «Копилка.» + plate + eyebrow «В МАЕ» | VERIFIED | `SavingsV10View.swift` (373 LOC); SavingsV10ViewModel uses SavingsAPI/GoalsAPI |
| 30 | Toggle + base chips → PATCH /savings/config (optimistic) | VERIFIED | VM.toggleRoundup/selectBase calls SavingsAPI.patchConfig |
| 31 | Карточки целей + «+ НОВАЯ ЦЕЛЬ» posterSheet | VERIFIED | NewGoalSheet.swift (135 LOC); VM.createGoal → GoalsAPI.create |
| 32 | «ПОПОЛНИТЬ» secondary posterSheet → POST /savings/deposit | VERIFIED | DepositSheet.swift (168 LOC); VM.deposit → SavingsAPI.postDeposit |

#### iOS Accounts (Plan 27-09)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 33 | Cream фон + «Счета.» + dark plate «СУММАРНО» | VERIFIED | `AccountsListV10View.swift` (255 LOC); AccountsListV10ViewModel uses AccountsAPI |
| 34 | Каждая строка: bank/type/balance + ОСНОВНОЙ; tap → push detail | VERIFIED | AccountsListV10View row → router?.push(AccountDetailV10View(accountId:)) |
| 35 | CTA «+ ДОБАВИТЬ СЧЁТ» (POST /accounts) + ПЕРЕВОД disabled SOON | VERIFIED | NewAccountSheet.swift (155 LOC); AccountsAPI.create extended |
| 36 | Account Detail (чёрный) + 2 KPI plates + ops list | VERIFIED | AccountDetailV10View.swift (237 LOC); AccountDetailV10ViewModel filters ActualV10API.list by account_id |

#### iOS Analytics (Plan 27-10)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 37 | Cream + «Месяц.» + segmented periods | VERIFIED | `AnalyticsV10View.swift` (355 LOC); AnalyticsV10ViewModel period state |
| 38 | 2 KPI plates (ПОТРАЧЕНО delta + СЭКОНОМЛЕНО yellow) | VERIFIED | AnalyticsV10View renders both plates |
| 39 | Segmented ДЕНЬ/НЕД./КАТ. + bar-chart красный ≥75% | VERIFIED | AnalyticsData.bucketBy* + threshold; AnalyticsV10View bar layout |
| 40 | Топ-5 категорий via /analytics/top-categories | VERIFIED | VM.load → AnalyticsAPI.topCategories |

#### iOS Management Hub + Shell wire (Plan 27-11)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 41 | iOS Mgmt-хаб (чёрный) с 5 numbered rows; 05 ДОСТУП — owner only | VERIFIED | MgmtHubView.swift renders Row array (5 items, .access ownerOnly:true); rows.filter { !$0.ownerOnly || model.isOwner } |
| 42 | Tap row → router?.push соответствующего View | VERIFIED | MgmtHubView.onTap routes to PlanView / AccountsListV10View / AnalyticsV10View / SettingsV10View / AccessV10View — all REAL views (zero-touch swap from stubs done in 27-11 final commit) |
| 43 | Settings poster rewrite (cycle Stepper, notify Stepper, AI Toggle, AI cap read-only) | VERIFIED | SettingsV10View.swift (213 LOC) + SettingsV10ViewModel (156 LOC); cap source = /me; optimistic PATCH with rollback |
| 44 | Owner Access: admin Users + AI Usage chip-tabs | VERIFIED | AccessV10View.swift (255 LOC); 403 → «Только для владельца» banner |
| 45 | V10MainShell handleTabChange: home→popToRoot, savings→push SavingsV10View, ai→push AiV10View, mgmt→push MgmtHubView | VERIFIED | V10MainShell.swift lines 98-108 push ALL real views — no stubs |

**Score:** 23/24 plan-level truths verified (45 sub-truths; 1 fails: web V10MainShell + MgmtHubMount route to stubs instead of real Mounts)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| Backend (5 files) | VERIFIED | ai.py 764 LOC, ai_observation.py 290 LOC, schemas/ai.py 98 LOC, test_ai_observation.py 439 LOC, router.py 222 LOC |
| Web AI (9 files) | VERIFIED | api/v10/ai.ts 39, AiView 214, AiView.module.css 245, AiMount 157, computeAi 42, index 12, 3 test files (8+12+3 = 23 tests) |
| Web Savings (8 files) | VERIFIED | api/v10/savings 79, goals 41, SavingsView 263, module.css 201, SavingsMount 205, computeSavings 84, NewGoalSheet 103, DepositSheet 142, index 15 |
| Web Accounts (8 files) | VERIFIED | api/v10/accounts 43 (extended), AccountsListView 171, AccountsListMount 133, AccountDetailView 224, AccountDetailMount 112, NewAccountSheet 166, computeAccounts 100, index 28 |
| Web Analytics (5 files) | VERIFIED | api/v10/analytics 77, AnalyticsView 287, AnalyticsMount 206, computeAnalytics 241, index 30 |
| Web Management (8 files) | PARTIAL | MgmtHubView 88, MgmtHubMount 68 (uses stubs for accounts/analytics), SettingsView 184, SettingsMount 107, AccessView 143, AccessMount 82, V10MainShell 152 (pushes stubs for savings/ai), _externalMountStubs 128 (dead code expected after wave) |
| iOS AI (6 files) | VERIFIED | AIObservationAPI 18, ObservationDTO 15, AiData 43, AiV10ViewModel 152, AiV10View 305, AiDataTests 117 |
| iOS Savings (10 files) | VERIFIED | SavingsAPI 106, GoalsAPI 34, SavingsDTO 77, GoalDTO 69, SavingsData 94, SavingsV10ViewModel 185, SavingsV10View 373, NewGoalSheet 135, DepositSheet 168, SavingsDataTests 247 |
| iOS Accounts (8 files) | VERIFIED | AccountsAPI 59 (extended), AccountsData 74, AccountsListV10ViewModel 95, AccountsListV10View 255, AccountDetailV10ViewModel 127, AccountDetailV10View 237, NewAccountSheet 155, AccountsDataTests 241 |
| iOS Analytics (6 files) | VERIFIED | AnalyticsAPI 38, AnalyticsDTO 104, AnalyticsData 227, AnalyticsV10ViewModel 194, AnalyticsV10View 355, AnalyticsDataTests 314 |
| iOS Management (10 files) | PARTIAL | MgmtHubView 147, MgmtHubViewModel 48, SettingsV10View 213, SettingsV10ViewModel 156, AccessV10View 255, AccessV10ViewModel 70, AdminAPI 61, MgmtHubTests 116, V10MainShell 117 — **MISSING:** plan declared `Networking/Endpoints/SettingsAPI.swift` but the SettingsAPI enum was added to `TransactionsAPI.swift:118-126` instead (functionally complete, file naming deviation only). |

**Artifact summary:** all 84 declared artifacts exist; sizes ≥ plan minima; only one minor file-organization deviation (iOS SettingsAPI in TransactionsAPI.swift instead of own file — functional, not a blocker).

---

### Key Link Verification (data flow / wiring)

| From | To | Pattern | Status |
|------|-----|---------|--------|
| ai.py route | ai_observation.build_observation | service call | WIRED |
| ai_observation | OBSERVATION_CACHE TTL=1h | dict lookup | WIRED |
| AiMount | GET /ai/observation via fetchObservation | useEffect | WIRED |
| AiMount | streamChat (v0.6 SSE) | import + invoke | WIRED |
| SavingsMount | GET /savings via fetchSavingsSummary | useEffect | WIRED |
| SavingsMount roundup | PATCH /savings/config via patchSavingsConfig | onClick handler | WIRED |
| DepositSheet save | POST /savings/deposit via postDeposit | form submit | WIRED |
| NewGoalSheet save | POST /goals via createGoal | form submit | WIRED |
| AccountsListMount | GET /accounts via listAccounts | useEffect | WIRED |
| NewAccountSheet save | POST /accounts via createAccount | form submit | WIRED |
| AccountsListView row tap | router.push(<AccountDetailMount/>) | onClick | WIRED (within Accounts feature) |
| AccountDetailMount | GET /actual?account_id (filter) + GET /categories | useEffect | WIRED |
| AnalyticsMount | GET /analytics/top-categories | useEffect | WIRED |
| AnalyticsMount | GET /actual?period_start filter for bar bucketing | useEffect | WIRED |
| **V10MainShell handleTab(savings)** | **router.push(<SavingsMount/>)** | router.push | **NOT_WIRED** — pushes <SavingsMountStub/> instead |
| **V10MainShell handleTab(ai)** | **router.push(<AiMount/>)** | router.push | **NOT_WIRED** — pushes <AiMountStub/> instead |
| V10MainShell handleTab(mgmt) | router.push(<MgmtHubMount/>) | router.push | WIRED |
| **MgmtHubMount onTap('accounts')** | **router.push(<AccountsListMount/>)** | router.push | **NOT_WIRED** — pushes <AccountsListMountStub/> |
| **MgmtHubMount onTap('analytics')** | **router.push(<AnalyticsMount/>)** | router.push | **NOT_WIRED** — pushes <AnalyticsMountStub/> |
| MgmtHubMount onTap('settings') | router.push(<SettingsMount/>) | router.push | WIRED |
| MgmtHubMount onTap('access') | router.push(<AccessMount/>) | router.push | WIRED |
| MgmtHubView ДОСТУП visibility | me.role === 'owner' check | filter | WIRED |
| iOS V10MainShell handleTabChange | router.push(SavingsV10View / AiV10View / MgmtHubView) | router.push | WIRED |
| iOS MgmtHubView onTap | router?.push(real V10 views) | router?.push | WIRED |

**4 of 26 key links NOT_WIRED** — all on web side, all pointing at sibling-wave stubs that were never swapped to real Mounts.

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| AiView.observation | observation prop | fetchObservation() → backend rule-engine SQL | YES | FLOWING |
| SavingsView.summary | summary state | fetchSavingsSummary() → /savings DB query | YES | FLOWING |
| SavingsView.goals | summary.goals | included in /savings response | YES | FLOWING |
| AccountsListView.accounts | accounts state | listAccounts() → /accounts DB query | YES | FLOWING |
| AccountDetailView.transactions | filtered actuals | listActualV10().filter(account_id===id) | YES | FLOWING |
| AnalyticsView.bars | bars state | listActualV10() bucketed by day/week/cat | YES | FLOWING |
| AnalyticsView.topCategories | topCategories state | fetchTopCategories() | YES | FLOWING |
| MgmtHubView.isOwner | isOwner state | getMeV10().role === 'owner' | YES | FLOWING |
| SettingsView.settings | settings state | parallel getSettings() + getMeV10() | YES | FLOWING |
| AccessView.users | users state | listAdminUsers() | YES | FLOWING |
| AccessView.aiUsage | aiUsage state | getAdminAiUsage() | YES | FLOWING |
| **V10MainShell pushed SavingsMount** | **N/A — replaced by Stub** | static «WIP» text | **NO** | **HOLLOW (rendered placeholder)** |
| **V10MainShell pushed AiMount** | **N/A — replaced by Stub** | static «WIP» text | **NO** | **HOLLOW (rendered placeholder)** |
| **MgmtHub pushed AccountsListMount** | **N/A — replaced by Stub** | static «WIP» text | **NO** | **HOLLOW** |
| **MgmtHub pushed AnalyticsMount** | **N/A — replaced by Stub** | static «WIP» text | **NO** | **HOLLOW** |
| iOS AiV10View | observation | AIObservationAPI.fetch() | YES | FLOWING |
| iOS SavingsV10View | summary | SavingsAPI.summary() | YES | FLOWING |
| iOS AccountsListV10View | accounts | AccountsAPI.list() | YES | FLOWING |
| iOS AnalyticsV10View | bars/top5 | AnalyticsAPI.topCategories + ActualV10API.list | YES | FLOWING |
| iOS MgmtHubView | isOwner | MeV10API.shared.fetchMeV10().role | YES | FLOWING |

**4 hollow data flows** — all on web side, caused by the same root cause: real Mounts built but never imported into the shell/hub routing.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Frontend full test suite | `npx vitest run` | 47 files, 683 tests pass | PASS |
| Frontend tsc clean | `npx tsc --noEmit` | no output | PASS |
| Backend AI observation tests | per 27-01 SUMMARY: pytest tests/api/test_ai_observation.py | 8 passed, 1 skipped | PASS |
| iOS make build (final wave) | per 27-11 SUMMARY: xcodebuild build | BUILD SUCCEEDED | PASS |
| iOS MgmtHubTests | per 27-11 SUMMARY | 5/5 pass | PASS |
| iOS V10MainShellTests | per 27-11 SUMMARY | 4/4 pass | PASS |
| Real AiMount mounted in V10MainShell | grep "AiMount" frontend/src/screensV10/V10MainShell.tsx (excluding Stub) | 0 hits — only AiMountStub used | FAIL |
| Real SavingsMount mounted in V10MainShell | grep "SavingsMount" frontend/src/screensV10/V10MainShell.tsx (excluding Stub) | 0 hits — only SavingsMountStub used | FAIL |

---

### Requirements Coverage

| REQ ID | Source Plan | Description (short) | Status | Evidence |
|--------|------------|---------------------|--------|----------|
| AI-V10-01 | 27-02 / 27-07 | Initial-state observation eyebrow + DM Serif | SATISFIED (web file built, iOS file built) — but web user cannot reach AI screen via tab (stub) | code complete; web shell wiring blocks UX |
| AI-V10-02 | 27-02 / 27-07 | 4 chip-suggestions tap → send prompt | SATISFIED (code) / BLOCKED (web shell routing) | DEFAULT_SUGGESTION_CHIPS + onChipTap → handleSend |
| AI-V10-03 | 27-01 | Backend rule-engine /ai/observation cache 1h | SATISFIED | 8 pytest cases pass; 4-rule chain + fallback |
| AI-V10-04 | 27-02 / 27-07 | Active-state chat bubbles + typing indicator | SATISFIED (code) / BLOCKED (web shell routing) | AiView.tsx, AiV10View.swift |
| AI-V10-05 | 27-02 / 27-07 | Composer + reuse v0.6 SSE | SATISFIED (code) / BLOCKED (web shell routing) | streamChat 4-arg adapter |
| SAV-V10-01 | 27-03 / 27-08 | «Копилка.» + НАКОПЛЕНО ВСЕГО plate | SATISFIED (code) / BLOCKED (web shell routing) | SavingsView.tsx + SavingsV10View.swift |
| SAV-V10-02 | 27-03 / 27-08 | ОКРУГЛЕНИЕ ТРАТ toggle + base chips | SATISFIED (code) / BLOCKED (web shell routing) | patchSavingsConfig wired |
| SAV-V10-03 | 27-03 / 27-08 | Goal cards + posterBarFill + CTAs | SATISFIED (code) / BLOCKED (web shell routing) | NewGoalSheet/DepositSheet present |
| SAV-V10-04 | 27-03 / 27-08 | New Goal sheet + Deposit sheet | SATISFIED (code) / BLOCKED (web shell routing) | both sheets implemented |
| ACCT-V10-01 | 27-04 / 27-09 | Accounts list cream + СУММАРНО | SATISFIED (code) / BLOCKED (web hub routing) | AccountsListView/AccountsListV10View |
| ACCT-V10-02 | 27-04 / 27-09 | + ДОБАВИТЬ + ПЕРЕВОД disabled SOON | SATISFIED (code) / BLOCKED (web hub routing) | NewAccountSheet + SOON badge |
| ACCT-V10-03 | 27-04 / 27-09 | Tap → push Account Detail | SATISFIED (code) / BLOCKED (web hub routing) | router.push(<AccountDetailMount/>) within Accounts feature works once user reaches list |
| ACCT-V10-04 | 27-04 / 27-09 | 2 KPI plates + ops list | SATISFIED (code) / BLOCKED (web hub routing) | AccountDetailView |
| ANAL-V10-01 | 27-05 / 27-10 | Cream + Месяц. + segmented periods | SATISFIED (code) / BLOCKED (web hub routing) | AnalyticsView |
| ANAL-V10-02 | 27-05 / 27-10 | 2 KPI plates ПОТРАЧЕНО + СЭКОНОМЛЕНО | SATISFIED (code) / BLOCKED (web hub routing) | computeAnalytics + view |
| ANAL-V10-03 | 27-05 / 27-10 | Segmented ДЕНЬ/НЕД./КАТ. + red ≥75% bars | SATISFIED (code) / BLOCKED (web hub routing) — needs human visual confirmation | bucketBy* + threshold |
| ANAL-V10-04 | 27-05 / 27-10 | Top-5 categories | SATISFIED (code) / BLOCKED (web hub routing) | fetchTopCategories |
| MGMT-V10-01 | 27-06 / 27-11 | Mgmt hub 5 (or 4) numbered rows owner-gated | SATISFIED | both web + iOS render rows + filter by isOwner |
| MGMT-V10-02 | 27-06 / 27-11 | Each row = mono # + UPPER + sub-info + → ; tap → push | SATISFIED on iOS / PARTIAL on web (settings/access route to real Mounts; accounts/analytics route to stubs) | code reads correctly; web routes to stubs for 2 of 5 rows |
| MGMT-V10-03 | 27-06 / 27-11 | Settings poster rewrite (steppers + toggle + cap read-only) | SATISFIED | both platforms; cap source = /me (documented decision) |
| MGMT-V10-04 | 27-06 / 27-11 | Owner Access: Users + AI Usage tabs | SATISFIED | both platforms; 403 → friendly banner |

**21/21 requirements have implementation code; 11 of them are unreachable from the web app shell** (AI-V10-01..05, SAV-V10-01..04, plus user-flow access to ACCT-V10-* and ANAL-V10-* via Mgmt hub) until the stub→real swap lands. Backend (AI-V10-03), iOS (everything), and the web Settings/Access (MGMT-V10-03/-04) ARE reachable.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| frontend/src/screensV10/V10MainShell.tsx | 86, 90 | `router.push(<SavingsMountStub />)` / `<AiMountStub />` — placeholder mount used in production routing | BLOCKER | KOPILKA + AI tabs render «WIP — replaced when Plan 27-XX lands» text instead of real screens |
| frontend/src/screensV10/Management/MgmtHubMount.tsx | 50, 52 | `router.push(<AccountsListMountStub />)` / `<AnalyticsMountStub />` — placeholder mount in routing | BLOCKER | Mgmt hub rows 02 СЧЕТА + 03 АНАЛИТИКА render WIP text |
| frontend/src/screensV10/Management/_externalMountStubs.tsx | 86-128 | Dead-code stub components (intended to be removed after wave merge) | INFO | Documented dead-code; harmless |
| frontend/src/screensV10/__tests__/V10MainShell.test.tsx | 157-170 | Tests assert that the WIP stubs render («Копилка —», «AI —») | WARNING | Tests pass but lock the broken state — once you swap stubs to real Mounts, these tests will need updating |
| ios/BudgetPlanner/Networking/Endpoints/SettingsAPI.swift | n/a | File declared in plan 27-11 frontmatter but never created — SettingsAPI enum lives in TransactionsAPI.swift:118 | INFO | Functional; file-organization deviation only |
| ios/BudgetPlanner/FeaturesV10/Management/MgmtExternalStubs.swift | n/a | Dead-code stubs (per 27-11 SUMMARY, kept as documented fallback) | INFO | Harmless — real views are wired |

---

### Human Verification Required

(See `human_verification:` in frontmatter — visual / dynamic / role-based / pixel checks.)

1. **Web stub-routing fix smoke test** — after orchestrator patches the 2 import lines, manually open the web Mini App and confirm КОПИЛКА tab + AI tab + УПР→02→03 actually render the real poster screens (not «Копилка — / WIP» text).
2. **iOS Simulator smoke** — confirm SwiftUI navigation displays real V10 views (code is correct, but visual confirmation in Simulator removes any doubt).
3. **AI observation rule output** — observe how rule-engine text changes with real user data (over-limit / sub charge tomorrow / week savings / month surplus / fallback).
4. **Bar-chart red ≥75% pixel check** — visual validation of red threshold colour.
5. **Optimistic settings PATCH rollback** — provoke a 500 from backend and confirm UI reverts.
6. **Owner-gate role check** — login as owner vs member and confirm 5 vs 4 row count.

---

## Gaps Summary

The phase landed **45 of 45 plan-level sub-truths in code**, but the web shell wiring step (which 27-06 explicitly named in its truth #5) was not performed after the sibling plans (27-02/03/04/05) shipped their real Mounts. The result is a gap that makes 11 of the 21 phase requirements **unreachable to a web user** even though their code is complete:

- The four real Mount components (`SavingsMount`, `AiMount`, `AccountsListMount`, `AnalyticsMount`) exist with full implementation, tests, and barrel exports.
- They are imported by **nothing** in production code paths.
- `V10MainShell.tsx` and `MgmtHubMount.tsx` both still import from `_externalMountStubs.tsx`, which renders «WIP — replaced when Plan 27-XX lands» placeholder text.
- iOS analogue (Plan 27-11) DID perform the zero-touch swap correctly — `MgmtHubView.swift` and `V10MainShell.swift` both reference the real V10 views, with no stub references remaining.

**Root cause:** 27-06 ran in the same wave as 27-02/03/04/05 and shipped stubs as a parallel-execution safety net (documented as a pattern in 27-06's SUMMARY). The plan's `affects:` field correctly enumerated the swap-target imports for each sibling, but no follow-up plan or final-wave step performed the swap. iOS 27-11 ran AFTER its siblings and performed the swap inline; web 27-06 ran BEFORE/CONCURRENTLY and never returned.

**Fix scope (small inline patch, ~10 line diff):**

1. `frontend/src/screensV10/V10MainShell.tsx`:
   - Replace `import { AccountsListMountStub, AnalyticsMountStub, SavingsMountStub, AiMountStub } from './Management/_externalMountStubs';` with `import { SavingsMount } from './Savings'; import { AiMount } from './Ai';` (also drop unused stub imports if accounts/analytics stubs are referenced elsewhere; they are not).
   - Replace `router.push(<SavingsMountStub />)` with `router.push(<SavingsMount />)` (line 86).
   - Replace `router.push(<AiMountStub />)` with `router.push(<AiMount />)` (line 90).

2. `frontend/src/screensV10/Management/MgmtHubMount.tsx`:
   - Replace `import { AccountsListMountStub, AnalyticsMountStub } from './_externalMountStubs';` with `import { AccountsListMount } from '../Accounts'; import { AnalyticsMount } from '../Analytics';`.
   - Replace `router.push(<AccountsListMountStub />)` with `router.push(<AccountsListMount />)` (line 50).
   - Replace `router.push(<AnalyticsMountStub />)` with `router.push(<AnalyticsMount />)` (line 52).

3. `frontend/src/screensV10/__tests__/V10MainShell.test.tsx`:
   - Extend the `vi.mock('../../api/v10', …)` block to also mock the leaves the real Mounts call: `fetchSavingsSummary`, `listGoals`, `createGoal`, `patchSavingsConfig`, `postDeposit`, `fetchObservation`, `fetchTopCategories`, `listActualV10`. Suggested:
     ```ts
     vi.mock('../../api/v10', () => ({
       listAccounts: vi.fn().mockResolvedValue([]),
       listCategoriesV10: vi.fn().mockResolvedValue([]),
       createActualV10: vi.fn(),
       fetchSavingsSummary: vi.fn().mockResolvedValue({ total_cents: 0, month_in_cents: 0, config: { roundup_enabled: false, roundup_base: 10 }, goals: [] }),
       listGoals: vi.fn().mockResolvedValue([]),
       createGoal: vi.fn(),
       patchSavingsConfig: vi.fn(),
       postDeposit: vi.fn(),
       fetchObservation: vi.fn().mockResolvedValue({ text: 'mock', generated_at: new Date().toISOString() }),
       fetchTopCategories: vi.fn().mockResolvedValue([]),
       listActualV10: vi.fn().mockResolvedValue([]),
     }));
     vi.mock('../../api/ai', () => ({ streamChat: vi.fn() }));
     ```
   - Retarget assertions at lines 157-170 from the WIP stub strings («Копилка —», «AI —») to a real-screen sentinel (e.g. data-testid `savings-view` / `ai-view`, or eyebrow text «КОПИЛКА · ОКРУГЛЕНИЕ» / «AI · ASSISTANT»).

4. (optional cleanup, not blocking) Delete `frontend/src/screensV10/Management/_externalMountStubs.tsx` once the imports are gone — already noted in 27-06 patterns-established as a follow-up `chore`.

---

## Re-verification Plan

After the orchestrator patches the 4 lines above + updates the V10MainShell test mocks:

- Re-run `npx vitest run --silent` → expect 683 tests pass (with the 2 retargeted assertions + new mocks).
- Re-run `npx tsc --noEmit` → clean.
- Spot-check `grep -nE "Stub" frontend/src/screensV10/V10MainShell.tsx frontend/src/screensV10/Management/MgmtHubMount.tsx` → only comments referencing the historical pattern, no code uses.
- Re-run this verification → status flips to `human_needed` (the 6 visual/dynamic items remain) at score 24/24.

---

_Verified: 2026-05-10T23:05:00Z_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
