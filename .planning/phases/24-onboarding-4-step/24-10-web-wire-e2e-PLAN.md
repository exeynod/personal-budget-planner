---
phase: 24-onboarding-4-step
plan: 10
type: execute
wave: 6
depends_on: [08]
files_modified:
  - frontend/src/AppV10.tsx
  - frontend/src/AppV10.module.css
  - frontend/src/screensV10/Onboarding/OnboardingMount.tsx
  - frontend/src/api/me.ts
  - frontend/src/api/types.ts
  - frontend/tests/e2e/onboarding-v10.spec.ts
  - frontend/tests/e2e/fixtures/onboarding-mocks.ts
autonomous: true
requirements: [ONB-V10-01, ONB-V10-06, ONB-V10-07]
must_haves:
  truths:
    - "AppV10 mounts OnboardingFlow at root when /me returns onboarded_at: null"
    - "Onboarded user (onboarded_at: <ISO>) sees Home placeholder, not onboarding"
    - "After successful submit, OnboardingFlow unmounts and Home placeholder renders"
    - "Playwright e2e test walks all 4 steps + Final, asserts localStorage cleared on success"
    - "Playwright e2e test simulates 409 response, asserts draft wiped"
  artifacts:
    - path: "frontend/src/screensV10/Onboarding/OnboardingMount.tsx"
      provides: "Conditional gateway: fetches /me; renders OnboardingFlow OR HomePlaceholder"
      min_lines: 60
    - path: "frontend/src/api/me.ts"
      provides: "getMeV10() typed wrapper returning MeV10Response"
      min_lines: 40
    - path: "frontend/tests/e2e/onboarding-v10.spec.ts"
      provides: "Playwright e2e covering full flow + draft persistence + 409"
      min_lines: 150
  key_links:
    - from: "AppV10.tsx"
      to: "OnboardingMount"
      via: "import + render at root in v10 surface"
      pattern: "<OnboardingMount"
    - from: "OnboardingMount.tsx"
      to: "/api/v1/me"
      via: "getMeV10() on mount"
      pattern: "getMeV10\\(\\)"
    - from: "OnboardingMount.tsx"
      to: "OnboardingFlow"
      via: "conditional render when !meResponse.onboarded_at"
      pattern: "<OnboardingFlow.*onComplete"
---

<objective>
Wire web onboarding into AppV10 root + ship Playwright e2e test covering the full happy path + persistence + 409.

Mounting logic:
1. AppV10 (when surface != 'preview') renders `<OnboardingMount />`.
2. OnboardingMount calls `getMeV10()` once on mount.
3. If `me.onboarded_at == null` → render `<OnboardingFlow onComplete={refetchMe} />`.
4. If `me.onboarded_at != null` → render Home placeholder («В разработке. Home will land in Phase 25.»).
5. After successful submit, `onComplete` triggers refetchMe → state flips → Home placeholder shows.

Output: 3 new files (mount component + me API wrapper + Playwright spec) + 2 modified files (AppV10 + types.ts) + Playwright fixtures.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-08-web-step04-goal-final-PLAN.md

@frontend/src/AppV10.tsx
@frontend/src/api/client.ts
@frontend/src/api/types.ts
@frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
@frontend/src/screensV10/Onboarding/useOnboardingDraft.ts
@frontend/src/api/onboardingV10.ts
@frontend/playwright.config.ts
@app/api/schemas/me_v10.py

<interfaces>
# MeV10Response (server schema, see app/api/schemas/me_v10.py):
{ tg_user_id, tg_chat_id, cycle_start_day, onboarded_at: string|null,
  chat_id_known, role, ai_spend_cents, ai_spending_cap_cents,
  income_cents: number|null }

# Trigger logic per CONTEXT D-10:
- "GET /api/v1/me returns income_cents=null AND accounts=[]" → mount onboarding
- BUT: MeV10Response does NOT include accounts (verified in Phase 22 schemas);
  AND /accounts requires require_onboarded → cannot fetch before onboarding
- DECISION (this plan): trigger via `me.onboarded_at == null`. The atomic
  /onboarding/complete endpoint sets onboarded_at on success, so this is
  the canonical signal.
- Edge case (mid-flight refresh): if user starts flow, gets to step 3, then
  refreshes → me.onboarded_at still null → OnboardingFlow remounts → 
  useOnboardingDraft.load() rehydrates state → user lands on step 3.

# Existing Playwright config: tests/ folder, baseURL likely http://localhost:5173,
# fixture pattern via .config.ts. Confirm via reading playwright.config.ts.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: getMeV10 API wrapper + OnboardingMount + AppV10 wiring</name>
  <files>
    frontend/src/api/me.ts,
    frontend/src/api/types.ts,
    frontend/src/screensV10/Onboarding/OnboardingMount.tsx,
    frontend/src/AppV10.tsx,
    frontend/src/AppV10.module.css
  </files>
  <behavior>
    me.ts:
      - export interface MeV10Response { tg_user_id: number; tg_chat_id: number|null; cycle_start_day: number; onboarded_at: string|null; chat_id_known: boolean; role: 'owner'|'member'|'revoked'; ai_spend_cents: number; ai_spending_cap_cents: number; income_cents: number|null; }
      - export function getMeV10(): Promise<MeV10Response> { return apiFetch<MeV10Response>('/me'); }
    types.ts:
      - Add MeV10Response export (or re-export from api/me.ts) — choose one location, document in SUMMARY
    OnboardingMount.tsx:
      ```tsx
      export function OnboardingMount() {
        const [me, setMe] = useState<MeV10Response | null>(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string | null>(null);
        const refetch = useCallback(async () => {
          setLoading(true); setError(null);
          try { setMe(await getMeV10()); }
          catch (e) { setError('не удалось загрузить профиль'); }
          finally { setLoading(false); }
        }, []);
        useEffect(() => { refetch(); }, [refetch]);
        if (loading) return <div className={styles.placeholder}>Загрузка…</div>;
        if (error) return <div className={styles.placeholder}>{error} <button onClick={refetch}>Повторить</button></div>;
        if (!me) return null;
        if (me.onboarded_at == null) {
          return <OnboardingFlow onComplete={async () => { await refetch(); }} />;
        }
        return <HomePlaceholder />;  // simple coral div «Home WIP — Phase 25»
      }
      ```
    AppV10.tsx update:
      - The existing component switches between 'preview' and 'placeholder' surfaces. Add a third path:
        - import.meta.env.DEV && ?preview=1 → PreviewApp (unchanged)
        - else → <OnboardingMount /> (replaces the current static placeholder)
      - The dev preview path stays untouched so DesignSystem gallery works
  </behavior>
  <action>
    1. Create `frontend/src/api/me.ts` with getMeV10. Re-export MeV10Response from there (keeps types.ts unchanged for legacy `MeResponse` consumers).
    2. Update `types.ts` ONLY to add `// see api/me.ts for v1.0 MeV10Response` comment if useful — otherwise leave untouched.
    3. Implement OnboardingMount per behavior. Place HomePlaceholder inline (small component below OnboardingMount, exported from same file or kept private).
    4. Update AppV10.tsx: keep preview-mode unchanged; replace the static "В разработке" block with `<OnboardingMount />` when surface !== 'preview'.
    5. CSS: minor adjustments to AppV10.module.css if needed (loading/error state padding/colour).
    6. Quick sanity test: `npm run dev`, open without ?preview=1 — should attempt to fetch /me; mock backend OR run real backend stack; verify OnboardingFlow mounts when onboarded_at=null.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit && npx eslint src/screensV10/Onboarding/OnboardingMount.tsx src/api/me.ts src/AppV10.tsx --max-warnings=0</automated>
  </verify>
  <done>
    Compiles clean. OnboardingMount renders correctly in dev with mocked /me response.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Playwright e2e — full flow + draft persistence + 409 + 422</name>
  <files>
    frontend/tests/e2e/onboarding-v10.spec.ts,
    frontend/tests/e2e/fixtures/onboarding-mocks.ts
  </files>
  <behavior>
    fixtures/onboarding-mocks.ts:
      - Helper functions to install Playwright route mocks for /api/v1/me and /api/v1/onboarding/complete
      - mockMeNotOnboarded(page): /me returns { onboarded_at: null, income_cents: null, ... }
      - mockMeOnboarded(page): /me returns { onboarded_at: '2026-05-10T12:00:00Z', ... }
      - mockOnboardingComplete200(page): success response
      - mockOnboardingComplete409(page): 409 status
      - mockOnboardingComplete422(page): 422 status
    onboarding-v10.spec.ts:
      - test('first-time user sees Step 01'):
          mockMeNotOnboarded; goto '/'; expect text «ШАГ 01 / 04 · ДОХОД»
      - test('completes full flow → submits → 200 → draft cleared → home placeholder'):
          mockMeNotOnboarded; mockOnboardingComplete200;
          goto '/';
          fill income input with '120000'; click ДАЛЕЕ →;
          on Step 02: click Т-Банк chip; fill balance '50000'; click ДОБАВИТЬ; click ДАЛЕЕ →;
          on Step 03: 8 sliders rendered; click ДАЛЕЕ → (default allocation already valid: Σ < income);
          on Step 04: click ПРОПУСТИТЬ;
          on Final: expect «ВСЁ.», expect «деньги — под контролем.»; click «НАЧАТЬ →»;
          // After response 200: re-mock /me to return onboarded; reload triggered or refetch occurred
          await page.evaluate(() => window.localStorage.getItem('onboarding.v10.draft')) === null;
          // After refetch /me → onboarded → HomePlaceholder rendered (not onboarding)
          // For test simplicity: re-mock /me before clicking submit so the post-200 refetch returns onboarded
      - test('draft persists across reload mid-flight'):
          mockMeNotOnboarded; goto '/';
          fill income '80000'; click ДАЛЕЕ → (now on step 02);
          add 1 account; click ДАЛЕЕ → (now on step 03);
          await page.reload();
          expect text «ШАГ 03 / 04 · ПЛАН»  // resumed correctly
          expect localStorage['onboarding.v10.draft'] !== null
      - test('409 wipes draft + lands on home'):
          mockMeNotOnboarded; mockOnboardingComplete409;
          // Pre-populate localStorage with a finished draft
          page.evaluate(() => localStorage.setItem('onboarding.v10.draft', JSON.stringify({step:5, income_cents:80_000_00, accounts:[{bank:'Т-БАНК',kind:'card',balance_cents:50_000_00,primary:true}], category_plans:{food:1_600_000, cafe:800_000, home:2_400_000, transit:480_000, fun:400_000, gifts:320_000, health:400_000, subs:240_000}, goal:null, savings_config:null})));
          goto '/';
          // Final renders directly; click «НАЧАТЬ →»;
          click «НАЧАТЬ →»;
          await waitFor toast «вы уже завершили онбординг»;
          await waitFor localStorage cleared;
      - test('422 keeps draft + shows error'):
          mockMeNotOnboarded; mockOnboardingComplete422;
          // Same pre-populate, but mock returns 422
          click submit;
          await waitFor toast «Проверьте план: сумма не может превышать доход»;
          await waitFor localStorage NOT cleared (still has the value);
  </behavior>
  <action>
    1. Read existing Playwright spec for patterns (e.g., `frontend/tests/e2e/v04-ui.spec.ts`) to match conventions.
    2. Create the fixture helpers using `page.route(url, route => route.fulfill({...}))`.
    3. Implement the 5 test cases. Use `page.locator('text=...')` for text assertions; for inputs, use `page.getByPlaceholder('0').fill('120000')` or `page.locator('input[type=text]').first().fill(...)`.
    4. For the «full flow» test, the localStorage assertion happens AFTER click submit + a small delay (use `page.waitForResponse('**/onboarding/complete')` then assert).
    5. For the «draft persists» test: assert localStorage has the right shape before reload, then reload, then assert UI shows step 03.
    6. The 409 / 422 tests pre-populate localStorage so the user lands directly on Final after refetch (Final renders when reducer.step==5; loading from draft with step=5 puts us there).
    7. Playwright run command: `npx playwright test tests/e2e/onboarding-v10.spec.ts`. If frontend dev server isn't running, the test runner should auto-start per `playwright.config.ts.webServer` — verify and configure if missing.
  </action>
  <verify>
    <automated>cd frontend && npx playwright test tests/e2e/onboarding-v10.spec.ts --reporter=list 2>&1 | tail -40</automated>
  </verify>
  <done>
    All 5 Playwright tests pass on Chromium. (Other browsers optional — match existing project's playwright.config.ts projects.)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| /me response | Server-issued; trusted |
| Playwright mocks | Test-only; do not ship |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-10-01 | Tampering | localStorage between sessions | mitigate (covered in Plan 24-01) | sanitiseDraft already drops bad fields; e2e test asserts behaviour |
| T-24-10-02 | Information Disclosure | /me payload contains tg_user_id, role | accept | Single-tenant, owner-only data; same as v0.x /me |
| T-24-10-03 | Auth bypass | manipulating localStorage to set onboarded_at | n/a | Client-side onboarded_at comes from /me; localStorage is just draft (no auth state) |
</threat_model>

<verification>
- tsc + eslint clean for new files
- All 5 Playwright tests pass
- Manual smoke: run `npm run dev` + start backend stack with a non-onboarded test user → app shows Step 01
</verification>

<success_criteria>
- T1 (trigger logic) verifiable via e2e
- T7 + T8 + T9 + T10 (submit responses + persistence) covered by 4 e2e tests
- ONB-V10-01, ONB-V10-06, ONB-V10-07 fully exercised end-to-end on web
- AppV10 root dispatches onboarding for non-onboarded users automatically
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-10-web-wire-e2e-SUMMARY.md` listing files + Playwright commands + a note on which test browsers were exercised.
</output>
