"""Tier resolution for app users (free/pro)."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Literal
from app.db.models import AppUser

Tier = Literal["free", "pro"]


def effective_tier(user: AppUser, now: datetime | None = None) -> Tier:
    """Return effective tier for a user.

    Priority (highest first):
      1. pro_active_until > now → pro (paid subscription active).
      2. trial_ends_at > now → pro (reverse-trial still active).
      3. else → free.
    """
    now = now or datetime.now(timezone.utc)
    if user.pro_active_until is not None and user.pro_active_until > now:
        return "pro"
    if user.trial_ends_at is not None and user.trial_ends_at > now:
        return "pro"
    return "free"


def is_pro(user: AppUser, now: datetime | None = None) -> bool:
    return effective_tier(user, now) == "pro"
