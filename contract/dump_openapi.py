"""Deterministic OpenAPI dump — single source of truth for Phase 69 codegen.

B1: writes ``app.openapi()`` to ``contract/openapi.json`` with sorted keys and
a trailing newline so the artifact is byte-stable across runs. The B5 sync-guard
diffs this file in CI; a non-deterministic key order would false-positive on
every run, so ``sort_keys=True`` is load-bearing.

Run inside the docker api container (local .venv is broken):

    docker compose -f docker-compose.yml -f docker-compose.dev.yml \
        -f docker-compose.test.yml exec -T api \
        /app/.venv/bin/python contract/dump_openapi.py

or via ``make contract``. The output path is anchored to this file's parent
directory, so the CWD does not matter (the api container runs from /app where
both ``main_api.py`` and ``contract/`` live, bind-mounted to the host repo).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from main_api import app

# Anchor the artifact next to this script (contract/openapi.json), independent
# of the caller's working directory.
OUT_PATH = Path(__file__).resolve().parent / "openapi.json"


def render() -> str:
    """Serialise app.openapi() deterministically into a byte-stable string."""
    return (
        json.dumps(
            app.openapi(),
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        + "\n"
    )


def dump() -> str:
    """Render + write to contract/openapi.json. Returns the written text."""
    text = render()
    OUT_PATH.write_text(text, encoding="utf-8")
    return text


if __name__ == "__main__":
    # ``--stdout``: emit to stdout only (for the docker api container, whose
    # code is image-baked and whose repo is NOT bind-mounted — `make contract`
    # redirects this into the host file). Default: write contract/openapi.json
    # directly (works when run with the repo writable, e.g. host or a mount).
    if "--stdout" in sys.argv[1:]:
        sys.stdout.write(render())
    else:
        dump()
        sys.stderr.write(f"wrote {OUT_PATH}\n")
