"""postgres role split: create budget_app NOSUPERUSER NOBYPASSRLS

Revision ID: 0007_postgres_role_split
Revises: 0006_multitenancy
Create Date: 2026-05-07

Phase 12 D-11-07-02: split single Postgres role into two roles.

Background: until this migration, runtime processes (api/bot/worker)
connected as `budget` which is SUPERUSER (created by Postgres entrypoint
via POSTGRES_USER). PostgreSQL bypasses RLS for superusers, so all the
Phase 11 RLS policies (alembic 0006) did not actually enforce at runtime
— only in tests via SET LOCAL ROLE budget_rls_test workaround.

What this revision does:
  1. Idempotently CREATE ROLE budget_app NOLOGIN NOSUPERUSER NOBYPASSRLS
     (DO-block).
  2. ALTER ROLE budget_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :pwd
     (read from BUDGET_APP_PASSWORD env; fail loud if missing/placeholder).
  3. GRANT USAGE ON SCHEMA public + SELECT/INSERT/UPDATE/DELETE
     on ALL TABLES + USAGE/SELECT on ALL SEQUENCES.
  4. ALTER DEFAULT PRIVILEGES so future tables created by `budget`
     (e.g. via subsequent alembic revisions) auto-grant to budget_app.

Operational notes:
  - This migration must run as the privileged role (DATABASE_URL pointing
    at `budget`). entrypoint.sh sets ADMIN_DATABASE_URL accordingly.
  - After upgrade, runtime DATABASE_URL (used by api/bot/worker) must
    switch to `budget_app:$BUDGET_APP_PASSWORD@...`. docker-compose
    provides both URLs to each service env (Plan 12-05 docker changes).
  - BUDGET_APP_PASSWORD env var must be set; missing → RuntimeError.
    Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
  - Security note: ALTER ROLE ... PASSWORD cannot use bind parameters in
    PostgreSQL DDL — password is embedded as a single-quoted literal after
    manual escaping (double single-quotes). Alembic logs DDL statements;
    in production operators should not share alembic output publicly.

downgrade:
  Drops the role + owned objects. Existing data tables remain (owned by
  `budget`), only privileges are revoked.
"""
from __future__ import annotations

import os
from typing import Sequence, Union

from alembic import op


revision: str = "0007_postgres_role_split"
down_revision: Union[str, None] = "0006_multitenancy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PLACEHOLDER_PREFIXES = ("change_me", "changeme", "")


def _resolve_app_password() -> str:
    """Read BUDGET_APP_PASSWORD env var; fail loud if missing or placeholder."""
    pwd = os.environ.get("BUDGET_APP_PASSWORD", "")
    if not pwd or any(pwd.startswith(p) for p in _PLACEHOLDER_PREFIXES if p):
        raise RuntimeError(
            "0007_postgres_role_split: BUDGET_APP_PASSWORD env var must be set "
            "to a real (non-placeholder) value. Generate with: "
            'python -c "import secrets; print(secrets.token_urlsafe(32))"'
        )
    return pwd


def _escape_pg_string_literal(s: str) -> str:
    """Escape value as single-quoted Postgres string literal.

    Postgres standard escape: double single quotes inside the literal.
    This is sufficient for ALTER ROLE PASSWORD which does not interpret
    backslash escapes (no E'' prefix needed).

    Security note: this is the standard Postgres method for embedding
    password literals in DDL where bind parameters are not supported by
    the DDL parser (ALTER ROLE syntax restriction).
    """
    return "'" + s.replace("'", "''") + "'"


def upgrade() -> None:
    password = _resolve_app_password()
    password_lit = _escape_pg_string_literal(password)

    # Step 1: idempotent CREATE ROLE budget_app NOLOGIN.
    # NOLOGIN first — switch to LOGIN after password set
    # so role is never left loginable without a password in the window
    # between two statements (T-12-05-05 mitigation).
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_app') "
        "THEN CREATE ROLE budget_app NOLOGIN NOSUPERUSER NOBYPASSRLS; "
        "END IF; "
        "END $$;"
    )

    # Step 2: set password + enable LOGIN.
    # ALTER ROLE password does not accept bind params (PostgreSQL DDL restriction).
    # Password is embedded as single-quoted literal after manual escaping.
    # T-12-05-04 mitigation: explicitly set NOSUPERUSER NOBYPASSRLS on ALTER
    # to ensure attributes even if role existed before with different attrs.
    op.execute(
        f"ALTER ROLE budget_app WITH LOGIN NOSUPERUSER NOBYPASSRLS "
        f"PASSWORD {password_lit}"
    )

    # Step 3: GRANTs on existing objects.
    # T-12-05-04 mitigation: only SELECT/INSERT/UPDATE/DELETE — no CREATE/DROP/ALTER.
    op.execute("GRANT USAGE ON SCHEMA public TO budget_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public "
        "TO budget_app"
    )
    op.execute(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO budget_app"
    )

    # Step 4: default privileges for future tables (created by current_user
    # which is the privileged role running this migration under ADMIN_DATABASE_URL).
    # T-12-05-07 mitigation: migration runs as `budget` (current_user via
    # ADMIN_DATABASE_URL); future tables created by budget will auto-grant to budget_app.
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO budget_app"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT USAGE, SELECT ON SEQUENCES TO budget_app"
    )

    # Step 5: pgvector extension (Phase 10) needs USAGE for budget_app
    # to use vector ops. EXTENSION objects use schema-level permissions —
    # already granted via USAGE ON SCHEMA. No-op here, documented for clarity.


def downgrade() -> None:
    # Reverse default privileges (best-effort — ALTER DEFAULT PRIVILEGES
    # REVOKE does not raise error if role has no default privs).
    try:
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM budget_app"
        )
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            "REVOKE USAGE, SELECT ON SEQUENCES FROM budget_app"
        )
    except Exception:
        # Role may already be dropped — that's fine for downgrade idempotency.
        pass

    # DROP OWNED BY revokes all privileges granted to the role.
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_app') "
        "THEN DROP OWNED BY budget_app; "
        "END IF; "
        "END $$;"
    )
    # Then DROP ROLE itself.
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_app') "
        "THEN DROP ROLE budget_app; "
        "END IF; "
        "END $$;"
    )
