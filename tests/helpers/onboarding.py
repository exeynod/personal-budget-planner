"""Shared v1.0 onboarding test helpers (Phase 68 / 68-05).

The v1.0 onboarding contract (BE-15, Phase 22 plan 22.13) replaced the legacy
v0.2/v0.3 body (``{seed_default_categories, starting_balance_cents}``) with the
v1.0 body ``{income_cents, accounts[], category_plans{}, goal?, savings_config?}``
and a ПДн-consent gate (Phase 33 CMP-33-04): ``app_user.pdn_consent_at`` MUST be
non-NULL before ``POST /api/v1/onboarding/complete`` succeeds — otherwise the
service raises ``PdnConsentRequiredError`` → 403 ``pdn_consent_required``.

``complete_onboarding_v10`` centralises the v1.0 body + the consent grant so the
six legacy-onboarding test files don't each re-template the payload. It POSTs to
the real endpoint through the provided ``async_client`` and returns the
``httpx.Response`` so callers keep full control over assertions.

The eight default expense category codes (per DATA-MODEL §6) are::

    food, cafe, home, transit, fun, gifts, health, subs
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

# Eight default expense category codes accepted by category_plans (DATA-MODEL §6).
DEFAULT_CATEGORY_CODES = (
    "food", "cafe", "home", "transit", "fun", "gifts", "health", "subs",
)


def v10_onboarding_body(
    *,
    income_cents: int = 200_000_00,
    accounts: Optional[list[dict[str, Any]]] = None,
    category_plans: Optional[dict[str, int]] = None,
    goal: Optional[dict[str, Any]] = None,
    savings_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build a valid v1.0 onboarding request body.

    Defaults: one primary card account (balance 0 — v1.0 starting_balance is 0
    per the 68-02 contract), and a category_plans map summing well under income.
    Override any field to exercise the validation paths.
    """
    if accounts is None:
        accounts = [
            {"bank": "Т-Банк", "kind": "card", "balance_cents": 0, "primary": True},
        ]
    if category_plans is None:
        category_plans = {
            "food": 30_000_00,
            "cafe": 10_000_00,
            "home": 20_000_00,
            "transit": 5_000_00,
            "fun": 3_000_00,
            "gifts": 2_000_00,
            "health": 4_000_00,
            "subs": 1_000_00,
        }
    body: dict[str, Any] = {
        "income_cents": income_cents,
        "accounts": accounts,
        "category_plans": category_plans,
    }
    if goal is not None:
        body["goal"] = goal
    if savings_config is not None:
        body["savings_config"] = savings_config
    return body


async def grant_pdn_consent(session_factory, *, tg_user_id: int) -> None:
    """Set ``app_user.pdn_consent_at = now()`` for the given tg_user_id.

    Uses a raw UPDATE through the provided async_sessionmaker so it works for the
    API integration tests that own their own engine/session. Bypasses the consent
    gate without touching product code.
    """
    from sqlalchemy import text

    async with session_factory() as session:
        await session.execute(
            text(
                "UPDATE app_user SET pdn_consent_at = :ts WHERE tg_user_id = :tg"
            ),
            {"ts": datetime.now(timezone.utc), "tg": tg_user_id},
        )
        await session.commit()


async def complete_onboarding_v10(
    client,
    headers: dict[str, str],
    *,
    session_factory=None,
    tg_user_id: Optional[int] = None,
    income_cents: int = 200_000_00,
    accounts: Optional[list[dict[str, Any]]] = None,
    category_plans: Optional[dict[str, int]] = None,
    goal: Optional[dict[str, Any]] = None,
    savings_config: Optional[dict[str, Any]] = None,
):
    """POST the v1.0 onboarding body via the real endpoint, granting consent.

    When ``session_factory`` and ``tg_user_id`` are provided, the user's
    ``pdn_consent_at`` is granted first (so the consent gate passes). Callers that
    have already granted consent (e.g. via ``seed_user(..., pdn_consent_at=...)``)
    may omit them.

    Returns the ``httpx.Response`` so the caller asserts status/shape itself —
    preserving each test's original intent.
    """
    if session_factory is not None and tg_user_id is not None:
        await grant_pdn_consent(session_factory, tg_user_id=tg_user_id)

    body = v10_onboarding_body(
        income_cents=income_cents,
        accounts=accounts,
        category_plans=category_plans,
        goal=goal,
        savings_config=savings_config,
    )
    return await client.post(
        "/api/v1/onboarding/complete", json=body, headers=headers
    )
