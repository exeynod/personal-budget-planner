#!/usr/bin/env bash
# Autogen-drift inspector (Этап 2 WI-4): models ↔ migration-head comparison.
#
# `alembic check` (alembic>=1.9) runs the autogenerate comparison against a DB
# already at head and EXITS 1 when target_metadata (Base.metadata) differs from
# the reflected schema. This wrapper forces the privileged admin URL (so the
# reflection is not filtered by RLS / missing GRANTs) and classifies the result.
#
# IMPORTANT (Этап 2 finding): this codebase carries intentional, by-design
# model↔schema divergences that `alembic check` ALWAYS reports as drift, so this
# is NOT wired into verify-all / ci-local as a blocking gate. It is an
# INFORMATIONAL tool (`make migrations-check`) for inspecting drift while
# authoring a migration. The known, intentional divergences are:
#   * Composite FKs declared at DB-level only (SQLAlchemy cannot declare a
#     composite FK to a non-PK target cleanly) — fk_*_composite on
#     actual_transaction / category / subscription.
#   * `analytics_event` — raw-SQL managed table (no ORM model by design).
#   * Several perf `ix_*` indexes (e.g. alembic 0027) not mirrored in ORM
#     __table_args__.
# A proper "model↔schema reconciliation" to make this green is a separate
# (Этап 3) effort — see docs/RUNBOOK.md "Миграции: autogen-drift".
#
# This script must run where alembic + the DB are reachable (inside the api
# container). `make migrations-check` pipes it in via stdin.
#
# Exit codes:
#   0  no drift
#   1  drift detected (informational)
#   2  internal error (alembic missing / DB unreachable)

set -uo pipefail

ALEMBIC="${ALEMBIC_BIN:-}"
if [ -z "$ALEMBIC" ]; then
  if [ -x /app/.venv/bin/alembic ]; then
    ALEMBIC=/app/.venv/bin/alembic
  elif command -v alembic >/dev/null 2>&1; then
    ALEMBIC=alembic
  else
    echo "check-migrations-autogen: alembic not found" >&2
    exit 2
  fi
fi

# Force the admin URL so reflection sees all tables regardless of RLS.
export DATABASE_URL="${ADMIN_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "check-migrations-autogen: no ADMIN_DATABASE_URL/DATABASE_URL set" >&2
  exit 2
fi

echo "=== alembic check (models ↔ head autogen drift) ==="
out=$("$ALEMBIC" check 2>&1)
rc=$?
printf '%s\n' "$out"

if [ "$rc" -eq 0 ]; then
  echo "OK: no autogen drift between models and migration head."
  exit 0
fi

if printf '%s' "$out" | grep -qi "New upgrade operations detected"; then
  echo "DRIFT detected (see ops above) — informational, not a blocking gate." >&2
  exit 1
fi

echo "check-migrations-autogen: alembic check failed for a non-drift reason (exit $rc)" >&2
exit 2
