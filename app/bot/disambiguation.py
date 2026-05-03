"""In-memory pending-state store for disambiguation callback (D-47).

When the internal API returns status="ambiguous" for a /add or /income command,
the bot stores a PendingActual in this module-level dict and sends the user an
inline keyboard. When the user taps a category button, the callback handler
calls pop_pending(token) to retrieve the original request parameters and
re-calls the internal API with an explicit category_id.

TTL: 5 minutes. Cleanup (GC) runs on every store_pending call — O(n) where n
is the number of pending entries. For a single-tenant pet app this is always
at most a handful of entries, so GC is cheap.

NOT persistent: bot restart drops the cache. Users simply re-issue the command.
Thread-safety: asyncio single event loop — no concurrent access, no locks needed.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4


TTL = timedelta(minutes=5)


@dataclass
class PendingActual:
    """Pending /add or /income request awaiting category disambiguation."""

    chat_id: int
    kind: str  # "expense" | "income"
    amount_cents: int
    description: Optional[str]
    tx_date: Optional[str]  # ISO date string or None — server defaults to today
    candidates: list[dict]  # list of {id, name, kind} dicts from ambiguous response
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_expired(self) -> bool:
        """True if more than TTL has passed since creation."""
        return datetime.now(timezone.utc) - self.created_at > TTL


# Module-level state — acceptable for single-tenant pet project (D-47).
_PENDING: dict[str, PendingActual] = {}


def store_pending(p: PendingActual) -> str:
    """Store a PendingActual; returns a full UUID hex token for use in callback_data.

    Also triggers GC to drop expired entries.
    """
    token = uuid4().hex
    _PENDING[token] = p
    _gc()
    return token


def pop_pending(token: str) -> Optional[PendingActual]:
    """Retrieve and remove a PendingActual by token.

    Returns None if the token is missing or the entry has expired (TTL elapsed).
    """
    p = _PENDING.pop(token, None)
    if p is None or p.is_expired:
        return None
    return p


def _gc() -> None:
    """Drop all expired entries. Called on every store_pending.

    O(n) over pending entries — acceptable given low cardinality (~10 max).
    """
    expired = [k for k, v in _PENDING.items() if v.is_expired]
    for k in expired:
        del _PENDING[k]
