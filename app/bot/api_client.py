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
