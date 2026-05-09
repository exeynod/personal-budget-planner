# Architecture Research — v1.0 Maximal Poster Integration

**Researched:** 2026-05-09
**Confidence:** HIGH (verified against actual code at file:line — `app/db/models.py:1-506`, `app/worker/jobs/close_period.py:1-200`, etc.)

---

## 1. Existing Architecture (Snapshot)

### Backend layout

```
app/
├── db/models.py                # 13 SQLAlchemy ORM tables (no Account/Goal/Recurrent yet)
├── core/period.py              # period_for(date, cycle_start_day) → (start, end)
├── core/auth.py                # Telegram initData HMAC + Bearer fallback
├── api/
│   ├── router.py               # public_router + internal_router; mounts 17 sub-routers
│   ├── routes/                 # 17 route files (auth, categories, planned, actual, …)
│   ├── schemas/                # Pydantic v2 request/response
│   └── dependencies.py         # get_current_user, get_db, verify_internal_token
├── services/                   # 17 service files — pure (no FastAPI imports)
├── worker/jobs/                # 3 cron-jobs (close_period, charge_subscriptions, notify_subscriptions)
└── bot/                        # aiogram handlers + parsers
```

### Frontend (web at `frontend/`, NOT `web/`)

- `frontend/src/App.tsx:1-248` — single `App` component with 5 useState calls for nav state
- Navigation: tab switch (`activeTab`) + management overlay (`managementView`) + history filter — all flat React state, no router lib
- TWA SDK: `@telegram-apps/sdk-react@3.3.9`
- Vite proxy `/api → :8000` (`frontend/vite.config.ts:11-13`)
- 16 screens under `frontend/src/screens/`, shared bottom-sheet, transaction editor

### iOS (at `ios/BudgetPlanner/`)

- `ios/BudgetPlanner/App/AppRouter.swift:6-26` — `switch authStore.state` between bootstrapping/login/onboarding/MainShell
- `ios/BudgetPlanner/Features/Common/BottomNav.swift:48-68` — native iOS 26 `TabView` with `.tabBarMinimizeBehavior(.onScrollDown)`
- 4-tab nav (Home / Transactions / AI / Management). **No NavigationStack(path:)** — каждая tab имеет свою `NavigationStack` внутри view, navigation через стандартный `NavigationLink`
- `APIClient.swift:1-180` — vanilla URLSession, snake_case auto-conversion, Bearer header injection

---

## 2. Q1 — Subscription vs Recurrent: рекомендация (a) merge

### Comparison

| Strategy | Migration cost | Code changes | Logic conflicts | Risk |
|---|---|---|---|---|
| **(a) Extend Subscription** | LOW (one Alembic ALTER) | small (rename in code, keep table) | manageable | LOW ✓ |
| **(b) Create Recurrent rival** | NONE | medium (dual logic) | high (two cron-jobs to maintain) | MEDIUM |
| **(c) Full rewrite + migrate data** | HIGH (data move + drop table) | heavy | low after migration | HIGH |

### Recommendation: (a) Extend `Subscription`

The handoff `Recurrent` is functionally a superset of current `Subscription`. Both have: name, amount, category, monthly cycle, user_id. Differences:

| Field | Current Subscription | Handoff Recurrent | Action |
|---|---|---|---|
| `cycle: monthly\|yearly` | yes | no (always monthly day-of-month) | KEEP — yearly is real (annual subs) |
| `next_charge_date: DATE` | yes | derived from `dayOfMonth` | KEEP — yearly subs need full date |
| `day_of_month: 1..28` | no | yes | ADD as nullable; null when cycle=yearly |
| `account_id` | no | yes | ADD (nullable for backward compat with old subs) |
| `posted_txn_id` | no | yes (manual post-to-fact) | ADD nullable; null = not yet posted this period |
| `paused` | `is_active` boolean | `paused?` | RENAME via column alias OR keep `is_active` and treat as `!paused` in service |

**Concrete migration (Alembic 0011):**
```sql
ALTER TABLE subscription
  ADD COLUMN day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 28),
  ADD COLUMN account_id BIGINT REFERENCES account(id),
  ADD COLUMN posted_txn_id BIGINT REFERENCES actual_transaction(id) ON DELETE SET NULL;

-- Backfill day_of_month from existing next_charge_date for monthly subs
UPDATE subscription
   SET day_of_month = EXTRACT(DAY FROM next_charge_date)::int
 WHERE cycle = 'monthly' AND day_of_month IS NULL;
```

**Why merge wins:**
- Existing `charge_subscriptions_job` (`app/worker/jobs/charge_subscriptions.py:46-165`) already correctly handles per-tenant + advisory lock — only logic to add: clear `posted_txn_id` when month rolls over (in `close_period_job`). NO new cron.
- The "post-to-fact" UI (handoff `POST /api/recurrents/:id/post`) maps cleanly to a new endpoint that creates an `actual_transaction(kind=expense)` and writes `subscription.posted_txn_id = txn.id` — service `app/services/subscriptions.py` already has the structure.
- Existing `uq_planned_sub_charge_date` (idempotency on auto-charge) stays valid.
- Public-facing route remains `/api/v1/subscriptions/...` for backward compat; v1.0 design refers to "Подписки" anyway. iOS `SubscriptionsView.swift` also stays compatible.

**Naming:** keep table `subscription` (no rename) — Recurrent in handoff is just a UI name (см. SCREENS § «Подписки»). Internal entity name = `Subscription`. **Reduces churn by ~40 file edits**.

---

## 3. Q2 — Account: clean introduction without breaking balance math

### Current balance computation (FYI)

`app/services/actual.py:497` (`compute_balance`):
```python
balance_now = period.starting_balance_cents + act_inc - act_exp
```
Period balance is **purely virtual**: `starting_balance` of next period inherits `ending_balance` of previous (`close_period.py:171`).

### Recommendation: dual-track balances

Add `account.balance_cents` as **authoritative for "wallet/account" UI** (Home «в кошельке 142 380 ₽» = `Σ account.balance_cents`); KEEP `BudgetPeriod.starting_balance_cents` for **per-period accounting** (existing semantics). They are **independent metrics**:

- **Account balance** = real-world bank balance, mutated on every txn create/edit/delete (delta accounting).
- **Period balance** = monthly accounting frame, computed from period transactions.

This avoids touching 60+ endpoints that depend on `compute_balance`.

### Migration strategy (multi-tenant safe)

Alembic 0012:
```sql
CREATE TABLE account (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  bank TEXT NOT NULL,
  mask TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('card', 'cash', 'savings')),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_account_user_primary
  ON account (user_id) WHERE is_primary;  -- exactly-one-primary

-- RLS (matches Phase 11 alembic 0006 pattern)
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE account FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON account
  USING (user_id = current_setting('app.current_user_id')::bigint);

-- ActualTransaction.account_id (nullable for backward compat; new txns required)
ALTER TABLE actual_transaction ADD COLUMN account_id BIGINT REFERENCES account(id);
```

**Backfill for existing single user (production):**
```sql
-- 1. Create one default cash account per onboarded user, set as primary
INSERT INTO account (user_id, bank, kind, balance_cents, is_primary)
SELECT id, 'НАЛИЧНЫЕ', 'cash', 0, TRUE
  FROM app_user WHERE onboarded_at IS NOT NULL;

-- 2. Backfill account_id on existing actual_transaction rows
UPDATE actual_transaction at
   SET account_id = a.id
  FROM account a
 WHERE a.user_id = at.user_id AND a.is_primary AND at.account_id IS NULL;

-- 3. Backfill balance from existing transaction history per account
UPDATE account a SET balance_cents = COALESCE(
  (SELECT SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE -amount_cents END)
     FROM actual_transaction WHERE account_id = a.id), 0);
```

**Trigger pattern for balance sync** (lighter than ORM hooks; survives bot direct INSERTs):
```sql
CREATE OR REPLACE FUNCTION update_account_balance() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE account SET balance_cents = balance_cents +
      (CASE NEW.kind WHEN 'income' THEN NEW.amount_cents
                     WHEN 'expense' THEN -NEW.amount_cents
                     WHEN 'roundup' THEN -NEW.amount_cents
                     WHEN 'deposit' THEN -NEW.amount_cents END)
     WHERE id = NEW.account_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE account SET balance_cents = balance_cents -
      (CASE OLD.kind WHEN 'income' THEN OLD.amount_cents
                     ELSE -OLD.amount_cents END)
     WHERE id = OLD.account_id;
  -- UPDATE: implementation similar; only kick in if account_id or amount_cents changed
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
```

**Caveat:** trigger-based balance is HIGH integrity but harder to debug. Alternative: **service-layer recompute** in `app/services/accounts.py` (helper `recompute_balance(user_id, account_id)`) — called explicitly from create/update/delete actual. Less magic, easier to test. **Recommend service-layer** for v1.0; trigger only if perf becomes issue (>10K txns/account).

---

## 4. Q3 — Roundup transaction lifecycle: explicit, not event-driven

### Comparison

| Approach | Pros | Cons |
|---|---|---|
| **SQLAlchemy event hook** (`@event.listens_for(ActualTransaction, 'after_insert')`) | "Free", auto on all inserts | Hidden side-effects; debug hell; tx_date coupling weird; tests brittle |
| **Background job** (queue child txn for async) | Decouples user request | No queue infra (no Redis/Celery); APScheduler is for cron, not jobs |
| **Explicit return value** ✓ | Clear control flow; testable; bot/AI/Mini App share same logic | Slightly more code in `create_actual` |

### Recommendation: explicit in `create_actual`

Modify `app/services/actual.py:254-301` `create_actual` to return `(parent_txn, roundup_txn | None)`:

```python
async def create_actual(db, *, user_id, kind, amount_cents, description, category_id,
                        tx_date, account_id, source) -> tuple[ActualTransaction, ActualTransaction | None]:
    # ... existing validation + insert ...
    parent = ...  # existing
    await db.flush()

    roundup = None
    if kind == 'expense':
        roundup = await roundup_svc.maybe_create_roundup(db, parent=parent, user_id=user_id)
    return parent, roundup
```

Where `app/services/roundup.py` (new) reads `SavingsConfig` and creates child txn with `parent_txn_id=parent.id, account_id=parent.account_id, kind='roundup'`.

### Lifecycle rules

| Parent event | Roundup behavior |
|---|---|
| **Create expense** with roundup_enabled | Create roundup child; same `account_id`, same `tx_date`, kind=roundup, parent_txn_id=parent.id |
| **Delete parent** | DB cascade: `parent_txn_id` FK with `ON DELETE CASCADE` → child auto-removed. Account balance trigger / service handles both deltas |
| **Edit parent amount** | DELETE old roundup + recreate (idempotent). Don't try to "patch" — base may have changed too. Service: `recompute_roundup_for(parent)` |
| **Edit parent kind** (expense → income) | DELETE roundup; income has no roundup |
| **Roundup amount = 0** (parent already exact multiple) | Don't create child at all (DATA-MODEL §4: `if delta > 0 && delta < base`) |

**FK definition:**
```sql
ALTER TABLE actual_transaction
  ADD COLUMN parent_txn_id BIGINT REFERENCES actual_transaction(id) ON DELETE CASCADE;
ALTER TABLE actual_transaction
  ALTER COLUMN kind TYPE TEXT;  -- enum extension
DROP TYPE categorykind_old;
CREATE TYPE actualkind AS ENUM ('expense', 'income', 'roundup', 'deposit');
```

**Note: actual_transaction.kind enum diverges from category.kind**

This is a real schema decision. Currently both share `CategoryKind {expense, income}`. v1.0 needs `actual.kind ∈ {expense, income, roundup, deposit}` while `category.kind` stays `{expense, income}`. **Solution: split enums**:
- Keep `CategoryKind` (expense, income) — unchanged for `category` and `planned_transaction`.
- New `ActualKind` (expense, income, roundup, deposit) — replaces `CategoryKind` on `actual_transaction.kind`.

This breaks the equality check at `app/services/actual.py:280` (`if cat.kind.value != kind`). Fix: roundup/deposit map to expense for the category-validation check (special case in service).

---

## 5. Q4 — Rollover in close_period_job

### Where to insert

**Pre-close, after `compute_balance`, before status flip.** Concretely between `app/worker/jobs/close_period.py:156` (compute_balance call) and `:160` (`expired.status = closed`).

```python
# close_period.py _close_period_for_user — augmented
bal = await compute_balance(session, expired.id, user_id=user_id)
ending_balance = bal["balance_now_cents"]

# NEW: rollover step (Phase 22)
await rollover_svc.process_rollover(session, period=expired, user_id=user_id)

# existing
expired.status = PeriodStatus.closed
expired.ending_balance_cents = ending_balance
# ...
```

### Idempotency

The advisory lock at `:81-87` already prevents concurrent runs. But re-running the job manually after a failed close needs idempotency:

**Solution:** add `period.rollover_processed_at` column. `rollover_svc.process_rollover` checks; if not null, skip. If a previous run failed mid-rollover, partial deposit txns can be detected via `(period_id, kind='deposit', description LIKE 'Остаток %')` and re-checked per-category.

**Stronger guarantee:** mark each created deposit txn with the source category id in description AND add a unique constraint:
```sql
CREATE UNIQUE INDEX uq_rollover_deposit_per_category_period
  ON actual_transaction (period_id, category_id)
  WHERE kind = 'deposit' AND description LIKE 'Остаток%';
```

### Multi-tenant: already handled

`close_period_job` already iterates per-user with isolated sessions (`:112-122`). Per-user rollover failure logs and continues — same pattern.

### Misc rollover (DATA-MODEL §3 case)

For `category.rollover='misc'`, **don't create a txn** — instead store `period.misc_rollover_cents` (sum across misc categories) for next-period's reporting. New column `budget_period.misc_rollover_in_cents BIGINT DEFAULT 0`. Surfaced in PLAN screen "Прочее" virtual line.

---

## 6. Q5 — Savings aggregator caching

### Recommendation: **no caching, server-computed on demand**

Reasoning:
- 5 containers, no shared cache infra (no Redis), `lru_cache` per-process means cache inconsistency between api/bot/worker.
- Single user has ≤ ~1000 transactions/month → aggregation is cheap (`SUM` on indexed `(user_id, kind)`).
- Adding indexes is cheaper than adding cache layer:
  ```sql
  CREATE INDEX ix_actual_user_kind ON actual_transaction (user_id, kind);
  CREATE INDEX ix_actual_user_kind_date ON actual_transaction (user_id, kind, tx_date);
  ```
- Endpoint: `app/api/routes/savings.py` (NEW) → `GET /api/v1/savings` returns `{total, monthIn, config, goals}`.
  - `total = SUM(amount) WHERE user_id AND kind IN ('roundup','deposit')`
  - `monthIn = same AND tx_date BETWEEN month_start AND month_end`
  - `config` = SavingsConfig row
  - `goals` = Goal[] for user

If perf becomes problem (10K+ users, future): add `Cache-Control: max-age=10` header — TWA's HTTP layer caches naturally.

---

## 7. Q6 — Default 8 categories on onboarding

### Current state

`SEED_CATEGORIES` at `app/services/categories.py:22-39` has **14 categories** with Russian names ("Продукты", "Кафе и рестораны"). Existing users already have these seeded.

`v1.0 wants 8 categories`: food/cafe/home/transit/fun/gifts/health/subs. Plus `category.id` is now `string` ('food', 'cafe', ...) per DATA-MODEL §1.3 — but our DB has `Integer PK`. **DATA-MODEL §1.3 string IDs are conceptual** — ID stays integer, but a new `Category.code` column (`TEXT UNIQUE per user`) enables stable references like 'food', 'cafe' in handoff/AI/JSON.

### Backward compat strategy

Existing users (single-tenant for now, but Phase 11 already migrated to multi-tenant) won't get re-seeded. Options:

| Strategy | For new users | For existing | Risk |
|---|---|---|---|
| **(A) Replace SEED_CATEGORIES with 8 v1.0 list** | new 8 | unaffected (idempotent skip in `seed_default_categories:175`) | LOW ✓ |
| **(B) Migrate existing user's 14 → 8** | new 8 | renaming + merging old into new | HIGH (data loss) |
| **(C) Add `code` column, allow old + v1.0 categories to coexist** | new 8 | unchanged | LOW ✓ |

**Recommended: (A) + (C) combined.** Add `category.code` column (nullable for legacy). New users get 8 categories with `code IN ('food','cafe',...)`. Legacy users keep their 14 with `code=NULL`; handoff features that need `code` (auto-roundup destination 'savings', AI references) gracefully degrade — find by `name ILIKE` if `code` not set.

### Onboarding API extension

Current request (`app/api/schemas/onboarding.py`):
```python
class OnboardingCompleteRequest:
    starting_balance_cents: int
    cycle_start_day: int
    seed_default_categories: bool
```

v1.0 needs (per DATA-MODEL §4 and ТЗ §4):
```python
class OnboardingCompleteRequest:
    starting_balance_cents: int           # DEPRECATED — use accounts[].balance instead
    cycle_start_day: int
    seed_default_categories: bool

    # NEW (v1.0, all optional for backward compat):
    income_cents: Optional[int] = None
    accounts: Optional[list[AccountSeed]] = None       # ≥1 required for v1.0 onboarding
    category_plans: Optional[dict[str, int]] = None    # {code: plan_cents} for 8 v1.0 cats
    goal: Optional[GoalSeed] = None                    # optional 4th step
    savings_config: Optional[SavingsConfigSeed] = None # roundup_enabled + base
```

**Logic in `app/services/onboarding.py:complete_onboarding`:**
1. If `income_cents` provided → `user.income_cents = income_cents`
2. If `accounts` provided → seed accounts; mark first as primary; backfill `starting_balance_cents` from primary's balance for backward compat with existing period flow
3. If `seed_default_categories=True` → use 8 v1.0 list (with `code`s) when accounts also provided (signals v1.0 client); else legacy 14 (signals v0.x client)
4. If `category_plans` → set `category.plan_cents` per code-lookup
5. If `goal` → INSERT Goal row
6. If `savings_config` → INSERT SavingsConfig row (or default `roundup_enabled=False`)

**Existing callers (web v0.x onboarding) keep working** — they don't send the new optional fields, get the legacy 14-cat behavior + classic `starting_balance_cents`.

---

## 8. Q7 — iOS custom `PosterNavStack`

### Why custom?

DESIGN-SYSTEM §7.5 maps `posterSlideInFwd/Back` to `.transition(.asymmetric(.move(edge:.trailing/.leading) + .opacity))`. Native iOS 26 `NavigationStack` slide transition is fixed (60fps, system look). To match the 28px-slide + 420ms-easeOut spec exactly, we need control over the transition curve and offset distance.

### Architecture

```swift
@MainActor @Observable
final class PosterNavStack {
    private(set) var stack: [Screen] = [.home]
    var direction: NavDirection = .forward  // for asymmetric transition

    func push(_ screen: Screen) { direction = .forward; stack.append(screen) }
    func pop() {
        guard stack.count > 1 else { return }
        direction = .backward
        stack.removeLast()
    }
    func popToRoot() { direction = .backward; stack = [stack.first!] }
}

enum Screen: Hashable {
    case home, transactions, plan, category(id: Int), accountList, account(id: Int),
         savings, savingsGoalEdit(id: Int?), addSheet, ...
}
```

**Render container:**
```swift
struct PosterRoot: View {
    @State var nav = PosterNavStack()
    var body: some View {
        ZStack {
            ForEach(Array(nav.stack.enumerated()), id: \.offset) { idx, screen in
                screenView(for: screen)
                    .transition(asymmetricSlide(direction: nav.direction))
                    .zIndex(Double(idx))
            }
        }
        .animation(.easeOut(duration: 0.42), value: nav.stack)
    }
}
```

### Edge-swipe-back

`UINavigationController` exposes `interactivePopGestureRecognizer`. With pure SwiftUI custom stack, you must add manually:

```swift
.gesture(
    DragGesture(minimumDistance: 12, coordinateSpace: .global)
        .onChanged { /* mirror translation as offset */ }
        .onEnded { v in if v.translation.width > 80 { nav.pop() } }
)
```

**But this conflicts with TabView swipe.** Mitigation: only enable horizontal-drag-pop when stack count > 1 (root tab screens don't need pop), and require `minimumDistance: 24` to avoid accidental triggers.

### Deep link integration

Convert URLs to `Screen` cases:
```swift
extension PosterNavStack {
    func handle(url: URL) {
        // tg://app/category/42 → push(.category(id: 42))
        if let parsed = parseDeepLink(url) {
            stack = [.home] + buildPath(to: parsed)
        }
    }
}
```

### Scroll preservation

Each `Screen` view should use `@SceneStorage` for `scrollOffset`. The `ZStack` keeps screens alive (only top is visible), so `ScrollView` state survives push/pop naturally. **Edge case:** memory growth if stack gets deep — cap at 8 screens, `popToRoot` from anywhere.

### Tab integration

Each tab gets its own `PosterNavStack`. `MainShell` holds 4 stacks (one per tab):
```swift
@State var homeNav = PosterNavStack()
@State var savingsNav = PosterNavStack()
@State var aiNav = PosterNavStack()
@State var mgmtNav = PosterNavStack()
```
TabView selection animates with `posterTabSwap` keyframe (350ms easeOut, fade+rise).

---

## 9. Q8 — iOS dual-design coexistence (v0.6 native + v1.0 poster)

### Recommendation: feature flag at `MainShell`, not per-screen

**Don't:** `if useV1 { PosterHomeView() } else { HomeView() }` in 28 screens. Maintenance hell.

**Do:**
```swift
struct MainShell: View {
    @AppStorage("ui.theme") var theme: UITheme = .v06_native

    var body: some View {
        switch theme {
        case .v06_native: V06MainShell()    // current code, untouched
        case .v10_poster: V10MainShell()    // new code
        }
    }
}
```

Two MainShells share `APIClient`, `AuthStore`, `MoneyFormatter`, but have separate view trees. `V06MainShell.swift` is a verbatim copy of current `BottomNav.swift:48-68`. `V10MainShell.swift` is the new `PosterRoot` with `PosterNavStack`.

**Pros:**
- Phase 22-27 development never touches v0.6 screens — zero regression risk.
- Phase 28 acceptance: feature flag flip + e2e check.
- Easy rollback: `defaults write` toggle.

**Cons:**
- 2× build size (negligible — SwiftUI views compile small).
- Some shared code (e.g., `MoneyFormatter`, DTOs) — fine, no duplication.

**File layout:**
```
ios/BudgetPlanner/
├── Features/                 # current v0.6 (untouched, references AppShellState)
│   ├── Home/HomeView.swift
│   └── ...
├── FeaturesV10/              # NEW — v1.0 Poster
│   ├── Home/PosterHomeView.swift
│   ├── Savings/PosterSavingsView.swift
│   ├── Common/PosterNavStack.swift
│   ├── Common/PosterTokens.swift  # palette, fonts, spacing
│   └── ...
└── App/
    ├── AppRouter.swift            # adds switch on theme
    └── V10MainShell.swift         # NEW
```

When Phase 28 ships, set `theme = .v10_poster` as default; v0.6 code stays a fallback for ~1 release before deletion.

---

## 10. Q9 — Web dual-track

### Recommendation: incremental rewrite **inside same Vite project**, route-gated

Same Vite app, but with a top-level "shell" choice:

```tsx
// frontend/src/main.tsx
import App from './App'              // v0.6
import AppV10 from './AppV10'        // v1.0

const useV10 = localStorage.getItem('ui.theme') === 'v10' ||
               import.meta.env.VITE_UI_THEME === 'v10'

ReactDOM.createRoot(document.getElementById('root')!).render(
  useV10 ? <AppV10 /> : <App />
)
```

**Why this beats separate Vite project:**
- Same backend `/api` proxy, same TG initData hook, same `frontend/src/api/` shared
- Single `vite build` → single `dist/` → Caddy serves both transparently
- Shared `frontend/src/api/types.ts` (Category, Transaction TS types) — DTO contract single source of truth

**File structure:**
```
frontend/src/
├── App.tsx              # v0.6 (untouched)
├── AppV10.tsx           # NEW — Poster app shell
├── api/                 # shared (extended with accounts.ts, savings.ts, etc.)
├── components/          # v0.6 (untouched)
├── componentsV10/       # NEW — Poster components
├── screens/             # v0.6 (untouched)
├── screensV10/          # NEW — Poster screens
└── stylesV10/           # NEW — Poster CSS variables, fonts
```

Production flag: env var `VITE_UI_THEME=v10` at deploy time. Or query string `?theme=v10` for owner testing without redeploy.

**Existing TWA never breaks** — flag default = v0.6.

### Bundle size concern

V10 imports DM Serif Italic + Archivo Black + JetBrains Mono + Manrope = ~600KB raw fonts. Use `@fontsource/*` with subset (latin + cyrillic) → ~150KB total. Vite tree-shakes unused screens automatically only if they're not in the entry chain. **Mitigation:** dynamic import per route once a router is added in V10:

```tsx
const PosterHome = React.lazy(() => import('./screensV10/PosterHome'))
```

---

## 11. Q10 — Cross-platform sync infrastructure

### Strategy: prototype is source of truth; Playwright captures targets

**Pipeline:**
```
.planning/v1.0-handoff/handoff/prototype/index.html
                    │
                    ▼ (open in Chrome via Playwright)
scripts/capture-targets.ts  →  .planning/v1.0-handoff/screenshots-target/{phase}/{screen}@{viewport}.png
                    │
                    ├──→ web pixel-perfect QA: Playwright e2e diff
                    └──→ iOS pixel-perfect QA: side-by-side preview (manual or Xcode preview)
```

### Directory structure

```
.planning/v1.0-handoff/screenshots-target/
├── README.md                          # how-to: run capture script, interpret
├── 22-backend/                        # (empty — backend phase has no screens)
├── 23-design-system/
│   ├── tokens.png                     # palette card from prototype
│   └── typography.png                 # font specimens
├── 24-onboarding/
│   ├── 01-income@390x844.png
│   ├── 02-accounts@390x844.png
│   ├── 03-plan@390x844.png
│   └── 04-goal@390x844.png
├── 25-home-tx-add/
│   ├── home-coral@390x844.png
│   ├── home-cobalt@390x844.png
│   ├── txn-list@390x844.png
│   └── add-sheet@390x844.png
├── 26-category-plan-subs/
│   ├── category-norm@390x844.png
│   ├── category-over@390x844.png
│   ├── plan@390x844.png
│   └── subs@390x844.png
├── 27-ai-savings-accounts-anal-mgmt/
│   ├── ai-initial@390x844.png
│   ├── ai-active@390x844.png
│   ├── savings@390x844.png
│   ├── accounts-list@390x844.png
│   ├── account-detail@390x844.png
│   ├── analytics@390x844.png
│   └── management@390x844.png
└── 28-polish/
    └── animations/                    # GIFs/MP4 of keyframes from prototype
        ├── posterRowIn.mp4
        └── ...
```

### Capture script (one-off per phase)

```typescript
// scripts/capture-targets.ts
import { chromium } from '@playwright/test'

const SCREENS = [
  { name: 'home-coral', selector: '[data-poster="home"][data-tweak="coral"]' },
  { name: 'txn-list', selector: '[data-poster="txn"]' },
  // ...
]

for (const s of SCREENS) {
  await page.goto('file://.../prototype/index.html')
  await page.locator(s.selector).screenshot({ path: `targets/${phase}/${s.name}@390x844.png` })
}
```

### Who updates? Designer rule

- Prototype changes → designer commits new prototype + reruns capture script → screenshots-target/ updated in same PR.
- Frontend implementer never edits prototype; only consumes screenshots-target/ as comparison baseline.

### Phase ownership

| Phase | Capture targets | When |
|---|---|---|
| 22 | none | — |
| 23 | tokens, type specimens | start of phase (one-time) |
| 24-27 | per-phase screen set | start of phase (planner runs script) |
| 28 | animation MP4s | start of polish phase |

### iOS comparison workflow

Add **Xcode SwiftUI Preview** rule: every PosterScreen view has a `#Preview` block; place target PNG side-by-side via Xcode Preview Canvas split view. For automated diff (optional v1.1): `xcrun simctl io booted recordVideo` → ffmpeg frame extract → `pixelmatch` vs target. Out-of-scope for v1.0 acceptance per memory `feedback-pixel-perfect.md` (manual side-by-side is the rule for now).

---

## 12. Q11 — Build order phases 22-28: dependencies & risks

### Suggested order (reaffirmed from PROJECT.md, with rationale)

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 22 — Backend Schema & Logic Foundation                    │
│  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │ Account  │ │ Goal   │ │SavingsCfg│ │CatExt  │ │Recurrent │ │
│  │  table   │ │ table  │ │  table   │ │ +cols  │ │  ext     │ │
│  └──────────┘ └────────┘ └──────────┘ └────────┘ └──────────┘ │
│         │           │           │           │          │       │
│         └───────────┴───────────┴───────────┴──────────┘       │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ~12 new endpoints + roundup_svc + rollover_svc          │  │
│  │ + close_period.py augmented                              │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Phase 23 — Design System Foundation (web ║ iOS PARALLEL)        │
│  ┌────────────────┐         ┌────────────────────────────┐    │
│  │ web: tokens    │         │ iOS: PosterTokens.swift    │    │
│  │ + 4 fonts      │         │ + bundle TTFs              │    │
│  │ + 11 keyframes │         │ + transitions/animations   │    │
│  │ + components/  │         │ + PosterNavStack           │    │
│  └────────────────┘         └────────────────────────────┘    │
│            └────── shared CSS-vars source ───────┘             │
└────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
       ┌────────────┐ ┌────────────┐ ┌───────────────┐
       │ Phase 24   │ │ Phase 25   │ │ Phases 26 + 27│
       │ Onboarding │ │ Home/Tx/Add│ │ in parallel   │
       │ (web → iOS)│ │ (web → iOS)│ │ (web → iOS)   │
       └────────────┘ └────────────┘ └───────────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ Phase 28 Polish│
                     └────────────────┘
```

### Phase 22 blocks all UI phases (correct as planned)

Without `Account`, `Goal`, `Recurrent` extensions — onboarding (24), home wallet display (25), savings (27), accounts list (27) all have no API to call.

### Phase 23 design system: shared source via codegen

**Risk:** web CSS variables and Swift constants drift. Engineer changes coral on web, forgets Swift.

**Mitigation: single TOML/JSON source, codegen both:**
```
.planning/v1.0-handoff/handoff/tokens.json    ← single source
       │
       ├──→ scripts/gen-css.ts        → frontend/src/stylesV10/tokens.css
       └──→ scripts/gen-swift.ts      → ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift
```

CI check: `make tokens-check` runs gen, fails if generated file ≠ committed.

Token shape:
```json
{
  "color": {
    "cream": "#F4EAD9",
    "ink": "#1B1A18",
    ...
  },
  "spacing": [4, 8, 10, 12, 14, 18, 22, 24, 28, 40, 56],
  "font": {
    "archivoBlack": { "family": "Archivo Black", "weight": 900 },
    ...
  }
}
```

**Trade-off:** modest setup cost (~half-day), but locks parity. Without it, expect ≥3 sync bugs over Phase 23-27.

### Phases 25-27 parallel: merge conflicts

| Phase | Web files touched | iOS files touched | Backend |
|---|---|---|---|
| 25 | `screensV10/PosterHome*`, `*PosterTxn*`, `*PosterAdd*` | `FeaturesV10/Home/`, `Transactions/`, `Add/` | none (backend done in 22) |
| 26 | `screensV10/PosterCategory*`, `*Plan*`, `*Subs*` | `FeaturesV10/Category/`, `Plan/`, `Subs/` | none |
| 27 | `screensV10/PosterAi*`, `*Savings*`, `*Account*`, `*Anal*`, `*Mgmt*` | `FeaturesV10/AI/`, `Savings/`, `Accounts/`, `Analytics/`, `Mgmt/` | none |

**Conflict surface:**
1. `frontend/src/AppV10.tsx` — central nav state extended in each phase. **Mitigation:** single PR per phase that touches AppV10.tsx; reviewer enforces single-line additions only ("add another route case", not refactor).
2. `frontend/src/api/types.ts` — DTO types shared. **Mitigation:** Phase 22 adds ALL new DTOs upfront (Account, Goal, Recurrent, SavingsConfig, AccountSeed, ...). Phases 25-27 only consume.
3. `ios/.../PosterNavStack.Screen` enum — additive. **Mitigation:** add all cases in Phase 23, even if not yet wired.
4. `ios/BudgetPlanner.xcodeproj/project.pbxproj` — Xcode project file. **Mitigation:** `XcodeGen` (memory `ios-tooling.md`) regenerates project from `project.yml` — no manual pbxproj edits, no merge conflicts.
5. `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` — shared. **Mitigation:** generated, never edited manually.

### git worktree workflow per `gsd-workstreams` (per PROJECT.md branching)

```bash
git worktree add ../tg-25-web v1.0/25-web
git worktree add ../tg-26-web v1.0/26-web
git worktree add ../tg-25-ios v1.0/25-ios
```
Each worktree builds independently; backend stays in main worktree (Phase 22 already merged into `v1.0-maximal-poster` integration branch). Merges to integration branch happen end of each phase, web before iOS within a phase (web→iOS sequencing within phase eliminates cross-platform parallelism conflict).

### Backend extension blocking Phase 22 — sub-ordering

Recommended sub-phase order for Phase 22 itself (DAG):
```
22.1 — Alembic migrations (tables + columns + RLS)         BLOCKER
       ├── 22.2a — AccountService + endpoints
       ├── 22.2b — GoalService + endpoints
       ├── 22.2c — SavingsService + config endpoint
       │            └── 22.3 — RoundupService (depends on Account + SavingsCfg)
       │                       └── 22.4 — Modify create_actual to call roundup_svc
       ├── 22.2d — Recurrent extension service + endpoints
       └── 22.5 — RolloverService + close_period.py augment (depends on Account)
                  └── 22.6 — Onboarding extension (uses everything)
```

22.1 must commit + run before any other 22.x. After that, 22.2a-d can parallelize across one developer or be sequenced (small enough that linear is fine).

---

## 13. Cross-cutting integration risks

| Risk | Where | Mitigation |
|---|---|---|
| **`actual_transaction.kind` enum change breaks `compute_balance`** | `app/services/actual.py:482-498` aggregates by kind, expects only expense/income | Filter roundup/deposit OUT of `planned_total_*` and `actual_total_*` (they're savings flow, not budget). Add explicit `WHERE kind IN ('expense','income')` to planned_q + filter in actual_q |
| **AI tools break with new transaction kinds** | `app/ai/tools.py` create_actual_transaction | Add validation: AI can create only `expense`/`income`. Roundup is server-side only. Same applies to bot `/add` command |
| **TWA bundle size** | adding 4 fonts + V10 components | Use `@fontsource` subsets; lazy-load V10 routes; budget: ≤ 200KB additional gzipped |
| **iOS font registration** | DESIGN-SYSTEM mandates 4 Google fonts; Apple HIG would prefer SF | Bundle TTFs in `Resources/Fonts/`, register via `UIAppFonts` in Info.plist; access via `Font.custom("Archivo Black", size: ...)` |
| **Trigger vs service for account.balance** | `account.balance_cents` mutation | Service-layer ONLY for v1.0; defer trigger optimization. Add e2e test: create txn → balance updates. Direct bot inserts via `app/bot/api_client.py` already go through API → service path; safe |
| **Period balance vs Account balance divergence** | `BudgetPeriod.starting_balance_cents` carries from previous period; `Σ account.balance_cents` is independent | Document in HLD: two views co-exist. Home shows `Σ account.balance_cents` («в кошельке»); PLAN/per-category math uses `compute_balance` |
| **Multi-tenant RLS for new tables** | Phase 11 already established the pattern | Each new table (account, goal, recurrent, savings_config) MUST: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (user_id = current_setting('app.current_user_id')::bigint)`. Pattern is in alembic 0006/0007 |
| **`/api/me` response inflation** | Web onboarding flow probes `GET /me` to check onboarded_at | Add `account_count`, `has_savings_config` to response so V10 client can branch logic without N+1 calls |
| **Categories code uniqueness across users** | `category.code` per-tenant unique, NOT global | `UNIQUE (user_id, code)` partial WHERE code IS NOT NULL — different users can both have 'food' code |
| **Recurrent posted_txn_id orphan** | If user deletes the actual_txn that recurrent points to | `ON DELETE SET NULL` on the FK |
| **Web e2e tests against v0.6 break when V10 ships** | `frontend/tests/e2e/*.spec.ts` selectors target v0.6 DOM | Tag tests with `@theme:v06`; add new `@theme:v10` suite in Phase 25+. CI matrix runs both with respective `VITE_UI_THEME` flag |
| **iOS XcodeGen project.yml conflicts when adding many new files** | Each phase adds 5-10 new Swift files | Use directory globs in `project.yml` (e.g., `path: BudgetPlanner/FeaturesV10/**`); regenerate per-phase, no manual edits |

---

## 14. New vs Modified components — explicit table

### NEW components (Phase 22)

| File | Purpose |
|---|---|
| `app/db/models.py` (extended) — class `Account`, `Goal`, `Recurrent`, `SavingsConfig` | New tables |
| `app/services/accounts.py` | CRUD + balance recompute |
| `app/services/goals.py` | CRUD |
| `app/services/savings.py` | aggregator (total, monthIn) + config |
| `app/services/roundup.py` | `maybe_create_roundup`, `recompute_roundup_for` |
| `app/services/rollover.py` | `process_rollover` for close_period |
| `app/services/recurrents.py` | (refactor) extract from subscriptions.py; post-to-fact + unpost |
| `app/api/routes/accounts.py` | `/accounts` CRUD endpoints |
| `app/api/routes/goals.py` | `/goals` CRUD |
| `app/api/routes/savings.py` | `GET /savings`, `PATCH /savings/config`, `POST /savings/deposit` |
| `app/api/routes/recurrents.py` | post/unpost endpoints |
| `app/api/schemas/{accounts,goals,savings,recurrents}.py` | Pydantic DTOs |
| `alembic/versions/0011_*.py` | migrations |

### MODIFIED components (Phase 22)

| File:line | Change |
|---|---|
| `app/db/models.py:213-237` Subscription | + day_of_month, account_id, posted_txn_id |
| `app/db/models.py:278-308` ActualTransaction | + parent_txn_id, account_id; kind enum → ActualKind |
| `app/db/models.py:125-152` Category | + code, plan_cents, rollover, paused, parent_id, ord |
| `app/db/models.py:87-122` AppUser | + income_cents, primary_account_id |
| `app/services/actual.py:254-301` create_actual | return tuple (parent, roundup); call roundup_svc |
| `app/services/actual.py:280` kind validation | special-case roundup/deposit → expense category |
| `app/services/actual.py:482-498` compute_balance | filter planned_q + actual_q to expense/income only |
| `app/services/onboarding.py:76-186` complete_onboarding | accept v1.0 fields; conditional 8-vs-14 seed |
| `app/services/categories.py:22-39` SEED_CATEGORIES | new V10_SEED_CATEGORIES with codes |
| `app/worker/jobs/close_period.py:125-199` _close_period_for_user | + rollover step before status flip; + reset recurrent.posted_txn_id |
| `app/api/router.py:120-158` | + include_router for accounts, goals, savings, recurrents |
| `app/api/schemas/onboarding.py` | + optional v1.0 fields |

### NEW (Phase 23 — design system)

| File | Purpose |
|---|---|
| `.planning/v1.0-handoff/handoff/tokens.json` | single source of design tokens |
| `scripts/gen-css.ts`, `scripts/gen-swift.ts` | codegen for tokens |
| `frontend/src/stylesV10/tokens.css` | generated CSS variables |
| `frontend/src/stylesV10/keyframes.css` | 11 poster animations |
| `frontend/src/stylesV10/fonts.css` | @fontsource imports |
| `frontend/src/componentsV10/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,PosterToast,PosterFAB}.tsx` | base components |
| `frontend/src/AppV10.tsx` | V10 shell (parallel to App.tsx) |
| `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` | generated Swift constants |
| `ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` | custom navigation |
| `ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift` | asymmetric transitions |
| `ios/BudgetPlanner/FeaturesV10/Common/PosterCountUp.swift` | count-up helper |
| `ios/BudgetPlanner/Resources/Fonts/{ArchivoBlack-Black.ttf,DMSerifDisplay-Italic.ttf,JetBrainsMono-*.ttf,Manrope-*.ttf}` | bundled fonts |
| `ios/BudgetPlanner/Info.plist` | + UIAppFonts entries |
| `ios/BudgetPlanner/App/AppRouter.swift:6-26` | + theme switch |
| `ios/BudgetPlanner/App/V10MainShell.swift` | new |

### NEW per Phase 24-27 — same V10-namespaced pattern; v0.6 untouched

---

## 15. Confidence

| Area | Level | Source |
|---|---|---|
| Existing backend layout (models, services, jobs) | HIGH | direct file:line reads |
| Existing iOS architecture | HIGH | `AppRouter.swift:1-26`, `BottomNav.swift:48-68`, `APIClient.swift` direct read |
| Existing web architecture | HIGH | `frontend/src/App.tsx:1-248` direct read; flat React state confirmed |
| v1.0 data model intent | HIGH | `DATA-MODEL.md` direct read |
| Subscription→Recurrent merge feasibility | MEDIUM | reasoning from schema; needs Phase 22 spike to validate `posted_txn_id` reset semantics in close_period |
| iOS PosterNavStack edge-swipe interaction with TabView | MEDIUM | architecturally sound but needs prototype on real device — gestures are notoriously tricky |
| Token codegen workflow | LOW | proposed but not validated; alternatives include manual sync (faster start, drift risk later) |
| Bundle-size estimates for fonts | LOW | rule-of-thumb; recommend measuring after first integration |
