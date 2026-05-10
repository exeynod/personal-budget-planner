---
phase: 24-onboarding-4-step
plan: 08
type: execute
wave: 5
depends_on: [06]
files_modified:
  - frontend/src/screensV10/Onboarding/Step04Goal.tsx
  - frontend/src/screensV10/Onboarding/Step04Goal.module.css
  - frontend/src/screensV10/Onboarding/Final.tsx
  - frontend/src/screensV10/Onboarding/Final.module.css
  - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
  - frontend/src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx
  - frontend/src/screensV10/Onboarding/__tests__/Final.test.tsx
autonomous: true
requirements: [ONB-V10-01, ONB-V10-05, ONB-V10-06]
must_haves:
  truths:
    - "Step 04 renders Mass italic «Зачем копишь?» + ПРОПУСТИТЬ in top-right"
    - "Goal name input (1..80 chars) + target amount input (>0)"
    - "Optional due_date input (date >= today+1d, ISO YYYY-MM-DD)"
    - "Tap ПРОПУСТИТЬ → state.goal = null, advances to Final without goal"
    - "NEXT label «ГОТОВО →» enabled when goal.name && goal.target_cents > 0"
    - "Final renders Eyebrow «VOL.04 · ГОТОВО» + Mass «ВСЁ.» + DM Serif italic «деньги — под контролем.»"
    - "Final summary plate shows ДОХОД / СЧЕТА / ПЛАН / ЦЕЛЬ rows"
    - "Final CTA «НАЧАТЬ →» triggers POST /api/v1/onboarding/complete"
    - "200 response: clearDraft + onComplete callback"
    - "409 response: clearDraft + toast «вы уже завершили онбординг» + onComplete"
    - "422 response: error toast, draft preserved, no navigation"
  artifacts:
    - path: "frontend/src/screensV10/Onboarding/Step04Goal.tsx"
      provides: "Goal step view with name + amount + optional due"
      min_lines: 80
    - path: "frontend/src/screensV10/Onboarding/Final.tsx"
      provides: "Final screen + summary plate + submit handler"
      min_lines: 100
  key_links:
    - from: "Final.tsx"
      to: "frontend/src/api/onboardingV10.ts:postOnboardingComplete"
      via: "submit handler"
      pattern: "postOnboardingComplete\\(serialiseDraft"
    - from: "Final.tsx"
      to: "useOnboardingDraft.clear()"
      via: "called on 200 OR 409"
      pattern: "draft\\.clear\\(\\)"
    - from: "Step04Goal.tsx"
      to: "OnboardingFlow"
      via: "SET_GOAL / SKIP_GOAL dispatch"
      pattern: "dispatch\\(\\{.*(SET_GOAL|SKIP_GOAL)"
---

<objective>
Web Step 04 (Цель опц.) + Final screen + atomic submit.

Step 04:
- Goal name (DM Serif italic 22px input, 1..80 chars), target amount (Archivo Black 36px + ₽ suffix, >0), optional due_date (HTML5 date picker, min = today+1).
- ПРОПУСТИТЬ button in chrome's right-top → dispatch SKIP_GOAL → NEXT.
- NEXT label «ГОТОВО →»; disabled until name && target_cents > 0 (per prototype); when SKIP path used, no enabled-state needed because skip bypasses NEXT.

Final:
- Eyebrow «VOL.04 · ГОТОВО» + Mass «ВСЁ.» + DM Serif italic «деньги — под контролем.» (line-break controlled).
- Summary plate (4 rows): ДОХОД / СЧЕТА (count · sum) / ПЛАН (Σ распределено) / ЦЕЛЬ (name · amount или «без цели»).
- CTA «НАЧАТЬ →» — calls postOnboardingComplete(serialiseDraft(state)); on 200 → clearDraft + onComplete(response); 409 → clearDraft + toast + onComplete (with synthetic response or null); 422 → error toast.

Output: 4 source files + 2 test files. Updates OnboardingFlow to render case 4 and case 5.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-06-web-step03-plan-PLAN.md
@.planning/phases/24-onboarding-4-step/24-01-foundation-draft-flow-SUMMARY.md

@frontend/src/componentsV10/Mass.tsx
@frontend/src/componentsV10/Plate.tsx
@frontend/src/componentsV10/Toast.tsx
@frontend/src/api/onboardingV10.ts
@frontend/src/screensV10/Onboarding/onboardingReducer.ts
@frontend/src/screensV10/Onboarding/types.ts
@frontend/src/screensV10/Onboarding/useOnboardingDraft.ts
@frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
@frontend/src/screensV10/Onboarding/OnboardingChrome.tsx

<interfaces>
# Step04Goal:
# Reuses prototype lines 1481-1513 (Goal name + amount + presets).
# CONTEXT D-07 explicitly removes preset goals — keep only manual input.

# Server constraints (from OnboardingV10Body.OnboardingGoalItem):
- name 1..80
- target_cents > 0, ≤ INCOME_MAX_CENTS (= 100M ₽ in cents)
- due strict > today (Europe/Moscow); ISO 'YYYY-MM-DD'

# Final summary plate uses Phase 23 Plate component:
- tone="paper" or custom; background paper-on-coral inversion looks bad — better use plain coral with paper text.
- Use prototype-style row list (4 rows separated by border-bottom rgba paper 0.25).

# Submit response handling:
- postOnboardingComplete returns Promise<OnboardingV10Response>
- apiFetch (frontend/src/api/client.ts) throws on non-2xx — catch and inspect error.status
- 200 path: response is fulfilled
- 409 path: error.status === 409
- 422 path: error.status === 422; error.body has Pydantic error array (FastAPI format)
- Network error: error.status undefined or 0; show generic toast «Ошибка сети, попробуйте ещё раз»
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Step04Goal view + flow integration + tests</name>
  <files>
    frontend/src/screensV10/Onboarding/Step04Goal.tsx,
    frontend/src/screensV10/Onboarding/Step04Goal.module.css,
    frontend/src/screensV10/Onboarding/OnboardingFlow.tsx,
    frontend/src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx
  </files>
  <behavior>
    Step04Goal:
      - Props: { goal: OnboardingGoal | null; dispatch: React.Dispatch<OnboardingAction>; }
      - Layout:
        - Mass italic 32px «Зачем копишь?»
        - Eyebrow opacity 0.55 «МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ»
        - Name input: <input> (DM Serif Display italic 22px, paper text), placeholder "Цель (Грузия, подушка, ноутбук…)", maxLength=80, bottom border paper opacity 0.4
        - Amount input row: numeric input (Archivo Black 36px) + ₽ suffix (Archivo Black 24px); input filter digits only, value formatted via thin space when displayed
        - Due date input (optional): <input type="date"> with min={todayPlusOne()} ; styled JetBrains Mono 11; renders as small row beneath amount with label «До какой даты (опц.)»
      - On any change → dispatch SET_GOAL with full goal object; never dispatch with bad shape (skip if name empty AND target empty)
      - todayPlusOne() = (new Date(Date.now() + 86400000)).toISOString().slice(0,10)
        - Note: client-side this gives local-day+1 in ISO; server validates against Europe/Moscow today; small TZ skew is benign (server is authoritative)
    OnboardingFlow update (case 4):
      - <OnboardingChrome step={4} label="ШАГ 04 / 04 · ЦЕЛЬ" onBack={() => dispatch({type:'BACK'})} onSkip={() => { dispatch({type:'SKIP_GOAL'}); dispatch({type:'NEXT'}); }} onNext={() => dispatch({type:'NEXT'})} nextLabel="ГОТОВО →" nextDisabled={!isGoalValid(state.goal)}><Step04Goal goal={state.goal} dispatch={dispatch}/></OnboardingChrome>
      - isGoalValid(g): g != null && g.name.trim().length >= 1 && g.target_cents > 0
    Tests:
      - Renders inputs; typing name + amount dispatches SET_GOAL with combined object
      - Skip button visible (chrome ПРОПУСТИТЬ via onSkip prop) — skip path tested in OnboardingFlow integration
      - isGoalValid: null → false; {name:'', target:0} → false; {name:'X', target:0} → false; {name:'X', target:1} → true
      - Due input has min attr equal to todayPlusOne (regex match YYYY-MM-DD)
  </behavior>
  <action>
    1. Implement Step04Goal — match prototype lines 1481-1513 (without the preset chips, per CONTEXT D-07).
    2. Wire SET_GOAL dispatch on every change — debounced is overkill; reducer is cheap. Dispatch with `{ name, target_cents, due }` where due is undefined when input empty.
    3. Implement isGoalValid helper inside the file (or in format.ts shared module).
    4. Update OnboardingFlow case 4 — onSkip dispatches SKIP_GOAL THEN NEXT (so we land on Final with goal=null).
    5. Tests via RTL: render with goal=null and goal={name:'X', target_cents:200_000_00} cases.
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Step04Goal.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    Tests pass. Skip path dispatches SKIP_GOAL + NEXT. Date input has min attribute set.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Final view + summary plate + submit handler + 200/409/422 handling + tests</name>
  <files>
    frontend/src/screensV10/Onboarding/Final.tsx,
    frontend/src/screensV10/Onboarding/Final.module.css,
    frontend/src/screensV10/Onboarding/OnboardingFlow.tsx,
    frontend/src/screensV10/Onboarding/__tests__/Final.test.tsx
  </files>
  <behavior>
    Final:
      - Props: { state: OnboardingDraft; onComplete: (response: OnboardingV10Response | null) => void; }
      - State: const [submitting, setSubmitting] = useState(false); const [errorMsg, setErrorMsg] = useState<string|null>(null);
      - Layout:
        - Eyebrow opacity 0.65 «VOL.04 · ГОТОВО»
        - Mass size={88} «ВСЁ.» (Archivo Black, no italic)
        - Mass italic size={28} «деньги — под контролем.» (DM Serif italic via the Mass `italic` prop)
        - Summary list (paper border-top + 4 rows with border-bottom):
            ДОХОД      → fmtRubles(income_cents) ₽ / мес
            СЧЕТА      → `${accounts.length} · ${fmtRubles(Σ balances)} ₽`
            ПЛАН       → `${fmtRubles(Σ category_plans)} ₽ распределено`
            ЦЕЛЬ       → goal ? `${goal.name} · ${fmtRubles(goal.target_cents)} ₽` : 'без цели'
          Each label is Eyebrow opacity 0.6; value is DM Serif italic 18px
        - CTA «НАЧАТЬ →» (paper bg, coral text, Archivo Black 13, kerning 0.18em) — disabled while submitting
        - Below CTA, error toast via Phase 23 Toast component (errorMsg shown for 4s then dismissed)
      - Submit handler:
        ```ts
        async function onStart() {
          setSubmitting(true);
          setErrorMsg(null);
          try {
            const body = serialiseDraft(state);
            const response = await postOnboardingComplete(body);
            draft.clear();
            onComplete(response);
          } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            if (status === 409) {
              draft.clear();
              setErrorMsg('вы уже завершили онбординг');
              setTimeout(() => onComplete(null), 1500);
            } else if (status === 422) {
              setErrorMsg('Проверьте план: сумма не может превышать доход');
            } else {
              setErrorMsg('Ошибка сети, попробуйте ещё раз');
            }
          } finally {
            setSubmitting(false);
          }
        }
        ```
        — Note: the exact apiFetch error shape needs verification — read `frontend/src/api/client.ts` to confirm whether errors carry `.status` or `.response.status`. Adjust accordingly.
    OnboardingFlow update (case 5):
      - <Final state={state} onComplete={(resp) => onComplete(resp)} />
      - Note: chrome is not used for case 5 (Final has its own layout); render directly.
    Tests (RTL + vitest, mock postOnboardingComplete):
      - Renders «VOL.04 · ГОТОВО», «ВСЁ.», «деньги — под контролем.»
      - Renders 4 summary rows with correct values for sample state
      - With goal=null, ЦЕЛЬ row shows «без цели»
      - Click «НАЧАТЬ →» → mocked postOnboardingComplete called with serialised body
      - On 200 → draft.clear called, onComplete called with response object
      - On 409 → draft.clear called, errorMsg displayed, onComplete called (with null) after delay
      - On 422 → errorMsg displayed, onComplete NOT called, draft NOT cleared
      - On network error → generic errorMsg
  </behavior>
  <action>
    1. Read `frontend/src/api/client.ts` to determine the exact thrown-error shape (look for `class ApiError` or similar; pull status/body from there). Adjust the catch block accordingly.
    2. Implement Final.tsx + CSS. Use Phase 23 Toast component for the error display (`<Toast message={errorMsg} visible={!!errorMsg} onDismiss={()=>setErrorMsg(null)} />`).
    3. Update OnboardingFlow case 5 to render Final directly (skip chrome).
    4. Tests:
       - Mock the API module: `vi.mock('../../api/onboardingV10', () => ({ postOnboardingComplete: vi.fn() }))`.
       - Pass mocked spy via spy.mockResolvedValue / mockRejectedValue.
       - Use `await waitFor(...)` for async assertions.
       - For 409 test, mock to reject with `{ status: 409 }`.
       - For 422, reject with `{ status: 422 }`.
       - For network error, reject with new TypeError (no status).
    5. The `serialiseDraft` from Plan 24-01 must omit `goal` key when state.goal === null. Verify via inspecting the body argument the spy receives.
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Final.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    All Final tests pass. 200/409/422/network paths each trigger the correct UX.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| free-text goal name | Length cap + trim before submit |
| due_date input | HTML5 date validation insufficient — server is authoritative |
| 409 race | User already onboarded but has stale draft |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-08-01 | Tampering | goal name free-text | mitigate | maxLength=80 + trim before SET_GOAL; React escapes on render |
| T-24-08-02 | Tampering | due_date past day | mitigate | min attr on date input + server strict > today validator |
| T-24-08-03 | Replay | repeated submit on slow network | mitigate | submitting state disables CTA |
| T-24-08-04 | Information Disclosure | error message reveals server detail | mitigate | Generic russian copy («Ошибка сети…»); never echo raw err.message |
| T-24-08-05 | Logic flaw | 409 with non-cleared draft | mitigate | draft.clear() called BEFORE onComplete in 409 branch |
</threat_model>

<verification>
- npm test passes for Step04Goal.test.tsx and Final.test.tsx
- tsc + eslint clean
- Visual smoke: temporarily mount OnboardingFlow with state.step=4 then 5 in PreviewApp
</verification>

<success_criteria>
- T5 + T6 + T7 + T8 + T9 covered (Step 04 + Final + atomic submit + all 3 response paths)
- ONB-V10-05, ONB-V10-06 implemented
- Goal optional path verified (skip clears goal); manual create path validated against client + server constraints
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-08-web-step04-goal-final-SUMMARY.md`.
</output>
