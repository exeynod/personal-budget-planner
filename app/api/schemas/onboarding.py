"""Pydantic schemas for /api/v1/onboarding endpoints (ONB-01, PER-02, CAT-03)."""
from datetime import datetime

from pydantic import BaseModel, Field


class OnboardingCompleteRequest(BaseModel):
    """POST /onboarding/complete request body.

    Fields:
        starting_balance_cents: signed integer in kopecks. Negative values
            (i.e. debt) are explicitly allowed per CONTEXT.md D-09.
        cycle_start_day: 1..28 — constrained by Pydantic Field per HLD §3
            and CONTEXT.md D-09. Out-of-range returns 422 before service.
        seed_default_categories: if True, the service creates the 14 default
            categories from D-16 — idempotent: skipped if any category
            already exists.
    """

    starting_balance_cents: int
    cycle_start_day: int = Field(ge=1, le=28)
    seed_default_categories: bool


class OnboardingCompleteResponse(BaseModel):
    """POST /onboarding/complete response — atomic side-effects summary."""

    period_id: int
    seeded_categories: int
    onboarded_at: datetime
