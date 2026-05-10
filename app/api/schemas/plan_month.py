"""Pydantic v2 schemas for /api/v1/plan-month (Phase 26 BE Plan 26-01, PLAN-V10-06).

Atomic batch update of ``Category.plan_cents`` for the current period. Single
round-trip replaces N sequential ``PATCH /categories/{id}`` calls and lets the
backend enforce the Σplan ≤ income constraint server-side (T-BE-02).

Threat-mitigations baked into the schema (see plan ``<threat_model>``):
- ``ConfigDict(extra="forbid")`` — reject unknown keys in case the wire layer
  drifts before the OpenAPI consumers regenerate (T-26-01-01).
- ``Field(gt=0)`` on ``category_id`` and ``Field(ge=0)`` on ``plan_cents`` —
  bounds-check before reaching the DB.
- ``model_validator`` rejects duplicate ``category_id`` per request body so
  conflicting values for the same category cannot collide silently.
- ``Field(min_length=1)`` on ``plans`` — empty payloads have no semantic
  meaning and are filtered before the service is invoked.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.api.schemas.categories import CategoryRead


class PlanMonthItem(BaseModel):
    """Single (category_id, plan_cents) tuple inside a batch PATCH."""

    model_config = ConfigDict(extra="forbid")

    category_id: int = Field(gt=0)
    plan_cents: int = Field(ge=0)


class PlanMonthPatch(BaseModel):
    """PATCH /api/v1/plan-month request body."""

    model_config = ConfigDict(extra="forbid")

    plans: list[PlanMonthItem] = Field(min_length=1)

    @model_validator(mode="after")
    def _no_duplicate_ids(self) -> "PlanMonthPatch":
        ids = [p.category_id for p in self.plans]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate category_id in plans list")
        return self


class PlanMonthResponse(BaseModel):
    """PATCH /api/v1/plan-month 200 response — refreshed CategoryRead rows.

    Returns the full CategoryRead shape (including unchanged columns) so
    клиенты могут заменить существующее состояние без второго round-trip.
    """

    categories: list[CategoryRead]
