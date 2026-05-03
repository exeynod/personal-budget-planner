"""Bot → API internal client.

Used by ``/start`` (and Phase 4+ command handlers) to call
``/api/v1/internal/*`` endpoints with ``X-Internal-Token``. The bot is the
only caller that holds ``settings.INTERNAL_TOKEN``; the matching endpoints
are blocked at the Caddy edge from external traffic (Phase 1, INF-04) and
re-validated by the FastAPI ``verify_internal_token`` dependency.

Connection errors (network down, API not yet up at startup) are wrapped into
:class:`InternalApiError` so handlers can degrade gracefully — the user
receives a reply even if chat-bind silently failed (the user can retry by
re-issuing ``/start``).

Phase 4 (ACT-03/04/05) extends this module with:
- ``_post_internal`` — shared POST helper with ``X-Internal-Token``.
- ``bot_create_actual`` — POST ``/api/v1/internal/bot/actual`` (disambiguation dispatcher).
- ``bot_get_balance`` — POST ``/api/v1/internal/bot/balance`` (ACT-04 balance summary).
- ``bot_get_today`` — POST ``/api/v1/internal/bot/today`` (ACT-04 today transactions).
"""
from __future__ import annotations

import httpx
import structlog

from app.core.settings import settings


logger = structlog.get_logger(__name__)


class InternalApiError(Exception):
    """Raised when the internal API call fails (network or non-2xx response)."""


async def bind_chat_id(*, tg_user_id: int, tg_chat_id: int) -> None:
    """POST ``/api/v1/internal/telegram/chat-bind`` (ONB-03 / D-11).

    Parameters
    ----------
    tg_user_id:
        Telegram user id (must equal ``OWNER_TG_ID`` — checked by caller).
    tg_chat_id:
        Telegram chat id to persist for push notifications (Phase 5/6).

    Raises
    ------
    InternalApiError
        On connection failure or non-2xx response. The exception message is
        suitable for logs; ``INTERNAL_TOKEN`` is never included.
    """
    url_path = "/api/v1/internal/telegram/chat-bind"
    payload = {"tg_user_id": tg_user_id, "tg_chat_id": tg_chat_id}
    headers = {"X-Internal-Token": settings.INTERNAL_TOKEN}

    try:
        async with httpx.AsyncClient(
            base_url=settings.API_BASE_URL,
            timeout=5.0,
        ) as client:
            response = await client.post(url_path, json=payload, headers=headers)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning(
            "bot.chat_bind.failed",
            tg_user_id=tg_user_id,
            error=str(exc),
        )
        raise InternalApiError(f"chat-bind failed: {exc}") from exc

    logger.info(
        "bot.chat_bind.ok",
        tg_user_id=tg_user_id,
        tg_chat_id=tg_chat_id,
    )


# ---------------------------------------------------------------------------
# Phase 4: shared helper + command endpoints
# ---------------------------------------------------------------------------


async def _post_internal(path: str, payload: dict) -> dict:
    """Generic POST to ``/api/v1/internal/*`` with ``X-Internal-Token``.

    Used by Phase 4 bot command handlers. Raises :class:`InternalApiError`
    on network error or non-2xx response. The ``INTERNAL_TOKEN`` value is
    never included in log output.
    """
    headers = {"X-Internal-Token": settings.INTERNAL_TOKEN}
    try:
        async with httpx.AsyncClient(
            base_url=settings.API_BASE_URL,
            timeout=5.0,
        ) as client:
            response = await client.post(path, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        logger.warning("bot.internal_call.failed", path=path, error=str(exc))
        raise InternalApiError(f"{path} failed: {exc}") from exc


async def bot_create_actual(
    *,
    tg_user_id: int,
    kind: str,
    amount_cents: int,
    category_query: str | None = None,
    category_id: int | None = None,
    description: str | None = None,
    tx_date: str | None = None,
) -> dict:
    """POST ``/api/v1/internal/bot/actual`` — disambiguation dispatcher (ACT-03).

    Returns a parsed JSON dict with ``BotActualResponse`` shape:
    ``{"status": "created"|"ambiguous"|"not_found", "actual": ..., ...}``.

    Only non-None optional fields are included in the payload so that
    Pydantic v2 on the server side correctly handles Optional + model_validator.

    Raises :class:`InternalApiError` on network / non-2xx.
    """
    payload: dict = {
        "tg_user_id": tg_user_id,
        "kind": kind,
        "amount_cents": amount_cents,
    }
    if category_query is not None:
        payload["category_query"] = category_query
    if category_id is not None:
        payload["category_id"] = category_id
    if description is not None:
        payload["description"] = description
    if tx_date is not None:
        payload["tx_date"] = tx_date
    return await _post_internal("/api/v1/internal/bot/actual", payload)


async def bot_get_balance(tg_user_id: int) -> dict:
    """POST ``/api/v1/internal/bot/balance`` — balance summary (ACT-04).

    Returns ``BotBalanceResponse`` JSON dict.
    Raises :class:`InternalApiError` on network / non-2xx (incl. 404 when
    no active period exists — caller should handle gracefully).
    """
    return await _post_internal(
        "/api/v1/internal/bot/balance", {"tg_user_id": tg_user_id}
    )


async def bot_get_today(tg_user_id: int) -> dict:
    """POST ``/api/v1/internal/bot/today`` — today's transactions (ACT-04).

    Returns ``BotTodayResponse`` JSON dict. Never 404 — empty list OK.
    Raises :class:`InternalApiError` on network / non-2xx.
    """
    return await _post_internal(
        "/api/v1/internal/bot/today", {"tg_user_id": tg_user_id}
    )
