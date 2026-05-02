"""Re-export shim for ``main_api.py`` at the project root.

The plan requires the FastAPI entry module to live at ``main_api.py`` in the
repo root (per D-09 and ``entrypoint.sh``: ``uvicorn main_api:app``). However,
the Wave-0 RED tests (tests/conftest.py written in Plan 01-01) import the app
via ``from app.main_api import app``. Both are valid call sites — this module
re-exports ``app`` so the import surface is unified without duplicating the
FastAPI instance.

Single source of truth: the ``app`` defined in ``main_api`` (root). Importing
twice from different paths returns the same FastAPI instance because Python
caches the module object in ``sys.modules``.
"""
from main_api import app  # noqa: F401 — re-export for tests
