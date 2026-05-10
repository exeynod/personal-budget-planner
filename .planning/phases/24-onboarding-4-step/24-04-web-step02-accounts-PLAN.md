---
phase: 24-onboarding-4-step
plan: 04
type: execute
wave: 3
depends_on: [02]
files_modified:
  - frontend/src/screensV10/Onboarding/Step02Accounts.tsx
  - frontend/src/screensV10/Onboarding/Step02Accounts.module.css
  - frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx
  - frontend/src/screensV10/Onboarding/AccountBalanceForm.module.css
  - frontend/src/screensV10/Onboarding/OnboardingFlow.tsx
  - frontend/src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx
autonomous: true
requirements: [ONB-V10-01, ONB-V10-03]
must_haves:
  truths:
    - "Step 02 renders eyebrow «ШАГ 02 / 04 · СЧЕТА» + chip-list (Т-Банк / Сбер / Наличные / + Добавить)"
    - "Tap on predefined chip opens balance form with bank name pre-filled"
    - "+ Добавить opens balance form with empty bank name field (free text input)"
    - "First added account auto-marked primary; star icon toggles primary; × removes"
    - "NEXT enabled iff accounts.length >= 1"
    - "Hint shows «N счёт/счёта · Σ ₽» (singular/plural per length)"
    - "Back arrow goes to Step 01"
  artifacts:
    - path: "frontend/src/screensV10/Onboarding/Step02Accounts.tsx"
      provides: "Accounts step view"
      min_lines: 120
    - path: "frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx"
      provides: "Inline form: bank name input + balance input + ДОБАВИТЬ/ОТМЕНА"
      min_lines: 70
  key_links:
    - from: "Step02Accounts.tsx"
      to: "OnboardingFlow dispatch"
      via: "ADD_ACCOUNT / REMOVE_ACCOUNT / SET_PRIMARY"
      pattern: "dispatch\\(.*ADD_ACCOUNT"
    - from: "AccountBalanceForm.tsx"
      to: "Step02Accounts.tsx"
      via: "props { initialBank, kind, onSave, onCancel }"
      pattern: "onSave\\(\\{.*bank.*kind.*balance_cents"
---

<objective>
Web Step 02 (Счета). Build chip-list accounts UI with balance-input form. Predefined chips (Т-Банк kind=card, Сбер kind=card, Наличные kind=cash) tap to open the inline `AccountBalanceForm` with bank name pre-filled. «+ Добавить» opens the same form with empty bank field for free-text entry. Accounts already added show in a list with star (toggle primary) and × (remove). NEXT enabled when length ≥ 1. Hint shows pluralised count + total balance.

Purpose: Implement REQ ONB-V10-03 on the web side.

Output: Step02Accounts + AccountBalanceForm + integration in OnboardingFlow + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-02-web-step01-income-PLAN.md
@.planning/phases/24-onboarding-4-step/24-02-web-step01-income-SUMMARY.md

@frontend/src/componentsV10/Chip.tsx
@frontend/src/componentsV10/Eyebrow.tsx
@frontend/src/componentsV10/Mass.tsx
@frontend/src/screensV10/Onboarding/onboardingReducer.ts
@frontend/src/screensV10/Onboarding/types.ts
@frontend/src/screensV10/Onboarding/OnboardingChrome.tsx

<interfaces>
<!-- Reference impl from prototype/poster-screens.jsx (lines 1381-1442). -->
<!-- We diverge on one point per CONTEXT D-05: chip-list is the entry pattern (predefined banks), not the inline-form-first pattern from prototype. -->

# Predefined chips (CONTEXT D-05):
const PRESET_BANKS = [
  { bank: 'Т-Банк',   kind: 'card' },
  { bank: 'Сбер',     kind: 'card' },
  { bank: 'Наличные', kind: 'cash' },
];
// Plus one "+ Добавить" chip → opens form with bank='' kind='card' (default)

# AccountBalanceForm props:
{ initialBank: string, initialKind: 'card'|'cash'|'savings',
  bankEditable: boolean,   // false for predefined, true for «+ Добавить»
  onSave: (account: { bank, mask?, kind, balance_cents }) => void,
  onCancel: () => void }

# Account row layout (existing accounts):
- Grid: 1fr | auto | auto | gap 10
- Col 1: bank name (Archivo Black 13, kerning 0.04em) + balance (JetBrains Mono 11, opacity 0.6) + " · основной" suffix when primary
- Col 2: star button — paper bg + coral text when primary; transparent + paper border otherwise
- Col 3: × button (JetBrains Mono 13, opacity 0.5) → REMOVE_ACCOUNT
- Border-top separator between rows (rgba 255,246,232,0.25)

# Hint string:
- 0 accounts: 'нужен минимум один счёт' (per prototype line 1398)
- 1 account: '1 счёт · {fmtNum(total)} ₽'
- 2-4 accounts: '{n} счёта · {fmtNum(total)} ₽'
- 5+ accounts: '{n} счётов · {fmtNum(total)} ₽'
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AccountBalanceForm component (inline form, reusable)</name>
  <files>
    frontend/src/screensV10/Onboarding/AccountBalanceForm.tsx,
    frontend/src/screensV10/Onboarding/AccountBalanceForm.module.css
  </files>
  <behavior>
    AccountBalanceForm:
      - Props: { initialBank: string; initialKind: 'card'|'cash'|'savings'; bankEditable: boolean; onSave: (a: {bank,mask?,kind,balance_cents}) => void; onCancel: () => void; }
      - Layout: bordered box (1px paper opacity 0.45), padding 14px
      - Header: Eyebrow opacity 0.6 «НОВЫЙ СЧЁТ»
      - Bank input: <input> bound to bankEditable (else read-only Text); placeholder "Название (Т-Банк, наличные…)"; max-length 40; bottom border paper opacity 0.4
      - Balance input: numeric (inputMode=numeric), digits-only filter, displays via thin-space format; ₽ suffix Archivo Black 18px
      - Buttons row: ОТМЕНА (ghost, 1px paper border) | ДОБАВИТЬ (paper bg, coral text, Archivo Black 11, kerning 0.16em) — disabled when bank trimmed empty
      - On save: calls onSave({ bank: bank.trim().toUpperCase(), kind: initialKind, balance_cents: parsed })
        — bank trim+uppercase per prototype line 1389 (`name.toUpperCase()`)
      - balance_cents = parseRubles(balance) * 100; default 0 if empty
  </behavior>
  <action>
    1. Create the component using same layout primitives as Step01Income (input + ₽ suffix). Reuse the format helper from Plan 24-02.
    2. Validation: bank.trim().length ∈ 1..40 (server limit); if user types >40 chars, slice or visually cap.
    3. Disable ДОБАВИТЬ button when bank.trim() is empty.
    4. CSS: dashed-border style for the wrapper similar to prototype.
    5. No tests for this component in isolation — Step02Accounts integration test exercises it.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit && npx eslint src/screensV10/Onboarding/AccountBalanceForm.tsx --max-warnings=0</automated>
  </verify>
  <done>
    Compiles clean; visually verifiable inside Step02Accounts in next task.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Step02Accounts view + chip-list + integration into OnboardingFlow + tests</name>
  <files>
    frontend/src/screensV10/Onboarding/Step02Accounts.tsx,
    frontend/src/screensV10/Onboarding/Step02Accounts.module.css,
    frontend/src/screensV10/Onboarding/OnboardingFlow.tsx,
    frontend/src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx
  </files>
  <behavior>
    Step02Accounts:
      - Props: { accounts: OnboardingAccount[]; dispatch: React.Dispatch<OnboardingAction>; }
      - State: const [formMode, setFormMode] = useState<null | { initialBank: string; initialKind: 'card'|'cash'|'savings'; editable: boolean }>(null)
      - Layout:
        - Mass italic 32px «Где лежат\nденьги?»
        - Eyebrow opacity 0.55 «ВСЕ КАРТЫ И НАЛИЧНЫЕ»
        - List of existing accounts (rendered grid rows; star + × buttons)
        - Chip row: PRESET_BANKS.map → <Chip onClick={() => setFormMode({initialBank: b.bank, initialKind: b.kind, editable: false})}>{b.bank}</Chip>; plus a `+ Добавить` chip with editable: true and initialBank: ''
        - When formMode !== null: render <AccountBalanceForm ... onSave={(acc) => { dispatch({ type:'ADD_ACCOUNT', payload: acc }); setFormMode(null); }} onCancel={() => setFormMode(null)} />
      - Star click → dispatch SET_PRIMARY { index }
      - × click → dispatch REMOVE_ACCOUNT { index }
    Hint computation (passed to OnboardingChrome via prop):
      - 0: 'нужен минимум один счёт'
      - 1: `1 счёт · ${fmtRubles(totalCents)} ₽`
      - else: `${n} ${pluralAccounts(n)} · ${fmtRubles(totalCents)} ₽` where pluralAccounts(n) returns 'счёт'/'счёта'/'счётов' per Russian plural rules:
        - one (n%10===1 && n%100!==11) → 'счёт'
        - few (n%10 ∈ 2..4 && (n%100 ∉ 12..14)) → 'счёта'
        - many → 'счётов'
    OnboardingFlow update:
      - Add case `state.step === 2` rendering Step02Accounts inside OnboardingChrome with:
        - label "ШАГ 02 / 04 · СЧЕТА"
        - onBack={() => dispatch({type:'BACK'})}
        - onNext={() => dispatch({type:'NEXT'})}
        - nextDisabled={state.accounts.length === 0}
        - hint={pluraliseHint(state.accounts)}
    Test (RTL + vitest):
      - Renders 4 chips by default (Т-Банк, Сбер, Наличные, + Добавить)
      - Click «Т-Банк» → form opens with read-only "Т-Банк" header
      - Type 50000 in balance, click ДОБАВИТЬ → dispatch called with { type:'ADD_ACCOUNT', payload:{ bank:'Т-БАНК', kind:'card', balance_cents:5_000_000 } } AND form closes
      - Pluralisation: 1→'счёт', 2→'счёта', 5→'счётов', 21→'счёт', 22→'счёта', 25→'счётов'
      - With 2 accounts in props (first primary), star-click on idx 1 → dispatch SET_PRIMARY {index:1}
      - × on idx 0 → dispatch REMOVE_ACCOUNT {index:0}
  </behavior>
  <action>
    1. Implement Step02Accounts following the prototype's account row layout (grid 1fr | auto | auto). Use the existing `Chip` component from componentsV10 for the predefined-bank chips (Chip.tsx supports `active` prop — we don't need active state here because chips trigger sheet, but keep them as Chips for visual parity).
    2. The «+ Добавить» chip can be a plain styled element if Chip doesn't support a "dashed" variant — render as a Chip with custom className override OR a plain div styled to match prototype line 1438 (1px dashed paper-opacity-0.45 border).
    3. Wire OnboardingFlow's switch: add `case 2:` that returns `<OnboardingChrome step={2} label="ШАГ 02 / 04 · СЧЕТА" onBack={...} onNext={...} nextDisabled={...} hint={pluraliseHint(...)}><Step02Accounts accounts={state.accounts} dispatch={dispatch}/></OnboardingChrome>`.
    4. Extract `pluraliseHint()` and `pluralAccounts()` helpers — put them in `frontend/src/screensV10/Onboarding/format.ts` next to the rubles formatter.
    5. Tests:
       - render Step02Accounts in isolation with mock dispatch and accounts=[]
       - render with accounts=[{bank:'Т-БАНК',kind:'card',balance_cents:5_000_000,primary:true}, ...] → assert rows render
       - simulate full add flow: click Т-Банк chip → fireEvent.change balance input → click ДОБАВИТЬ → assert dispatch payload
       - pluraliseHint helper has its own test file/section
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/Step02Accounts.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    Step02Accounts tests pass. Pluralisation table verified for n ∈ {0,1,2,3,4,5,11,12,21,22,25}. OnboardingFlow renders step 2 with correct chrome.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user free-text bank name | Could contain HTML/JS — React auto-escapes, but trim() + length cap matters |
| balance_cents range | OnboardingV10Body.balance_cents ∈ [-100M*100, +100M*100]; client must respect |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-04-01 | Tampering | bank input free-text | mitigate | trim() + slice to 40 chars before saving (server enforces same); React's JSX escapes automatically when rendered |
| T-24-04-02 | Tampering | balance overflow | mitigate | Cap input digits to 9; balance_cents = parsedRubles * 100 fits Int safely |
| T-24-04-03 | XSS via bank name | bank rendering | mitigate | All renders go through {bank} JSX expression (not dangerouslySetInnerHTML); React escapes < > & |
| T-24-04-04 | Logic flaw | multiple primary accounts | mitigate | Reducer SET_PRIMARY clears others (already in plan 24-01); ADD_ACCOUNT first-only auto-primary (already in plan 24-01) |
</threat_model>

<verification>
- npm test passes
- tsc + eslint clean
- Pluralisation table covered: 0/1/2/5/11/21/22/25 → expected forms
</verification>

<success_criteria>
- T3 + ONB-V10-03 implemented (chip-list + balance + auto-primary + NEXT-disabled rule)
- Form opens on chip tap, closes on save/cancel
- Pluralisation hint matches Russian rules
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-04-web-step02-accounts-SUMMARY.md`.
</output>
