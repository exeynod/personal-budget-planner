"""Pydantic v2 schemas for Phase 34 billing (REQ-34-01).

Public-facing API contracts для YooKassa payment flow и subscription tier
read endpoints. ORM-mapping via ``model_config = ConfigDict(from_attributes=True)``
для прямой сериализации из SQLAlchemy моделей (Payment, SubscriptionBilling).

Note: ``WebhookEvent.object`` оставлен dict — YooKassa webhook payload schema
варьируется по типу события (payment.succeeded / payment.canceled / refund.*),
service-layer разбирает payload по полям после идемпотентного lookup.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    yookassa_payment_id: str
    amount_cents: int
    status: str
    created_at: datetime
    paid_at: Optional[datetime] = None
    refunded_at: Optional[datetime] = None


class PaymentCreateRequest(BaseModel):
    amount_cents: int
    description: Optional[str] = None
    return_url: str


class PaymentCreateResponse(BaseModel):
    payment_id: int
    confirmation_url: str


class SubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tier: str
    period_start: date
    period_end: date
    status: str


class WebhookEvent(BaseModel):
    event: str
    object: dict
