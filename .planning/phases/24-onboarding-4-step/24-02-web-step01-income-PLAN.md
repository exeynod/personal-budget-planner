---
phase: 24-onboarding-4-step
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - frontend/src/screensV10/Onboarding/OnboardingChrome.tsx
  - frontend/src/screensV10/Onboarding/OnboardingChrome.module.css
  - frontend/src/screensV10/Onboarding/Step01Income.tsx
  - frontend/src/screensV10/Onboarding/Step01Income.module.css
  - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
  - frontend/src/screensV10/Onboarding/OnboardingFlow.module.css
  - frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx
autonomous: true
requirements: [ONB-V10-01, ONB-V10-02]
must_haves:
  truths:
    - "Step 01 renders eyebrow «ШАГ 01 / 04 · ДОХОД» + 4-dot progress (1 paper, 3 dimmed)"
    - "Income input accepts digits only, formats with U+202F thin space, displays ₽ suffix"
    - "NEXT button labelled «ДАЛЕЕ →» disabled until income_cents > 0"
    - "Back-arrow disabled (no previous step on Step 01)"
    - "OnboardingFlow.tsx mounts Step01Income and wires reducer + draft hook"
  artifacts:
    - path: "frontend/src/screensV10/Onboarding/OnboardingChrome.tsx"
      provides: "Reusable chrome with back, eyebrow, progress dots, NEXT CTA, optional skip"
      min_lines: 80
    - path: "frontend/src/screensV10/Onboarding/Step01Income.tsx"
      provides: "Income step view (Mass + numeric input + ₽ suffix)"
      min_lines: 80
    - path: "frontend/src/screensV10/Onboarding/OnboardingFlow.tsx"
      provides: "Root component with reducer + draft persistence + step switch"
      min_lines: 80
  key_links:
    - from: "OnboardingFlow.tsx"
      to: "useOnboardingDraft + onboardingReducer"
      via: "useReducer + useEffect persist"
      pattern: "useReducer.*onboardingReducer.*useEffect.*save"
    - from: "Step01Income.tsx"
      to: "OnboardingFlow"
      via: "props { incomeCents, dispatch, onNext }"
      pattern: "dispatch\\(.*SET_INCOME"
---

<objective>
First visible web step. Build:
1. **OnboardingFlow root** — `useReducer(onboardingReducer)`, mounts `<Step01Income/>` for step 1, persists draft via `useOnboardingDraft` on every state change, rehydrates from draft on initial mount.
2. **OnboardingChrome** — reusable scaffold (back arrow, eyebrow label, 4-dot progress, optional skip, NEXT CTA, hint slot) used by all 4 steps.
3. **Step01Income** — Mass italic «Какой доход в месяц?», large input + ₽ suffix, presets row (50/80/120/200K ₽ as quick-fill chips), dispatches SET_INCOME on change, wires NEXT disabled when income_cents ≤ 0.

Purpose: Lock the chrome contract (props, slot positions) for steps 02/03/04 to consume; prove the reducer-driven flow works end-to-end on at least one screen before we replicate the pattern.

Output: 5 source files (chrome + step + flow + 2 CSS modules) + 1 test file. Does NOT mount yet into AppV10 — that wiring is plan 24-10.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-01-foundation-draft-flow-PLAN.md
@.planning/phases/24-onboarding-4-step/24-01-foundation-draft-flow-SUMMARY.md

@frontend/src/componentsV10/Eyebrow.tsx
@frontend/src/componentsV10/Mass.tsx
@frontend/src/componentsV10/PosterButton.tsx
@frontend/src/stylesV10/tokens.css
@frontend/src/screensV10/Onboarding/onboardingReducer.ts
@frontend/src/screensV10/Onboarding/types.ts
@frontend/src/screensV10/Onboarding/useOnboardingDraft.ts

<interfaces>
<!-- Reference impl from prototype/poster-screens.jsx (lines 1292-1380): -->

# OnbChrome (props):
{ step: 1..4, total: 4, label: string, onBack?: () => void, onSkip?: () => void,
  onNext: () => void, nextLabel?: string (default 'ДАЛЕЕ →'),
  nextDisabled?: boolean, hint?: string, children: ReactNode }

# Visual rules:
- Background: var(--poster-coral); color: var(--poster-paper); padding: 56px 22px 28px
- Header row: ← (back, JetBrains Mono 14, opacity 0.85 if onBack else 0.25) | eyebrow centered | ПРОПУСТИТЬ (right, JetBrains Mono 11, only when onSkip)
- Body: flex column, slot for children
- Footer: optional hint (JetBrains Mono 11, opacity 0.65, centered) → 4-dot progress (height 2px, paper for i<step) → NEXT CTA (Archivo Black 13, letter-spacing 0.18em, paper bg, coral text, full-width)

# Income step body content:
- Mass italic 36px «Какой доход\nв месяц?» (linebreak after "доход")
- Eyebrow opacity 0.55 «ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ»
- Input row: <input> (Archivo Black 48px) + «₽» suffix (Archivo Black 32px), bottom border rgba(255,246,232,0.5)
- Presets row (4 chips): 50000, 80000, 120000, 200000 — JetBrains Mono 11, click sets income_cents
- Format display via U+202F thin space (e.g., "120 000")
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: OnboardingChrome + OnboardingFlow root + draft rehydration</name>
  <files>
    frontend/src/screensV10/Onboarding/OnboardingChrome.tsx,
    frontend/src/screensV10/Onboarding/OnboardingChrome.module.css,
    frontend/src/screensV10/Onboarding/OnboardingFlow.tsx,
    frontend/src/screensV10/Onboarding/OnboardingFlow.module.css
  </files>
  <behavior>
    OnboardingChrome:
      - Renders header row, body slot, footer (hint? + dots + NEXT CTA)
      - Back arrow: when onBack provided, opacity 0.85 cursor pointer; when undefined, opacity 0.25 cursor default
      - Skip: only renders when onSkip provided (Step 04 only)
      - Dots: 4 segments, segment.background = paper for i < step, rgba 0.25 otherwise
      - NEXT CTA: full-width PosterButton variant="primary" alt; OR custom div styled like prototype OnbCTA (paper bg, coral text); pick the one that matches Phase 23 PosterButton variants — if the existing PosterButton supports variant="onboarding-cta" use it, else inline div per prototype
      - nextDisabled greys CTA, sets aria-disabled, suppresses onNext
      - Children fill flex:1 between header and footer

    OnboardingFlow:
      - `useReducer(onboardingReducer, INITIAL_STATE, init)` where init reads from useOnboardingDraft.load() so draft rehydrates on mount
      - `useEffect(() => save(state), [state])` persists every change
      - Renders <OnboardingChrome step={state.step} ...> wrapping the active <Step0X/> component
      - For now (this plan) only step 1 has a real component; steps 2-5 render <PlaceholderStep/> stub (one-line div «Step N — coming next plan»)
      - Exposes `<OnboardingFlow onComplete={() => …} />` prop — onComplete called when reducer reaches step=5 AND submit returns 200 (wired in plan 24-08)
  </behavior>
  <action>
    1. Create `OnboardingChrome.tsx`:
       ```tsx
       import { Eyebrow } from '../../componentsV10';
       import styles from './OnboardingChrome.module.css';
       export interface OnboardingChromeProps { step:1|2|3|4|5; total?:number; label:string; onBack?:()=>void; onSkip?:()=>void; onNext?:()=>void; nextLabel?:string; nextDisabled?:boolean; hint?:string; children:React.ReactNode; }
       export function OnboardingChrome({ step, total=4, label, onBack, onSkip, onNext, nextLabel='ДАЛЕЕ →', nextDisabled=false, hint, children }: OnboardingChromeProps){ … }
       ```
       — Hide CTA entirely on step=5 (Final has its own CTA layout, plan 24-08)
       — Hide progress dots on step=5
    2. CSS module — coral background, paper text, exact prototype paddings/typography. Use tokens from `stylesV10/tokens.css`: `--poster-coral`, `--poster-paper`, `--poster-mono-font` (JetBrains Mono), `--poster-display-font` (Archivo Black). Cross-reference with `componentsV10/Eyebrow.module.css` for letter-spacing values.
    3. Create `OnboardingFlow.tsx`:
       ```tsx
       import { useEffect, useReducer } from 'react';
       import { onboardingReducer, INITIAL_STATE } from './onboardingReducer';
       import { useOnboardingDraft } from './useOnboardingDraft';
       import { OnboardingChrome } from './OnboardingChrome';
       import { Step01Income } from './Step01Income'; // created in next task
       import styles from './OnboardingFlow.module.css';
       export interface OnboardingFlowProps { onComplete: (response: OnboardingV10Response) => void; }
       export function OnboardingFlow({ onComplete }: OnboardingFlowProps){
         const draft = useOnboardingDraft();
         const [state, dispatch] = useReducer(onboardingReducer, INITIAL_STATE, (s) => draft.load() ?? s);
         useEffect(() => { draft.save(state); }, [state]);
         const labels = { 1:'ШАГ 01 / 04 · ДОХОД', 2:'ШАГ 02 / 04 · СЧЕТА', 3:'ШАГ 03 / 04 · ПЛАН', 4:'ШАГ 04 / 04 · ЦЕЛЬ' };
         // … switch state.step
       }
       ```
    4. CSS for Flow — full-viewport coral background, no scroll for fixed-height steps (each step manages its own overflow if needed).
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit && npx eslint src/screensV10/Onboarding/OnboardingChrome.tsx src/screensV10/Onboarding/OnboardingFlow.tsx --max-warnings=0</automated>
  </verify>
  <done>
    Chrome and Flow compile; rendering them in isolation (e.g., quick PreviewApp test) shows coral bg + dots + disabled CTA; tsc/eslint clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Step01Income view + presets + format helper + integration test</name>
  <files>
    frontend/src/screensV10/Onboarding/Step01Income.tsx,
    frontend/src/screensV10/Onboarding/Step01Income.module.css,
    frontend/src/screensV10/Onboarding/__tests__/Step01Income.test.tsx
  </files>
  <behavior>
    Step01Income:
      - Props: { incomeCents: number; dispatch: React.Dispatch<OnboardingAction>; }
      - Renders Mass italic 36px «Какой доход\nв месяц?»
      - Eyebrow opacity 0.55 «ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ»
      - Input: <input type="text" inputMode="numeric"> bound to incomeCents (display: divides by 100 to get rubles, formats with thin space; on change: parses digits, multiplies by 100, dispatches SET_INCOME)
      - ₽ suffix Archivo Black 32px
      - Presets row 4 chips: 50000₽, 80000₽, 120000₽, 200000₽ — click → dispatch SET_INCOME with cents value (5_000_000 / 8_000_000 / 12_000_000 / 20_000_000)
      - Active preset chip (incomeCents matches) gets paper background + coral text inversion
    Format helper:
      - `formatRubles(cents: number): string` — divide by 100, round, format `\d{3}` groups with ` ` thin space; export from a shared utility (e.g., `frontend/src/screensV10/Onboarding/format.ts` — create if not exists; reuse if existing project util has thin-space already)
    Test:
      - Renders with incomeCents=0 → input value === ''
      - User types "120000" → onChange dispatches { type:'SET_INCOME', payload:{income_cents: 12_000_000} }
      - Click preset 80000₽ → dispatches { income_cents: 8_000_000 }
      - Format helper: 12_000_000 → "120 000" (with U+202F)
  </behavior>
  <action>
    1. Read prototype reference impl (`prototype/poster-screens.jsx` lines 1329-1380) to copy exact text + sizing values. Use Phase 23 components:
       - `<Mass italic size={36}>` for headline
       - `<Eyebrow opacity={0.55}>` for sub-label
    2. Create `format.ts` with thin-space formatter (or import from existing util if found via `grep -rn "u202F" frontend/src` — only add new helper if not already present).
    3. Step01Income parses input: strip non-digits via `value.replace(/\D/g,'')`, then multiply by 100. Empty string → income_cents = 0. Reject input >100M ₽ visually (cap value displayed).
    4. Presets array: const PRESETS = [50_000, 80_000, 120_000, 200_000] (rubles). Click handler: dispatch SET_INCOME with `cents: p * 100`.
    5. Test (RTL + vitest):
       ```tsx
       const dispatch = vi.fn();
       const { rerender } = render(<Step01Income incomeCents={0} dispatch={dispatch} />);
       fireEvent.change(screen.getByRole('textbox'), { target:{ value:'120000' } });
       expect(dispatch).toHaveBeenCalledWith({ type:'SET_INCOME', payload:{ income_cents: 12_000_000 } });
       fireEvent.click(screen.getByText(/80 000/));
       expect(dispatch).toHaveBeenCalledWith({ type:'SET_INCOME', payload:{ income_cents: 8_000_000 } });
       ```
       Plus a snapshot test confirming the chrome elements are present (eyebrow text «ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ»).
    6. Integration: in `OnboardingFlow.tsx`, when `state.step === 1`, render `<Step01Income incomeCents={state.income_cents} dispatch={dispatch} />` inside `<OnboardingChrome step={1} label="ШАГ 01 / 04 · ДОХОД" onNext={() => dispatch({type:'NEXT'})} nextDisabled={state.income_cents <= 0} />`. NO onBack prop on step 1 (chrome renders disabled arrow).
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Step01Income.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    Step01Income tests pass. Manual visual check (`npm run dev` + temporary mount in PreviewApp) shows coral background, large input, ₽ suffix, NEXT enabled only when value >0, presets clickable. Per D-11, formatted display uses U+202F thin space.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user input → input field | Free-form numeric input — coerce to integer cents on every change |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-02-01 | Tampering | Income input | mitigate | `value.replace(/\D/g,'')` strips all non-digit chars; reducer clamps ≥0 |
| T-24-02-02 | Denial of Service | very large pasted income (e.g. 1e15) | mitigate | Cap displayed value at 100M ₽ (= 100_000_000_00 cents) per OnboardingV10Body Field constraint; reject larger inputs visually with no error toast |
| T-24-02-03 | Information Disclosure | Income value in DOM (devtools) | accept | Single-tenant, user is already the owner of the data |
</threat_model>

<verification>
- `npm test -- --run src/screensV10/Onboarding` passes
- `npx tsc --noEmit` clean
- ESLint clean for new files
- Visual smoke: temporarily mount `<OnboardingFlow onComplete={() => {}} />` in PreviewApp → step 1 renders correctly
</verification>

<success_criteria>
- T2 (Step 01 chrome + NEXT disabled until income>0) verifiable via test
- ONB-V10-02 (income input + ₽ suffix + NEXT enabled when income>0) implemented
- OnboardingChrome reusable for steps 02/03/04 (signature stable)
- OnboardingFlow rehydrates from localStorage on mount and persists every reducer action
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-02-web-step01-income-SUMMARY.md` listing files + the OnboardingChrome props signature for downstream plans.
</output>
