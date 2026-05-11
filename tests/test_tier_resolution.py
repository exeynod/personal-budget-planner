from datetime import datetime, timezone, timedelta
import pytest
from app.db.models import AppUser, UserRole
from app.services.tier import effective_tier, is_pro


def _u(**kwargs):
    return AppUser(tg_user_id=1, role=UserRole.owner, **kwargs)


def test_free_no_trial_no_pro():
    assert effective_tier(_u()) == "free"


def test_pro_via_active_subscription():
    user = _u(pro_active_until=datetime.now(timezone.utc) + timedelta(days=10))
    assert effective_tier(user) == "pro"
    assert is_pro(user)


def test_pro_via_active_trial():
    user = _u(trial_ends_at=datetime.now(timezone.utc) + timedelta(days=5))
    assert effective_tier(user) == "pro"


def test_free_after_trial_expired():
    user = _u(trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1))
    assert effective_tier(user) == "free"


def test_pro_active_overrides_expired_trial():
    user = _u(
        trial_ends_at=datetime.now(timezone.utc) - timedelta(days=30),
        pro_active_until=datetime.now(timezone.utc) + timedelta(days=10),
    )
    assert effective_tier(user) == "pro"


def test_explicit_now_argument():
    past = datetime(2025, 1, 1, tzinfo=timezone.utc)
    user = _u(trial_ends_at=datetime(2025, 1, 10, tzinfo=timezone.utc))
    assert effective_tier(user, now=past) == "pro"
    future = datetime(2025, 1, 20, tzinfo=timezone.utc)
    assert effective_tier(user, now=future) == "free"
