---
phase: 25-home-transactions-add-sheet
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - app/api/schemas/actual.py
  - app/api/routes/actual.py
  - tests/api/test_actual_v10_extension.py
autonomous: true
requirements:
  - ADD-V10-01
  - ADD-V10-02
  - ADD-V10-03
  - ADD-V10-04
  - ADD-V10-05
  - TXN-V10-04
  - HOME-V10-04

must_haves:
  truths:
    - "POST /api/v1/actual принимает optional `account_id` и optional `kind ∈ {expense,income,roundup,deposit}`; при наличии account_id вызывает create_actual_v10 (delta-balance + roundup hook)."
    - "ActualRead response эмитит `kind` ∈ 4 значения + optional `account_id` + optional `parent_txn_id` (для UI roundup/deposit spec-tags)."
    - "Legacy clients без account_id продолжают работать (legacy create_actual path)."
  artifacts:
    - path: "app/api/schemas/actual.py"
      provides: "Extended ActualKindStr Literal['expense','income','roundup','deposit'] + ActualCreate.account_id + ActualRead.{kind,account_id,parent_txn_id}"
      contains: "Literal[\"expense\", \"income\", \"roundup\", \"deposit\"]"
    - path: "app/api/routes/actual.py"
      provides: "POST /actual maps account_id → create_actual_v10; ActualRead returns extended fields"
      contains: "create_actual_v10"
    - path: "tests/api/test_actual_v10_extension.py"
      provides: "Integration tests covering: account_id passthrough → create_actual_v10 + balance delta + roundup hook + ActualRead extended fields"
  key_links:
    - from: "app/api/routes/actual.py"
      to: "app.services.actual.create_actual_v10"
      via: "Python import + conditional call when body.account_id is not None"
      pattern: "from app.services import actual as actual_svc.*create_actual_v10"
    - from: "ActualRead.from_attributes"
      to: "ActualTransaction ORM model fields (account_id, parent_txn_id)"
      via: "Pydantic model_validate"
      pattern: "ActualRead.model_validate"
---

<objective>
Extend `POST /api/v1/actual` and `ActualRead` schema to support v1.0 ActualKind enum (`expense|income|roundup|deposit`), `account_id`, and `parent_txn_id`. Without this extension Phase 25 Add Sheet cannot pass `account_id` (so account.balance never updates and roundup never fires) and Transactions registry cannot render roundup/deposit spec-tags (TXN-V10-04).

Purpose: unblock all Phase 25 UI plans (Home, Transactions, AddSheet) which require v1.0 wire contract.
Output: extended `actual.py` schema + route + integration tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/phases/22-backend-schema-logic-foundation/22.07-roundup-service-SUMMARY.md
@.planning/phases/22-backend-schema-logic-foundation/22.13-api-routers-SUMMARY.md
@app/api/schemas/actual.py
@app/api/routes/actual.py
@app/services/actual.py
@app/db/models.py

<interfaces>
<!-- Existing service signature (Phase 22-07) — wire route to it. -->

From app/services/actual.py:
```python
async def create_actual_v10(
    db: AsyncSession,
    *,
    user_id: int,
    kind: str,                       # 'expense' | 'income' | 'roundup' | 'deposit'
    amount_cents: int,
    description: Optional[str],
    category_id: int,
    tx_date: date,
    source: ActualSource,
    account_id: Optional[int] = None,
    parent_txn_id: Optional[int] = None,
) -> tuple[ActualTransaction, Optional[ActualTransaction]]:
    # Returns (parent, optional_roundup_child)
    # Raises: InvalidCategoryError, KindMismatchError, FutureDateError,
    #         AccountNotFoundError (when account_id supplied + missing)

# Legacy (keep working — expense/income only, no account_id, no roundup):
async def create_actual(
    db: AsyncSession,
    *,
    user_id: int,
    kind: str,                       # 'expense' | 'income'
    amount_cents: int,
    description: Optional[str],
    category_id: int,
    tx_date: date,
    source: ActualSource,
) -> ActualTransaction
```

From app/db/models.py (ActualTransaction):
```python
class ActualTransaction(Base):
    id: int
    period_id: int
    kind: ActualKind                 # PgEnum 'actualkind' — expense/income/roundup/deposit
    amount_cents: int                # BIGINT
    description: Optional[str]
    category_id: int
    tx_date: date
    source: ActualSource
    created_at: datetime
    user_id: int
    parent_txn_id: Optional[int]     # self-FK CASCADE — roundup parent ref
    account_id: Optional[int]        # FK account.id RESTRICT — nullable for legacy v0.x rows
```

From app/db/models.py (ActualKind):
```python
class ActualKind(str, enum.Enum):
    expense = "expense"
    income = "income"
    roundup = "roundup"
    deposit = "deposit"
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → POST /api/v1/actual | untrusted body (amount_cents, account_id, kind) crosses Pydantic validation |
| route → service | tenant scope set via `get_db_with_tenant_scope`; user_id resolved from initData (not body) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-01-01 | Tampering | ActualCreate body (account_id) | mitigate | `account_id: Optional[int] = Field(default=None, gt=0)`. Service-layer (apply_balance_delta) validates account belongs to user_id (existing Phase 22-06 RLS scope on account row) — cross-tenant account_id raises AccountNotFoundError → 404. |
| T-25-01-02 | Tampering | ActualCreate body (kind) | mitigate | Extended `ActualKindStr = Literal['expense','income','roundup','deposit']`; Pydantic strict reject any other string with 422. Server still gates business semantics: `create_actual_v10` raises KindMismatchError if kind/category mismatch. |
| T-25-01-03 | Information Disclosure | ActualRead leaking parent_txn_id of cross-tenant rows | accept | RLS on `actual_transaction` (Phase 11) + `get_db_with_tenant_scope` ensures rows never traverse tenant; parent_txn_id is local id only — no information about other tenants. |
| T-25-01-04 | Repudiation | Switch to create_actual_v10 hides legacy fallback bug | mitigate | Route picks `create_actual_v10` only when `body.account_id is not None`; legacy path retained for backwards compat. Test `test_actual_no_account_id_uses_legacy_path` asserts no roundup fired and balance unchanged. |
| T-25-01-05 | Denial of Service | Roundup recursion / extreme amounts | accept | Existing Phase 22-07 mitigations: roundup only when parent.kind=expense (no recursion); BIGINT bounds + Pydantic `gt=0` + service-level `_check_future_date`. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend ActualCreate / ActualRead schema with v10 fields</name>
  <files>app/api/schemas/actual.py</files>
  <behavior>
    - Test 1: `ActualCreate(kind='expense', amount_cents=100, category_id=1, tx_date=date.today(), account_id=42)` validates; account_id stored as 42.
    - Test 2: `ActualCreate(kind='roundup', amount_cents=10, category_id=1, tx_date=date.today())` validates (roundup is now legal kind).
    - Test 3: `ActualCreate(kind='invalid', ...)` raises ValidationError.
    - Test 4: `ActualCreate(account_id=0)` raises ValidationError (gt=0).
    - Test 5: `ActualRead.model_validate(actual_orm_with_account_id_42_and_parent_txn_id_99)` produces JSON dict with `kind`, `account_id=42`, `parent_txn_id=99`.
    - Test 6: `ActualRead.model_validate(actual_orm_with_account_id_None)` produces dict with `account_id=None`.
  </behavior>
  <action>
    Per D-3 (CONTEXT) — extend existing v0.x schema additively (do NOT create a new ActualV10Read; keep single source).

    1. Replace `KindStr = Literal["expense", "income"]` with:
       ```python
       ActualKindStr = Literal["expense", "income", "roundup", "deposit"]
       ```
       Keep a backward-compat alias `KindStr = ActualKindStr` so other modules importing `KindStr` keep working (Plan 22-13 grep confirms only this file + planned-route imports it; rename later as cleanup).

    2. Update `ActualCreate`:
       - `kind: ActualKindStr` (was `KindStr`)
       - Add `account_id: Optional[int] = Field(default=None, gt=0)` — wire-level optional; service decides what to do.
       - Keep existing `model_config` if any; add `ConfigDict(extra="forbid")` to reject unknown fields (T-25-01-02).

    3. Update `ActualUpdate`:
       - `kind: Optional[ActualKindStr] = None` — allow patches to switch kind (deposit/roundup edits — defer if too disruptive; expense↔income still allowed today).
       - Do NOT add account_id to PATCH (out of scope for Phase 25 — TXN-V10-05 edit reuses existing fields). Keep current PATCH surface untouched for now.

    4. Update `ActualRead`:
       - `kind: ActualKindStr` (was `KindStr`)
       - Add `account_id: Optional[int] = None`
       - Add `parent_txn_id: Optional[int] = None`
       - `from_attributes=True` already present — Pydantic auto-pulls from ORM.

    5. Keep `BalanceCategoryRow.kind: KindStr` (still expense|income only — categories don't have roundup/deposit kinds; no change needed but document why in module docstring).

    6. Update module docstring: append «Phase 25 (ADD-V10/TXN-V10): kind enum extended to 4 values; ActualCreate.account_id and ActualRead.{account_id, parent_txn_id} added».
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "from app.api.schemas.actual import ActualCreate, ActualRead, ActualKindStr; from datetime import date; c=ActualCreate(kind='expense', amount_cents=100, category_id=1, tx_date=date.today(), account_id=42); assert c.account_id == 42; c2=ActualCreate(kind='roundup', amount_cents=10, category_id=1, tx_date=date.today()); assert c2.kind == 'roundup'; print('OK')"</automated>
  </verify>
  <done>Schema imports cleanly; existing 4 kind strings validate; account_id field accepted as optional positive int; ActualRead has account_id and parent_txn_id fields.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire POST /actual to create_actual_v10 when account_id present</name>
  <files>app/api/routes/actual.py</files>
  <behavior>
    - Test 1: POST `/api/v1/actual` with `{kind:'expense', amount_cents:100_50, category_id:CAT_ID, tx_date:'2026-05-09', account_id:ACCT_ID}` for an account with balance 50000_00 + roundup_enabled config + base 10₽ → returns 200 with `kind='expense'`, `account_id=ACCT_ID`, `parent_txn_id=None`; account.balance_cents == 49899_50; a sibling `kind='roundup'` row exists with `parent_txn_id=parent.id`.
    - Test 2: POST without account_id (legacy) → returns 200; no balance change; no roundup row created (legacy create_actual path).
    - Test 3: POST with `account_id` referencing other-user's account → 404 AccountNotFoundError (RLS / ownership check).
    - Test 4: POST with `kind='deposit'` + valid account_id → returns 200 with kind='deposit' (savings category code='savings' or generic — service validates).
    - Test 5: ActualRead JSON in response includes `account_id` field (key present even if None) and `parent_txn_id` field.
  </behavior>
  <action>
    1. Update `create_actual` route handler in `app/api/routes/actual.py`:
       - Import `ActualSource` and add new exception `from app.services.accounts import AccountNotFoundError`.
       - In handler body, branch:
         ```python
         if body.account_id is not None:
             try:
                 parent, _child = await actual_svc.create_actual_v10(
                     db,
                     user_id=user_id,
                     kind=body.kind,
                     amount_cents=body.amount_cents,
                     description=body.description,
                     category_id=body.category_id,
                     tx_date=body.tx_date,
                     source=ActualSource.mini_app,
                     account_id=body.account_id,
                 )
                 row = parent
             except AccountNotFoundError as exc:
                 raise HTTPException(status_code=404, detail=str(exc)) from exc
             # Map other domain exceptions identically to legacy path
             except CategoryNotFoundError as exc: ...
             except (InvalidCategoryError, KindMismatchError, FutureDateError) as exc: ...
         else:
             # Legacy v0.x path — unchanged
             row = await actual_svc.create_actual(...)
         ```
       - DRY-up exception mapping: extract a small `_map_actual_create_exceptions(exc)` helper at module level, OR keep the explicit try-blocks and add the new AccountNotFoundError clause to both. Choose explicit (clearer for code review).

    2. Update docstring to mention v10 path: «D-25-01 (Phase 25): when `account_id` is supplied, route delegates to `create_actual_v10` which applies balance delta + roundup hook. Legacy clients without account_id continue using `create_actual`.»

    3. Verify NO change required for GET endpoints — they read from ORM via `ActualRead.model_validate` which now picks up account_id / parent_txn_id automatically (Task 1 added the fields).

    4. Verify NO change required for DELETE/PATCH — Phase 25 scope only asks for AddSheet create flow + Transactions read flow + edit reusing existing v0.x editor (Plan 25-04 / 25-05). Edit endpoint can stay legacy until Phase 26 if needed.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/api/test_actual_v10_extension.py -x -q 2>&1 | tail -20</automated>
  </verify>
  <done>Route handler dispatches based on account_id presence; integration test in Task 3 passes; existing test_actual_crud.py (legacy clients) still passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Integration tests for v10 actual extensions</name>
  <files>tests/api/test_actual_v10_extension.py</files>
  <behavior>
    Five test cases per Task 2 behavior list — fixtures: seeded user with onboarded_at, one account with balance 50000_00, savings_config(roundup_enabled=true, base_cents=1000), one expense category 'food', one savings category code='savings'.

    All tests use existing `dev_client` / `seeded_user` fixtures from `tests/conftest.py`.
  </behavior>
  <action>
    Create `tests/api/test_actual_v10_extension.py` with these tests:

    ```python
    async def test_post_actual_with_account_id_triggers_v10_path(dev_client, seeded_user_with_account_and_savings_config):
        # POST {kind:'expense', amount_cents:100_50, category_id:food.id, tx_date:today, account_id:acct.id}
        # Assert response 200, body has account_id == acct.id, parent_txn_id is None.
        # GET /accounts → balance_cents shrunk by parent + roundup amount (verify formula).
        # GET /periods/{pid}/actual → 2 rows: parent (kind='expense') + child (kind='roundup', parent_txn_id=parent.id, account_id=acct.id).

    async def test_post_actual_without_account_id_uses_legacy_path(dev_client, seeded_user_with_account_and_savings_config):
        # POST {kind:'expense', amount_cents:100_50, category_id:food.id, tx_date:today}  # no account_id
        # Assert response 200, account_id == None.
        # GET /accounts → balance UNCHANGED (legacy create_actual does not touch balance).
        # GET /periods/{pid}/actual → 1 row only (no roundup child).

    async def test_post_actual_cross_tenant_account_id_returns_404(dev_client, two_users_with_accounts):
        # POST with user A's initData but body.account_id = user B's account
        # Assert response 404 (AccountNotFoundError).

    async def test_post_actual_kind_deposit_via_v10_path(dev_client, seeded_user_with_savings_category):
        # POST {kind:'deposit', amount_cents:1000_00, category_id:savings_cat.id, tx_date:today, account_id:acct.id}
        # Assert response 200, body kind == 'deposit'.

    async def test_actual_read_response_shape_includes_v10_fields(dev_client, seeded_user_with_account):
        # POST returns dict — assert keys: 'kind', 'account_id', 'parent_txn_id' all present (None or value).
        # GET /periods/{pid}/actual returns list — each row has same keys.
    ```

    Use `httpx.AsyncClient` patterns from existing `tests/api/test_accounts_api.py`.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/api/test_actual_v10_extension.py -x -v 2>&1 | tail -30</automated>
  </verify>
  <done>All 5 tests pass; existing `tests/api/test_actual_crud.py` (legacy contract) still passes — no regression.</done>
</task>

</tasks>

<verification>
1. `pytest tests/api/test_actual_v10_extension.py tests/api/test_actual_crud.py -x` → 0 failures (new + legacy both green).
2. `python -c "from app.api.schemas.actual import ActualCreate; ActualCreate(kind='roundup', amount_cents=10, category_id=1, tx_date='2026-05-09', account_id=42)"` → no ValidationError.
3. `grep -c '"account_id"' app/api/schemas/actual.py` ≥ 2 (in ActualCreate + ActualRead).
4. `grep -n create_actual_v10 app/api/routes/actual.py` returns at least one match (route imports/calls service).
</verification>

<success_criteria>
- POST /api/v1/actual accepts optional account_id; passes through to create_actual_v10 with balance delta + roundup hook firing.
- ActualRead emits 4-valued kind enum + account_id + parent_txn_id (frontend can render TXN-V10-04 spec-tags).
- Legacy clients without account_id keep working (no behavioral change for v0.x callers).
- Cross-tenant account_id returns 404, not 500 (T-25-01-01).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-01-backend-actual-v10-SUMMARY.md` documenting:
- Schema diff (KindStr → ActualKindStr; account_id / parent_txn_id additions)
- Route dispatch logic (account_id presence → v10 path)
- Test coverage (5 new + 0 regressions)
- Migration notes for downstream UI plans (v10 actual API now produces compatible wire shape).
</output>
