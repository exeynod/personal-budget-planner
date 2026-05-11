# Multi-tenant Production Runbook

**Phase**: 32 (Multi-tenant Production Enablement)
**Requirement**: REQ-32-05
**RTO target**: 30 минут
**Owner**: project owner (single-tenant deploy initially; multi-tenant
enabled per PROJECT-STRATEGY v1.1 transition).

## TL;DR — типичный production deploy

```bash
# 1. Backup
docker compose exec -T db pg_dump -U budget budget_db | gzip > /backups/$(date +%Y%m%d-%H%M%S)-pre-phase32.sql.gz

# 2. Upgrade application
git pull origin v1.0-maximal-poster   # или соответствующая v1.1 branch
docker compose pull api bot worker
docker compose up -d api bot worker --build

# 3. Run migrations
docker compose exec api alembic upgrade head
# Expected: ... -> 0019_owner_backfill (head)

# 4. Verify
docker compose exec api pytest tests/test_rls_audit.py tests/test_multitenancy_live.py -v
# Expected: all green

# 5. Smoke
curl https://<domain>/api/v1/health   # → {"ok": true, "db": "ok"}
```

## Pre-migration checklist

- [ ] `docker compose exec -T db pg_dump ...` backup created.
- [ ] `du -sh /backups/*.sql.gz` shows backup size > 0.
- [ ] Read-replica or external backup pushed offsite (recommended; not strictly required for single-VPS pet).
- [ ] Phase 32 PRs merged + tests green in CI (`pytest tests/` exit 0).
- [ ] Maintenance-window scheduled (15 min target; user-facing 503 acceptable per PROJECT.md downtime policy).

## Alembic upgrade procedure

```bash
docker compose exec api alembic current
# → 0017_v10_account_id_composite_fk (или последняя pre-32 head).

docker compose exec api alembic upgrade head
# → applies 0018_cap_500, 0019_owner_backfill.
# Logs: ALTER TABLE app_user, UPDATE app_user, RAISE NOTICE.

docker compose exec api alembic current
# → 0019_owner_backfill (head).
```

Expected logs (RAISE NOTICE если OWNER_TG_ID не set; otherwise silent):
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Running upgrade 0017... -> 0018_cap_500, ...
NOTICE: 0019_owner_backfill: OWNER_TG_ID not set, skipping owner-role backfill
```

## Alembic downgrade (rollback)

Сценарий: migration 0019 / 0018 неожиданно сломала что-то — needs rollback.

```bash
docker compose exec api alembic downgrade -1
# → 0018_cap_500 (rollback of 0019 — no-op per migration design).

docker compose exec api alembic downgrade -1
# → 0017_v10_account_id_composite_fk (rollback of 0018 — SET DEFAULT 100;
#   existing 500-rows NOT reverted, schema-only).
```

**Note**: downgrades НЕ удаляют data (RLS, role enum остаются в DB
structure после v0.4). Чтобы откатить v0.4 multi-tenant — нужно
`alembic downgrade 0005_enable_ai_categorization` что НЕ recommended
в production (потеря history; cascading FK changes).

## Disaster recovery (pg_dump / pg_restore)

Сценарий: миграция сломалась невозвратимо, требуется restore из backup.

```bash
# 1. Stop application (api / bot / worker), оставить только db.
docker compose stop api bot worker

# 2. Drop & re-create database.
docker compose exec db psql -U postgres -c "DROP DATABASE IF EXISTS budget_db"
docker compose exec db psql -U postgres -c "CREATE DATABASE budget_db OWNER budget"

# 3. Restore from backup.
gunzip -c /backups/<timestamp>-pre-phase32.sql.gz | \
  docker compose exec -T db psql -U budget budget_db

# 4. Verify schema head matches backup era.
docker compose exec db psql -U budget budget_db -c \
  "SELECT version_num FROM alembic_version"

# 5. Re-start api/bot/worker.
docker compose up -d api bot worker
```

**RTO**: 10-20 min для pet-scale backups (< 1 GB compressed).
**RPO**: depends on backup frequency — recommend `cron` ежедневно + перед
каждым deploy (per checklist выше).

## Monitoring queries

После cutover periodically run:

```sql
-- RLS sanity: are all 12 tenant tables still RLS-enabled?
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'category', 'budget_period', 'planned_transaction',
  'actual_transaction', 'subscription', 'category_embedding',
  'ai_conversation', 'ai_message', 'ai_usage_log',
  'account', 'goal', 'savings_config'
)
ORDER BY relname;
-- Expected: every row → t, t
```

```sql
-- AI cap distribution: are new users picking up default 500?
SELECT spending_cap_cents, COUNT(*)
FROM app_user
GROUP BY spending_cap_cents
ORDER BY spending_cap_cents;
-- Expected: majority в 500-bucket (post-Phase 32); 100-bucket = 0
-- (либо легасийные customised users).
```

```sql
-- Cross-tenant leak detector: any row с user_id, не существующим в app_user?
SELECT 'category' AS table, COUNT(*) FROM category c
  WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = c.user_id)
UNION ALL SELECT 'actual_transaction', COUNT(*) FROM actual_transaction a
  WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = a.user_id);
-- Expected: every COUNT = 0.
```

## Alert triage

| Symptom | Likely cause | First check |
|---------|--------------|-------------|
| 5xx burst после deploy | migration failed mid-way | `alembic current`; `docker compose logs api` |
| Users seeing "Not authorized" (403) | RLS GUC missing OR role flipped | `set_tenant_scope` invocation; `SELECT role FROM app_user WHERE tg_user_id=$X` |
| AI 429 storm | cap-default не bumped | `SELECT column_default FROM information_schema.columns WHERE column_name='spending_cap_cents'` → expect `500` |
| Cross-tenant rows visible (impossible) | RLS disabled OR table missing FORCE | `SELECT relforcerowsecurity FROM pg_class WHERE relname='X'` |

## Known issues / FAQ

- **«alembic upgrade head» failed на 0006_multitenancy** — это v0.4
  migration (uplifted Phase 11). Should NEVER fail on a fresh DB. Если
  возникло — likely orphan rows. Manual triage: see `.planning/milestones/v0.4-phases/11-multi-tenancy-db-migration/11-VERIFICATION.md`.
- **OWNER_TG_ID не работает после deploy** — 0019_owner_backfill — safety-net.
  Если OWNER_TG_ID env set + user existed pre-deploy + role=member → after
  `alembic upgrade head` user.role = 'owner'. Если NOT working: 
  manual `UPDATE app_user SET role='owner' WHERE tg_user_id=$OWNER_TG_ID`.
