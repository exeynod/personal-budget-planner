---
phase: 25-home-transactions-add-sheet
plan: 3
type: execute
wave: 2
depends_on: [1]
files_modified:
  - frontend/src/api/types.ts
  - frontend/src/api/v10/actual.ts
  - frontend/src/api/v10/accounts.ts
  - frontend/src/api/v10/categories.ts
  - frontend/src/api/v10/index.ts
  - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
  - ios/BudgetPlanner/Networking/DTO/AccountDTO.swift
  - ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
  - ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift
  - ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift
  - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
autonomous: true
requirements:
  - HOME-V10-02
  - HOME-V10-04
  - TXN-V10-04
  - ADD-V10-04
  - ADD-V10-05

must_haves:
  truths:
    - "Web `api/v10/actual.ts` exports listActualV10 + createActualV10 with extended kind enum and account_id."
    - "Web `api/v10/accounts.ts` exports listAccounts → AccountResponse[] (id, bank, mask, kind, balance_cents, primary)."
    - "Web `api/v10/categories.ts` exports listCategoriesV10 → CategoryV10[] (with code, plan_cents, paused, rollover, ord, parent_id)."
    - "iOS AccountDTO / CategoryV10DTO / extended ActualDTO Decodable via APIClient JSONDecoder (snake_case)."
    - "iOS AccountsAPI.list() / CategoriesV10API.list() / extended ActualAPI.create accepting account_id."
  artifacts:
    - path: "frontend/src/api/v10/actual.ts"
      provides: "Typed v10 actual wrappers"
      exports: ["listActualV10", "createActualV10", "type ActualV10Kind", "type ActualV10Read", "type ActualV10Create"]
    - path: "frontend/src/api/v10/accounts.ts"
      provides: "Typed accounts wrapper"
      exports: ["listAccounts", "type AccountResponse"]
    - path: "frontend/src/api/v10/categories.ts"
      provides: "Typed categories wrapper for v10 surface"
      exports: ["listCategoriesV10", "type CategoryV10"]
    - path: "ios/BudgetPlanner/Networking/DTO/AccountDTO.swift"
      provides: "AccountDTO Decodable mirror of AccountRead"
    - path: "ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift"
      provides: "CategoryV10DTO with v1.0 fields"
    - path: "ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift"
      provides: "AccountsAPI.list() async throws -> [AccountDTO]"
    - path: "ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift"
      provides: "CategoriesV10API.list() async throws -> [CategoryV10DTO]"
  key_links:
    - from: "frontend/src/api/v10/actual.ts"
      to: "/api/v1/actual + /api/v1/periods/{id}/actual"
      via: "apiFetch from ../client"
      pattern: "apiFetch.*actual"
    - from: "ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift"
      to: "ActualCreateRequest with optional accountId field"
      via: "Encodable mapping (camelCase → snake_case via APIClient encoder)"
      pattern: "let accountId: Int\\?"
---

<objective>
Build typed API client wrappers (web + iOS) for the v1.0 surfaces consumed by Phase 25 UI: `/accounts`, `/categories` (v1.0 fields), `/actual` (v10 kind + account_id). Without typed wrappers, every UI plan reinvents fetch shapes.

Purpose: provide a single source of truth for v10 wire shapes so all downstream UI plans (Home, Transactions, AddSheet) import from one place.
Output: 3 new web modules under `frontend/src/api/v10/` + 3 iOS DTOs + 2 new iOS API enums + extended ActualDTO/ActualCreateRequest.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/phases/25-home-transactions-add-sheet/25-01-backend-actual-v10-PLAN.md
@app/api/schemas/accounts.py
@app/api/schemas/actual.py
@frontend/src/api/client.ts
@frontend/src/api/types.ts
@frontend/src/api/actual.ts
@frontend/src/api/categories.ts
@ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
@ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift

<interfaces>
<!-- Backend wire contracts after Plan 25-01 lands. -->

POST /api/v1/actual request body (Phase 25-01 extension):
```json
{
  "kind": "expense" | "income" | "roundup" | "deposit",
  "amount_cents": 100,
  "description": null,
  "category_id": 1,
  "tx_date": "2026-05-09",
  "account_id": 42  // optional — when present, triggers create_actual_v10 (balance + roundup)
}
```

ActualRead response (extended in 25-01):
```json
{
  "id": 1, "period_id": 5, "kind": "expense",
  "amount_cents": 100, "description": null, "category_id": 1,
  "tx_date": "2026-05-09", "source": "mini_app", "created_at": "...",
  "account_id": 42,         // new
  "parent_txn_id": null     // new — non-null on roundup children
}
```

GET /api/v1/accounts → AccountRead[] (Phase 22-13):
```json
[{
  "id": 1, "bank": "Т-Банк", "mask": "3477", "kind": "card",
  "balance_cents": 5000000, "primary": true, "created_at": "..."
}]
```

GET /api/v1/categories → CategoryRead[] (Phase 22 extended schema, see app/api/schemas/categories.py).
Look at the actual schema file when implementing — fields are: id, name, kind (expense|income), code (food/cafe/...), is_archived, sort_order, plan_cents, rollover (misc|savings), paused, parent_id, ord, created_at.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API JSON → typed client | Server-controlled shape; client trusts wire schema after Phase 22 RLS. |
| Form input → createActualV10 body | client validates amount_cents > 0 + category_id > 0 before POST; server re-validates. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-03-01 | Tampering | client createActualV10 sending negative amount_cents | mitigate | Type signature requires positive int; runtime guard `if (amount_cents <= 0) throw new Error(...)` before fetch. Server enforces `gt=0` Pydantic. |
| T-25-03-02 | Spoofing | account_id from URL/router state crossed to API | accept | RLS server-side rejects cross-tenant; client need not validate. |
| T-25-03-03 | Information Disclosure | Logging full ActualRead with description containing PII | accept | Single-tenant app; description is owner-authored — no leak. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Web v10 API wrappers</name>
  <files>frontend/src/api/types.ts, frontend/src/api/v10/actual.ts, frontend/src/api/v10/accounts.ts, frontend/src/api/v10/categories.ts, frontend/src/api/v10/index.ts</files>
  <action>
    1. **Extend `frontend/src/api/types.ts`** (additive — do NOT modify existing exports):
       - Add `export type ActualV10Kind = 'expense' | 'income' | 'roundup' | 'deposit';`
       - Add `export interface ActualV10Read` mirroring v0.x ActualRead but with `kind: ActualV10Kind`, `account_id: number | null`, `parent_txn_id: number | null`.
       - Add `export interface ActualV10CreatePayload { kind: ActualV10Kind; amount_cents: number; description?: string | null; category_id: number; tx_date: string; account_id?: number | null; }`.
       - Add `export interface AccountResponse { id: number; bank: string; mask: string | null; kind: 'card'|'cash'|'savings'; balance_cents: number; primary: boolean; created_at: string; }`.
       - Add `export type CategoryRollover = 'misc' | 'savings';`
       - Add `export interface CategoryV10 { id: number; name: string; kind: 'expense'|'income'; code: string | null; is_archived: boolean; sort_order: number; plan_cents: number; rollover: CategoryRollover; paused: boolean; parent_id: number | null; ord: number; created_at: string; }` — read schemas/categories.py to confirm exact field set; use Optional only for fields actually nullable in DB.

    2. Create `frontend/src/api/v10/actual.ts`:
       ```typescript
       import { apiFetch } from '../client';
       import type { ActualV10Read, ActualV10CreatePayload } from '../types';

       export type { ActualV10Read, ActualV10CreatePayload, ActualV10Kind } from '../types';

       /** GET /api/v1/periods/{id}/actual — returns all kinds (incl. roundup/deposit). */
       export async function listActualV10(
         periodId: number,
         filters?: { kind?: 'expense'|'income'|'roundup'|'deposit'; category_id?: number },
       ): Promise<ActualV10Read[]> {
         const qs = new URLSearchParams();
         if (filters?.kind) qs.set('kind', filters.kind);
         if (filters?.category_id !== undefined) qs.set('category_id', String(filters.category_id));
         const suffix = qs.toString() ? `?${qs.toString()}` : '';
         return apiFetch<ActualV10Read[]>(`/periods/${periodId}/actual${suffix}`);
       }

       /** POST /api/v1/actual — pass account_id to trigger v10 path (balance + roundup). */
       export async function createActualV10(payload: ActualV10CreatePayload): Promise<ActualV10Read> {
         if (payload.amount_cents <= 0) throw new Error('amount_cents must be positive');
         return apiFetch<ActualV10Read>('/actual', { method: 'POST', body: JSON.stringify(payload) });
       }
       ```

    3. Create `frontend/src/api/v10/accounts.ts`:
       ```typescript
       import { apiFetch } from '../client';
       import type { AccountResponse } from '../types';
       export type { AccountResponse };

       /** GET /api/v1/accounts — returns user's accounts (primary first per backend ordering). */
       export async function listAccounts(): Promise<AccountResponse[]> {
         return apiFetch<AccountResponse[]>('/accounts');
       }
       ```

    4. Create `frontend/src/api/v10/categories.ts`:
       ```typescript
       import { apiFetch } from '../client';
       import type { CategoryV10 } from '../types';
       export type { CategoryV10 };

       /** GET /api/v1/categories — returns active categories with v1.0 fields. */
       export async function listCategoriesV10(includeArchived = false): Promise<CategoryV10[]> {
         const qs = includeArchived ? '?include_archived=true' : '';
         return apiFetch<CategoryV10[]>(`/categories${qs}`);
       }
       ```

    5. Create `frontend/src/api/v10/index.ts` barrel exporting all from 3 modules.

    6. **Verify schema field set** by reading `app/api/schemas/categories.py` BEFORE implementing CategoryV10 — confirm exact field list (some may not have shipped yet — if `code/plan_cents/rollover/paused/parent_id/ord` are missing, mark them as `?: null` optionals on the TS type with a comment «pending Phase 22 schema update»). Document any schema gap in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -10</automated>
  </verify>
  <done>tsc clean; barrel exports correctly resolve; types.ts additions don't conflict with existing v0.x types.</done>
</task>

<task type="auto">
  <name>Task 2: iOS DTOs (Account / CategoryV10) + extend ActualDTO/ActualCreateRequest</name>
  <files>ios/BudgetPlanner/Networking/DTO/AccountDTO.swift, ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift, ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift</files>
  <action>
    1. Create `AccountDTO.swift`:
       ```swift
       import Foundation
       enum AccountKind: String, Decodable { case card, cash, savings }

       struct AccountDTO: Decodable, Identifiable, Equatable {
           let id: Int
           let bank: String
           let mask: String?
           let kind: AccountKind
           let balanceCents: Int
           let primary: Bool                     // wire field 'primary' decoded via .convertFromSnakeCase as `primary` (no transform needed for single-word)
           let createdAt: Date?
       }
       ```

    2. Create `CategoryV10DTO.swift`:
       ```swift
       import Foundation
       enum CategoryRollover: String, Decodable { case misc, savings }

       struct CategoryV10DTO: Decodable, Identifiable, Equatable {
           let id: Int
           let name: String
           let kind: CategoryKind                // existing v0.x enum reused
           let code: String?                     // 'food'|'cafe'|... — nullable for legacy
           let isArchived: Bool
           let sortOrder: Int
           let planCents: Int
           let rollover: CategoryRollover
           let paused: Bool
           let parentId: Int?
           let ord: Int
           let createdAt: Date?
       }
       ```
       — **Verify field set against `app/api/schemas/categories.py`** before committing; if Phase 22 schema doesn't yet emit some fields, mark them as `Int?`/optional in DTO with comment «pending Phase 22 schema update — falls back to default» AND add a defaulting Decodable init for missing keys. Document gap in SUMMARY.

    3. Modify `TransactionDTO.swift`:
       - Add new enum `enum ActualKindV10: String, Decodable { case expense, income, roundup, deposit }`. Keep existing `CategoryKind` untouched.
       - **Replace** `ActualDTO.kind: CategoryKind` → `ActualDTO.kind: ActualKindV10` (4-valued). This is a **breaking change** for v0.6 Features/Transactions/TransactionEditor.swift consumers — they only handle 2-valued. Audit grep first:
         ```
         grep -rn "ActualDTO" ios/BudgetPlanner/ | grep -v Tests/
         ```
         For each consumer that switches over `dto.kind`, ensure default case (or filter out roundup/deposit before display). Phase 25 plan 25-04 (iOS Transactions) handles the new kinds; Phase 25 plan 25-09 keeps v0.6 Transactions tab demoted (no new code touches it).
         If breakage is too large, alternative: keep `ActualDTO.kind: CategoryKind` and ADD a sibling `kindRaw: String` (always decodable) — UI consumers parse `kindRaw` themselves. Choose the cleaner enum approach if v0.6 consumers can be updated safely.
       - Add `let accountId: Int?` to ActualDTO.
       - Add `let parentTxnId: Int?` to ActualDTO.
       - Modify `ActualCreateRequest`:
         - `let kind: String` already present — fine (enum constants are passed as string from caller).
         - Add `let accountId: Int?` (encodes to `account_id` via `.convertToSnakeCase`).

    4. **Audit existing v0.6 ActualDTO consumers** before changing kind type:
       - `Features/AI/AIChatView.swift:114` — uses `ActualCreateRequest(kind:...)` — encoder side, no impact.
       - `Features/Transactions/TransactionEditor.swift:213` — same.
       - `Features/Transactions/TransactionsView.swift` — reads `ActualDTO.kind`. Must add default arm or filter.
       - Any analytics screens reading kind.
       Provide an inline update or feature-flag the kind change. Recommended: keep CategoryKind in v0.6 path by **adding** a new `ActualV10DTO` as a separate type used only by V10 features, leaving v0.6 ActualDTO untouched. This is the safer split — record the rationale in code comment and SUMMARY.
       
       **Final decision:** create a NEW `ActualV10DTO` struct in TransactionDTO.swift (not replace existing `ActualDTO`). v0.6 features continue using legacy ActualDTO with 2-valued kind. V10 plans use ActualV10DTO.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -20</automated>
  </verify>
  <done>iOS build clean; new DTOs decode properly via APIClient JSONDecoder; v0.6 ActualDTO untouched (no regression in legacy screens).</done>
</task>

<task type="auto">
  <name>Task 3: iOS API endpoints — Accounts / CategoriesV10 / extended TransactionsAPI</name>
  <files>ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift, ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift, ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift</files>
  <action>
    1. Create `AccountsAPI.swift`:
       ```swift
       import Foundation

       @MainActor
       enum AccountsAPI {
           static func list() async throws -> [AccountDTO] {
               try await APIClient.shared.request("GET", "/accounts")
           }
       }
       ```

    2. Create `CategoriesV10API.swift`:
       ```swift
       import Foundation

       @MainActor
       enum CategoriesV10API {
           static func list(includeArchived: Bool = false) async throws -> [CategoryV10DTO] {
               let q: [String: String]? = includeArchived ? ["include_archived": "true"] : nil
               return try await APIClient.shared.request("GET", "/categories", query: q)
           }
       }
       ```
       — Note: legacy `CategoriesAPI` (different file?) returns `[CategoryDTO]`. We add a parallel V10 enum so v0.6 stays untouched. If existing CategoriesAPI conflicts, either add a method or rename — investigate and choose minimal-churn path.

    3. Modify `TransactionsAPI.swift`:
       - Add a new enum `ActualV10API` (parallel to `ActualAPI`) for v10 paths:
         ```swift
         @MainActor
         enum ActualV10API {
             static func list(periodId: Int, kind: ActualKindV10? = nil, categoryId: Int? = nil) async throws -> [ActualV10DTO] {
                 var query: [String: String] = [:]
                 if let kind { query["kind"] = kind.rawValue }
                 if let categoryId { query["category_id"] = "\(categoryId)" }
                 return try await APIClient.shared.request(
                     "GET", "/periods/\(periodId)/actual",
                     query: query.isEmpty ? nil : query
                 )
             }

             static func create(_ request: ActualCreateRequest) async throws -> ActualV10DTO {
                 try await APIClient.shared.request("POST", "/actual", body: request)
             }
         }
         ```
       - Existing `ActualAPI` keeps decoding to legacy `ActualDTO` (CategoryKind).
       - **Verify** `ActualCreateRequest.accountId` encodes properly; if needed, add `CodingKeys` explicitly. APIClient default encoder uses `.convertToSnakeCase` for camelCase → snake_case so `accountId` → `account_id`. Confirm via existing patterns in codebase.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && make build 2>&1 | tail -20</automated>
  </verify>
  <done>iOS build clean; new APIs callable from V10 features; legacy ActualAPI untouched.</done>
</task>

</tasks>

<verification>
1. `cd frontend && npx tsc --noEmit` clean.
2. `cd frontend && grep -c "export.*listActualV10\|export.*createActualV10\|export.*listAccounts\|export.*listCategoriesV10" src/api/v10/index.ts` ≥ 4.
3. `cd ios && make build` succeeds (XcodeGen + xcodebuild).
4. `grep -c "struct AccountDTO\|struct CategoryV10DTO\|struct ActualV10DTO" ios/BudgetPlanner/Networking/DTO/*.swift` ≥ 3.
</verification>

<success_criteria>
- Web: 3 typed client modules under `frontend/src/api/v10/` exporting `listActualV10`, `createActualV10`, `listAccounts`, `listCategoriesV10` + supporting types.
- iOS: AccountDTO, CategoryV10DTO, ActualV10DTO + AccountsAPI, CategoriesV10API, ActualV10API enums.
- v0.6 surfaces (legacy ActualDTO, ActualAPI, CategoriesAPI) untouched.
- Field set verified against backend Phase 22 schemas (any gaps documented).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-03-api-clients-SUMMARY.md` with:
- Field set verification (which v1.0 category fields actually shipped from Phase 22 vs which are pending)
- iOS split rationale (parallel V10 enums vs replacing v0.6)
- Wire shape examples (request/response JSON snippets)
</output>
