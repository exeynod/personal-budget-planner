"""Plan template service — DEPRECATED in Phase 22 (plan 22.13).

The ``plan_template_item`` table was dropped in alembic 0013 (CONTEXT D-02).
``Category.plan_cents`` is now the source of truth for the per-category
monthly plan. Historical plan analytics, if ever needed, can be reconstructed
from ``PlannedTransaction`` rows.

Why this module still exists:
    The legacy ``/api/v1/template/*`` routes (``app/api/routes/templates.py``)
    are kept mounted as deprecated stubs that return empty responses or 410
    Gone — removing the router file outright would break ``app.api.router``
    imports across the codebase. Plan 22.13 (this plan) keeps the import
    surface intact and replaces the active code paths with safe no-ops.

Behaviour after stub:
    - Module imports cleanly (no reference to removed ``PlanTemplateItem``).
    - Domain exceptions kept exported so existing route ``except`` clauses
      still resolve at module-load time.
    - Each public function raises ``TemplatesDeprecatedError`` (subclass of
      ``RuntimeError``) so any in-process caller gets a clear failure rather
      than a silent no-op. The route layer catches this and surfaces 410.
"""
from __future__ import annotations

from typing import Any


class TemplatesDeprecatedError(RuntimeError):
    """Raised by every public templates-service function.

    Plan 22.13 dropped the underlying table; the route layer maps this to
    HTTP 410 Gone so the deprecation surfaces clearly to legacy clients.
    """

    def __init__(self) -> None:
        super().__init__(
            "Plan templates were dropped in Phase 22 (alembic 0013). "
            "Use Category.plan_cents as the per-category monthly plan instead."
        )


class TemplateItemNotFoundError(Exception):
    """Kept for backward-compat with route ``except`` blocks.

    The dropped table cannot produce these errors anymore; the stub
    functions raise :class:`TemplatesDeprecatedError` instead. Route layer
    is updated in plan 22.13 to map both to 410.
    """

    def __init__(self, item_id: int) -> None:
        self.item_id = item_id
        super().__init__(f"Template item {item_id} not found (table dropped)")


# ---------- Stubbed public surface ----------


async def list_template_items(*args: Any, **kwargs: Any) -> list:
    """Return empty list — no rows can exist after the table was dropped.

    Returns ``[]`` instead of raising so the route layer can render an
    empty response body without an extra try/except. Logging is left to
    the route layer (which knows the user-facing context).
    """
    return []


async def get_or_404(*args: Any, **kwargs: Any) -> None:
    """Always raises :class:`TemplateItemNotFoundError` — table dropped."""
    item_id = kwargs.get("item_id")
    if item_id is None and args:
        # Best-effort: id is the second positional arg in the legacy signature
        # ``get_or_404(db, item_id, *, user_id)``.
        item_id = args[1] if len(args) >= 2 else 0
    raise TemplateItemNotFoundError(int(item_id or 0))


async def create_template_item(*args: Any, **kwargs: Any) -> None:
    raise TemplatesDeprecatedError()


async def update_template_item(*args: Any, **kwargs: Any) -> None:
    raise TemplatesDeprecatedError()


async def delete_template_item(*args: Any, **kwargs: Any) -> None:
    raise TemplatesDeprecatedError()


async def snapshot_from_period(*args: Any, **kwargs: Any) -> dict:
    """Return empty snapshot for legacy route compatibility.

    The legacy route ``POST /api/v1/template/snapshot-from-period/{id}``
    returned ``{template_items: [...], replaced: int}``. We honour the
    shape but return an empty list / zero count — there are no items to
    snapshot because the source table is gone.
    """
    return {"template_items": [], "replaced": 0}


__all__ = [
    "TemplatesDeprecatedError",
    "TemplateItemNotFoundError",
    "list_template_items",
    "get_or_404",
    "create_template_item",
    "update_template_item",
    "delete_template_item",
    "snapshot_from_period",
]
