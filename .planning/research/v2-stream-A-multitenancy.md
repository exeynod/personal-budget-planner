# v0.3 Research — Stream A: Multi-tenancy + Audit Log + Whitelist

**Researched:** 2026-05-05
**Domain:** PostgreSQL multi-tenancy, audit logging, access control for TG-Budget-Planner
**Confidence:** HIGH on patterns; MEDIUM on pgvector (depends on AI features not yet specified)
**Scope:** v0.3 evolution from single-tenant (`OWNER_TG_ID` ENV) → 5-50 user whitelisted multi-tenant + audit log + AI chat with embeddings

---

## Executive Summary

For a 5-50 user single-instance Telegram Mini App, the **recommended path** is:

1. **Multi-tenancy**: Shared schema + `user_id BIGINT NOT NULL` FK in all data tables, **enforced at the application layer via SQLAlchemy session-scoped tenant context**, with PostgreSQL **Row-Level Security (RLS) as a defense-in-depth backstop** (not the primary mechanism). Schema-per-tenant rejected as overkill given Alembic friction with N schemas.
2. **Whitelist**: Extend `app_user` with `role` (`owner`/`member`/`revoked`) — no separate `whitelist_entry` table. Owner gates via bot-only commands `/invite`, `/revoke`, `/list_users`. New users authenticate but get 403 if `role NOT IN ('owner','member')`.
3. **Audit log**: PostgreSQL `audit_log` table populated by **AFTER INSERT/UPDATE/DELETE row-level triggers** that emit JSONB diffs, partitioned by month, retention 12 months. ClickHouse rejected — at 500-5000 events/day it is 4 orders of magnitude below ClickHouse's break-even point.
4. **pgvector**: Separate `transaction_embedding` table with `user_id` denormalized for filtered HNSW search. Single global HNSW index with `user_id` prefilter (not partial-per-tenant) — partial indexes only pay off with skewed tenant sizes, which is unlikely here.
5. **Soft delete**: Keep hard delete for transactions/subscriptions. The audit log + JSONB `old_values` provides the historical trail. Adding `deleted_at` introduces double-state complexity that isn't justified at this scale.

**Primary recommendation:** RLS + app-layer filter in tandem. App-layer is your fast path (queries are clean, indexes work normally); RLS is your "I forgot WHERE clause" insurance policy. Costs ~1 line per query (`session.execute(text("SET app.current_user_id = ..."))`) and ~<1ms per query overhead with proper indexes.

---

## 1. PostgreSQL Multi-tenancy: Recommendation + Comparative Analysis

### 1.1 Three approaches compared

| Aspect | Shared schema + `user_id` column | Shared schema + RLS | Schema-per-tenant |
|--------|----------------------------------|---------------------|-------------------|
| Code complexity | LOW: every query has `WHERE user_id = :uid` | MEDIUM: app sets `SET app.current_user_id`; queries are tenant-agnostic | HIGH: dynamic search_path or N connection pools |
| Risk of leak | HIGH: one missed `WHERE` = cross-tenant breach | LOW: enforced at storage layer, even raw SQL is safe | LOWEST: physical schema separation |
| Migration friction (Alembic) | Trivial: 1 migration for all users | Trivial: 1 migration + RLS policies once | Severe: must run Alembic N times, drift risk |
| pgvector compatibility | Native: `WHERE user_id` prefilter on HNSW | Native: RLS policy filters HNSW results | Per-schema HNSW indexes — wastes RAM on N=50 |
| Audit log partitioning | Single `audit_log` table partitioned by month | Same | Per-schema audit log = N tables to manage |
| Query SQLAlchemy 2.x async | Add filter to every `select()` | Set context once per request via FastAPI dep | `async_sessionmaker` per tenant — connection pool explosion |
| Backup/restore | Single pg_dump | Single pg_dump | Easier per-tenant export |
| Resource usage | Best (one connection pool) | Best (one connection pool) | Worst (N pools / search_path swaps) |
| Cross-tenant queries (admin reports) | Trivial | Need `BYPASSRLS` role | Cross-schema joins are awkward |

[CITED: aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/]
[CITED: planetscale.com/blog/approaches-to-tenancy-in-postgres]
[CITED: crunchydata.com/blog/row-level-security-for-tenants-in-postgres]

### 1.2 Recommendation: hybrid — `user_id` column + RLS belt-and-suspenders

For 5-50 users on one VPS Postgres, **schema-per-tenant is rejected outright** — the operational tax (Alembic loop over schemas, search_path management, N pgvector indexes consuming RAM you don't have on a small VPS) far exceeds the marginal isolation benefit.

Between the remaining two, the **right answer is "both"**:

- **Primary mechanism**: `user_id BIGINT NOT NULL` column on every tenant-scoped table + a FastAPI dependency (`get_current_user_db_id`) that yields the active user_id. Queries explicitly filter: `select(ActualTransaction).where(ActualTransaction.user_id == current_user_id)`. This is the readable, debuggable, performance-friendly path.
- **Defense-in-depth**: Enable RLS on every tenant-scoped table with policy `USING (user_id = current_setting('app.current_user_id')::bigint)`. The FastAPI session dependency calls `SET LOCAL app.current_user_id = <id>` at request start. Even if a developer writes `SELECT * FROM actual_transaction` in a raw script that runs through the app role, RLS blocks cross-tenant rows. [CITED: postgresql.org/docs/current/ddl-rowsecurity.html]

The connection role that runs migrations and worker jobs needs `BYPASSRLS` (or use `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` for owner). The API/bot/scheduler role connects as a non-superuser without `BYPASSRLS` — this is the role policies apply to.

**Why not RLS-only?** Two reasons:
1. RLS makes implicit what should be explicit. Reading a query and not seeing `WHERE user_id` makes the data flow harder to reason about during code review.
2. The `app_user` table itself (whitelist!) needs special handling: members can read their own row, owner can read all. RLS policies for that mixed-role table get tangled. App-layer filtering keeps the policy simple ("is requester == row owner OR is requester role=owner").

**Why not app-layer-only?** A single missed `WHERE` clause across the entire codebase = data leak. With 5-50 trusted users this is a small blast radius, but the cost of RLS as backstop is one `SET LOCAL` per request and a one-time policy-creation migration. [CITED: simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/]

**Performance overhead**: RLS adds <1ms at p95 with a `user_id` index. [CITED: permit.io/blog/postgres-rls-implementation-guide] The `user_id` filter must be the leading column of relevant indexes (or a separate index on `user_id` alone), otherwise sequential scans appear. [ASSUMED — verify with EXPLAIN ANALYZE on real data once migration done]

### 1.3 Tables that DO NOT get user_id

- `app_user` itself (it IS the tenant directory — distinguish via `role`)
- `app_health` (worker heartbeat, no tenant context)
- `audit_log` (has `user_id` for the actor, but readable globally by owner)
- `category` — open question. The current 14-category seed implies categories are per-user (each user has their own "Food", "Rent"). My recommendation: **per-user categories** (`category.user_id NOT NULL`). Seeds are duplicated per user during onboarding. This avoids the messy "user A renames category, user B sees the rename" scenario.

---

## 2. Migration Plan: single → multi-tenant

The existing prod has 1 user (the owner). Downtime is acceptable for a personal pet during the cutover (15-30 min maintenance window). This makes the migration dramatically simpler than zero-downtime SaaS migrations [CITED: dev.to/grommash9/37-alembic-migrations-zero-downtime] which need 37 separate revisions.

### 2.1 Migration sequence (5 Alembic revisions)

**Revision 0003 — `add_user_role_and_owner_membership`**
```python
# alembic/versions/0003_add_user_role_and_owner_membership.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

def upgrade():
    user_role = ENUM('owner', 'member', 'revoked', name='user_role', create_type=True)
    user_role.create(op.get_bind(), checkfirst=True)

    op.add_column('app_user',
        sa.Column('role', sa.Enum('owner', 'member', 'revoked', name='user_role'),
                  nullable=False, server_default='member'))
    op.add_column('app_user',
        sa.Column('invited_by_user_id', sa.Integer(),
                  sa.ForeignKey('app_user.id', ondelete='SET NULL'), nullable=True))
    op.add_column('app_user',
        sa.Column('revoked_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # Promote the existing single user to owner
    op.execute("""
        UPDATE app_user SET role = 'owner'
        WHERE tg_user_id = (SELECT tg_user_id FROM app_user ORDER BY id LIMIT 1)
    """)
```

**Revision 0004 — `add_user_id_columns_nullable`** (EXPAND phase)
```python
def upgrade():
    for table in ('category', 'budget_period', 'plan_template_item',
                  'planned_transaction', 'actual_transaction', 'subscription'):
        op.add_column(table,
            sa.Column('user_id', sa.Integer(),
                      sa.ForeignKey('app_user.id', ondelete='CASCADE'),
                      nullable=True))  # nullable for backfill
        op.create_index(f'ix_{table}_user_id', table, ['user_id'])
```

**Revision 0005 — `backfill_user_id`** (data migration)
```python
def upgrade():
    op.execute("""
        WITH owner AS (SELECT id FROM app_user WHERE role='owner' LIMIT 1)
        UPDATE category SET user_id = (SELECT id FROM owner) WHERE user_id IS NULL;
    """)
    # Repeat for all 6 tables. With ~5000 rows total, this is a single statement, no batching.
    # For each table, also vacuum/reindex post-update.
```

**Revision 0006 — `tighten_user_id_constraints`** (CONTRACT phase)
```python
def upgrade():
    # Make user_id NOT NULL
    for table in ('category', 'budget_period', ...):
        op.alter_column(table, 'user_id', nullable=False)

    # Replace global unique constraints with composite
    op.drop_constraint('budget_period_period_start_key', 'budget_period', type_='unique')
    op.create_unique_constraint('uq_budget_period_user_period_start',
                                'budget_period', ['user_id', 'period_start'])

    op.drop_constraint('uq_planned_sub_charge_date', 'planned_transaction', type_='unique')
    op.create_unique_constraint('uq_planned_sub_charge_date',
                                'planned_transaction',
                                ['user_id', 'subscription_id', 'original_charge_date'])

    # Composite indexes for tenant-leading lookups
    op.create_index('ix_actual_user_period_kind', 'actual_transaction',
                    ['user_id', 'period_id', 'kind'])
    op.drop_index('ix_actual_period_kind', table_name='actual_transaction')

    op.create_index('ix_planned_user_period_kind', 'planned_transaction',
                    ['user_id', 'period_id', 'kind'])
    op.drop_index('ix_planned_period_kind', table_name='planned_transaction')

    # Category sort_order should also be unique per user (if you enforce it)
    # - decide based on existing constraints
```

**Revision 0007 — `enable_rls`**
```python
TENANT_TABLES = ['category', 'budget_period', 'plan_template_item',
                 'planned_transaction', 'actual_transaction', 'subscription']

def upgrade():
    for t in TENANT_TABLES:
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY;")  # apply to table owner too
        op.execute(f"""
            CREATE POLICY tenant_isolation ON {t}
            USING (user_id = current_setting('app.current_user_id', true)::bigint)
            WITH CHECK (user_id = current_setting('app.current_user_id', true)::bigint);
        """)

    # Create a separate role for migrations/admin that bypasses RLS
    op.execute("CREATE ROLE budget_admin BYPASSRLS;")  # used by Alembic + worker for cross-user jobs
```

### 2.2 SQLAlchemy + FastAPI integration

```python
# app/api/dependencies.py — extended
from contextvars import ContextVar
from sqlalchemy import text

current_user_db_id: ContextVar[int | None] = ContextVar('current_user_db_id', default=None)

async def get_current_app_user(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppUser:
    """Resolves Telegram user → DB AppUser, enforces whitelist, sets RLS context."""
    stmt = select(AppUser).where(AppUser.tg_user_id == user['id'])
    app_user = (await db.execute(stmt)).scalar_one_or_none()
    if app_user is None or app_user.role == UserRole.revoked:
        raise HTTPException(403, 'Not whitelisted')

    # Set RLS session variable (LOCAL = scoped to current transaction)
    await db.execute(text("SET LOCAL app.current_user_id = :uid").bindparams(uid=app_user.id))
    current_user_db_id.set(app_user.id)
    return app_user
```

[CITED: medium.com/@anand_thakkar — set_config / SET LOCAL pattern]
[CITED: dobken.nl/posts/rls-postgres/ — async SQLAlchemy RLS]

### 2.3 Worker / scheduler considerations

The 3 cron jobs (notify_subscriptions, charge_subscriptions, close_period) iterate over **all** users. They must connect as `budget_admin` (BYPASSRLS) and explicitly loop:

```python
async for user in iter_active_users(db):
    await db.execute(text("SET LOCAL app.current_user_id = :uid").bindparams(uid=user.id))
    await close_period_for_user(db, user)
```

The advisory lock pattern stays the same but namespace the lock key by user_id: `pg_try_advisory_lock(hash('close_period'::text), user_id)`.

### 2.4 Risks

- **Risk: forgotten composite unique constraint**. Currently `budget_period.period_start UNIQUE` will block any second user from having a period starting on the same date. Migration 0006 MUST run before any second user is invited. **Mitigation**: gate `/invite` bot command behind a check that 0006 is applied.
- **Risk: RLS bypass via migration tool**. If Alembic runs as a role without BYPASSRLS, migrations fail silently on tenant tables. **Mitigation**: explicit `budget_admin` role used for migrations in `alembic/env.py`.
- **Risk: scheduler advisory locks collide across users**. Currently locks are per-job-name. Need to namespace by user. **Mitigation**: see worker section above.
- **Risk: orphaned data on user revoke**. CASCADE on `app_user.id` will hard-delete a revoked user's full budget. Owner needs an "archive instead of delete" option (see §3.4).

---

## 3. Whitelist: model + bot commands + UX

### 3.1 Model

**Recommendation: extend `app_user` with `role`, do not introduce a separate `whitelist_entry` table.**

A separate table makes sense in classic SaaS where invites have an existence before the user signs up (you invite by email; user clicks link; account is created on click). In Telegram-land you invite by `tg_user_id` — that ID either belongs to a real Telegram account or it doesn't, and we cannot verify membership pre-app-launch. So the lifecycle simplifies:

```
[invite owner action] -> create app_user(tg_user_id, role='member', invited_by=owner.id)
                                                     ^
                                                     |
[user opens Mini App for first time] -> tg_user_id matches existing row
                                       -> proceed to onboarding (set chat_id, balance, etc.)
                                       -> set onboarded_at
[owner revokes] -> set role='revoked', revoked_at=now()
                -> next API call returns 403; user sees "access revoked" screen
```

`role` enum: `owner | member | revoked`. Hard-delete the user on revoke is a separate decision — see §3.4.

### 3.2 Bot commands (owner-only, gated by `role='owner'`)

| Command | Behavior |
|---------|----------|
| `/invite <tg_user_id>` | Insert `app_user(tg_user_id, role='member', invited_by=<owner.id>)`. If row exists with `role='revoked'`, flip to `'member'` and clear `revoked_at`. Reply with deep-link to the Mini App so owner can forward it. |
| `/revoke <tg_user_id>` | Set `role='revoked'`, `revoked_at=now()`. Audit-log the action. Optionally send the revoked user a message via stored `tg_chat_id`. |
| `/list_users` | Render table: `tg_user_id, role, invited_at, last_seen_at, tx_count`. |
| `/promote <tg_user_id>` | Edge case: transfer ownership (rare; document but maybe defer). |

Bot command parsing uses `tg_user_id` (numeric) only — usernames are mutable in Telegram and unsafe for whitelist identity.

### 3.3 First-launch UX for new whitelisted user

1. Owner runs `/invite 12345678`. Row created.
2. Owner DMs the invitee a deep link to the Mini App (or the user already has it).
3. Invitee opens app → `validate_init_data()` succeeds → `get_current_app_user()` finds the row, sees `role='member'`, `onboarded_at IS NULL` → returns `needs_onboarding=true` flag.
4. Frontend renders the existing onboarding scrollable page (sketch 006-B): bot bind, starting balance, cycle_start_day, seed categories. Crucially, **categories are seeded per-user** during this step — the 14 default categories are duplicated for the new user with `user_id` set to their id.

### 3.4 Revoke semantics — soft revoke (recommended)

| Option | Behavior | Recommended? |
|--------|----------|--------------|
| Soft revoke (`role='revoked'`, data kept) | User cannot access. Owner can re-invite (flip role back). Data preserved for audit/restore. | ✅ Yes — default action |
| Hard delete (CASCADE) | All transactions, periods, subscriptions, embeddings deleted irreversibly. | Only on explicit `/purge_user <id>` second command, after revoke confirmation. |

This two-step design (revoke first, optionally purge later) prevents accidents and gives a window for "oops, undo".

### 3.5 Edge cases

- **Two users with same `tg_user_id`**: Telegram guarantees uniqueness of `tg_user_id` globally, so the database `unique(tg_user_id)` index is sufficient. No defense beyond that needed.
- **Re-invite of revoked user**: Idempotent — flip `role` back to `member`, clear `revoked_at`, leave data intact. Audit-log the re-invite.
- **Owner self-revoke**: `/revoke <owner.tg_user_id>` must be rejected ("cannot revoke owner; use /transfer_ownership first").

---

## 4. Audit Log

### 4.1 Why Postgres triggers, not application-level

| Approach | Pros | Cons |
|----------|------|------|
| AFTER trigger → audit_log | Catches ALL writes including raw SQL, manual fixes, scheduler updates. Cannot be bypassed. Captures actual final values (including DB-side defaults, computed columns, server timestamps). | Setting `actor_user_id` requires session variable bridge. |
| Application-level (SQLAlchemy event hooks) | Easy access to request context (actor, request_id, user_agent). | Bypassed by raw SQL, by Alembic migrations, by manual scheduler fixes. Drift risk. |
| Temporal tables / pgmemento | Comprehensive history, point-in-time queries. | Extra extension to install/maintain on a small VPS. Heavier than needed for 500-5000 events/day. |
| pgaudit | Logs to PG log file, system-level. | Wrong tool — emits text logs, not queryable JSONB. Designed for compliance, not business audit. |

[CITED: vladmihalcea.com/postgresql-audit-logging-triggers/]
[CITED: github.com/m-martinez/pg-audit-json]

**Recommendation**: AFTER row-level triggers writing to a partitioned `audit_log` table, with `actor_user_id` plumbed from the same `app.current_user_id` session variable used for RLS. Application-level hooks supplement triggers ONLY for non-DB events (e.g., login attempts, bot command audit).

### 4.2 Schema

```sql
-- Parent partitioned table
CREATE TABLE audit_log (
    id           BIGSERIAL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id BIGINT,            -- the user whose request caused this; NULL for scheduler/admin
    actor_kind   TEXT NOT NULL,      -- 'user' | 'scheduler' | 'admin' | 'bot_owner_cmd'
    target_user_id BIGINT,           -- the user whose data was affected
    table_name   TEXT NOT NULL,
    operation    TEXT NOT NULL,      -- 'INSERT' | 'UPDATE' | 'DELETE'
    row_pk       BIGINT,             -- primary key of affected row
    old_values   JSONB,              -- NULL on INSERT
    new_values   JSONB,              -- NULL on DELETE
    changed_keys TEXT[],             -- only on UPDATE: keys where old != new
    request_id   TEXT,               -- correlation id (set via app.request_id)
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX ix_audit_target_user ON audit_log (target_user_id, occurred_at DESC);
CREATE INDEX ix_audit_table_op ON audit_log (table_name, operation, occurred_at DESC);

-- Monthly partitions, created by a worker job (auto_create_audit_partition) on day 25
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

[CITED: elephas.io/audit-logging-with-postgres-partitioning/]

### 4.3 Trigger function

```sql
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS TRIGGER AS $$
DECLARE
    old_jsonb JSONB := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
    new_jsonb JSONB := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
    pk        BIGINT := COALESCE((NEW).id, (OLD).id);
    target_uid BIGINT := COALESCE((NEW).user_id, (OLD).user_id);
    diff_keys TEXT[];
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(key) INTO diff_keys
        FROM jsonb_each(new_jsonb)
        WHERE old_jsonb -> key IS DISTINCT FROM new_jsonb -> key;
        IF diff_keys IS NULL OR array_length(diff_keys, 1) = 0 THEN
            RETURN NEW;  -- no-op update; skip audit
        END IF;
    END IF;

    INSERT INTO audit_log (
        actor_user_id, actor_kind, target_user_id, table_name, operation,
        row_pk, old_values, new_values, changed_keys, request_id
    ) VALUES (
        NULLIF(current_setting('app.current_user_id', true), '')::bigint,
        COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'user'),
        target_uid,
        TG_TABLE_NAME,
        TG_OP,
        pk,
        old_jsonb,
        new_jsonb,
        diff_keys,
        NULLIF(current_setting('app.request_id', true), '')
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to each tenant table
CREATE TRIGGER audit_actual_transaction
AFTER INSERT OR UPDATE OR DELETE ON actual_transaction
FOR EACH ROW EXECUTE FUNCTION audit_row_change();
-- Repeat for: category, budget_period, planned_transaction, subscription, plan_template_item, app_user
```

The function reads three session vars: `app.current_user_id`, `app.actor_kind`, `app.request_id`. The FastAPI dep already sets the first; add the other two:

```python
await db.execute(text("SET LOCAL app.actor_kind = 'user'"))
await db.execute(text("SET LOCAL app.request_id = :rid").bindparams(rid=request.headers.get('x-request-id', '')))
```

For scheduler jobs, set `app.actor_kind = 'scheduler'` and leave `current_user_id` to the iterated user.

### 4.4 What to log

- **Mutations only** (INSERT / UPDATE / DELETE). Read auditing is not required for this product and would inflate the log 100x for no security/compliance benefit.
- **All tenant tables** including `app_user` (so role flips are auditable).
- **Skip** `app_health` (heartbeat noise).
- **Application-level audit (additional)** for events not visible to triggers:
  - Successful Telegram initData validation
  - Failed initData (403) attempts — useful to detect probing
  - Bot owner commands `/invite`, `/revoke`
  - These go into the same `audit_log` table with `table_name='_event'` and a synthetic operation like `'auth.login'`.

### 4.5 Retention + UI

- **Retention**: 12 months. Worker job on day 1 of each month drops partitions older than 12 months (`DROP TABLE audit_log_YYYY_MM`). Optionally `pg_dump` them first into the nightly backup before drop.
- **UI**: For 5-50 users, a dedicated admin Mini App screen is overkill. Provide a single owner-only `/audit <tg_user_id> [--since=2026-04-01]` bot command that returns the last 50 events as a paginated text message. Power user case (full SQL access) is the owner via psql. Defer a real admin UI to v0.4 if it ever becomes painful.

### 4.6 ClickHouse comparison — confirmed overkill

| Metric | Your scale | ClickHouse break-even |
|--------|-----------|----------------------|
| Events/day | 500-5000 | ~1M+ events/day |
| Insert rate sustained | <1/sec peak | PG handles 50k-100k inserts/sec batched |
| Storage at 12mo retention | ~1.8M rows × ~2KB = ~3.6 GB | Designed for TB-scale |
| Operational tax | 1 PG instance you already run | + ZooKeeper/Keeper, sharding, separate ETL |

[CITED: dev.to/polliog/why-i-chose-postgres-timescaledb-over-clickhouse-for-storing-10m-logs-1e18]
[CITED: tinybird.co/blog/clickhouse-vs-postgresql-with-extensions]

**Verdict**: ClickHouse is the right answer at ≥1M events/day. You are 200× below that. PostgreSQL with monthly partitions and JSONB diff is correct.

---

## 5. pgvector + multi-tenancy

### 5.1 Schema

Separate the embeddings from the source table — embeddings churn with model upgrades, transactions don't.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE transaction_embedding (
    id              BIGSERIAL PRIMARY KEY,
    actual_transaction_id BIGINT NOT NULL REFERENCES actual_transaction(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,  -- denormalized
    embedding       vector(1536) NOT NULL,  -- adjust dim to your model (1536 = OpenAI text-embedding-3-small)
    model_version   TEXT NOT NULL DEFAULT 'text-embedding-3-small@v1',
    text_snapshot   TEXT NOT NULL,  -- "<description> | <category> | <amount>" — what was embedded
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (actual_transaction_id, model_version)
);

CREATE INDEX ix_txemb_user_id ON transaction_embedding (user_id);

-- Single global HNSW with cosine distance; user_id filter applied as prefilter
CREATE INDEX ix_txemb_hnsw ON transaction_embedding
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- RLS belt-and-suspenders
ALTER TABLE transaction_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON transaction_embedding
    USING (user_id = current_setting('app.current_user_id', true)::bigint);
```

### 5.2 Why denormalize `user_id` into the embedding table

The AI chat will hit queries like:
```sql
SELECT t.*, te.embedding <=> :query_vec AS distance
FROM transaction_embedding te
JOIN actual_transaction t ON t.id = te.actual_transaction_id
WHERE te.user_id = :uid
ORDER BY te.embedding <=> :query_vec
LIMIT 20;
```

Having `user_id` on `transaction_embedding` means PostgreSQL can prefilter via index BEFORE the HNSW search, dramatically narrowing the candidate set. Without it, you'd have to JOIN first then filter, which fights the planner. [CITED: thenile.dev/blog/multi-tenant-rag]

### 5.3 Index choice — single HNSW, not partial-per-tenant

| Strategy | When it wins | Verdict for us |
|----------|--------------|----------------|
| Single global HNSW + `user_id` filter | Even-ish tenant sizes, low N | ✅ This is us |
| Partial HNSW per tenant (`WHERE user_id = X`) | One whale tenant dominates | ❌ N=50 partial indexes = 50× planner cost, RAM bloat |
| Hash partitioning on user_id + per-partition HNSW | High N (1000s), multi-shard | ❌ Massive overkill |

[CITED: medium.com/@Modexa/10-pgvector-index-patterns-for-rag-2-0-in-postgres-17]
[CITED: crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector]

**HNSW vs IVFFlat**: HNSW for our scale. IVFFlat needs ~10k vectors/list to be efficient, and at 50 users × ~2k transactions/year = ~100k vectors total over years, HNSW is the better default. HNSW also doesn't need rebuild after bulk inserts. [CITED: dev.to/philip_mcclarence_2ef9475/ivfflat-vs-hnsw-in-pgvector-which-index-should-you-use]

**Parameters**: `m=16, ef_construction=64` — pgvector defaults, fine for our scale. Tune `ef_search` (query-time, default 40) up to 100 for higher recall at slight latency cost.

### 5.4 Embedding update strategy — application-level queue

| Strategy | Pros | Cons | Recommended? |
|----------|------|------|--------------|
| Synchronous trigger calling embedding API | Always consistent | Trigger blocks the txn while waiting on OpenAI; INSERT latency = OpenAI latency | ❌ |
| Trigger-enqueues-work-row → worker processes async | Decoupled, retryable | Adds queue table + worker job | ✅ |
| Application-level on insert (in same FastAPI handler) | Simple | Blocks the API response on OpenAI; bot-command insert path also has to embed | Acceptable as v1 |
| Vectorizer extension (Tiger / Supabase) | Auto-managed | External dependency; we run our own VPS | ❌ for now |

[CITED: dbi-services.com/blog/rag-series-embedding-versioning-with-pgvector]
[CITED: tigerdata.com/blog/how-to-automatically-create-update-embeddings-in-postgresql]

**Recommendation**: Start with a `embedding_job` queue table populated by an AFTER INSERT/UPDATE trigger on `actual_transaction`. The existing APScheduler worker runs a new job every 30s that drains this queue (batch up to 100, call embedding API in batch, insert results, mark jobs done). On embedding API failure, the row stays in the queue — retried next tick. This piggybacks on infrastructure you already have.

```sql
CREATE TABLE embedding_job (
    id BIGSERIAL PRIMARY KEY,
    actual_transaction_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE OR REPLACE FUNCTION enqueue_embedding_job() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO embedding_job (actual_transaction_id, user_id)
    VALUES (NEW.id, NEW.user_id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enqueue_emb_on_tx
AFTER INSERT OR UPDATE OF description, amount_cents, category_id ON actual_transaction
FOR EACH ROW EXECUTE FUNCTION enqueue_embedding_job();
```

### 5.5 Cross-tenant leak surface for AI chat

The most dangerous moment is the LLM call itself. The retrieved transaction rows go into the prompt as "user has these transactions: ...". If retrieval is buggy, the LLM happily summarizes another user's spending. Defenses:

1. RLS on `transaction_embedding` (above) — leak-proof at storage layer.
2. App-layer assertion in the AI service: `assert all(t.user_id == current_user_id for t in retrieved)` before prompt construction.
3. Audit log every AI query: `actor_kind='ai_chat'`, log the retrieved row IDs in a JSONB field.

---

## 6. Soft delete: stay with hard delete

### Recommendation: keep hard delete for transactions and subscriptions.

**Reasoning**:
1. The audit log captures the full state in `old_values JSONB` at the moment of delete. Restore = INSERT from `audit_log.old_values`. The trail exists.
2. Adding `deleted_at` introduces a "two-state truth" problem: every query, every aggregation, every dashboard, every bot command must remember to filter `WHERE deleted_at IS NULL`. The risk of forgetting on one screen exactly mirrors the multi-tenancy `WHERE user_id` problem — and we don't want two such problems.
3. Soft delete is valuable when:
   - Users frequently want "undo delete" UI within the app — not the case for a budget tracker; deletion is intentional.
   - There are referential dependencies that break on hard delete — not the case (we use FK CASCADE meaningfully).
   - Compliance requires retention beyond the audit log — not applicable.
4. Categories KEEP `is_archived` (already designed) — that's not deletion, it's hiding from dropdowns while preserving historical category names on past transactions. Different concern, correctly handled.

**Edge case**: undelete via audit log. Provide a `/recent_deletes` owner bot command that lists last 24h of `operation='DELETE'` rows. Re-insertion from JSONB is a one-shot manual operation, acceptable at this scale.

---

## 7. Open Questions and Risks

### Open questions

1. **Are categories per-user or shared?** Strongly leaning per-user for isolation simplicity. If shared, then revoking a user is harder (their transactions still reference shared category IDs). Confirm.
2. **Does the AI chat have access to the audit log?** Could be a feature ("when did I change my food budget?") but raises permission complexity. Defer to AI stream.
3. **Embedding model dimension (`vector(1536)` vs `vector(384)`)** depends on chosen model. Schema is otherwise model-agnostic via `model_version` column allowing parallel versions during model migration.
4. **Should `app_user.tg_chat_id` migration matter?** The existing column stays — but for new whitelisted users it's NULL until `/start`. `ONB-02` already handles this in current spec.
5. **Owner self-protection on `/revoke`**: explicit logic to prevent revoking the only owner.

### Risks

1. **RLS misconfiguration** silently allowing cross-tenant reads. **Mitigation**: integration test that connects as a non-superuser role and verifies `SELECT * FROM actual_transaction` returns 0 rows when `app.current_user_id` is unset.
2. **Forgotten `SET LOCAL` in worker code** → either RLS blocks all rows (worker breaks) or worker uses BYPASSRLS role and silently leaks. **Mitigation**: explicit code review checklist; log a warning if `app.current_user_id` is unset on a tenant-table query in dev mode.
3. **Audit log unbounded growth** if partition-drop job fails silently. **Mitigation**: alert on `audit_log` total size > 10 GB.
4. **Embedding job queue stuck** if OpenAI is down — chat features degrade silently. **Mitigation**: surface job-queue lag in `/health` endpoint; dashboard warn at >100 stuck jobs.
5. **Bot `/invite <id>` typo** invites a stranger. **Mitigation**: confirm step in bot ("Invite tg_user_id 12345678? Send /confirm_invite to proceed") with a 60s window.
6. **Migration race** if a second user is created before composite unique constraints land in 0006. **Mitigation**: `/invite` command checks `alembic current` is at >= 0006 before accepting.
7. **`ON DELETE CASCADE` from `app_user` on revoke** could silently destroy data if revoke = hard delete. **Mitigation**: revoke is soft (role flip); only explicit `/purge_user` triggers cascade, with confirmation.

---

## Sources

### Primary (HIGH confidence)
- [PostgreSQL 18: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — RLS semantics, BYPASSRLS, FORCE ROW LEVEL SECURITY
- [pgvector GitHub README](https://github.com/pgvector/pgvector) — HNSW/IVFFlat parameters, vector ops
- [AWS Database Blog — Multi-tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) — official AWS pattern reference

### Secondary (MEDIUM confidence)
- [PlanetScale — Approaches to Tenancy in Postgres](https://planetscale.com/blog/approaches-to-tenancy-in-postgres) — comparative analysis
- [Crunchy Data — Row Level Security for Tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) — vendor pattern
- [Crunchy Data — HNSW Indexes with Postgres and pgvector](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector) — index sizing
- [Nile — Multi-tenant RAG](https://www.thenile.dev/blog/multi-tenant-rag) — pgvector + tenancy patterns
- [Vlad Mihalcea — PostgreSQL Audit Logging Triggers](https://vladmihalcea.com/postgresql-audit-logging-triggers/) — trigger pattern
- [Elephas — Audit Logging with Postgres Partitioning](https://elephas.io/audit-logging-with-postgres-partitioning/) — monthly partition design
- [Elephas — Audit Logging using JSONB](https://elephas.io/audit-logging-using-jsonb-in-postgres/) — JSONB diff approach
- [DEV — 37 Alembic Migrations Zero Downtime SaaS](https://dev.to/grommash9/37-alembic-migrations-zero-downtime-how-we-moved-a-live-saas-from-single-tenant-to-multi-tenant-4i6n) — single→multi migration playbook
- [Permit.io — Postgres RLS Implementation Guide](https://www.permit.io/blog/postgres-rls-implementation-guide) — performance numbers
- [dobken.nl — Row-Level Security with SQLAlchemy](https://dobken.nl/posts/rls-postgres/) — async SQLAlchemy pattern
- [adityamattos.com — FastAPI + Postgres + SQLAlchemy RLS Multitenancy](https://adityamattos.com/multi-tenancy-in-python-fastapi-and-sqlalchemy-using-postgres-row-level-security) — concrete FastAPI integration
- [DEV — Why I chose Postgres over ClickHouse for 10M logs](https://dev.to/polliog/why-i-chose-postgres-timescaledb-over-clickhouse-for-storing-10m-logs-1e18) — PG vs CH break-even
- [dbi-services — Embedding Versioning with pgvector](https://www.dbi-services.com/blog/rag-series-embedding-versioning-with-pgvector-why-event-driven-architecture-is-a-precondition-to-ai-data-workflows/) — queue pattern
- [Tiger Data — Automatic embeddings in PostgreSQL](https://www.tigerdata.com/blog/how-to-automatically-create-update-embeddings-in-postgresql) — async embedding architecture
- [Modexa — 10 pgvector Index Patterns](https://medium.com/@Modexa/10-pgvector-index-patterns-for-rag-2-0-in-postgres-17-148feaf639a4) — partial index criteria
- [DEV — IVFFlat vs HNSW in pgvector](https://dev.to/philip_mcclarence_2ef9475/ivfflat-vs-hnsw-in-pgvector-which-index-should-you-use-305p) — index selection
- [github.com/m-martinez/pg-audit-json](https://github.com/m-martinez/pg-audit-json) — reference trigger implementation

### Tertiary (LOW confidence — for awareness, not normative)
- [Logto — Multi-tenancy implementation with PostgreSQL](https://blog.logto.io/implement-multi-tenancy)
- [simplyblock — Postgres Multi-Tenancy with RLS](https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/)

---

## Metadata

**Confidence breakdown:**
- Multi-tenancy strategy: HIGH — pattern is well-documented, multiple authoritative sources agree
- Migration plan: HIGH — Alembic mechanics standard, single-user backfill is trivial
- Whitelist model: HIGH — straightforward extension of existing `app_user`
- Audit log design: HIGH — partitioning + JSONB triggers are standard 2025 pattern
- ClickHouse rejection: HIGH — scale numbers are 200-2000× below break-even
- pgvector strategy: MEDIUM — depends on AI feature spec not yet finalized; index choices revisitable
- Soft delete decision: MEDIUM — defensible but a judgment call; could revisit if undelete becomes a frequent need

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days; pgvector ecosystem moves quickly, RLS/audit patterns are stable)
