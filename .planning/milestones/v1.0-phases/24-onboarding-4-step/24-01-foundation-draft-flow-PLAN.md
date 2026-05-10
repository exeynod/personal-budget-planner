---
phase: 24-onboarding-4-step
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/screensV10/Onboarding/defaultCategories.ts
  - frontend/src/screensV10/Onboarding/types.ts
  - frontend/src/screensV10/Onboarding/useOnboardingDraft.ts
  - frontend/src/screensV10/Onboarding/onboardingReducer.ts
  - frontend/src/screensV10/Onboarding/__tests__/useOnboardingDraft.test.ts
  - frontend/src/screensV10/Onboarding/__tests__/onboardingReducer.test.ts
  - frontend/src/api/onboardingV10.ts
  - frontend/src/api/types.ts
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift
  - ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift
  - ios/BudgetPlannerTests/OnboardingFlowTests.swift
autonomous: true
requirements: [ONB-V10-01, ONB-V10-07]
must_haves:
  truths:
    - "Web reducer + draft hook round-trip a JSON shape matching OnboardingV10Body"
    - "iOS @Observable OnboardingFlow round-trips the same JSON shape via UserDefaults"
    - "Draft sanitisation drops unknown fields and clamps invalid step numbers"
    - "Both layers expose default 8 categories (food/cafe/home/transit/fun/gifts/health/subs) with correct shares"
  artifacts:
    - path: "frontend/src/screensV10/Onboarding/useOnboardingDraft.ts"
      provides: "load/save/clear localStorage hook"
      min_lines: 60
    - path: "frontend/src/screensV10/Onboarding/onboardingReducer.ts"
      provides: "Step state machine (SET_INCOME, ADD_ACCOUNT, …, NEXT, BACK, RESET)"
      min_lines: 80
    - path: "frontend/src/screensV10/Onboarding/types.ts"
      provides: "OnboardingDraft TS shape mirroring OnboardingV10Body"
      min_lines: 40
    - path: "frontend/src/screensV10/Onboarding/defaultCategories.ts"
      provides: "DEFAULT_CATEGORIES const array"
      min_lines: 25
    - path: "frontend/src/api/onboardingV10.ts"
      provides: "postOnboardingComplete(body) typed wrapper"
      min_lines: 40
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift"
      provides: "@Observable class OnboardingFlow"
      min_lines: 120
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift"
      provides: "Codable struct OnboardingDraft"
      min_lines: 50
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift"
      provides: "static [DefaultCategory] array"
      min_lines: 25
    - path: "ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift"
      provides: "postOnboardingComplete async API call"
      min_lines: 60
  key_links:
    - from: "useOnboardingDraft.ts"
      to: "localStorage"
      via: "window.localStorage.getItem/setItem"
      pattern: "localStorage\\.(get|set)Item\\(['\"]onboarding\\.v10\\.draft['\"]"
    - from: "OnboardingFlow.swift"
      to: "UserDefaults.standard"
      via: "JSONEncoder/Decoder + UserDefaults"
      pattern: "UserDefaults\\.standard\\.(set|object|removeObject).*onboarding\\.v10\\.draft"
    - from: "frontend/src/api/onboardingV10.ts"
      to: "/api/v1/onboarding/complete"
      via: "apiFetch POST"
      pattern: "apiFetch.*'/onboarding/complete'.*POST"
    - from: "ios OnboardingAPI.swift"
      to: "/api/v1/onboarding/complete"
      via: "APIClient.shared.request POST"
      pattern: "APIClient\\.shared\\.request\\(.*POST.*onboarding/complete"
---

<objective>
Foundation layer for Phase 24: TypeScript types + reducer + localStorage draft hook on the web side, and the symmetric `@Observable OnboardingFlow` + `Codable OnboardingDraft` + `UserDefaults` round-trip on iOS. Both expose the same JSON wire shape that mirrors `OnboardingV10Body` from Phase 22 (`app/api/schemas/onboarding_v10.py`). Adds typed API wrappers (`postOnboardingComplete`) and the shared 8-default-categories module both sides import from.

Purpose: Down-stream plans (24-02..24-09) build the visual step components on top of this state foundation; 24-10 / 24-11 wire the flow into the app shells. By committing types + draft I/O + reducer first, all per-step plans receive a deterministic state contract — they never invent `dispatch` actions or invent JSON keys.

Output: 4 web files + 4 iOS files + 2 shared API wrappers + 3 test files (unit, no Playwright/XCUI yet — those come in 24-10 / 24-11).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md

@app/api/schemas/onboarding_v10.py
@app/api/schemas/me_v10.py
@frontend/src/api/client.ts
@frontend/src/api/types.ts
@ios/BudgetPlanner/Networking/APIClient.swift

<interfaces>
<!-- Wire contract from Phase 22 (read-only). Mirror this exactly in TS + Swift. -->

# Python — request body (POST /api/v1/onboarding/complete)
class OnboardingV10Body(BaseModel):
    income_cents: int           # > 0, ≤ 100_000_000_00
    accounts: list[OnboardingAccountItem]   # 1..20
    category_plans: dict[str, int]          # keys ∈ {food,cafe,home,transit,fun,gifts,health,subs}; values ≥ 0; Σ ≤ income_cents
    goal: Optional[OnboardingGoalItem]
    savings_config: Optional[OnboardingSavingsConfigItem]

class OnboardingAccountItem(BaseModel):
    bank: str          # 1..40
    mask: Optional[str]   # ≤16
    kind: Literal["card","cash","savings"]
    balance_cents: int    # [-100M*100, +100M*100], default 0
    primary: bool         # default False; at most one True

class OnboardingGoalItem(BaseModel):
    name: str           # 1..80
    target_cents: int   # > 0, ≤ 100_000_000_00
    due: Optional[date] # Europe/Moscow today + 1d strict

class OnboardingSavingsConfigItem(BaseModel):
    roundup_enabled: bool   # default False
    base: Literal[10, 50, 100]   # default 10

# Response shape
class OnboardingV10Response(BaseModel):
    user_id: int
    income_cents: int
    account_ids: list[int]
    category_ids_by_code: dict[str, int]
    savings_category_id: int
    goal_id: Optional[int]
    savings_config: { roundup_enabled: bool, roundup_base: int }
    onboarded_at: str   # ISO-8601
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Web foundation — defaultCategories + types + reducer + draft hook + API wrapper</name>
  <files>
    frontend/src/screensV10/Onboarding/defaultCategories.ts,
    frontend/src/screensV10/Onboarding/types.ts,
    frontend/src/screensV10/Onboarding/useOnboardingDraft.ts,
    frontend/src/screensV10/Onboarding/onboardingReducer.ts,
    frontend/src/screensV10/Onboarding/__tests__/useOnboardingDraft.test.ts,
    frontend/src/screensV10/Onboarding/__tests__/onboardingReducer.test.ts,
    frontend/src/api/onboardingV10.ts,
    frontend/src/api/types.ts
  </files>
  <behavior>
    onboardingReducer:
      - initial state: { step: 1, income_cents: 0, accounts: [], category_plans: {}, goal: null, savings_config: null }
      - SET_INCOME { income_cents } → updates income_cents (>=0; reject negative by clamping to 0); ALSO recomputes default category_plans from DEFAULT_CATEGORIES.share when category_plans is empty
      - ADD_ACCOUNT { bank, kind, balance_cents, mask? } → appends; first added gets primary=true automatically; subsequent stay primary=false unless SET_PRIMARY action used
      - REMOVE_ACCOUNT { index } → removes; if removed primary, the remaining[0] (if any) becomes primary
      - SET_PRIMARY { index } → flips primary on index, clears others
      - SET_PLAN { code, cents } → sets category_plans[code] (clamps to >=0); ignores codes not in DEFAULT_CATEGORIES
      - SET_GOAL { name, target_cents, due? } → sets goal field
      - SKIP_GOAL → goal=null
      - NEXT → step+1 capped at 5 (Final)
      - BACK → step-1 floored at 1
      - RESET → returns initial state
    useOnboardingDraft:
      - load(): returns sanitised draft (drops unknown fields per CONTEXT §threat model "draft injection"; clamps step ∈ 1..5; ignores non-array accounts; ignores non-object category_plans; ignores goal with bad shape) OR null when key missing
      - save(state): stringifies, writes to localStorage['onboarding.v10.draft']
      - clear(): localStorage.removeItem
      - tolerates SSR / no-window via typeof window guards (no-op fallback)
    Tests must cover:
      - reducer: every action transitions state correctly + idempotency on RESET
      - reducer: ADD_ACCOUNT auto-primary on first; SET_PRIMARY uniqueness invariant
      - reducer: SET_INCOME with empty plan triggers default share allocation (food=20% rounded down to step 500₽ * 100 cents)
      - draft hook: round-trips arbitrary state; load() returns null when no key; sanitises injected `__proto__`/extra keys; clamps step=99 → 5 (or rejects entire payload — implementer decides; document choice)
  </behavior>
  <action>
    1. Create `frontend/src/screensV10/Onboarding/defaultCategories.ts` exporting:
       ```ts
       export interface DefaultCategory { code: 'food'|'cafe'|'home'|'transit'|'fun'|'gifts'|'health'|'subs'; name: string; ord: string; share: number; }
       export const DEFAULT_CATEGORIES: ReadonlyArray<DefaultCategory> = [
         { code:'food', name:'ПРОДУКТЫ', ord:'01', share:0.20 },
         { code:'cafe', name:'КАФЕ', ord:'02', share:0.10 },
         { code:'home', name:'ДОМ', ord:'03', share:0.30 },
         { code:'transit', name:'ТРАНСПОРТ', ord:'04', share:0.06 },
         { code:'fun', name:'РАЗВЛЕЧ.', ord:'05', share:0.05 },
         { code:'gifts', name:'ПОДАРКИ', ord:'06', share:0.04 },
         { code:'health', name:'ЗДОРОВЬЕ', ord:'07', share:0.05 },
         { code:'subs', name:'ПОДПИСКИ', ord:'08', share:0.03 },
       ];
       export const VALID_CATEGORY_CODES = new Set(DEFAULT_CATEGORIES.map(c => c.code));
       ```
       (per D-04, exact shares matching DATA-MODEL §1.3 + the prototype)
    2. Create `frontend/src/screensV10/Onboarding/types.ts` exporting `OnboardingDraft`, `OnboardingAccount`, `OnboardingGoal`, `OnboardingSavingsConfig`, `OnboardingStep` (=1..5; step 5 = Final). Field names verbatim from `OnboardingV10Body`. Use `snake_case` for wire fields (income_cents, balance_cents, target_cents, etc.) — do NOT camelCase or schema mismatch on submit.
    3. Create `frontend/src/screensV10/Onboarding/onboardingReducer.ts`:
       - `export type OnboardingAction = | { type:'SET_INCOME'; payload:{income_cents:number} } | { type:'ADD_ACCOUNT'; payload:{bank:string;kind:'card'|'cash'|'savings';balance_cents:number;mask?:string} } | { type:'REMOVE_ACCOUNT'; payload:{index:number} } | { type:'SET_PRIMARY'; payload:{index:number} } | { type:'SET_PLAN'; payload:{code:string;cents:number} } | { type:'SET_GOAL'; payload:OnboardingGoal } | { type:'SKIP_GOAL' } | { type:'NEXT' } | { type:'BACK' } | { type:'RESET' }`
       - `export const INITIAL_STATE: OnboardingDraft = { step:1, income_cents:0, accounts:[], category_plans:{}, goal:null, savings_config:null };`
       - `export function onboardingReducer(state, action): OnboardingDraft { … }`
       - SET_INCOME triggers default-plan recompute: when `Object.keys(state.category_plans).length === 0`, populate via `Math.floor(income_cents * share / 50000) * 50000` per category (per D-06 — step 500₽ = 50_000 cents, floor down).
    4. Create `frontend/src/screensV10/Onboarding/useOnboardingDraft.ts`:
       - `const STORAGE_KEY = 'onboarding.v10.draft';`
       - `export function useOnboardingDraft(): { load: () => OnboardingDraft | null; save: (state: OnboardingDraft) => void; clear: () => void; }`
       - `load()` parses JSON, runs `sanitiseDraft()` (private function): keeps only known top-level fields; clamps step ∈ 1..5 (out-of-range → return null entirely so we don't resume garbage); validates accounts is array; validates category_plans keys against VALID_CATEGORY_CODES; defensively ignores `__proto__`, prototype-pollution patterns. Returns null on JSON.parse error.
       - `save()` JSON.stringify + setItem; swallow QuotaExceededError silently (log via console.warn).
       - `clear()` localStorage.removeItem(STORAGE_KEY).
       - All three guard `typeof window !== 'undefined'` for SSR safety.
    5. Create `frontend/src/api/onboardingV10.ts`:
       ```ts
       import { apiFetch } from './client';
       import type { OnboardingDraft } from '../screensV10/Onboarding/types';
       export interface OnboardingV10Response { user_id:number; income_cents:number; account_ids:number[]; category_ids_by_code:Record<string,number>; savings_category_id:number; goal_id:number|null; savings_config:{roundup_enabled:boolean; roundup_base:number}; onboarded_at:string; }
       export interface OnboardingV10Body { income_cents:number; accounts:Array<{bank:string;mask?:string|null;kind:'card'|'cash'|'savings';balance_cents:number;primary:boolean}>; category_plans:Record<string,number>; goal?:{name:string;target_cents:number;due?:string}|null; savings_config?:{roundup_enabled:boolean; base:10|50|100}|null; }
       export function postOnboardingComplete(body: OnboardingV10Body): Promise<OnboardingV10Response> {
         return apiFetch<OnboardingV10Response>('/onboarding/complete', { method:'POST', body: JSON.stringify(body) });
       }
       export function serialiseDraft(draft: OnboardingDraft): OnboardingV10Body { /* strips step, omits goal when null */ }
       ```
       — `serialiseDraft` must omit the `step` field (it's UI-only) and emit `goal: undefined` (i.e. omit key) when draft.goal === null so server-side `extra="forbid"` doesn't bite (Pydantic `Optional` accepts missing key but here goal=null is also valid; test both).
    6. Extend `frontend/src/api/types.ts` if needed to add `MeV10Response` extension (income_cents: number | null) — only if not already present; otherwise leave types.ts untouched. Re-export nothing new from the index — onboarding types stay in their own namespace.
    7. Tests:
       - `__tests__/onboardingReducer.test.ts` (vitest): cover every action; ADD_ACCOUNT first-primary invariant; REMOVE_ACCOUNT primary-handoff; SET_INCOME with empty plan auto-allocates 8 codes; NEXT capped at 5; BACK floored at 1.
       - `__tests__/useOnboardingDraft.test.ts` (vitest): mock localStorage via `vi.stubGlobal('localStorage', …)`; save→load round-trip equal; load() returns null when nothing stored; sanitises step=99 → null; sanitises unknown keys (e.g., `{step:1, income_cents:0, accounts:[], category_plans:{}, goal:null, savings_config:null, __evil:'pwn'}`) by dropping `__evil` (or rejecting entirely — pick one + assert).

    No CSS yet. No React component yet. Pure data layer.
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__/onboardingReducer.test.ts src/screensV10/Onboarding/__tests__/useOnboardingDraft.test.ts</automated>
  </verify>
  <done>
    All vitest specs pass. `cd frontend && npx tsc --noEmit` succeeds (no new TS errors). Files exist at the listed paths and export the symbols enumerated above.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: iOS foundation — OnboardingDraft Codable + @Observable OnboardingFlow + DefaultCategories + OnboardingAPI</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift,
    ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift,
    ios/BudgetPlannerTests/OnboardingFlowTests.swift
  </files>
  <behavior>
    OnboardingDraft (Codable struct):
      - mirrors web JSON shape verbatim: step, income_cents, accounts:[OnboardingAccount], category_plans:[String:Int], goal:OnboardingGoal?, savings_config:OnboardingSavingsConfig?
      - snake_case CodingKeys for income_cents, balance_cents, target_cents, savings_config, etc.
    OnboardingFlow (@Observable final class):
      - holds: step:Int, incomeCents:Int, accounts:[OnboardingAccount], categoryPlans:[String:Int], goal:OnboardingGoal?, savingsConfig:OnboardingSavingsConfig?
      - methods:
        - setIncome(_:Int) — clamps ≥0; if categoryPlans empty, auto-allocates floor(income * share / 50_000) * 50_000 across 8 codes
        - addAccount(bank:String, kind:AccountKind, balanceCents:Int, mask:String?=nil) — first added auto-primary; subsequent primary=false
        - removeAccount(at:Int) — if removed primary, accounts.first?.primary = true
        - setPrimary(at:Int) — clears all others
        - setPlan(code:String, cents:Int) — ignores unknown codes (whitelist via DefaultCategories.codes)
        - setGoal(_:OnboardingGoal) / skipGoal()
        - next() / back() (capped 1..5)
        - reset()
      - persistence:
        - private `save()` (JSONEncoder → UserDefaults.standard, key "onboarding.v10.draft")
        - private `load()` returns OnboardingDraft? (sanitises: clamps step ∈ 1..5; rejects on JSON decode error; strict Codable means unknown JSON keys are ignored by default, that's fine)
        - public `clearDraft()` removes the key
      - persists on every mutation (save() called at end of each method)
    OnboardingAPI:
      - struct OnboardingAPIBody (Encodable) mirroring server schema
      - struct OnboardingAPIResponse (Decodable)
      - `static func postOnboardingComplete(body: OnboardingAPIBody) async throws -> OnboardingAPIResponse` using APIClient.shared.request("POST", "/onboarding/complete", body: body)
    Tests (XCTest):
      - addAccount auto-primary; removeAccount primary-handoff
      - setIncome with empty plan auto-allocates 8 codes
      - JSONEncoder/Decoder round-trips OnboardingDraft losslessly
      - persist + new instance + load() → identical state
      - sanitiser rejects step=99 → load() returns nil (or clamps — pick + assert)
  </behavior>
  <action>
    1. Create `ios/BudgetPlanner/FeaturesV10/Onboarding/DefaultCategories.swift`:
       ```swift
       struct DefaultCategory: Hashable, Sendable {
           let code: String
           let name: String
           let ord: String
           let share: Double
       }
       enum DefaultCategories {
           static let all: [DefaultCategory] = [
               .init(code:"food",    name:"ПРОДУКТЫ",  ord:"01", share:0.20),
               .init(code:"cafe",    name:"КАФЕ",      ord:"02", share:0.10),
               .init(code:"home",    name:"ДОМ",       ord:"03", share:0.30),
               .init(code:"transit", name:"ТРАНСПОРТ", ord:"04", share:0.06),
               .init(code:"fun",     name:"РАЗВЛЕЧ.",  ord:"05", share:0.05),
               .init(code:"gifts",   name:"ПОДАРКИ",   ord:"06", share:0.04),
               .init(code:"health",  name:"ЗДОРОВЬЕ",  ord:"07", share:0.05),
               .init(code:"subs",    name:"ПОДПИСКИ",  ord:"08", share:0.03),
           ]
           static let codes: Set<String> = Set(all.map { $0.code })
       }
       ```
    2. Create `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingDraft.swift`:
       - `struct OnboardingAccount: Codable, Hashable { var bank: String; var mask: String?; var kind: AccountKind; var balanceCents: Int; var primary: Bool; enum AccountKind: String, Codable { case card, cash, savings } }`
       - `struct OnboardingGoal: Codable, Hashable { var name: String; var targetCents: Int; var due: String? /* ISO yyyy-MM-dd */ }`
       - `struct OnboardingSavingsConfig: Codable, Hashable { var roundupEnabled: Bool; var base: Int /* 10/50/100 */ }`
       - `struct OnboardingDraft: Codable { var step: Int; var incomeCents: Int; var accounts: [OnboardingAccount]; var categoryPlans: [String: Int]; var goal: OnboardingGoal?; var savingsConfig: OnboardingSavingsConfig? }`
       - All structs: `enum CodingKeys: String, CodingKey { case bank, mask, kind; case balanceCents = "balance_cents"; case primary }` (etc. — snake_case wire mapping for every camelCase Swift property).
    3. Create `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift`:
       - `@Observable final class OnboardingFlow`
       - storage-key constant: `private static let draftKey = "onboarding.v10.draft"`
       - init() loads from UserDefaults if present (sanitised); otherwise INITIAL state (step=1, incomeCents=0, accounts=[], categoryPlans=[:], goal=nil, savingsConfig=nil)
       - implements all behaviour methods listed above; each calls `private func persist()` at end
       - `func clearDraft() { UserDefaults.standard.removeObject(forKey: Self.draftKey) }`
       - `func toDraft() -> OnboardingDraft` — pure conversion for persistence + serialisation
       - `func toAPIBody() -> OnboardingAPIBody` — serialise for submit (drops step; omits goal if nil)
    4. Create `ios/BudgetPlanner/Networking/Endpoints/OnboardingAPI.swift`:
       - `struct OnboardingAPIBody: Encodable { let incomeCents: Int; let accounts: [APIAccount]; let categoryPlans: [String:Int]; let goal: APIGoal?; let savingsConfig: APISavingsConfig?; ... CodingKeys snake_case }`
       - `struct OnboardingAPIResponse: Decodable { let userId: Int; let incomeCents: Int; let accountIds: [Int]; let categoryIdsByCode: [String:Int]; let savingsCategoryId: Int; let goalId: Int?; let savingsConfig: SavingsConfigOut; let onboardedAt: String; ... CodingKeys snake_case }`
       - `enum OnboardingAPI { static func postComplete(_ body: OnboardingAPIBody) async throws -> OnboardingAPIResponse { try await APIClient.shared.request("POST", "/onboarding/complete", body: body) } }`
       - Verify call signature against existing APIClient (read `ios/BudgetPlanner/Networking/APIClient.swift` to confirm `request(_:_:body:)` arity); adjust if API differs.
    5. Create `ios/BudgetPlannerTests/OnboardingFlowTests.swift` (XCTest):
       - `func testAddAccountAutoPrimary()`: empty flow, addAccount → accounts[0].primary == true; addAccount second → accounts[1].primary == false
       - `func testRemoveAccountPrimaryHandoff()`: 2 accounts, primary on idx 0, remove(at:0) → accounts[0].primary == true (was idx 1)
       - `func testSetIncomeAutoAllocatesPlan()`: setIncome(80_000_00); assert categoryPlans["food"] == Int(floor(80_000_00 * 0.20 / 50_000)) * 50_000 == 16_000_00 (= 1_600_000 cents)
       - `func testNextBackBounds()`: 5 nexts cap at step 5; 5 backs floor at step 1
       - `func testDraftRoundTrip()`: encode → decode → equal
       - `func testPersistAndLoadAcrossInstances()`: instance A.setIncome(123_45); deinit; instance B.init() → B.incomeCents == 123_45 (use suite UserDefaults fixture: `UserDefaults(suiteName: "test")` injected via init parameter — refactor flow to accept defaults: UserDefaults = .standard)
       - `func testSanitiserRejectsBadStep()`: write { "step": 99, … } via UserDefaults raw; new Flow.init → falls back to INITIAL (step=1) — confirms clamp/reject behaviour
    6. Make `make tests` (or `make build` if test target not configured) pass.
  </action>
  <verify>
    <automated>cd ios && (make tests 2>/dev/null || make build) && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/OnboardingFlowTests 2>&1 | tail -40</automated>
  </verify>
  <done>
    All XCTest cases pass. `make build` succeeds. UserDefaults round-trip works via injectable defaults parameter (test isolation).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server (POST /onboarding/complete) | Untrusted JSON body crosses here — server already validates via Pydantic strict + extra="forbid"; client must not mistakenly send camelCase or unknown keys |
| browser → localStorage (web) | Draft can be tampered by user/extension between sessions — sanitiser must drop unknown keys + clamp step |
| app → UserDefaults (iOS) | Same as above; app sandbox protects against external tampering, but format mismatch on schema migration must not crash |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-01-01 | Tampering | localStorage / UserDefaults draft | mitigate | `sanitiseDraft()` whitelists known top-level fields; `step ∉ 1..5` → reject entire payload (return null/nil); category_plans keys checked against VALID_CATEGORY_CODES |
| T-24-01-02 | Tampering | wire body to /onboarding/complete | accept (server-side defence) | Server `OnboardingV10Body` has `extra="forbid"` + strict + Σ-checks; client only emits fields listed in OnboardingV10Body; unit test asserts serialiseDraft does NOT include `step` |
| T-24-01-03 | Information Disclosure | localStorage draft | accept | Draft contains user's monthly income + bank account names — no PII beyond what user just entered; same threat surface as any in-progress form. Single-tenant pet, low-value target |
| T-24-01-04 | Denial of Service | malformed JSON in localStorage causing JSON.parse throw on every load | mitigate | try/catch in load(); on parse error, clear the bad key + return null/nil so user gets fresh flow rather than hard crash |
| T-24-01-05 | Tampering | prototype pollution via `__proto__` in stored JSON | mitigate | sanitiseDraft uses `Object.create(null)` for the destination object OR uses an explicit field-by-field copy (no spread) when reconstructing the draft |
</threat_model>

<verification>
Manual sanity:
```bash
cd frontend && npm test -- --run src/screensV10/Onboarding/__tests__
cd frontend && npx tsc --noEmit
cd ios && make build
```

All three must succeed. Reducer tests specifically prove every truth listed in must_haves.
</verification>

<success_criteria>
- All vitest specs pass; all XCTest specs pass.
- `frontend/src/api/onboardingV10.ts` exposes `postOnboardingComplete` and `serialiseDraft`.
- `OnboardingFlow.swift` exposes `next()`, `back()`, `setIncome(_:)`, `addAccount(...)`, `removeAccount(at:)`, `setPrimary(at:)`, `setPlan(code:cents:)`, `setGoal(_:)`, `skipGoal()`, `clearDraft()`, `toAPIBody()`.
- TypeScript `OnboardingDraft` JSON serialisation === Swift `OnboardingDraft` JSON encoding (verified manually by encoding the same logical state in both languages and `diff`-ing the resulting JSON — document in SUMMARY).
- No UI yet — pure foundation. Subsequent plans build on top.
</success_criteria>

<output>
After completion, create `.planning/phases/24-onboarding-4-step/24-01-foundation-draft-flow-SUMMARY.md` listing:
- exact file paths created
- key reducer/method signatures
- a sample JSON draft (e.g., post-step-2 state) emitted by both web and iOS, demonstrating identical wire format
</output>
