"""Negative-control for the autogen-drift inspector (Этап 2 WI-4).

Proves the drift detector can actually go RED: plants a phantom Table in
``Base.metadata`` that does NOT exist in the live DB and asserts that
``alembic.autogenerate.compare_metadata`` proposes an ``add_table`` op for it.

Run inside the api container (alembic + DB reachable). ``make
migrations-check-selftest`` pipes this in via stdin:

    make migrations-check-selftest

Exit codes:
    0  phantom table detected by autogenerate (gate proven red-capable)
    1  phantom table NOT detected, OR baseline alembic check hit an internal
       error (DB/alembic broken)
"""

from __future__ import annotations

import os
import sys

# The api image lays the alembic migration env at /app/alembic, which shadows
# the installed ``alembic`` library whenever /app is on sys.path (it is, so that
# ``app.db`` imports). Promote the venv site-packages ahead of /app *only* for
# the alembic import below, so ``from alembic import autogenerate`` resolves to
# the library, not the migration directory.
import sysconfig

_site = sysconfig.get_paths().get("purelib")
if _site and _site in sys.path:
    sys.path.remove(_site)
if _site:
    sys.path.insert(0, _site)

import asyncio

from sqlalchemy import BigInteger, Column, Table
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import autogenerate
from alembic.runtime.migration import MigrationContext

from app.db.base import Base
import app.db.models  # noqa: F401 — registers all models with Base.metadata


def _compare(sync_conn) -> list:
    mc = MigrationContext.configure(
        sync_conn,
        opts={"target_metadata": Base.metadata, "compare_type": True},
    )
    return autogenerate.compare_metadata(mc, Base.metadata)


async def _run() -> int:
    # The project ships only the asyncpg driver (no psycopg) — use the async
    # engine and run the autogenerate comparison via run_sync (same pattern as
    # alembic/env.py).
    url = os.environ.get("ADMIN_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        print("FAIL: no ADMIN_DATABASE_URL/DATABASE_URL set", file=sys.stderr)
        return 1

    # Plant a table absent from the DB → autogenerate must propose add_table.
    Table(
        "selftest_phantom_tbl",
        Base.metadata,
        Column("id", BigInteger, primary_key=True),
    )

    eng = create_async_engine(url)
    try:
        async with eng.connect() as conn:
            diffs = await conn.run_sync(_compare)
    finally:
        await eng.dispose()

    hit = any("selftest_phantom_tbl" in str(d) for d in diffs)
    if hit:
        print("PASS: planted phantom table detected by autogenerate")
        return 0
    print("FAIL: planted phantom table NOT detected — drift detector is broken")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
