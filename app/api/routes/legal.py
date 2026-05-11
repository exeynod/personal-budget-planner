"""Phase 33 CMP-33-03: /legal endpoints — Privacy + ToS public docs.

Public, unauthenticated endpoints serving markdown documents from
`docs/legal/`. Mounted on the main FastAPI app WITHOUT the /api/v1
prefix (privacy policy must be accessible BEFORE Telegram-auth so
a user can read before granting consent).

Caching: markdown files are loaded once at first request and cached
in module-level dict; container restart invalidates cache.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response

legal_router = APIRouter(prefix="/legal", tags=["legal"])

# Project root — резолвится относительно текущего файла:
# app/api/routes/legal.py → ../../.. → repo root.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DOCS_DIR = _REPO_ROOT / "docs" / "legal"

# Filename mapping: (kind, lang) → file basename.
_FILES: dict[tuple[str, str], str] = {
    ("privacy", "ru"): "privacy-policy.ru.md",
    ("privacy", "en"): "privacy-policy.en.md",
    ("terms", "ru"): "terms.ru.md",
    ("terms", "en"): "terms.en.md",
}

# In-memory cache: (kind, lang) → markdown text. Populated lazily.
_CACHE: dict[tuple[str, str], str] = {}


def _read_doc(kind: str, lang: str) -> str:
    key = (kind, lang)
    if key in _CACHE:
        return _CACHE[key]
    filename = _FILES.get(key)
    if not filename:
        raise HTTPException(status_code=404, detail=f"No doc for {kind}/{lang}")
    path = _DOCS_DIR / filename
    if not path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Legal doc missing on disk: {filename}",
        )
    body = path.read_text(encoding="utf-8")
    _CACHE[key] = body
    return body


@legal_router.get(
    "/privacy",
    responses={200: {"content": {"text/markdown": {}}}},
)
async def get_privacy(
    lang: Literal["ru", "en"] = Query("ru"),
) -> Response:
    """Public Privacy Policy — Markdown response."""
    body = _read_doc("privacy", lang)
    return Response(content=body, media_type="text/markdown; charset=utf-8")


@legal_router.get(
    "/terms",
    responses={200: {"content": {"text/markdown": {}}}},
)
async def get_terms(
    lang: Literal["ru", "en"] = Query("ru"),
) -> Response:
    """Public Terms of Service — Markdown response."""
    body = _read_doc("terms", lang)
    return Response(content=body, media_type="text/markdown; charset=utf-8")
