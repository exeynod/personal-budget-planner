"""Pydantic schemas for v1.1 balance reconcile (AGREED §H)."""

from typing import Optional

from pydantic import BaseModel


class ReconcileBalanceRequest(BaseModel):
    target_balance_cents: int


class ReconcileBalanceResponse(BaseModel):
    adjustment_txn_id: Optional[int]
    balance_now_cents: int
