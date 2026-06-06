"""Pydantic v2 schemas for POST /api/v1/onboarding/complete v1.0 (BE-15).

Body shape mirrors ``app.services.onboarding_v10.complete_v10`` (CONTEXT
§Area 3, verbatim) — see the service module's docstring for the full
verbose description. The Pydantic schemas in this module enforce the
DATA-MODEL §6 validators **before** the service is called so 422s
surface from the route layer without touching the DB.

Threat mitigations (plan 22.12 <threat_model>):
- T-22-12-01 / T-22-12-02: ``ConfigDict(strict=True, extra="forbid")``
  on every nested model + the top-level body model.
- T-22-12-03: ``income_cents`` bounded (0, 100M ₽].
- T-22-12-04: ``@field_validator("category_plans")`` whitelists keys
  against :data:`VALID_CATEGORY_CODES` and ensures every value is a
  non-negative ``int``.
- T-22-12-05: ``@model_validator(mode="after")`` cross-checks
  ``Σ category_plans.values() ≤ income_cents``.
- T-22-12-06: same model-validator counts ``primary=True`` flags across
  ``accounts`` and rejects ``> 1``.

Single source of truth note: the constants
:data:`INCOME_MAX_CENTS` and :data:`VALID_CATEGORY_CODES` are intentionally
re-imported from ``app.services.onboarding_v10`` so the wire layer and
the service layer share one definition. The service-side validators
remain (defense-in-depth + reset endpoint reuses them with raw dicts).
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Re-export shared constants from the service module so the schema and
# service layers cannot drift. ``INCOME_MAX_CENTS`` is also imported by
# ``app.api.schemas.me_v10`` for the PATCH /me bound.
from app.services.onboarding_v10 import (  # noqa: F401  (re-exported)
    INCOME_MAX_CENTS,
    VALID_CATEGORY_CODES,
)


AccountKindStr = Literal["card", "cash", "savings"]


class OnboardingAccountItem(BaseModel):
    """Single row inside ``OnboardingV10Body.accounts``.

    Matches :class:`app.api.schemas.accounts.AccountCreate` field-for-field
    but lives in this module to keep the onboarding body self-contained
    (the route handler instantiates a single body model and passes the
    nested dicts through to ``complete_v10``).
    """

    model_config = ConfigDict(strict=True, extra="forbid", str_strip_whitespace=True)

    bank: str = Field(min_length=1, max_length=40)
    mask: Optional[str] = Field(default=None, max_length=16)
    kind: AccountKindStr
    balance_cents: int = Field(default=0, ge=-100_000_000_00, le=100_000_000_00)
    primary: bool = False


class OnboardingV10Body(BaseModel):
    """POST /api/v1/onboarding/complete request body (BE-15).

    All cross-field rules (T-22-12-04/05/06) live here so the route
    handler can rely on a single ``model_validate`` to sanitise the
    payload before forwarding to ``complete_v10``.
    """

    model_config = ConfigDict(strict=True, extra="forbid")

    income_cents: int = Field(gt=0, le=INCOME_MAX_CENTS)
    accounts: list[OnboardingAccountItem] = Field(min_length=1, max_length=20)
    # WR-11 (Phase 22 review): max_length=20 caps the dict at the 8 valid
    # category codes plus headroom. Without an explicit bound, an attacker
    # could submit 1M unknown keys; the per-key whitelist validator rejects
    # the first one, but only after O(N) traversal. Bounding the dict size
    # is a cheap DoS-resilience knob.
    category_plans: dict[str, int] = Field(max_length=20)
    # v1.1 (AGREED §G1): goal/savings_config slots removed (накопления выпилены).

    @field_validator("category_plans")
    @classmethod
    def _validate_codes_and_values(cls, v: dict[str, int]) -> dict[str, int]:
        """T-22-12-04: whitelist codes, non-negative ints, no booleans.

        Booleans are subclasses of ``int`` in Python — Pydantic's strict
        mode rejects ``True``/``False`` for ``int`` fields automatically,
        but the values inside the dict are not strict-checked by default
        when the dict-value type is ``int``. We re-check here.
        """
        if not isinstance(v, dict):
            raise ValueError("category_plans must be a dict")
        for code, cents in v.items():
            if code not in VALID_CATEGORY_CODES:
                raise ValueError(
                    f"Unknown category code in category_plans: {code!r} "
                    f"(valid: {sorted(VALID_CATEGORY_CODES)})"
                )
            if isinstance(cents, bool) or not isinstance(cents, int):
                raise ValueError(
                    f"category_plans[{code!r}] must be int; got {type(cents).__name__}"
                )
            if cents < 0:
                raise ValueError(f"category_plans[{code!r}] must be ≥ 0; got {cents}")
        return v

    @model_validator(mode="after")
    def _cross_field_checks(self) -> "OnboardingV10Body":
        # T-22-12-05: Σ plan ≤ income.
        sum_plan = sum(self.category_plans.values())
        if sum_plan > self.income_cents:
            raise ValueError(
                f"Sum of category_plans ({sum_plan}) exceeds income_cents "
                f"({self.income_cents})"
            )
        # DATA-MODEL §6: each plan ≤ income * 4 (defensive upper bound).
        upper = self.income_cents * 4
        for code, cents in self.category_plans.items():
            if cents > upper:
                raise ValueError(
                    f"category_plans[{code!r}]={cents} exceeds income*4={upper}"
                )
        # T-22-12-06: at most one explicit primary across accounts.
        primary_count = sum(1 for a in self.accounts if a.primary)
        if primary_count > 1:
            raise ValueError(
                f"At most one accounts[].primary may be true; got {primary_count}"
            )
        return self


class OnboardingV10Response(BaseModel):
    """POST /api/v1/onboarding/complete response (BE-15).

    Mirrors the dict returned by ``complete_v10``. ``onboarded_at`` is a
    plain ISO-8601 string (the service formats ``user.onboarded_at``
    via ``.isoformat()`` before returning) — Pydantic does not parse
    it back into a datetime, leaving format negotiation to the client.
    """

    # ``extra="ignore"`` is intentional: the service may add helper
    # keys (e.g. category_ids_by_code) not all consumers care about,
    # and we do not want to turn each backend addition into a breaking
    # response-validation failure.
    model_config = ConfigDict(extra="ignore")

    user_id: int
    income_cents: int
    account_ids: list[int]
    category_ids_by_code: dict[str, int]
    # v1.1: adjustment system category id (replaces savings_category_id).
    adjustment_category_id: int
    onboarded_at: str
