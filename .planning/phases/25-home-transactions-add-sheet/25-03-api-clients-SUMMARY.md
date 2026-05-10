---
phase: 25-home-transactions-add-sheet
plan: 3
subsystem: api-clients
tags: [typescript, swift, api-client, v10-wire, decodable, encodable]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 1
    provides: extended POST /api/v1/actual (account_id dispatch); ActualRead with 4-valued kind + account_id + parent_txn_id; AccountRead schema (Phase 22 BE-02 stable)
provides:
  - "Web: typed v10 client wrappers (frontend/src/api/v10/{actual,accounts,categories,index}.ts) — single source of truth for v1.0 wire shapes."
  - "Web: ActualV10Kind (4-valued) + ActualV10Read + ActualV10CreatePayload + AccountResponse + AccountKindStr + CategoryRollover + CategoryV10 types added to frontend/src/api/types.ts (additive, v0.x untouched)."
  - "iOS: AccountDTO + CategoryV10DTO (defensive Decodable for pending CategoryRead schema gap) + ActualV10DTO + ActualKindV10 (parallel to legacy ActualDTO/CategoryKind, no v0.6 regression)."
  - "iOS: AccountsAPI / CategoriesV10API / ActualV10API enums — parallel surface to legacy ActualAPI; ActualCreateRequest extended with optional accountId (encodeIfPresent) so legacy callers stay byte-clean."
  - "Runtime guard: createActualV10 rejects non-positive amount_cents (T-25-03-01 mitigation)."
affects:
  - 25-04-web-home-view (imports listActualV10 + listAccounts + listCategoriesV10 from src/api/v10)
  - 25-05-ios-home-view (imports AccountsAPI / CategoriesV10API / ActualV10API)
  - 25-06+ all V10 plans consume these clients (Transactions registry, AddSheet, Category Detail)

# Tech tracking
tech-stack:
  added: []   # no new dependencies on either side
  patterns:
    - "Parallel-DTO split (ActualV10DTO alongside legacy ActualDTO) to widen kind enum without breaking v0.6 consumers"
    - "Defensive Decodable init with decodeIfPresent + safe defaults for fields pending backend schema update (CategoryV10DTO)"
    - "encodeIfPresent on optional Encodable fields to preserve legacy wire shape (no `\"account_id\": null` from v0.6 callers)"
    - "Barrel re-exports (frontend/src/api/v10/index.ts) so consumers import from one path"
    - "Client-side runtime guard (amount_cents > 0) as defence-in-depth complementing Pydantic gt=0"

key-files:
  created:
    - frontend/src/api/v10/actual.ts
    - frontend/src/api/v10/accounts.ts
    - frontend/src/api/v10/categories.ts
    - frontend/src/api/v10/index.ts
    - ios/BudgetPlanner/Networking/DTO/AccountDTO.swift
    - ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
    - ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift
    - ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift
  modified:
    - frontend/src/api/types.ts                                    # additive v10 types
    - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift        # ActualV10DTO + ActualCreateRequest.accountId
    - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift # ActualV10API parallel enum

key-decisions:
  - "Parallel DTOs (not replace): legacy ActualDTO.kind stays CategoryKind 2-valued, ActualV10DTO.kind is ActualKindV10 4-valued. v0.6 features (TransactionsView/TransactionEditor/AIChatView) untouched."
  - "ActualCreateRequest.accountId is OPTIONAL with explicit encode(to:) using encodeIfPresent — legacy v0.6 callers keep emitting the exact same JSON they did before (no `account_id: null` injected)."
  - "CategoryV10 / CategoryV10DTO fields pending Phase 22 wire schema (code/plan_cents/ord/rollover/paused/parent_id) are typed Optional with safe defaults. UI MUST defensively default until CategoryRead is widened. Documented as schema gap below."
  - "Web barrel (api/v10/index.ts) — single import path; iOS uses separate enum files because Swift conventions favour file-per-API-surface."
  - "createActualV10 client-side guard (amount_cents > 0): defence-in-depth even though server enforces gt=0. Catches caller bugs (e.g. forgetting to take abs() of a UI delta) before the network round-trip."

patterns-established:
  - "Two-tier kind enum: legacy 2-valued (CategoryKind/CategoryKindStr) for v0.x flows, 4-valued (ActualV10Kind/ActualKindV10) for v1.0 — keep both in lock-step with backend ActualKindStr alias."
  - "Encodable with optional additive fields → custom encode(to:) + encodeIfPresent ensures byte-identical wire output for legacy callers."
  - "Schema-gap defensive Decodable: when ORM has fields the wire schema doesn't yet emit, declare DTO fields Optional + decodeIfPresent + safe defaults; document the gap in jsdoc."

requirements-completed:
  - HOME-V10-02
  - HOME-V10-04
  - TXN-V10-04
  - ADD-V10-04
  - ADD-V10-05

# Metrics
duration: 5m
completed: 2026-05-10
---

# Phase 25 Plan 3: API Clients (Web + iOS) Summary

**Built typed API client wrappers on both surfaces (web `frontend/src/api/v10/*` + iOS `Networking/{DTO,Endpoints}/*`) so all downstream Phase 25 UI plans (Home, Transactions, AddSheet) consume v1.0 wire shapes from a single source of truth instead of reinventing fetch types.**

## Performance

- **Duration:** ~5 min (296 s wall-clock)
- **Started:** 2026-05-10T12:11:02Z
- **Completed:** 2026-05-10T12:15:58Z
- **Tasks:** 3 of 3 (atomic — no TDD; structural plumbing plan)
- **Files created:** 8 (4 web + 4 iOS)
- **Files modified:** 3 (1 web types.ts + 2 iOS DTO/endpoint extensions)

## Accomplishments

- **Web**: `frontend/src/api/v10/{actual,accounts,categories,index}.ts` — typed wrappers exporting `listActualV10`, `createActualV10`, `listAccounts`, `listCategoriesV10` plus all supporting types. Barrel re-exports keep consumer imports flat (`import { listAccounts } from '../api/v10'`).
- **Web types**: `frontend/src/api/types.ts` extended additively with `ActualV10Kind`, `ActualV10Read`, `ActualV10CreatePayload`, `AccountResponse`, `AccountKindStr`, `CategoryRollover`, `CategoryV10`. v0.x types untouched.
- **iOS DTOs**: `AccountDTO`, `CategoryV10DTO` (with custom defensive Decodable init for the schema-gap fields), and `ActualV10DTO` (parallel to legacy `ActualDTO`).
- **iOS endpoints**: `AccountsAPI`, `CategoriesV10API`, and `ActualV10API` (parallel to legacy `ActualAPI`). Legacy `CategoriesWriteAPI` and `ActualAPI` kept untouched — no v0.6 regression.
- **Encodable extension**: `ActualCreateRequest` gained optional `accountId` with explicit `encode(to:)` using `encodeIfPresent` — legacy v0.6 callers (TransactionEditor, AIChatView) emit byte-identical JSON to before this plan.
- **Runtime guard**: `createActualV10` rejects `amount_cents <= 0` before the fetch (T-25-03-01 mitigation; complements server-side Pydantic `gt=0`).
- **Verification gates**: `tsc --noEmit` clean; `make build` (iOS) → Build Succeeded.

## Wire shape examples

### POST /api/v1/actual (v10 path — with account_id)
Request:
```json
{
  "kind": "expense",
  "amount_cents": 12500,
  "description": "кофе",
  "category_id": 7,
  "tx_date": "2026-05-10",
  "account_id": 42
}
```
Response (`ActualV10Read` / `ActualV10DTO`):
```json
{
  "id": 1234,
  "period_id": 5,
  "kind": "expense",
  "amount_cents": 12500,
  "description": "кофе",
  "category_id": 7,
  "tx_date": "2026-05-10",
  "source": "mini_app",
  "created_at": "2026-05-10T12:15:00.123456+00:00",
  "account_id": 42,
  "parent_txn_id": null
}
```

### POST /api/v1/actual (legacy path — v0.6 caller, accountId nil → field omitted)
Request emitted by legacy `ActualCreateRequest` (no `account_id` key):
```json
{
  "kind": "expense",
  "amount_cents": 12500,
  "category_id": 7,
  "tx_date": "2026-05-10",
  "description": "кофе"
}
```
Backend dispatch: `body.account_id is None` → legacy `create_actual` path (no balance delta, no roundup). v0.6 contract unchanged.

### GET /api/v1/accounts
Response (`AccountResponse[]` / `[AccountDTO]`):
```json
[
  {
    "id": 1,
    "bank": "Т-Банк",
    "mask": "3477",
    "kind": "card",
    "balance_cents": 5000000,
    "primary": true,
    "created_at": "2026-04-15T08:30:00+00:00"
  }
]
```
Wire field is `primary` (single word). Both web (`AccountResponse.primary`) and iOS (`AccountDTO.primary`) decode it as-is — `keyDecodingStrategy = .convertFromSnakeCase` leaves single-word keys alone.

### GET /api/v1/categories (current Phase 22 wire — schema gap)
Response (`CategoryV10[]` / `[CategoryV10DTO]`):
```json
[
  {
    "id": 7,
    "name": "Кафе",
    "kind": "expense",
    "is_archived": false,
    "sort_order": 10,
    "created_at": "2026-04-01T00:00:00+00:00"
  }
]
```
**Note**: `code`, `plan_cents`, `ord`, `rollover`, `paused`, `parent_id` are NOT yet emitted by `CategoryRead` Pydantic — see Schema Gap section below. Both clients decode defensively (Optional / decodeIfPresent + safe defaults).

## Schema Gap — Phase 22 BE `CategoryRead` not yet widened

Per the plan instruction to verify backend schema before declaring DTO field shapes, I audited `app/api/schemas/categories.py` and found:

```python
class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: CategoryKindStr
    is_archived: bool
    sort_order: int
    created_at: datetime
```

The Phase 22 BE-04 ORM model `Category` (`app/db/models.py:192`) DOES have the v1.0 columns — `plan_cents`, `code`, `ord`, `rollover`, `paused`, `parent_id` were added by alembic 0013. But the public Pydantic `CategoryRead` was NOT widened in Phase 22 to expose them on the wire.

**Implication**: `GET /api/v1/categories` currently returns ONLY the v0.x field set. Phase 25 UI plans (Home category list with plan_cents bar, AddSheet category picker filtered by `code != 'savings' AND paused = false`) cannot work until either:
1. The backend `CategoryRead` schema is extended to emit the v1.0 fields, OR
2. UI plans introduce a workaround (e.g. fetch categories + plan from a different endpoint, or compute plan client-side from balance response).

**Mitigation in this plan**: Both `CategoryV10` (TS) and `CategoryV10DTO` (Swift) declare the v1.0 fields as Optional with safe defaults. UI code MUST defensively default (`plan_cents ?? 0`, `paused ?? false`, `rollover ?? 'misc' / .misc`, `code ?? null/nil`). Once the schema is widened, the same DTOs will start receiving real values without code changes — only the UI defaults become unreachable.

**Action item for Plan 25-04 / 25-05 (or a quick backend tweak)**: extend `CategoryRead` Pydantic to emit the v1.0 fields. This is a small additive change (mirroring the ORM columns) and completes the Phase 22 BE-04 wire contract. Suggested follow-up: open a quick-task or fold into 25-04 RED phase as a prerequisite.

## iOS split rationale: parallel V10 enums vs replacing v0.6

The plan asked me to consider two options for `ActualDTO.kind`:
- **Option A**: Replace `ActualDTO.kind: CategoryKind` (2-valued) with `ActualKindV10` (4-valued). Risk: silently breaks every v0.6 consumer that switches over `dto.kind` (TransactionsView grouping, AIChatView display, TransactionEditor save flow).
- **Option B (chosen)**: Add a NEW parallel `ActualV10DTO` struct + `ActualKindV10` enum. v0.6 features keep using `ActualDTO`/`CategoryKind`. v1.0 features (Phase 25) opt into the wider surface explicitly.

**Audit confirmed** before deciding (grep `ActualDTO` outside Tests/):
- `Features/Transactions/TransactionEditor.swift:6` — `case editActual(ActualDTO)`
- `Features/Transactions/TransactionsView.swift:14, 47, 105, 251, 333` — multiple `[ActualDTO]` consumers including `historyGroups` partitioning
- `Features/AI/AIChatView.swift:114` — `ActualCreateRequest(...)` constructor (encoder side, no `kind` switch)

Option A would have demanded `default:` arms in 5+ switches across the v0.6 surface for code paths that never see roundup/deposit anyway (those kinds only flow through v1.0 features). Option B keeps v0.6 byte-identical and adds zero risk.

The same pattern was applied for `ActualAPI` → `ActualV10API` (parallel enum) and `CategoriesWriteAPI` → `CategoriesV10API` (read-only parallel enum). Web doesn't need the split because v0.x web code uses `ActualRead` directly without exhaustive `kind` switches that would break.

## Files Created/Modified

### Created (web)
- `frontend/src/api/v10/actual.ts` — `listActualV10`, `createActualV10` + re-exports of `ActualV10Kind`/`ActualV10Read`/`ActualV10CreatePayload`. Runtime guard on `amount_cents <= 0`.
- `frontend/src/api/v10/accounts.ts` — `listAccounts` returning `AccountResponse[]`.
- `frontend/src/api/v10/categories.ts` — `listCategoriesV10(includeArchived = false)` returning `CategoryV10[]`.
- `frontend/src/api/v10/index.ts` — barrel re-export of all four functions + supporting types.

### Created (iOS)
- `ios/BudgetPlanner/Networking/DTO/AccountDTO.swift` — `AccountKind` enum + `AccountDTO` Decodable struct (single-word `primary` decoded as-is).
- `ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift` — `CategoryRollover` enum + `CategoryV10DTO` with custom `init(from:)` using `decodeIfPresent` + safe defaults (defends against the Phase 22 schema gap).
- `ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift` — `enum AccountsAPI { static func list() }`.
- `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift` — `enum CategoriesV10API { static func list(includeArchived:) }`.

### Modified
- `frontend/src/api/types.ts` — additive: `ActualV10Kind`, `ActualV10Read`, `ActualV10CreatePayload`, `AccountKindStr`, `AccountResponse`, `CategoryRollover`, `CategoryV10`. v0.x types untouched.
- `ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift` — added `ActualKindV10` enum + `ActualV10DTO` struct (parallel to legacy `ActualDTO`); extended `ActualCreateRequest` with optional `accountId` and explicit `encode(to:)` using `encodeIfPresent` (preserves legacy wire shape).
- `ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift` — added `enum ActualV10API { static func list / create }` parallel to legacy `ActualAPI`.

## Decisions Made

(See `key-decisions` in frontmatter.)

## Deviations from Plan

None — plan executed exactly as written, with the field-set verification step (Task 1.6 / Task 2.2) producing the documented Schema Gap finding rather than a code change. The plan explicitly required documenting any gap in the SUMMARY; that requirement is fulfilled in the Schema Gap section above.

The plan's Task 2 also explicitly directed the parallel-DTO approach (final paragraph: "create a NEW `ActualV10DTO` struct in TransactionDTO.swift (not replace existing `ActualDTO`)") — followed verbatim.

## Issues Encountered

- **iOS xcodeproj is gitignored**: `.xcodeproj/project.pbxproj` is XcodeGen-managed and not under git tracking — no commit necessary for the regenerated project. New `.swift` files are auto-picked up by `sources: BudgetPlanner` (recursive glob in `project.yml`).
- **Single-word `primary` field**: a brief check confirmed `keyDecodingStrategy = .convertFromSnakeCase` leaves single-word keys untouched, so `AccountDTO.primary: Bool` decodes the wire field `"primary": true` correctly without any `CodingKeys` workaround.
- **Encodable optional fields default behaviour**: `JSONEncoder` by default emits `null` for `Optional` properties — that would have changed the wire shape for legacy `ActualCreateRequest` callers (silent regression). Solved with explicit `encode(to:)` using `encodeIfPresent`, verified manually by reading the Encodable Apple docs.

## Threat Flags

None — plan introduces no new attack surface beyond what Phase 25-01 already mitigated. T-25-03-01 (negative `amount_cents`) is mitigated client-side in `createActualV10`; T-25-03-02 (cross-tenant `account_id`) accepted (server RLS); T-25-03-03 (PII in description) accepted (single-tenant app).

## Known Stubs

None — every wrapper is functionally complete and exercised by the verify gates. The Schema Gap is NOT a stub: it's a backend-side limitation that this plan defended against via Optional types + safe defaults; once the backend schema is widened, both clients start receiving real values automatically.

## Next Phase Readiness

- **25-04 (web Home view)** can now `import { listAccounts, listCategoriesV10, listActualV10 } from '../api/v10'` and feed the returned shapes into `HomeMount.tsx`.
- **25-05 (iOS Home view)** can call `AccountsAPI.list()`, `CategoriesV10API.list()`, `ActualV10API.list(periodId:)` from `HomeViewModel` parallel-load.
- **25-06 (Transactions registry)** consumes `listActualV10(periodId, { kind })` (web) / `ActualV10API.list(periodId:kind:)` (iOS) for filter chips + roundup/deposit spec-tags.
- **25-08 (web AddSheet)** + **25-07 (iOS AddSheet)** consume `createActualV10({ ..., account_id })` (web) / `ActualV10API.create(ActualCreateRequest(..., accountId:))` (iOS) to fire balance delta + roundup hook on submit.
- **Schema Gap action item**: `app/api/schemas/categories.py CategoryRead` needs widening to emit `code/plan_cents/ord/rollover/paused/parent_id` before Plan 25-04 can render plan-bars; flagged for orchestrator / Plan 25-04 RED gate.

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/api/v10/actual.ts
- FOUND: frontend/src/api/v10/accounts.ts
- FOUND: frontend/src/api/v10/categories.ts
- FOUND: frontend/src/api/v10/index.ts
- FOUND: ios/BudgetPlanner/Networking/DTO/AccountDTO.swift
- FOUND: ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
- FOUND: ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift
- FOUND: ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift

**Commits exist:**
- FOUND: 32f7e51 — feat(25-03): add web v10 API client wrappers (Task 1)
- FOUND: 833cbca — feat(25-03): add iOS v10 DTOs (Task 2)
- FOUND: 5b10cc9 — feat(25-03): add iOS v10 API endpoints (Task 3)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && grep -c '{listActualV10|createActualV10|listAccounts|listCategoriesV10}' src/api/v10/index.ts`: 5 occurrences (all 4 functions exported via barrel re-exports)
- `cd ios && make build`: Build Succeeded
- `grep -c 'struct AccountDTO|struct CategoryV10DTO|struct ActualV10DTO' ios/.../DTO/*.swift`: 3 (one per file — AccountDTO.swift, CategoryV10DTO.swift, TransactionDTO.swift)

**No accidental file deletions in any of the three task commits** (`git diff d679be9..HEAD --diff-filter=D --name-only`: empty).

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 03*
*Completed: 2026-05-10*
