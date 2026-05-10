---
phase: 24-onboarding-4-step
plan: 06
type: execute
wave: 4
depends_on: [04]
files_modified:
  - frontend/src/screensV10/Onboarding/Step03Plan.tsx
  - frontend/src/screensV10/Onboarding/Step03Plan.module.css
  - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
  - frontend/src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx
autonomous: true
requirements: [ONB-V10-01, ONB-V10-04]
must_haves:
  truths:
    - "Step 03 renders Mass italic «Распредели\\n{income} ₽»"
    - "8 PosterSlider components (one per default category) with step=500₽ (50_000 cents)"
    - "Initial slider value per category = floor(income_cents * share / 50_000) * 50_000"
    - "Bottom counter shows «остаётся X ₽ → накопления» (green) when Σplan < income"
    - "Bottom counter shows «превышение X ₽» (red) when Σplan > income, NEXT disabled"
    - "Bottom counter shows «всё распределено» when Σplan == income"
  artifacts:
    - path: "frontend/src/screensV10/Onboarding/Step03Plan.tsx"
      provides: "Plan distribution step with 8 sliders + live counter"
      min_lines: 100
  key_links:
    - from: "Step03Plan.tsx"
      to: "PosterSlider"
      via: "ForEach DEFAULT_CATEGORIES rendering PosterSlider per code"
      pattern: "DEFAULT_CATEGORIES\\.map.*PosterSlider"
    - from: "Step03Plan.tsx"
      to: "OnboardingFlow dispatch"
      via: "SET_PLAN action on every onChange"
      pattern: "dispatch\\(.*SET_PLAN"
---

<objective>
Web Step 03 (План). Render 8 PosterSlider components (one per default category from `defaultCategories.ts`), each with `step=500₽` (= 50_000 cents). Initial value per slider = `floor(income_cents * share / 50_000) * 50_000`. Bottom counter recomputes Σplan on every change and displays one of:
- «всё распределено» (Σ == income)
- «остаётся X ₽ → накопления» (Σ < income)
- «превышение X ₽» (Σ > income, red text, blocks NEXT)

Purpose: Implement REQ ONB-V10-04. Reuse Phase 23 PosterSlider component.

Output: Step03Plan + CSS + flow integration + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-04-web-step02-accounts-PLAN.md

@frontend/src/componentsV10/PosterSlider.tsx
@frontend/src/screensV10/Onboarding/defaultCategories.ts
@frontend/src/screensV10/Onboarding/onboardingReducer.ts
@frontend/src/screensV10/Onboarding/types.ts
@frontend/src/screensV10/Onboarding/OnboardingChrome.tsx
@frontend/src/screensV10/Onboarding/OnboardingFlow.tsx

<interfaces>
# PosterSlider props (Phase 23):
{ value: number; min?: number; max: number; step?: number; onChange: (v:number)=>void;
  onCommit?: (v:number)=>void; label?: string }

# Plan reducer (Plan 24-01):
SET_PLAN { code: string; cents: number } — sets categoryPlans[code]; ignores codes not in VALID_CATEGORY_CODES.

# Initial-value formula (D-06):
For category c in DEFAULT_CATEGORIES:
  initial = Math.floor(income_cents * c.share / 50_000) * 50_000
where 50_000 = 500₽ in cents (step granularity).

# Slider max (per prototype line 1467):
max = Math.max(60_000_00, Math.round(income_cents * 0.6))
i.e. at least 60_000₽ headroom OR 60% of income, whichever is larger.

# Bottom counter rules:
left = income_cents - Σ(plan values)
- left == 0: «всё распределено»
- left > 0: «остаётся {fmtRubles(left)} ₽ → накопления» (color: paper, opacity 0.85)
- left < 0: «превышение {fmtRubles(-left)} ₽» (color: red token, e.g. var(--poster-red))
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Step03Plan view + counter + flow integration + tests</name>
  <files>
    frontend/src/screensV10/Onboarding/Step03Plan.tsx,
    frontend/src/screensV10/Onboarding/Step03Plan.module.css,
    frontend/src/screensV10/Onboarding/OnboardingFlow.tsx,
    frontend/src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx
  </files>
  <behavior>
    Step03Plan:
      - Props: { incomeCents: number; categoryPlans: Record<string,number>; dispatch: React.Dispatch<OnboardingAction>; }
      - Layout:
        - Mass italic 32px «Распредели\n{fmtRubles(incomeCents)} ₽»
        - Eyebrow opacity 0.55 «СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ»
        - For each category in DEFAULT_CATEGORIES:
            <div class="row">
              <div class="header">
                <span class="ord">{c.ord}</span>
                <span class="name">{c.name}</span>
                <span class="value">{fmtRubles(currentValue)} ₽</span>
              </div>
              <PosterSlider value={currentValue} max={sliderMax} step={50_000} onChange={(v) => dispatch({type:'SET_PLAN', payload:{code:c.code, cents:v}})} />
            </div>
      - currentValue = categoryPlans[c.code] ?? floor(incomeCents * c.share / 50_000) * 50_000
        - On first mount when categoryPlans is empty, the reducer (per Plan 24-01 SET_INCOME default-allocation) should already have populated it; but defensive default here for races
      - sliderMax = Math.max(6_000_000, Math.round(incomeCents * 0.6))  // 60_000₽ in cents
    Bottom counter (rendered as `hint` prop on OnboardingChrome OR directly inside step content above the chrome footer):
      - Decision: pass via `hint` prop on OnboardingChrome since OnboardingChrome already supports a hint slot above the dots/CTA. This keeps layout consistent.
      - Compute in OnboardingFlow when rendering case 3:
          const total = Object.values(state.category_plans).reduce((s,v)=>s+v, 0);
          const left = state.income_cents - total;
          const hint = left === 0 ? 'всё распределено' : left > 0 ? `остаётся ${fmtRubles(left)} ₽ → накопления` : `превышение ${fmtRubles(-left)} ₽`;
          const nextDisabled = left < 0;
      - For coloring (red on overflow), since hint is plain string, extend OnboardingChrome to accept a `hintTone?: 'normal'|'overflow'` prop (default 'normal'), with CSS rule applying var(--poster-red) when overflow. Add this prop to chrome and document it in 24-02 SUMMARY (or update chrome here as a small enhancement).
    OnboardingFlow update:
      - case 3: render OnboardingChrome with hint, hintTone, nextDisabled, label "ШАГ 03 / 04 · ПЛАН", onBack/onNext, wrapping <Step03Plan ...>
    Tests (RTL + vitest):
      - With incomeCents=8_000_000 (80k₽) and empty plan: 8 sliders rendered with default values matching share allocation (food = floor(8_000_000 * 0.20 / 50_000) * 50_000 = 1_600_000)
      - Slider drag (fireEvent.change with target.value = '2000000') → dispatch called with { SET_PLAN, payload:{code:'food', cents:2_000_000} }
      - Counter logic (test as pure function or via assertion on rendered hint):
        - income=10_000_000, sum=10_000_000 → 'всё распределено'
        - income=10_000_000, sum=8_000_000 → 'остаётся 20 000 ₽ → накопления'
        - income=10_000_000, sum=11_000_000 → 'превышение 10 000 ₽' AND nextDisabled === true
  </behavior>
  <action>
    1. Implement Step03Plan with the layout described. Use `<PosterSlider>` from componentsV10 — it already handles step=500 by default, but pass step={50_000} explicitly since values are in cents (the component is value-agnostic, treats step as raw integer; we work in cents end-to-end).
    2. Compute `currentValue` defensively: `categoryPlans[c.code] ?? Math.floor(incomeCents * c.share / 50_000) * 50_000`. The reducer should have populated this on SET_INCOME (Plan 24-01), but if a user navigates back, edits income, then forward, the plan map may be stale — the reducer's SET_INCOME default-allocate behaviour only triggers when plan is empty. Document this edge: "Editing income on Step 01 after Step 03 has been visited keeps existing plan values; user can reset by tapping 'Reset' (out of scope) or manually adjusting sliders."
    3. Update OnboardingChrome.tsx (lightly) to add `hintTone?: 'normal'|'overflow'` prop. Add corresponding CSS class in OnboardingChrome.module.css: `.hintOverflow { color: var(--poster-red); animation: posterShake 400ms ease-out infinite; }` (the prototype shows shaking text per CONTEXT — verify keyframe exists in stylesV10/animations.css; if not, add a static red color, no animation, and note for plan 24-10 polish). Confirm by `grep posterShake frontend/src/stylesV10/animations.css`.
    4. Update OnboardingFlow.tsx case 3 to compute `hint`, `hintTone`, `nextDisabled` and pass to chrome.
    5. Tests: render Step03Plan with mocked props; use `screen.getAllByRole('slider')` to find all 8 sliders; trigger fireEvent.change. Pure-function test for counter logic.
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Step03Plan.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    Tests pass. Manual visual check: 8 sliders render with correct initial values for income=80_000₽; dragging updates counter; overflow turns counter red; NEXT disables on overflow.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| slider input range | Native range input cannot exceed max — already clamped by browser |
| sum calculation | Σplan must respect server constraint Σ ≤ income |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-06-01 | Tampering | manual draft edit (sum > income) | mitigate | NEXT button disabled when left < 0; final submit will also fail server-side (422) — covered in plan 24-08 error toast |
| T-24-06-02 | Logic flaw | unknown category code in plan map | mitigate | Reducer SET_PLAN ignores unknown codes (Plan 24-01); rendering iterates DEFAULT_CATEGORIES (whitelist) |
</threat_model>

<verification>
- npm test passes
- tsc clean
- Visual smoke: temporarily mount OnboardingFlow with state pre-populated to step=3, income=80_000₽; counter and 8 sliders render correctly
</verification>

<success_criteria>
- T4 + ONB-V10-04 implemented (8 sliders + live counter + NEXT-disabled rule)
- Initial values use the floor formula exactly
- Counter color flips on overflow
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-06-web-step03-plan-SUMMARY.md`.
</output>
